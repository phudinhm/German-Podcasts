/**
 * Subtitle and timestamp formatting.
 *
 * The vocabulary exports that used to live here went with the vault: without a
 * place to collect words there was nothing to export. Timed text remains,
 * because a transcript built here should be usable outside the app.
 */

export function formatTimestamp(seconds: number): string {
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

/** A line of timed text, which is all a subtitle file is. */
export interface TimedLine {
  at: number;
  until: number;
  de: string;
  translation?: string;
}

function clockSrt(seconds: number): string {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const rest = ms % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(rest).padStart(3, "0")}`;
}

function clockVtt(seconds: number): string {
  return clockSrt(seconds).replace(",", ".");
}

export type SubtitleFlavour = "original" | "both" | "translated";

function subtitleText(line: TimedLine, flavour: SubtitleFlavour): string | null {
  if (flavour === "original") return line.de;
  if (flavour === "translated") return line.translation ?? null;
  return line.translation ? `${line.de}\n${line.translation}` : line.de;
}

/**
 * SubRip. Every player made in the last twenty years reads it, which is the
 * point: a transcript captured here should be usable in VLC, on a TV, or in
 * whatever the learner already watches things in.
 */
export function toSrt(lines: TimedLine[], flavour: SubtitleFlavour = "both"): string {
  const blocks: string[] = [];
  let index = 1;
  for (const line of lines) {
    const text = subtitleText(line, flavour);
    if (!text) continue;
    // A cue with no duration never renders, and rounding can produce one.
    const end = Math.max(line.until, line.at + 0.2);
    blocks.push(`${index}\n${clockSrt(line.at)} --> ${clockSrt(end)}\n${text}\n`);
    index += 1;
  }
  return blocks.join("\n");
}

/** WebVTT, which is what a browser's own <track> element wants. */
export function toVtt(lines: TimedLine[], flavour: SubtitleFlavour = "both"): string {
  const blocks: string[] = ["WEBVTT", ""];
  for (const line of lines) {
    const text = subtitleText(line, flavour);
    if (!text) continue;
    const end = Math.max(line.until, line.at + 0.2);
    blocks.push(`${clockVtt(line.at)} --> ${clockVtt(end)}\n${text}\n`);
  }
  return blocks.join("\n");
}
