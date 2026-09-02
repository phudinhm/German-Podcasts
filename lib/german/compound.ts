import { STEMS, FUGEN } from "./stems";
import { EXTRA_STEMS } from "../../data/lexicon/stems.extra";

const STEM_SET = new Set<string>([...STEMS, ...EXTRA_STEMS].map((s) => s.toLowerCase()));

/** Minimum length for a slice to count as a compound member. */
const MIN_MEMBER = 4;
/** Members shorter than this are only accepted when in the stem list. */
const MIN_KNOWN = 3;

const cache = new Map<string, string[]>();

function isStem(candidate: string): boolean {
  if (STEM_SET.has(candidate)) return true;
  // Common derivational endings on a known stem still count.
  for (const suffix of ["ung", "heit", "keit", "schaft", "lich", "isch", "ig", "er", "en", "e", "n", "s"]) {
    if (candidate.endsWith(suffix) && candidate.length - suffix.length >= MIN_KNOWN) {
      if (STEM_SET.has(candidate.slice(0, candidate.length - suffix.length))) return true;
    }
  }
  return false;
}

/**
 * Splits a compound into its members, longest-match from the left with
 * linking-element tolerance. Returns a single-element array when the word is
 * not recognisably a compound, so callers can always iterate the result.
 */
export function splitCompound(word: string): string[] {
  const lower = word.toLowerCase();
  if (lower.length < 8) return [lower];
  const cached = cache.get(lower);
  if (cached) return cached;

  const result = search(lower, 0) ?? [lower];
  cache.set(lower, result);
  return result;
}

function search(word: string, depth: number): string[] | null {
  if (depth > 4) return null;
  // A tail is only accepted when it is a real stem. Accepting any short
  // remainder produced splits like "angsts + chweiß"; refusing to split is a
  // much cheaper mistake than splitting in the wrong place.
  if (isStem(word)) return [word];
  if (word.length <= 6) return null;

  // Try the longest head first so "Wirtschaftskrise" prefers "wirtschaft".
  for (let cut = word.length - MIN_MEMBER; cut >= MIN_KNOWN; cut -= 1) {
    const head = word.slice(0, cut);
    if (!isStem(head)) continue;
    for (const fuge of FUGEN) {
      if (!word.startsWith(head + fuge, 0)) continue;
      const rest = word.slice(cut + fuge.length);
      if (rest.length < MIN_KNOWN) continue;
      const tail = search(rest, depth + 1);
      if (tail) return [head + fuge, ...tail];
    }
  }
  return null;
}

export function isCompound(word: string): boolean {
  return splitCompound(word).length > 1;
}
