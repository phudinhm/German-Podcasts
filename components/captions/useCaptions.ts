"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TargetLang } from "@/lib/types";
import type { PlayerHandle } from "../player/types";
import { getSpeechRecognition, type SpeechRecognitionLike } from "@/lib/audio/speech";
import { covers, coveredSeconds, mergeInterval, utteranceStart, type Interval } from "@/lib/audio/captions";
import { splitUtterance } from "@/lib/audio/segment";
import { captureFromElement, rms, SILENCE_THRESHOLD, type CaptureHandle } from "@/lib/audio/capture";
import { WhisperEngine, hasWebGpu, type WhisperStatus } from "@/lib/audio/whisper";

export type CaptionMode = "internal" | "mic";

export interface CaptionLine {
  id: string;
  at: number;
  until: number;
  de: string;
  translation?: string;
}

export interface CaptionState {
  lines: CaptionLine[];
  interim: string;
  running: boolean;
  replaying: boolean;
  activeId: string | null;
  covered: number;
  error: string | null;
  whisper: WhisperStatus;
  micSupported: boolean;
  webGpu: boolean;
}

/**
 * Caption capture, in two flavours.
 *
 * **internal** taps the audio inside the page and transcribes it with Whisper
 * in a worker. Headphones are fine, a noisy carriage is fine, and nothing
 * leaves the device. It costs a model download once, and needs the stream
 * routed through this origin, because a browser will not let Web Audio read
 * cross-origin media.
 *
 * **mic** uses the browser's own recogniser, which listens to the microphone.
 * It starts instantly and downloads nothing, and it requires the audio to be
 * audible in the room.
 *
 * Both feed the same pipeline: split a recognised block into short lines, stamp
 * each from when its speech began, skip ground already captured, translate what
 * is new.
 */
