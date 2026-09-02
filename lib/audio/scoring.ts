import { tokenizeWords } from "@/lib/german/orthography";

/**
 * On-device pronunciation scoring.
 *
 * The honest framing: this scores what a German speech recogniser *heard*, not
 * your phonemes. It catches dropped words, wrong stress patterns that break
 * recognition and vowels far enough off to change the word, which is most of
 * what a learner needs. Wire AZURE_SPEECH_KEY for true phoneme-level assessment.
 */

export interface WordScore {
  target: string;
  heard: string | null;
  /** 0..1 similarity of the recognised token to the target. */
  similarity: number;
  verdict: "good" | "close" | "missed";
}

export interface PronunciationScore {
  words: WordScore[];
  /** 0..100 share of target words recognised well. */
  accuracy: number;
  /** 0..100 how completely the sentence was produced. */
  completeness: number;
  transcript: string;
}

function normalise(word: string): string {
  return word
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/[^a-z]/g, "");
}

/** Levenshtein-based similarity, 0..1. */
export function similarity(a: string, b: string): number {
  const left = normalise(a);
  const right = normalise(b);
  if (!left || !right) return 0;
  if (left === right) return 1;

  const rows = left.length + 1;
  const cols = right.length + 1;
  let previous = new Array<number>(cols);
  let current = new Array<number>(cols);
  for (let j = 0; j < cols; j += 1) previous[j] = j;

  for (let i = 1; i < rows; i += 1) {
    current[0] = i;
    for (let j = 1; j < cols; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
    }
    [previous, current] = [current, previous];
  }
  const distance = previous[cols - 1];
  return 1 - distance / Math.max(left.length, right.length);
}

/**
 * Aligns what was heard against the target sentence, greedily and in order, so
 * a skipped word shifts the rest rather than silently matching the wrong one.
 */
export function scorePronunciation(target: string, heard: string): PronunciationScore {
  const targets = tokenizeWords(target);
  const heardTokens = tokenizeWords(heard);

  const words: WordScore[] = [];
  let cursor = 0;

  for (const word of targets) {
    let best = { index: -1, score: 0 };
    // Look a couple of tokens ahead, so one inserted filler does not derail it.
    for (let offset = 0; offset < 3 && cursor + offset < heardTokens.length; offset += 1) {
      const score = similarity(word, heardTokens[cursor + offset]);
      if (score > best.score) best = { index: cursor + offset, score };
    }
    if (best.score >= 0.55) {
      words.push({
        target: word,
        heard: heardTokens[best.index],
        similarity: best.score,
        verdict: best.score >= 0.85 ? "good" : "close",
      });
      cursor = best.index + 1;
    } else {
      words.push({ target: word, heard: null, similarity: 0, verdict: "missed" });
    }
  }

  const recognised = words.filter((w) => w.verdict !== "missed");
  const accuracy =
    recognised.length === 0
      ? 0
      : Math.round((recognised.reduce((sum, w) => sum + w.similarity, 0) / recognised.length) * 100);
  const completeness = Math.round((recognised.length / Math.max(1, targets.length)) * 100);

  return { words, accuracy, completeness, transcript: heard };
}
