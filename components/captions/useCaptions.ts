"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TargetLang } from "@/lib/types";
import type { PlayerHandle } from "../player/types";
import { getSpeechRecognition, type SpeechRecognitionLike } from "@/lib/audio/speech";
import {
  covers,
  coveredSeconds,
  isFullyCovered,
  mergeInterval,
  utteranceStart,
  type Interval,
} from "@/lib/audio/captions";
import { splitUtterance } from "@/lib/audio/segment";
import { findActive, insertSorted } from "@/lib/audio/timeline";
import { captureFromElement, rms, SILENCE_THRESHOLD, type CaptureHandle } from "@/lib/audio/capture";
import { useCaptureElement, type CaptureRoute } from "./useCaptureElement";
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
  /**
   * null until the check has run. The difference matters: a component that
   * treats "not yet known" as "not supported" will switch away from the
   * microphone on the very first render and never switch back.
   */
  micSupported: boolean | null;
  webGpu: boolean;
  /** Where the transcriber is reading the audio from, once it is reading. */
  route: CaptureRoute | null;
  /** Seconds from starting the engine to the first line of text. */
  firstResultMs: number | null;
}

/**
 * Caption capture, in two flavours.
 *
 * **internal** transcribes the episode's own audio with Whisper in a worker.
 * Headphones are fine, a noisy carriage is fine, and nothing leaves the
 * device. It costs a model download once, and it reads from a silent shadow
 * copy of the episode rather than from the element the listener is hearing, so
 * that a problem on the transcription side can never interrupt playback.
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
  mediaUrl,
  targetLang,
  translate,
}: {
  handle: PlayerHandle;
  /** The episode's media URL, or null when there is nothing tappable. */
  mediaUrl: string | null;
  targetLang: TargetLang;
  translate: boolean;
}) {
  const [lines, setLines] = useState<CaptionLine[]>([]);
  const [interim, setInterim] = useState("");
  const [running, setRunning] = useState(false);
  const [replaying, setReplaying] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [whisper, setWhisper] = useState<WhisperStatus>({ state: "idle" });
  const [micSupported, setMicSupported] = useState<boolean | null>(null);
  const [firstResultMs, setFirstResultMs] = useState<number | null>(null);
  const startedAtRef = useRef(0);
  // Destructured deliberately. Depending on the hook's returned object would
  // make every consumer's callbacks change identity on each render, and one of
  // those callbacks is the teardown that runs when the episode changes - which
  // then ran constantly and stopped captions the moment they started.
  const { acquire, release, route } = useCaptureElement(handle);

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

    const all = splitUtterance(text, at, Math.max(until, at + 1));
    // Only lines that lie wholly inside ground already transcribed are
    // dropped. That covers the real cases - replaying a passage, and the
    // opening of a window repeating the close of the one before - while a line
    // that straddles the seam is kept, because losing a sentence is a worse
    // failure for someone reading along than repeating a few words.
    const chunks = all.filter((chunk) => !isFullyCovered(coverageRef.current, chunk.at, chunk.until));
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
      // Inserted in place rather than re-sorting the whole list on every
      // arrival: lines almost always come in order, so this is a push.
      return additions.reduce<CaptionLine[]>((list, line) => insertSorted(list, line), previous);
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

  const stopInternal = useCallback(() => {
    captureRef.current?.stop();
    captureRef.current = null;
    whisperRef.current?.stop();
    whisperRef.current = null;
    release();
  }, [release]);

  const startInternal = useCallback(async () => {
    if (!mediaUrl) {
      setError("This episode has no audio stream this browser can read. Microphone captions still work.");
      wantRunningRef.current = false;
      setRunning(false);
      return;
    }

    startedAtRef.current = performance.now();
    setFirstResultMs(null);

    const engine = new WhisperEngine(
      (status) => {
        setWhisper(status);
        // A model that will not load is a dead end, not a slow start. Say so
        // and release everything rather than sitting on "listening" forever.
        if (status.state === "error") {
          setError(
            `The speech model could not be loaded${status.error ? `: ${status.error}` : "."} Microphone captions still work.`,
          );
          wantRunningRef.current = false;
          setRunning(false);
          stopInternal();
        }
      },
      (result) => {
        if (startedAtRef.current) {
          setFirstResultMs((previous) => previous ?? Math.round(performance.now() - startedAtRef.current));
        }
        addUtterance(result.text, result.at, result.until);
      },
    );
    whisperRef.current = engine;
    engine.start();

    const acquired = await acquire(mediaUrl);
    if (!wantRunningRef.current) {
      stopInternal();
      return;
    }
    if (!acquired) {
      setError("The audio could not be opened for reading. Microphone captions still work.");
      wantRunningRef.current = false;
      setRunning(false);
      stopInternal();
      return;
    }

    // A cross-origin element the browser refuses to expose does not throw: it
    // hands back silence. Counting silent windows is the only way to tell that
    // apart from a pause, and four in a row while the clock runs is not a pause.
    let silentWindows = 0;
    const tap = captureFromElement(acquired.element, {
      // Five seconds is the shortest window that still gives Whisper enough
      // context to punctuate and to get compounds right, and it is what the
      // caption lag is: text arrives about a window behind the speech. The
      // second of overlap is what stops a word being cut in half at the seam.
      windowSeconds: 5,
      overlapSeconds: 1,
      // The shadow element is muted and never reaches the speakers.
      passthrough: false,
      currentTime: () => handle.getTime(),
      onWindow: ({ samples, at, until }) => {
        if (rms(samples) < SILENCE_THRESHOLD) {
          const playing = !acquired.element.paused && !acquired.element.ended;
          silentWindows = playing ? silentWindows + 1 : 0;
          if (silentWindows === 4) {
            setError(
              "The audio is playing but reads as silence, which means the browser will not expose it. Microphone captions still work.",
            );
          }
          return;
        }
        silentWindows = 0;
        // Only skip ground that is wholly transcribed already: a window whose
        // far end is new is worth the inference even though it starts inside
        // the previous one.
        if (isFullyCovered(coverageRef.current, at, until)) return;
        whisperRef.current?.transcribe(samples, at, until);
      },
    });

    if (!tap) {
      setError("This browser would not let the page read the audio. Try Chrome, or use microphone captions.");
      wantRunningRef.current = false;
      setRunning(false);
      stopInternal();
      return;
    }
    captureRef.current = tap;
  }, [acquire, addUtterance, handle, mediaUrl, stopInternal]);

  // ---- control -----------------------------------------------------------

  const start = useCallback(
    (mode: CaptionMode) => {
      setError(null);
      wantRunningRef.current = true;
      setRunning(true);
      if (mode === "mic") {
        startMic();
      } else {
        void startInternal();
      }
    },
    [startMic, startInternal],
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
    stopInternal();
  }, [stopInternal]);

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
    let hint = -1;
    function tick() {
      frame = requestAnimationFrame(tick);
      const time = handle.getTime();
      hint = findActive(linesRef.current, time, hint);
      const current = hint >= 0 ? linesRef.current[hint] : undefined;
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
    route,
    firstResultMs,
  };

  return { state, start, stop, clear };
}
