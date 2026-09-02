"use client";

import { memo } from "react";
import { HAZARD_CLASS, renderWord, type RenderedWord } from "@/lib/german/render";

export interface WordSpanProps {
  /** The German surface form exactly as it appears in the transcript. */
  de: string;
  spoken?: boolean;
  saved?: boolean;
  hazards?: boolean;
  onSelect: (token: string, rendered: RenderedWord, anchor: HTMLElement) => void;
}

/**
 * One clickable German token.
 *
 * Rendering is memoised on the props that actually change during playback
 * (`spoken`, `saved`) because a 200-word transcript re-renders on every word
 * boundary otherwise.
 */
function WordSpanImpl({ de, spoken, saved, hazards = true, onSelect }: WordSpanProps) {
  const rendered = renderWord(de, { hazards });
  if (!rendered.token) return <span>{de}</span>;

  return (
    <>
      {rendered.lead}
      <span
        role="button"
        tabIndex={0}
        className="word"
        data-spoken={spoken ? "true" : undefined}
        data-saved={saved ? "true" : undefined}
        onClick={(event) => {
          event.stopPropagation();
          onSelect(rendered.token, rendered, event.currentTarget);
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          event.stopPropagation();
          onSelect(rendered.token, rendered, event.currentTarget);
        }}
      >
        {rendered.pieces.map((piece, index) =>
          piece.hazard ? (
            <span key={index} className={HAZARD_CLASS[piece.hazard.kind]} title={piece.hazard.hint}>
              {piece.text}
            </span>
          ) : (
            <span key={index}>{piece.text}</span>
          ),
        )}
      </span>
      {rendered.trail}
    </>
  );
}

export const WordSpan = memo(WordSpanImpl);