export function useCaptions({
  handle,
  mediaElement,
  targetLang,
  translate,
  onNeedCapture,
  captureFailed,
}: {
  handle: PlayerHandle;
  mediaElement: () => HTMLMediaElement | null;
  targetLang: TargetLang;
  translate: boolean;
  /** Asks the player to route audio through this origin, or to stop. */
  onNeedCapture: (on: boolean) => void;
  /** The player could not load the proxied stream, so this path is closed. */
  captureFailed?: boolean;
}) {
  const [lines, setLines] = useState<CaptionLine[]>([]);
  const [interim, setInterim] = useState("");
  const [running, setRunning] = useState(false);
  const [replaying, setReplaying] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [whisper, setWhisper] = useState<WhisperStatus>({ state: "idle" });
  const [micSupported, setMicSupported] = useState(false);

  const coverageRef = useRef<Interval[]>([]);
  const linesRef = useRef<CaptionLine[]>([]);
  linesRef.current = lines;

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const wantRunningRef = useRef(false);
  const startsRef = useRef(new Map<number, number>());
  const captureRef = useRef<CaptureHandle | null>(null);
  const whisperRef = useRef<WhisperEngine | null>(null);

  useEffect(() => setMicSupported(Boolean(getSpeechRecognition())), []);

  /** Adds a recognised block, split into readable lines. */
  const addUtterance = useCallback((text: string, at: number, until: number) => {
    if (!text.trim()) return;
    if (covers(coverageRef.current, at)) return;

    const chunks = splitUtterance(text, at, Math.max(until, at + 1));
    if (chunks.length === 0) return;

    coverageRef.current = mergeInterval(coverageRef.current, {
      from: chunks[0].at,
      to: chunks[chunks.length - 1].until,
    });

    setLines((previous) => {
      const additions = chunks
        .filter(
          (chunk) => !previous.some((line) => Math.abs(line.at - chunk.at) < 0.2 && line.de === chunk.text),
        )
        .map((chunk, index) => ({
          id: `c${Math.round(chunk.at * 1000)}-${index}`,
          at: chunk.at,
          until: chunk.until,
          de: chunk.text,
        }));
      return [...previous, ...additions].sort((a, b) => a.at - b.at);
    });
  }, []);

  // ---- translation -------------------------------------------------------

  const translateLine = useCallback(async (id: string, text: string, lang: TargetLang) => {
    try {
      const response = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, lang }),
      });
      const data = (await response.json()) as { text?: string | null };
      if (!data.text) return;
      setLines((previous) =>
        previous.map((line) => (line.id === id ? { ...line, translation: data.text ?? undefined } : line)),
      );
    } catch {
      // A missing translation never interrupts capture.
    }
  }, []);

  const pendingRef = useRef(false);
  useEffect(() => {
    if (!translate || pendingRef.current) return;
    const pending = linesRef.current.filter((line) => !line.translation);
    if (pending.length === 0) return;
    pendingRef.current = true;
    void (async () => {
      // One at a time: the keyless provider is rate limited, and a burst of
      // requests is the quickest way to be cut off.
      for (const line of pending.slice(-20)) {
        await translateLine(line.id, line.de, targetLang);
      }
      pendingRef.current = false;
    })();
  }, [translate, targetLang, lines, translateLine]);

  useEffect(() => {
    setLines((previous) => previous.map((line) => ({ ...line, translation: undefined })));
  }, [targetLang]);

  // ---- microphone engine -------------------------------------------------

  const startMic = useCallback(() => {
    const Recognition = getSpeechRecognition();
    if (!Recognition) {
      setError("This browser has no speech recognition. Chrome and Edge do.");
      return;
    }
    startsRef.current.clear();
    const recognition = new Recognition();
    recognition.lang = "de-DE";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      let pending = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = result[0]?.transcript?.trim() ?? "";
        if (!text) continue;
        if (!startsRef.current.has(i)) startsRef.current.set(i, utteranceStart(handle.getTime()));
        if (result.isFinal) {
          const at = startsRef.current.get(i) ?? utteranceStart(handle.getTime());
          startsRef.current.delete(i);
          addUtterance(text, at, handle.getTime());
        } else {
          pending += ` ${text}`;
        }
      }
      setInterim(pending.trim());
    };
    recognition.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setError("Microphone access was refused.");
        wantRunningRef.current = false;
        setRunning(false);
      }
    };
    recognition.onend = () => {
      startsRef.current.clear();
      if (wantRunningRef.current) {
        try {
          recognition.start();
        } catch {
          setRunning(false);
        }
      }
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
    } catch {
      setError("Captions could not be started.");
    }
  }, [handle, addUtterance]);

  // ---- internal audio engine --------------------------------------------

  const startInternal = useCallback(() => {
    const engine = new WhisperEngine(
      (status) => {
        setWhisper(status);
        // A model that will not load is a dead end, not a slow start. Say so and
        // release the tap rather than sitting on "listening" forever.
        if (status.state === "error") {
          setError(
            "The speech model could not be loaded. Check the connection, or switch to microphone captions.",
          );
          wantRunningRef.current = false;
          setRunning(false);
          captureRef.current?.stop();
          captureRef.current = null;
          onNeedCapture(false);
        }
      },
      (result) => {
        addUtterance(result.text, result.at, result.until);
      },
    );
    whisperRef.current = engine;
    engine.start();

    // The element only becomes readable once its source is same-origin, so the
    // tap waits a moment for the player to swap it.
    window.setTimeout(() => {
      const element = mediaElement();
      if (!element) {
        setError("No audio is playing.");
        return;
      }
      // A cross-origin element that the browser refuses to expose does not
      // throw: it hands back silence. Counting the silent windows is the only
      // way to tell that apart from an actual pause, and after four of them in
      // a row while the clock is running it is not a pause.
      let silentWindows = 0;
      const capture = captureFromElement(element, {
        windowSeconds: 6,
        overlapSeconds: 0.8,
        currentTime: () => handle.getTime(),
        onWindow: ({ samples, at, until }) => {
          if (rms(samples) < SILENCE_THRESHOLD) {
            const playing = !element.paused && !element.ended;
            silentWindows = playing ? silentWindows + 1 : 0;
            if (silentWindows === 4) {
              setError(
                "The page is playing sound, but the browser will not let it be read. Microphone captions still work.",
              );
            }
            return;
          }
          silentWindows = 0;
          if (covers(coverageRef.current, at)) return;
          whisperRef.current?.transcribe(samples, at, until);
        },
      });
      if (!capture) {
        setError(
          "This browser would not let the page read the audio. Switch to microphone captions, or try Chrome.",
        );
        return;
      }
      captureRef.current = capture;
    }, 400);
  }, [addUtterance, handle, mediaElement, onNeedCapture]);

  // ---- control -----------------------------------------------------------

  const start = useCallback(
    (mode: CaptionMode) => {
      setError(null);
      wantRunningRef.current = true;
      setRunning(true);
      if (mode === "mic") {
        onNeedCapture(false);
        startMic();
      } else {
        onNeedCapture(true);
        startInternal();
      }
    },
    [onNeedCapture, startMic, startInternal],
  );

  const stop = useCallback(() => {
    wantRunningRef.current = false;
    setRunning(false);
    setInterim("");
    try {
      recognitionRef.current?.stop();
    } catch {
      // Already stopped.
    }
    recognitionRef.current = null;
    captureRef.current?.stop();
    captureRef.current = null;
    whisperRef.current?.stop();
    whisperRef.current = null;
    onNeedCapture(false);
  }, [onNeedCapture]);

  useEffect(
    () => () => {
      try {
        recognitionRef.current?.stop();
      } catch {
        // Already stopped.
      }
      captureRef.current?.stop();
      whisperRef.current?.stop();
    },
    [],
  );

  /** Follows playback and reports whether this ground already has text. */
  useEffect(() => {
    let frame = 0;
    let lastId: string | null = null;
    let lastReplaying = false;
    function tick() {
      frame = requestAnimationFrame(tick);
      const time = handle.getTime();
      const current = linesRef.current.find((line) => time >= line.at - 0.75 && time <= line.until + 0.75);
      const id = current?.id ?? null;
      if (id !== lastId) {
        lastId = id;
        setActiveId(id);
      }
      const isReplaying = covers(coverageRef.current, time);
      if (isReplaying !== lastReplaying) {
        lastReplaying = isReplaying;
        setReplaying(isReplaying);
      }
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [handle]);

  /** The proxy failed, so playback reverted and internal capture is impossible. */
  useEffect(() => {
    if (!captureFailed) return;
    wantRunningRef.current = false;
    setRunning(false);
    captureRef.current?.stop();
    captureRef.current = null;
    whisperRef.current?.stop();
    whisperRef.current = null;
    setError("This stream cannot be read inside the page. Microphone captions still work.");
  }, [captureFailed]);

  const clear = useCallback(() => {
    setLines([]);
    coverageRef.current = [];
  }, []);

  const state: CaptionState = {
    lines,
    interim,
    running,
    replaying,
    activeId,
    covered: coveredSeconds(coverageRef.current),
    error,
    whisper,
    micSupported,
    webGpu: hasWebGpu(),
  };

  return { state, start, stop, clear };
}
