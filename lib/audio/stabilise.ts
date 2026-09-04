/**
 * Deciding when a caption line is worth translating.
 *
 * The idea is borrowed from LiveCaptions-Translator, which sits on top of
 * Windows' own recogniser and learned the hard way that translating whatever
 * text is on screen right now is wasteful and reads badly: recognisers revise
 * what they have said, so half the requests are for text that is about to
 * change, and a sentence translated in two halves is worse than one translated
 * whole. Its answer is to cut at sentence punctuation and to notice when new
 * text is nearly the same as text already handled.
 *
 * The same problem exists here for a different reason. Capture windows overlap
 * on purpose so a word split across the seam is still heard whole, which means
 * the opening of one line often repeats the close of the last one.
 */

/** Ends a sentence. German adds nothing exotic; the ellipsis is worth having. */
export const PUNC_EOS = [".", "?", "!", "…"];

/**
 * The part of `text` that forms complete sentences, or "" when none do.
 *
 * A trailing fragment is left out rather than translated: it is the part most
 * likely to be revised, and the part a translator handles worst without the
 * rest of its clause.
 */
export function completeSentences(text: string): string {
  const trimmed = text.trim();
  let last = -1;
  for (const punc of PUNC_EOS) last = Math.max(last, trimmed.lastIndexOf(punc));
  return last === -1 ? "" : trimmed.slice(0, last + 1);
}

/** Levenshtein distance, iterative with a single row. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  if (a.length > b.length) [a, b] = [b, a];

  let previous = Array.from({ length: a.length + 1 }, (_, i) => i);
  for (let j = 1; j <= b.length; j += 1) {
    const current = [j];
    for (let i = 1; i <= a.length; i += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[i] = Math.min(current[i - 1] + 1, previous[i] + 1, previous[i - 1] + cost);
    }
    previous = current;
  }
  return previous[a.length];
}

/**
 * How alike two lines are, 0..1.
 *
 * One line being a prefix of the other counts as identical, because that is
 * what a growing caption looks like rather than two different sentences.
 */
export function similarity(a: string, b: string): number {
  const x = a.trim();
  const y = b.trim();
  if (!x && !y) return 1;
  if (!x || !y) return 0;
  if (x.startsWith(y) || y.startsWith(x)) return 1;
  const longest = Math.max(x.length, y.length);
  return 1 - editDistance(x, y) / longest;
}

/** Above this, two lines are the same thing said twice. */
export const DUPLICATE_THRESHOLD = 0.82;

export function isNearDuplicate(a: string, b: string, threshold = DUPLICATE_THRESHOLD): boolean {
  return similarity(a, b) >= threshold;
}
