import { countSyllablesInText, tokenizeWords } from "./german/orthography";
import { phoneticComplexity } from "./german/phonetics";
import { lemmatize } from "./german/lemma";
import type { EpisodeMetrics, Segment } from "./types";

/**
 * Shadowing Difficulty Metric.
 *
 * Three inputs, each normalised to 0..1 against the range that actually occurs
 * in German speech, then combined with weights that reflect how much each one
 * hurts a shadower:
 *
 *  - speech rate dominates. Below ~3.5 syl/s almost anyone can keep up; above
 *    ~7 syl/s even advanced learners fall behind.
 *  - lexical diversity matters next: a narrow vocabulary is forgiving because
 *    the same words keep coming back.
 *  - phonetic complexity is real but secondary; you can shadow a hard cluster
 *    slowly, you cannot shadow a fast clause at all.
 */
export const SDM_WEIGHTS = { rate: 0.5, diversity: 0.3, phonetics: 0.2 } as const;

const RATE_FLOOR = 3.0;
const RATE_CEILING = 7.5;
/** Mean segmental type-token ratio typical of repetitive vs dense German speech. */
const DIVERSITY_FLOOR = 0.78;
const DIVERSITY_CEILING = 0.94;
/** Window size for the segmental TTR, in tokens. */
const MSTTR_WINDOW = 50;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function syllablesPerSecond(segments: Segment[]): number {
  let syllables = 0;
  let seconds = 0;
  for (const segment of segments) {
    const duration = Math.max(0, segment.end - segment.start);
    if (duration <= 0) continue;
    syllables += countSyllablesInText(segment.de);
    seconds += duration;
  }
  return seconds > 0 ? syllables / seconds : 0;
}

/**
 * Mean segmental type-token ratio over lemmas.
 *
 * A plain TTR falls as a text gets longer, so a 40-minute interview would score
 * as "easier" than a 90-second news bulletin purely because of length. Averaging
 * the ratio over fixed 50-token windows removes that, which is what makes the
 * number comparable across a 100-second bulletin and a four-hour interview.
 */
export function lexicalDiversity(text: string): number {
  const tokens = tokenizeWords(text).map((t) => lemmatize(t).lemma.toLowerCase());
  if (tokens.length === 0) return 0;
  if (tokens.length < MSTTR_WINDOW) {
    return clamp01(new Set(tokens).size / tokens.length);
  }

  let sum = 0;
  let windows = 0;
  for (let start = 0; start + MSTTR_WINDOW <= tokens.length; start += MSTTR_WINDOW) {
    const window = tokens.slice(start, start + MSTTR_WINDOW);
    sum += new Set(window).size / window.length;
    windows += 1;
  }
  return clamp01(sum / windows);
}

export function computeSdm(input: {
  syllablesPerSecond: number;
  lexicalDiversity: number;
  phoneticComplexity: number;
}): number {
  const rate = clamp01((input.syllablesPerSecond - RATE_FLOOR) / (RATE_CEILING - RATE_FLOOR));
  const diversity = clamp01(
    (input.lexicalDiversity - DIVERSITY_FLOOR) / (DIVERSITY_CEILING - DIVERSITY_FLOOR),
  );
  const phonetics = clamp01(input.phoneticComplexity / 0.6);
  const score =
    SDM_WEIGHTS.rate * rate +
    SDM_WEIGHTS.diversity * diversity +
    SDM_WEIGHTS.phonetics * phonetics;
  return Math.round(score * 100);
}

export function shadowingBadge(sdm: number): { label: string; tone: "easy" | "steady" | "brisk" | "punishing" } {
  if (sdm < 25) return { label: "Gentle", tone: "easy" };
  if (sdm < 50) return { label: "Steady", tone: "steady" };
  if (sdm < 72) return { label: "Brisk", tone: "brisk" };
  return { label: "Punishing", tone: "punishing" };
}

export function analyseSegments(segments: Segment[]): Omit<EpisodeMetrics, "goetheCoverage" | "outOfListRatio"> {
  const text = segments.map((s) => s.de).join(" ");
  const rate = syllablesPerSecond(segments);
  const diversity = lexicalDiversity(text);
  const phonetics = phoneticComplexity(text);
  return {
    syllablesPerSecond: Number(rate.toFixed(2)),
    lexicalDiversity: Number(diversity.toFixed(3)),
    phoneticComplexity: Number(phonetics.toFixed(3)),
    sdm: computeSdm({
      syllablesPerSecond: rate,
      lexicalDiversity: diversity,
      phoneticComplexity: phonetics,
    }),
  };
}

/**
 * Picks the sentences worth drilling: long enough to be a real phrase, short
 * enough to hold in working memory, and dense in level-appropriate vocabulary.
 */
export function selectDrillSegments(segments: Segment[], count = 5): string[] {
  const scored = segments
    .map((segment) => {
      const tokens = tokenizeWords(segment.de);
      const duration = segment.end - segment.start;
      if (tokens.length < 6 || tokens.length > 22 || duration < 2 || duration > 12) {
        return { id: segment.id, score: -1 };
      }
      const lemmas = new Set(tokens.map((t) => lemmatize(t).lemma.toLowerCase()));
      const density = lemmas.size / tokens.length;
      const phonetics = phoneticComplexity(segment.de);
      // Favour phrases that are lexically rich but not phonetic minefields.
      const score = density * 0.6 + Math.min(phonetics, 0.4) * 0.4 + Math.min(tokens.length, 16) / 100;
      return { id: segment.id, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, count).map((s) => s.id);
}
