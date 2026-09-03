"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUi } from "@/lib/i18n";
import type { TargetLang } from "@/lib/types";
import type { PlayerHandle } from "./player/types";
import { getSpeechRecognition, type SpeechRecognitionLike } from "@/lib/audio/speech";
import { CaptionWord, splitLine } from "./CaptionWord";
import {
  COVERAGE_SLACK,
  covers,
  coveredSeconds,
  mergeInterval,
  utteranceStart,
  type Interval,
} from "@/lib/audio/captions";

export interface CaptionLine {
  id: string;
  /** Where the phrase *started*, in media time. */
  at: number;
  /** Where it ended, used for highlighting and for coverage. */
  until: number;
  de: string;
  translation?: string;
}

/**
 * Live captions for a stream that has no transcript.
 *
 * The honest mechanics: browser speech recognition listens to the microphone,
 * not to a media element, and a cross-origin podcast stream cannot be captured
 * for analysis because its CDN sends no CORS headers. So this hears the audio
 * the same way a person in the room does, through the speakers.
 *
 * Two things follow from captions being tied to media time rather than to wall
 * clock. Each line is stamped from when its speech began, not when recognition
 * finished thinking, so clicking a line replays the words it shows. And the
 * stretch of audio a line covers is remembered, so replaying a passage
 * highlights the text already captured instead of transcribing it a second time.
 */
