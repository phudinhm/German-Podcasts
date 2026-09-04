/**
 * Where a word sits inside a line, in seconds.
 *
 * A caption line has a start and an end but no per-word timings, so clicking
 * the fifth word of a line has to be estimated. Splitting the line's duration
 * by character count rather than by word count is noticeably better in German:
 * "Geschwindigkeitsbegrenzung" takes far longer to say than "und", and a
 * language full of compounds punishes the naive version most exactly where a
 * learner is most likely to click.
 */

/** Letters are weighted; spaces and punctuation carry almost no time. */
function weight(token: string): number {
  const letters = token.replace(/[^\p{L}\p{N}]/gu, "").length;
  return letters > 0 ? letters : 0.25;
}

/**
 * Start time of the token at `index` within `tokens`, spread across the line.
 *
 * `tokens` includes whitespace pieces, exactly as the renderer splits them, so
 * an index taken from the rendered list lines up without further bookkeeping.
 */
export function wordTime(tokens: string[], index: number, at: number, until: number): number {
  const span = Math.max(0, until - at);
  if (span === 0 || tokens.length === 0) return at;

  let total = 0;
  for (const token of tokens) total += weight(token);
  if (total === 0) return at;

  let before = 0;
  for (let i = 0; i < index && i < tokens.length; i += 1) before += weight(tokens[i]);

  // A small lead, because a click means "play this word" and a listener would
  // rather catch its first consonant than start halfway through it.
  return Math.max(at, at + (before / total) * span - 0.15);
}
