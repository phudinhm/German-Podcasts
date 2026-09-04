"use client";

import { memo } from "react";

/**
 * A clickable token inside a caption or transcript line.
 *
 * Live captions are the only text many episodes will ever have, so the words in
 * them need to behave like the words in a real transcript: click to look up,
 * click again to save. Selecting a run of words looks up the phrase instead,
 * which is what you want for a separable verb or a fixed expression.
 */
function CaptionWordImpl({
  word,
  onSelect,
}: {
  word: string;
  onSelect: (word: string, anchor: HTMLElement) => void;
}) {
  const clean = word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
  if (!clean) return <span>{word}</span>;

  const lead = word.slice(0, word.indexOf(clean));
  const trail = word.slice(word.indexOf(clean) + clean.length);

  return (
    <>
      {lead}
      <span
        role="button"
        tabIndex={0}
        className="word"
        onClick={(event) => {
          // A drag-select means the user wants the phrase, not this one word.
          const selected = window.getSelection()?.toString().trim() ?? "";
          if (selected.length > clean.length + 1) return;
          event.stopPropagation();
          onSelect(clean, event.currentTarget);
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          onSelect(clean, event.currentTarget);
        }}
      >
        {clean}
      </span>
      {trail}
    </>
  );
}

export const CaptionWord = memo(CaptionWordImpl);

/** Splits a line into tokens while keeping the whitespace for rendering. */
export function splitLine(line: string): string[] {
  return line.split(/(\s+)/).filter((piece) => piece.length > 0);
}