export function LiveCaption({
  handle,
  targetLang,
  showTranslation,
  onSeek,
  onWord,
  savedWords,
}: {
  handle: PlayerHandle;
  targetLang: TargetLang;
  showTranslation: boolean;
  onSeek: (seconds: number) => void;
  onWord?: (word: string, sentence: string, anchor: HTMLElement) => void;
  savedWords?: Set<string>;
}) {
  const { t } = useUi();
  const [running, setRunning] = useState(false);
  const [lines, setLines] = useState<CaptionLine[]>([]);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [replaying, setReplaying] = useState(false);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const wantRunningRef = useRef(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  /** First-seen media time per in-flight recognition result index. */
  const startsRef = useRef(new Map<number, number>());
  const coverageRef = useRef<Interval[]>([]);
  const linesRef = useRef<CaptionLine[]>([]);
  linesRef.current = lines;

  useEffect(() => setSupported(Boolean(getSpeechRecognition())), []);

  const translateLine = useCallback(
    async (id: string, text: string, lang: TargetLang) => {
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
        // A missing translation is not worth interrupting the captions for.
      }
    },
    [],
  );

  /**
   * Translates anything not yet translated. Runs when a line arrives, when the
   * translation toggle is switched on mid-session, and when the target language
   * changes, so turning it on does not leave earlier lines bare.
   */
  useEffect(() => {
    if (!showTranslation) return;
    const pending = linesRef.current.filter((line) => !line.translation).slice(-12);
    for (const line of pending) void translateLine(line.id, line.de, targetLang);
  }, [showTranslation, targetLang, lines.length, translateLine]);

  // A new target language invalidates every translation already fetched.
  useEffect(() => {
    setLines((previous) => previous.map((line) => ({ ...line, translation: undefined })));
  }, [targetLang]);

  const start = useCallback(() => {
    const Recognition = getSpeechRecognition();
    if (!Recognition) return;
    setError(null);
    wantRunningRef.current = true;
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

        // The first time this utterance is seen, note where the media was.
        if (!startsRef.current.has(i)) {
          startsRef.current.set(i, utteranceStart(handle.getTime()));
        }

        if (result.isFinal) {
          const at = startsRef.current.get(i) ?? utteranceStart(handle.getTime());
          startsRef.current.delete(i);
          const until = handle.getTime();

          // Replaying a stretch that already has text: keep what is there.
          if (covers(coverageRef.current, at)) continue;

          coverageRef.current = mergeInterval(coverageRef.current, { from: at, to: Math.max(until, at + 1) });
          const id = `c${Math.round(at * 1000)}-${i}`;
          setLines((previous) =>
            [...previous, { id, at, until, de: text }].sort((a, b) => a.at - b.at),
          );
        } else {
          pending += ` ${text}`;
        }
      }
      setInterim(pending.trim());
    };

    recognition.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setError(
          "Microphone access was refused. Live captions listen through the microphone, so the browser needs permission.",
        );
        wantRunningRef.current = false;
        setRunning(false);
      }
      // "no-speech" and "aborted" are routine; onend restarts.
    };

    recognition.onend = () => {
      // Chrome ends a session periodically; restart while it is still wanted.
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
      setRunning(true);
    } catch {
      setError("Live captions could not be started.");
    }
  }, [handle]);

  const stop = useCallback(() => {
    wantRunningRef.current = false;
    try {
      recognitionRef.current?.stop();
    } catch {
      // Already stopped.
    }
    recognitionRef.current = null;
    setRunning(false);
    setInterim("");
  }, []);

  useEffect(() => () => stop(), [stop]);

  /** Follows playback: highlights the line covering the current position. */
  useEffect(() => {
    let frame = 0;
    let lastId: string | null = null;
    let lastReplaying = false;
    function tick() {
      frame = requestAnimationFrame(tick);
      const time = handle.getTime();
      const current = linesRef.current.find(
        (line) => time >= line.at - COVERAGE_SLACK && time <= line.until + COVERAGE_SLACK,
      );
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

  useEffect(() => {
    if (!activeId) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-line="${activeId}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeId]);

  // Only auto-scroll to the newest line while actually transcribing.
  useEffect(() => {
    if (replaying) return;
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [lines.length, interim, replaying]);

  const covered = useMemo(
    () => coveredSeconds(coverageRef.current),
    // Recomputed whenever a line lands, which is the only time coverage grows.
    [lines.length],
  );

  if (!supported) {
    return (
      <p className="text-[12.5px] leading-relaxed text-[var(--ink-faint)]">
        Live captions need the browser&apos;s speech recognition, which this browser does not offer.
        Chrome and Edge have it. You can also run the ingest worker to produce a real transcript.
      </p>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-primary" onClick={() => (running ? stop() : start())}>
          {running ? t("listen.stopCaption") : t("listen.liveCaption")}
        </button>
        {running ? (
          replaying ? (
            <span className="text-[11px] text-[var(--ink-faint)]">already captioned, replaying</span>
          ) : (
            <span className="flex items-center gap-1.5 text-[11px] text-[var(--accent)]">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[var(--accent-ring)]" />
              listening
            </span>
          )
        ) : null}
        {covered > 0 ? (
          <span className="text-[11px] text-[var(--ink-faint)]">
            {Math.round(covered)}s captured
          </span>
        ) : null}
        {lines.length > 0 ? (
          <button
            type="button"
            className="ml-auto text-[11px] text-[var(--ink-faint)] underline decoration-dotted underline-offset-4"
            onClick={() => {
              setLines([]);
              coverageRef.current = [];
            }}
          >
            clear
          </button>
        ) : null}
      </div>

      <p className="mt-2 text-[11.5px] leading-relaxed text-[var(--ink-faint)]">
        Captions are heard through your microphone, so play the audio out loud rather than through
        headphones. Nothing is uploaded by this app; recognition happens in the browser. Replaying a
        passage keeps the text already captured rather than transcribing it again.
        {onWord ? ` ${t("caption.saveWord")} ${t("caption.selectHint")}` : ""}
      </p>

      {error ? <p className="mt-2 text-[12px] text-rose-600">{error}</p> : null}

      {lines.length > 0 || interim ? (
        <div ref={listRef} className="surface mt-3 max-h-[280px] overflow-y-auto p-3">
          {lines.map((line) => (
            <p
              key={line.id}
              data-line={line.id}
              data-active={line.id === activeId}
              className="segment mb-2.5 rounded-md px-1 py-0.5 last:mb-0"
            >
              <button
                type="button"
                onClick={() => onSeek(Math.max(0, line.at))}
                className="mr-2 align-top font-mono text-[10px] text-[var(--ink-faint)] hover:text-[var(--accent)]"
                title="Play from here"
              >
                {Math.floor(line.at / 60)}:{String(Math.floor(line.at % 60)).padStart(2, "0")}
              </button>
              <span className="caption-line">
                {onWord
                  ? splitLine(line.de).map((piece, index) =>
                      /^\s+$/.test(piece) ? (
                        <span key={index}>{piece}</span>
                      ) : (
                        <CaptionWord
                          key={index}
                          word={piece}
                          saved={Boolean(savedWords?.has(piece.replace(/[^\p{L}]/gu, "").toLowerCase()))}
                          onSelect={(word, anchor) => {
                            const selected = window.getSelection()?.toString().trim() ?? "";
                            onWord(selected.length > word.length ? selected : word, line.de, anchor);
                          }}
                        />
                      ),
                    )
                  : line.de}
              </span>
              {showTranslation && line.translation ? (
                // Smaller and dimmer than the German on purpose: the original
                // holds the eye, the translation is there as a check.
                <span className="mt-0.5 block pl-[38px] text-[13px] leading-snug text-[var(--ink-faint)]">
                  {line.translation}
                </span>
              ) : null}
            </p>
          ))}
          {interim && !replaying ? (
            <p className="caption-line pl-[38px] text-[var(--ink-faint)]">{interim}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
