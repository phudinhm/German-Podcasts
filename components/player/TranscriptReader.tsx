"use client";

import { useEffect, useRef, useState } from "react";
import { useUi } from "@/lib/i18n";
import { liveCaptionService, type CaptionSegment } from "@/lib/liveCaption";
import { usePlayer } from "./PlayerProvider";

interface TranscriptReaderProps {
  currentTime: number;
  onSeek: (seconds: number) => void;
  showTranslation: boolean;
  /** Which single translated language to show beneath the active line - the
   * reader shows one language at a time (with a picker to switch), not
   * every translation stacked together. */
  translationLang: "de" | "en" | "vi";
  /** Off lets someone scroll back through earlier lines - or ahead - without
   * the view snapping back to the current one on every segment change. */
  autoScroll: boolean;
  fontSize: number;
}

function translationFor(seg: CaptionSegment, lang: "de" | "en" | "vi"): string | null {
  return seg.translations?.[lang] ?? seg.translation ?? null;
}

/**
 * A continuous, book-like reading view of the transcript - the way Apple
 * Podcasts and Apple Music show one during playback: the current sentence
 * bright, everything else dimmed, the whole thing gliding to keep the
 * current line centred rather than pinned to an edge.
 *
 * Deliberately without the full transcript panel's toolbar - search,
 * export, per-line timestamps, AI grammar notes. Those stay in the regular
 * panel (this page's toolbar, the floating one); this screen is for reading
 * along with the episode, not for reference.
 */
export function TranscriptReader({
  currentTime,
  onSeek,
  showTranslation,
  translationLang,
  autoScroll,
  fontSize,
}: TranscriptReaderProps) {
  const { t } = useUi();
  const { track, onGenerateTranscript, generatingTranscript, generateTranscriptError, transcriptOffsetSec } =
    usePlayer();
  const [segments, setSegments] = useState<CaptionSegment[]>([]);
  const activeRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    setSegments(liveCaptionService.getTranscript());
    return liveCaptionService.onTranscript(setSegments);
  }, []);

  // The transcript's own clock, once a dynamically inserted ad break (its
  // length varying by country, sometimes by request) has pushed the real
  // audio out of step with it - see the sync control in CaptionSettings.
  const contentTime = currentTime - transcriptOffsetSec;

  const activeSegmentId = segments.find(
    (s) => contentTime >= s.start - 0.5 && contentTime <= s.end + 0.5,
  )?.id;

  useEffect(() => {
    if (!autoScroll) return;
    activeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeSegmentId, autoScroll]);

  if (segments.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
        {generatingTranscript ? (
          <>
            <p className="text-[15px] font-medium text-white">{t("caption.generating")}</p>
            <p className="max-w-xs text-[12.5px] text-white/50">{t("caption.generatingHint")}</p>
          </>
        ) : (
          <>
            <p className="text-[14px] text-white/50">{t("caption.noTranscript")}</p>
            {generateTranscriptError ? (
              <p className="max-w-xs text-[12px] text-rose-300">
                {generateTranscriptError === "too-large"
                  ? t("caption.generateTooLarge")
                  : generateTranscriptError === "no-key"
                    ? t("caption.generateNoProvider")
                    : t("caption.generateFailed")}
              </p>
            ) : null}
            {track?.url ? (
              <button
                type="button"
                onClick={onGenerateTranscript}
                className="rounded-full bg-white px-4 py-1.5 text-[12.5px] font-medium text-black transition active:scale-95"
              >
                {t("caption.generateTranscript")}
              </button>
            ) : null}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-6 sm:px-10" style={{ scrollbarWidth: "none" }}>
      <div className="mx-auto max-w-xl py-[38vh]">
        <p
          className="text-center font-medium text-white/40"
          style={{ fontSize: `${fontSize}px`, lineHeight: 1.7 }}
        >
          {segments.map((seg) => {
            const isActive = seg.id === activeSegmentId;
            const translation = isActive && showTranslation ? translationFor(seg, translationLang) : null;
            return (
              <span key={seg.id}>
                <span
                  ref={isActive ? activeRef : null}
                  onClick={() => onSeek(Math.max(0, seg.start - 0.25 + transcriptOffsetSec))}
                  className={`cursor-pointer transition-colors duration-300 ${
                    isActive ? "font-semibold text-white" : "hover:text-white/70"
                  }`}
                >
                  {seg.text}
                </span>
                {translation ? (
                  <span
                    className="mx-1 block py-1 text-white/45"
                    style={{ fontSize: `${Math.max(13, Math.round(fontSize * 0.68))}px`, lineHeight: 1.5 }}
                  >
                    {translation}
                  </span>
                ) : null}
                {" "}
              </span>
            );
          })}
        </p>
      </div>
    </div>
  );
}
