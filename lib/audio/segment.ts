/**
 * Splitting recognised speech into caption-sized lines.
 *
 * Continuous speech recognition emits whatever it has when it decides an
 * utterance ended, which on a fluent speaker can be thirty words in one block.
 * A caption that long is useless: it scrolls past, it cannot be clicked
 * precisely, and its single timestamp points at the start of a passage rather
 * than at a phrase.
 *
 * Splitting is by punctuation first, because German punctuation marks real
 * clause boundaries, then by length. Timestamps are interpolated across the
 * chunk in proportion to syllable-ish weight rather than character count, so a
 * long compound noun does not steal time from the words around it.
 */

/** Below this, a line is too short to be worth its own row. */
export const MIN_WORDS = 4;
/** Above this, a line is too long to follow while listening. */
export const MAX_WORDS = 14;
/** Never split a chunk shorter than this many seconds. */
export const MIN_CHUNK_SECONDS = 0.8;

export interface TextChunk {
  text: string;
  /** Fraction of the utterance, 0..1, where this chunk starts and ends. */
  fromRatio: number;
  toRatio: number;
}

export interface TimedChunk {
  text: string;
  at: number;
  until: number;
}

/** Rough spoken weight of a word: long words take longer to say. */
function weight(word: string): number {
  const letters = word.replace(/[^\p{L}]/gu, "").length;
  // A syllable is about 2.5 letters in German; never weight a word at zero.
  return Math.max(1, Math.round(letters / 2.5));
}

/**
 * Breaks a block of recognised text into readable lines.
 *
 * Punctuation wins where it exists. Where it does not, which is most of the
 * time because recognisers rarely punctuate, the text is cut on word count with
 * a look for a natural seam: a conjunction or a preposition starts a new line
 * better than the middle of a noun phrase does.
 */
const SEAM_WORDS = new Set([
  "und", "aber", "oder", "denn", "sondern", "weil", "dass", "wenn", "als", "ob",
  "obwohl", "während", "damit", "bevor", "nachdem", "sodass", "wobei", "wodurch",
  "der", "die", "das", "ein", "eine", "im", "in", "auf", "mit", "für", "von",
  "zu", "bei", "nach", "über", "unter", "durch", "gegen", "ohne", "um",
]);

export function chunkText(raw: string): TextChunk[] {
  const text = raw.trim().replace(/\s+/g, " ");
  if (!text) return [];

  const words = text.split(" ");
  const weights = words.map(weight);
  const total = weights.reduce((sum, value) => sum + value, 0) || 1;

  if (words.length <= MAX_WORDS) {
    return [{ text, fromRatio: 0, toRatio: 1 }];
  }

  // First pass: cut after sentence-ending punctuation.
  const groups: number[][] = [];
  let current: number[] = [];
  for (let i = 0; i < words.length; i += 1) {
    current.push(i);
    const endsSentence = /[.!?…]$/.test(words[i]);
    if (endsSentence && current.length >= MIN_WORDS) {
      groups.push(current);
      current = [];
    }
  }
  if (current.length) groups.push(current);

  // Second pass: anything still too long gets cut on a seam near the middle.
  const refined: number[][] = [];
  for (const group of groups) {
    let rest = group;
    while (rest.length > MAX_WORDS) {
      const target = Math.min(MAX_WORDS, Math.ceil(rest.length / 2));
      let cut = target;
      // Look for a seam word to start the next line, within a small window.
      for (let offset = 0; offset <= 3; offset += 1) {
        const forward = target + offset;
        const backward = target - offset;
        if (forward < rest.length - MIN_WORDS && SEAM_WORDS.has(strip(words[rest[forward]]))) {
          cut = forward;
          break;
        }
        if (backward > MIN_WORDS && SEAM_WORDS.has(strip(words[rest[backward]]))) {
          cut = backward;
          break;
        }
      }
      refined.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    if (rest.length) {
      // A stub left over from the split joins the line before it.
      if (rest.length < MIN_WORDS && refined.length > 0) {
        refined[refined.length - 1] = [...refined[refined.length - 1], ...rest];
      } else {
        refined.push(rest);
      }
    }
  }

  // Turn word groups into ratios using accumulated weight.
  const prefix: number[] = [0];
  for (let i = 0; i < weights.length; i += 1) prefix.push(prefix[i] + weights[i]);

  return refined
    .filter((group) => group.length > 0)
    .map((group) => ({
      text: group.map((index) => words[index]).join(" "),
      fromRatio: prefix[group[0]] / total,
      toRatio: prefix[group[group.length - 1] + 1] / total,
    }));
}

function strip(word: string): string {
  return word.replace(/[^\p{L}]/gu, "").toLowerCase();
}

/** Places chunks on the media timeline between `at` and `until`. */
export function timeChunks(chunks: TextChunk[], at: number, until: number): TimedChunk[] {
  const span = Math.max(MIN_CHUNK_SECONDS, until - at);
  return chunks.map((chunk) => ({
    text: chunk.text,
    at: at + chunk.fromRatio * span,
    until: at + chunk.toRatio * span,
  }));
}

/** Convenience: split and place in one step. */
export function splitUtterance(text: string, at: number, until: number): TimedChunk[] {
  return timeChunks(chunkText(text), at, until);
}
