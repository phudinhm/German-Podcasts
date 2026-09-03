"use client";

import { useState } from "react";
import { useUi } from "@/lib/i18n";
import { toSrt, toVtt, type SubtitleFlavour } from "@/lib/export";
import type { CaptionLine } from "./useCaptions";

/**
 * Takes the transcript out of the app.
 *
 * Whatever was captured here - a publisher's transcript or an hour of captions
 * built in the browser - is text with timings, and text with timings is a
 * subtitle file. Writing it out means the work is not trapped in one tab: the
 * same episode can be watched in VLC, loaded into a video editor, or kept.
 */
export function SubtitleExport({ lines, title }: { lines: CaptionLine[]; title: string }) {
  const { t } = useUi();
  const [flavour, setFlavour] = useState<SubtitleFlavour>("both");
  if (lines.length === 0) return null;

  const slug =
    title
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "hoerbar";

  function save(kind: "srt" | "vtt") {
    const text = kind === "srt" ? toSrt(lines, flavour) : toVtt(lines, flavour);
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${slug}.${kind}`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <span className="text-[11.5px] text-[var(--ink-faint)]">{t("caption.exportAs")}</span>
      <div className="flex overflow-hidden rounded-full border border-[var(--rule)]">
        {(["original", "both", "translated"] as const).map((option) => (
          <button
            key={option}
            type="button"
            data-active={flavour === option}
            onClick={() => setFlavour(option)}
            className="btn rounded-none border-0 border-r border-[var(--rule)] px-2.5 py-0.5 text-[11.5px] last:border-r-0"
          >
            {option === "original"
              ? t("caption.subsOriginal")
              : option === "both"
                ? t("caption.subsBoth")
                : t("caption.subsTranslated")}
          </button>
        ))}
      </div>
      <button type="button" className="btn px-2.5 py-0.5 text-[11.5px]" onClick={() => save("srt")}>
        .srt
      </button>
      <button type="button" className="btn px-2.5 py-0.5 text-[11.5px]" onClick={() => save("vtt")}>
        .vtt
      </button>
    </div>
  );
}
