"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useUi } from "@/lib/i18n";
import type { Segment, TargetLang } from "@/lib/types";
import type { PlayerHandle } from "./player/types";
import { CaptionWord, splitLine } from "./CaptionWord";

/**
 * Transcript for a streamed episode, opened on demand.
 *
 * Kept behind a click for two reasons: it is the largest payload on the page,
 * and a wall of text next to a play button is exactly the crutch that stops
 * people listening. Once open it follows the player, and any sentence seeks.
 */
export type TranscriptLayout = "stacked" | "columns";

export function EpisodeTranscript({
  segments,
  handle,
  targetLang,
  showTranslation,
  layout = "stacked",
  maxHeight = 420,
  onWord,
  savedWords,
}: {
  segments: Segment[];
  handle: PlayerHandle;
  targetLang: TargetLang;
  showTranslation: boolean;
  /** "columns" puts the translation beside the German rather than under it. */
  layout?: TranscriptLayout;
  maxHeight?: number | string;
  onWord?: (word: string, sentence: string, anchor: HTMLElement) => void;
  savedWords?: Set<string>;
}) {
  const { t } = useUi();
  const [activeIndex, setActiveIndex] = useState(-1);
  const listRef = useRef<HTMLOListElement | null>(null);
  const lastScrolled = useRef(-1);

  const bounds = useMemo(() => segments.map((segment) => [segment.start, segment.end] as const), [segments]);

  useEffect(() => {
    let frame = 0;
    let last = -1;
    function tick() {
      frame = requestAnimationFrame(tick);
      const time = handle.getTime();
      let index = -1;
      for (let i = 0; i < bounds.length; i += 1) {
        if (time >= bounds[i][0] && time < bounds[i][1]) {
          index = i;
          break;
        }
        if (time >= bounds[i][0]) index = i;
      }
      if (index !== last) {
        last = index;
        setActiveIndex(index);
      }
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [bounds, handle]);

  useEffect(() => {
    if (activeIndex < 0 || activeIndex === lastScrolled.current) return;
    lastScrolled.current = activeIndex;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeIndex]);

  if (segments.length === 0) {
    return <p className="text-[12.5px] text-[var(--ink-faint)]">{t("listen.noTranscriptYet")}</p>;
  }

  const columns = layout === "columns" && showTranslation;

  return (
    <ol
      ref={listRef}
      className="overflow-y-auto pr-1"
      style={{ maxHeight: typeof maxHeight === "number" ? `${maxHeight}px` : maxHeight }}
    >
      {segments.map((segment, index) => {
        const gloss = targetLang === "en" ? segment.en : segment.vi;
        const seek = () => {
          handle.seekTo(segment.start, true);
          handle.play();
        };
        const german = (
          <p className="cursor-pointer text-[15px] leading-[1.6]" onClick={seek}>
            {onWord
              ? splitLine(segment.de).map((piece, pieceIndex) =>
                  /^\s+$/.test(piece) ? (
                    <span key={pieceIndex}>{piece}</span>
                  ) : (
                    <CaptionWord
                      key={pieceIndex}
                      word={piece}
                      saved={Boolean(savedWords?.has(piece.replace(/[^\p{L}]/gu, "").toLowerCase()))}
                      onSelect={(word, anchor) => {
                        const selected = window.getSelection()?.toString().trim() ?? "";
                        onWord(selected.length > word.length ? selected : word, segment.de, anchor);
                      }}
                    />
                  ),
                )
              : segment.de}
          </p>
        );
        // Smaller and dimmer than the German on purpose: the original should
        // hold the eye, with the translation available as a check rather than
        // as the thing being read.
        const translation =
          showTranslation && gloss ? (
            <p className="text-[13px] leading-[1.5] text-[var(--ink-faint)]">{gloss}</p>
          ) : null;

        return (
          <li
            key={segment.id}
            data-index={index}
            data-active={index === activeIndex}
            className="segment row-hover grid grid-cols-[42px_1fr] gap-x-2 px-1.5 py-1.5"
          >
            <button
              type="button"
              onClick={seek}
              className="self-start pt-[3px] text-right font-mono text-[10px] leading-5 text-[var(--ink-faint)] hover:text-[var(--accent)]"
            >
              {Math.floor(segment.start / 60)}:{String(Math.floor(segment.start % 60)).padStart(2, "0")}
            </button>
            {columns ? (
              <div className="grid min-w-0 gap-x-4 sm:grid-cols-2">
                <div className="min-w-0">{german}</div>
                <div className="min-w-0">{translation}</div>
              </div>
            ) : (
              <div className="min-w-0">
                {german}
                {translation ? <div className="mt-0.5">{translation}</div> : null}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
