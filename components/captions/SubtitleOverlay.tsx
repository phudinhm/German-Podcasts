"use client";

import { useEffect, useState } from "react";
import { useUi } from "@/lib/i18n";
import type { PlayerHandle } from "../player/types";
import { findActive } from "@/lib/audio/timeline";
import type { CaptionLine } from "./useCaptions";

export type SubtitleMode = "off" | "original" | "both" | "translated";

/**
 * Follows playback and reports the line that should be on screen.
 *
 * The clock is read in an animation frame, but state is only written when the
 * line actually changes, so a two-hour episode costs a handful of renders
 * rather than sixty a second.
 */
function useActiveLine(handle: PlayerHandle, lines: CaptionLine[], active: boolean): CaptionLine | null {
  const [id, setId] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;
    let frame = 0;
    let last: string | null = null;
    let hint = -1;
    function tick() {
      frame = requestAnimationFrame(tick);
      const time = handle.getTime();
      hint = findActive(lines, time, hint, 0.25);
      const next = hint >= 0 ? lines[hint].id : null;
      if (next !== last) {
        last = next;
        setId(next);
      }
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [handle, lines, active]);

  return lines.find((line) => line.id === id) ?? null;
}

/**
 * Subtitles burned over the video, the way a player shows them.
 *
 * Three useful states rather than a single on/off: the German alone for
 * listening practice, both languages for when a phrase will not resolve, and
 * the translation alone for following the argument without the German pulling
 * the eye away from the picture.
 */
export function SubtitleOverlay({
  handle,
  lines,
  mode,
}: {
  handle: PlayerHandle;
  lines: CaptionLine[];
  mode: SubtitleMode;
}) {
  const line = useActiveLine(handle, lines, mode !== "off");
  if (mode === "off" || !line) return null;

  const showOriginal = mode === "original" || mode === "both";
  const showTranslation = mode === "translated" || mode === "both";
  if (showTranslation && !showOriginal && !line.translation) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center p-3 sm:p-4">
      <div className="max-w-[92%] rounded-lg bg-black/70 px-3 py-2 text-center backdrop-blur-sm">
        {showOriginal ? (
          <p className="text-[16px] font-medium leading-snug text-white sm:text-[19px]">{line.de}</p>
        ) : null}
        {showTranslation && line.translation ? (
          <p
            className={
              showOriginal
                ? "mt-1 text-[13.5px] leading-snug text-white/75 sm:text-[15px]"
                : "text-[16px] font-medium leading-snug text-white sm:text-[19px]"
            }
          >
            {line.translation}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** Cycles the subtitle mode from a single button. */
export function SubtitleButton({
  mode,
  onChange,
}: {
  mode: SubtitleMode;
  onChange: (mode: SubtitleMode) => void;
}) {
  const { t } = useUi();
  const order: SubtitleMode[] = ["off", "original", "both", "translated"];
  const label: Record<SubtitleMode, string> = {
    off: t("caption.subsOff"),
    original: t("caption.subsOriginal"),
    both: t("caption.subsBoth"),
    translated: t("caption.subsTranslated"),
  };
  return (
    <button
      type="button"
      className="btn px-2.5 py-1 text-[12px]"
      data-active={mode !== "off"}
      onClick={() => onChange(order[(order.indexOf(mode) + 1) % order.length])}
      title={t("caption.subtitles")}
    >
      {label[mode]}
    </button>
  );
}
