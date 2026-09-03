"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useUi } from "@/lib/i18n";
import type { TargetLang } from "@/lib/types";
import type { PlayerHandle } from "./player/types";
import { getSpeechRecognition, type SpeechRecognitionLike } from "@/lib/audio/speech";
import { CaptionWord, splitLine } from "./CaptionWord";

export interface CaptionLine {
  id: string;
  at: number;
  de: string;
  translation?: string;
}

/**
 * Live captions for a stream that has no transcript.
 *
 * The honest mechanics: browser speech recognition listens to the microphone,
 * not to a media element, and a cross-origin podcast stream cannot be captured
 * for analysis because its CDN sends no CORS headers. So this hears the audio
 * the same way a person in the room does - through the speakers. That sounds
 * like a hack and is in fact the only route that works on arbitrary podcast
 * audio without shipping the recording to a server.
 *
 * Captions are timestamped against the player clock, so a line can be replayed
 * and the whole session reads back as a rough transcript afterwards.
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
  /** Opens the dictionary for a clicked word or a selected phrase. */
  onWord?: (word: string, sentence: string, anchor: HTMLElement) => void;
  savedWords?: Set<string>;
}) {
  const { t } = useUi();
  const [running, setRunning] = useState(false);
  const [lines, setLines] = useState<CaptionLine[]>([]);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const wantRunningRef = useRef(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  const [supported, setSupported] = useState(true);
  useEffect(() => setSupported(Boolean(getSpeechRecognition())), []);

  const translate = useCallback(
    async (id: string, text: string) => {
      try {
        const response = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, lang: targetLang }),
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
    [targetLang],
  );

  const start = useCallback(() => {
    const Recognition = getSpeechRecognition();
    if (!Recognition) return;
    setError(null);
    wantRunningRef.current = true;

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
        if (result.isFinal) {
          const id = `c${Date.now()}-${i}`;
          const at = handle.getTime();
          setLines((previous) => [...previous, { id, at, de: text }]);
          if (showTranslation) void translate(id, text);
        } else {
          pending += ` ${text}`;
        }
      }
      setInterim(pending.trim());
    };

    recognition.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setError("Microphone access was refused. Live captions listen through the microphone, so the browser needs permission.");
        wantRunningRef.current = false;
        setRunning(false);
      }
      // "no-speech" and "aborted" are routine; onend restarts.
    };

    recognition.onend = () => {
      // Chrome ends a session every so often; restart while the user wants it.
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
  }, [handle, showTranslation, translate]);

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

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [lines.length, interim]);

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
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => (running ? stop() : start())}
        >
          {running ? t("listen.stopCaption") : t("listen.liveCaption")}
        </button>
        {running ? (
          <span className="flex items-center gap-1.5 text-[11px] text-[var(--accent)]">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[var(--accent-ring)]" />
            listening
          </span>
        ) : null}
        {lines.length > 0 ? (
          <button
            type="button"
            className="ml-auto text-[11px] text-[var(--ink-faint)] underline decoration-dotted underline-offset-4"
            onClick={() => setLines([])}
          >
            clear
          </button>
        ) : null}
      </div>

      <p className="mt-2 text-[11.5px] leading-relaxed text-[var(--ink-faint)]">
        Captions are heard through your microphone, so play the audio out loud rather than through
        headphones. Nothing is uploaded by this app; recognition happens in the browser.
        {onWord ? ` ${t("caption.saveWord")} ${t("caption.selectHint")}` : ""}
      </p>

      {error ? <p className="mt-2 text-[12px] text-rose-600">{error}</p> : null}

      {lines.length > 0 || interim ? (
        <div
          ref={listRef}
          className="surface mt-3 max-h-[280px] overflow-y-auto p-3"
        >
          {lines.map((line) => (
            <p key={line.id} className="mb-2.5 last:mb-0">
              <button
                type="button"
                onClick={() => onSeek(Math.max(0, line.at - 1))}
                className="mr-2 align-top font-mono text-[10px] text-[var(--ink-faint)] hover:text-[var(--accent)]"
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
                // Deliberately smaller and dimmer than the German: the eye
                // should land on the original first and use this as a check.
                <span className="mt-0.5 block pl-[38px] text-[13px] leading-snug text-[var(--ink-faint)]">
                  {line.translation}
                </span>
              ) : null}
            </p>
          ))}
          {interim ? <p className="caption-line pl-[38px] text-[var(--ink-faint)]">{interim}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
