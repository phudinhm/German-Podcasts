"use client";

import { useEffect, useRef, useState } from "react";
import { useUi } from "@/lib/i18n";
import { liveCaptionService, type CaptionSegment } from "@/lib/liveCaption";
import { usePlayer } from "./PlayerProvider";

import { FONT_FAMILIES, type FontFamily, type CaptionTheme, captionThemeStyle } from "../caption/CaptionSettings";

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
  fontFamily: FontFamily;
  theme: CaptionTheme;
  translationVisibility: "all" | "active";
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
  fontFamily,
  theme,
  translationVisibility,
}: TranscriptReaderProps) {
  const { t } = useUi();
  const { track, onGenerateTranscript, generatingTranscript, generateTranscriptError, transcriptOffsetSec } =
    usePlayer();
  const [segments, setSegments] = useState<CaptionSegment[]>([]);
  const activeRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setSegments(liveCaptionService.getTranscript());
    return liveCaptionService.onTranscript(setSegments);
  }, []);

  const contentTime = currentTime - transcriptOffsetSec;

  const activeSegmentId = segments.find(
    (s) => contentTime >= s.start - 0.5 && contentTime <= s.end + 0.5,
  )?.id;

  useEffect(() => {
    if (!autoScroll) return;
    activeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeSegmentId, autoScroll]);

  // Determine colors based on theme using the CSS variables from captionThemeStyle
  // By default (modern), TranscriptReader is inside a dark FullscreenPlayer.
  // When a theme is selected, the CSS variables like --ink and --ink-soft will be redefined.
  
  // For the default "modern" theme, we want white text on the dark player background.
  // For other themes, we use the theme's defined --ink.
  const isModern = theme === "modern";
  
  const inactiveColor = isModern ? "text-white/40" : "text-[var(--ink-faint)]";
  const activeColor = isModern ? "text-white" : "text-[var(--ink)]";
  const hoverColor = isModern ? "hover:text-white/70" : "hover:text-[var(--ink-soft)]";
  const translationColor = isModern ? "text-white/60" : "text-[var(--ink-soft)]";
  const borderColor = isModern ? "border-white/20" : "border-[var(--rule)]";
  const generatingText = isModern ? "text-white" : "text-[var(--ink)]";
  const generatingHint = isModern ? "text-white/50" : "text-[var(--ink-soft)]";
  const errorText = isModern ? "text-rose-300" : "text-rose-600";
  const btnClasses = isModern 
    ? "bg-white text-black" 
    : "bg-[var(--ink)] text-[var(--surface)]";

  if (segments.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center rounded-xl" style={captionThemeStyle(theme)}>
        {generatingTranscript ? (
          <>
            <p className={`text-[15px] font-medium ${generatingText}`}>{t("caption.generating")}</p>
            <p className={`max-w-xs text-[12.5px] ${generatingHint}`}>{t("caption.generatingHint")}</p>
          </>
        ) : (
          <>
            <p className={`text-[14px] ${generatingHint}`}>{t("caption.noTranscript")}</p>
            {generateTranscriptError ? (
              <p className={`max-w-xs text-[12px] ${errorText}`}>
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
                className={`rounded-full px-4 py-1.5 text-[12.5px] font-medium transition active:scale-95 ${btnClasses}`}
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
    <div
      className={`h-full overflow-y-auto px-4 sm:px-8 transition-colors duration-500 rounded-2xl ${
        !isModern ? "bg-[var(--surface)]" : ""
      }`}
      style={{ ...captionThemeStyle(theme), scrollbarWidth: "none" }}
    >
      <div className="mx-auto max-w-xl py-[30vh] space-y-2">
        {segments.map((seg) => {
          const isActive = seg.id === activeSegmentId;
          const showForSeg = showTranslation && (translationVisibility === "all" || isActive);
          const translation = showForSeg ? translationFor(seg, translationLang) : null;

          return (
            <div
              key={seg.id}
              ref={isActive ? activeRef : null}
              onClick={() => onSeek(Math.max(0, seg.start - 0.25 + transcriptOffsetSec))}
              className={`group cursor-pointer rounded-2xl px-4 py-3 transition-all duration-300 text-center ${
                isActive
                  ? isModern
                    ? "bg-white/12 shadow-lg ring-1 ring-white/20 backdrop-blur-md scale-[1.02]"
                    : "bg-[var(--paper-raised)] shadow-md ring-1 ring-[var(--accent)]/30 scale-[1.02]"
                  : "opacity-45 hover:opacity-85 hover:bg-white/5 active:scale-[0.99]"
              }`}
            >
              <p
                className={`font-semibold leading-relaxed transition-colors duration-300 select-text ${
                  isActive ? activeColor : inactiveColor
                }`}
                style={{ fontSize: `${fontSize}px`, fontFamily: FONT_FAMILIES[fontFamily] }}
              >
                {seg.text}
              </p>

              {translation ? (
                <p
                  className={`mt-2 font-normal leading-relaxed italic select-text transition-all ${
                    isModern ? "text-amber-200/90 font-medium" : "text-[var(--accent)] font-medium"
                  }`}
                  style={{
                    fontSize: `${Math.max(13, Math.round(fontSize * 0.82))}px`,
                  }}
                >
                  {translation}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
