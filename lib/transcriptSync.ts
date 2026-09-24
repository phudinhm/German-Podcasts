"use client";

const STORAGE_KEY = "hoerbar.transcriptSync.v1";
const MAX_ENTRIES = 50;

function readMap(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

/**
 * How many seconds the real audio runs ahead of its published transcript's
 * timestamps for one specific episode - positive when a dynamically
 * inserted ad break (these vary by country, and sometimes by request, so
 * the same episode can drift differently play to play) pushes the actual
 * audio later than the transcript expects. There is no reliable way to
 * detect the ad break itself, so this is a manual correction someone nudges
 * until the transcript lines back up, remembered per episode.
 */
export function getTranscriptOffset(episodeId: string): number {
  return readMap()[episodeId] ?? 0;
}

export function setTranscriptOffset(episodeId: string, offsetSec: number): void {
  if (typeof window === "undefined") return;
  try {
    const map = readMap();
    if (offsetSec === 0) delete map[episodeId];
    else map[episodeId] = offsetSec;
    const ids = Object.keys(map);
    // Insertion order for string keys - drops the longest-untouched entry
    // once the cache would otherwise grow without bound.
    if (ids.length > MAX_ENTRIES) delete map[ids[0]];
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {}
}
