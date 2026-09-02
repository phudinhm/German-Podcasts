"use client";

import { memo, useCallback, useEffect, useRef } from "react";
import type { Segment, TargetLang } from "@/lib/types";
import { splitSentence, type RenderedWord } from "@/lib/german/render";
import { WordSpan } from "./WordSpan";

interface Props {
  segments: Segment[];
  activeIndex: number;
  activeWordIndex: number;
  focusIndex: number;
  lang: TargetLang;
  showDual: boolean;
  showHazards: boolean;
  karaoke: boolean;
  savedLemmas: Set<string>;
  drillIds: Set<string>;
  onSeek: (index: number) => void;
  onWord: (token: string, rendered: RenderedWord, anchor: HTMLElement, segment: Segment) => void;
  onBreakdown: (segment: Segment) => void;
  onLoop: (index: number) => void;
}

export function Transcript(props: Props) {
  const { segments, activeIndex } = props;
  const listRef = useRef<HTMLOListElement | null>(null);
  const lastScrolled = useRef(-1);

  // Keep the active sentence in view, but never fight the user: only scroll
  // when the sentence actually changes, and never during a manual scroll.
  useEffect(() => {
    if (activeIndex < 0 || activeIndex === lastScrolled.current) return;
    lastScrolled.current = activeIndex;
    const node = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    node?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeIndex]);

  return (
    <ol ref={listRef} className="divide-y divide-[var(--rule)]">
      {segments.map((segment, index) => (
        <SegmentRow
          key={segment.id}
          {...props}
          segment={segment}
          index={index}
          active={index === props.activeIndex}
          focused={index === props.focusIndex}
          activeWordIndex={index === props.activeIndex ? props.activeWordIndex : -1}
        />
      ))}
    </ol>
  );
}

interface RowProps extends Props {
  segment: Segment;
  index: number;
  active: boolean;
  focused: boolean;
}

const SegmentRow = memo(function SegmentRow({
  segment,
  index,
  active,
  focused,
  activeWordIndex,
  lang,
  showDual,
  showHazards,
  karaoke,
  savedLemmas,
  drillIds,
  onSeek,
  onWord,
  onBreakdown,
  onLoop,
}: RowProps) {
  const gloss = lang === "en" ? segment.en : segment.vi;
  const pieces = splitSentence(segment.de);

  // Map each rendered token onto its index in the alignment array, so the
  // karaoke highlight follows the same word the aligner timed.
  let wordCounter = -1;

  const handleWord = useCallback(
    (token: string, rendered: RenderedWord, anchor: HTMLElement) => {
      onWord(token, rendered, anchor, segment);
    },
    [onWord, segment],
  );

  return (
    <li
      data-index={index}
      data-active={active ? "true" : "false"}
      data-drill={drillIds.has(segment.id) ? "true" : "false"}
      className="segment group grid grid-cols-[38px_1fr] gap-x-3 px-2 py-2.5"
    >
      <button
        type="button"
        onClick={() => onSeek(index)}
        title={`Zu ${formatTime(segment.start)} springen`}
        className="segment-index self-start pt-[3px] text-right font-mono text-[10px] leading-5 text-[var(--ink-faint)] hover:text-[var(--accent)]"
      >
        {formatTime(segment.start)}
      </button>

      <div className="min-w-0">
        <p
          className="cursor-pointer text-[16px] leading-[1.7] text-[var(--ink)]"
          style={{ fontFamily: "var(--font-display)" }}
          onClick={() => onSeek(index)}
        >
          {segment.speaker ? (
            <span className="mr-1.5 text-[11px] font-sans uppercase tracking-wider text-[var(--ink-faint)]">
              {segment.speaker}
            </span>
          ) : null}
          {pieces.map((piece, pieceIndex) => {
            if (/^\s+$/.test(piece)) return <span key={pieceIndex}>{piece}</span>;
            wordCounter += 1;
            const wordIndex = wordCounter;
            return (
              <WordSpan
                key={pieceIndex}
                de={piece}
                hazards={showHazards}
                spoken={karaoke && activeWordIndex >= 0 && wordIndex <= activeWordIndex && active}
                saved={savedLemmas.has(piece.replace(/[^\p{L}]/gu, "").toLowerCase())}
                onSelect={handleWord}
              />
            );
          })}
        </p>

        {showDual && gloss ? (
          <p className="mt-0.5 text-[13.5px] leading-[1.6] text-[var(--gloss)]">{gloss}</p>
        ) : null}

        <div className="mt-1 flex items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 data-[on=true]:opacity-100" data-on={focused ? "true" : "false"}>
          <button
            type="button"
            className="btn px-2 py-0.5 text-[11px]"
            data-active={focused}
            onClick={() => onLoop(index)}
            title="Diesen Satz in Schleife üben"
          >
            {focused ? "läuft" : "Schleife"}
          </button>
          <button
            type="button"
            className="btn px-2 py-0.5 text-[11px]"
            onClick={() => onBreakdown(segment)}
            title="Satzbau erklären"
          >
            Satzbau
          </button>
        </div>
      </div>
    </li>
  );
});

function formatTime(seconds: number): string {
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, "0")}`;
}
