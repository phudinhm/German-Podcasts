"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useUi } from "@/lib/i18n";
import type { Segment, TargetLang } from "@/lib/types";
import type { PlayerHandle } from "./player/types";

/**
 * Transcript for a streamed episode, opened on demand.
 *
 * Kept behind a click for two reasons: it is the largest payload on the page,
 * and a wall of text next to a play button is exactly the crutch that stops
 * people listening. Once open it follows the player, and any sentence seeks.
 */
export function EpisodeTranscript({
  segments,
  handle,
  targetLang,
  showTranslation,
}: {
  segments: Segment[];
  handle: PlayerHandle;
  targetLang: TargetLang;
  showTranslation: boolean;
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

  return (
    <ol ref={listRef} className="max-h-[420px] overflow-y-auto pr-1">
      {segments.map((segment, index) => {
        const gloss = targetLang === "en" ? segment.en : segment.vi;
        return (
          <li
            key={segment.id}
            data-index={index}
            data-active={index === activeIndex}
            className="segment row-hover grid grid-cols-[42px_1fr] gap-x-2 px-1.5 py-1.5"
          >
            <button
              type="button"
              onClick={() => {
                handle.seekTo(segment.start, true);
                handle.play();
              }}
              className="self-start pt-[3px] text-right font-mono text-[10px] leading-5 text-[var(--ink-faint)] hover:text-[var(--accent)]"
            >
              {Math.floor(segment.start / 60)}:{String(Math.floor(segment.start % 60)).padStart(2, "0")}
            </button>
            <div className="min-w-0">
              <p
                className="cursor-pointer text-[15px] leading-[1.6]"
                onClick={() => {
                  handle.seekTo(segment.start, true);
                  handle.play();
                }}
              >
                {segment.de}
              </p>
              {showTranslation && gloss ? (
                <p className="mt-0.5 text-[13px] leading-[1.55] text-[var(--gloss)]">{gloss}</p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
