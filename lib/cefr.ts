import { CEFR_LEVELS, type Cefr, type EpisodeMetrics, type Segment } from "./types";
import { tokenizeWords } from "./german/orthography";
import { lemmatize } from "./german/lemma";
import { isCompound, splitCompound } from "./german/compound";
import { GOETHE } from "../data/lexicon/goethe";
import { PROPER_NOUNS } from "../data/lexicon/proper-nouns";

const LISTS: Record<"A1" | "A2" | "B1", Set<string>> = {
  A1: new Set(GOETHE.A1.split(/\s+/).filter(Boolean)),
  A2: new Set(GOETHE.A2.split(/\s+/).filter(Boolean)),
  B1: new Set(GOETHE.B1.split(/\s+/).filter(Boolean)),
};

export interface Coverage {
  /** Cumulative share of tokens covered by the list at or below this level. */
  cumulative: Record<"A1" | "A2" | "B1", number>;
  /** Share of tokens in no shipped list at all. */
  outOfList: number;
  /** Share of tokens that are multi-member compounds. */
  compoundRatio: number;
  tokenCount: number;
}

const PROPER = new Set(PROPER_NOUNS);

const LEVEL_ORDER = { A1: 0, A2: 1, B1: 2 } as const;

function listLevel(lemma: string): "A1" | "A2" | "B1" | null {
  const key = lemma.toLowerCase();
  if (LISTS.A1.has(key)) return "A1";
  if (LISTS.A2.has(key)) return "A2";
  if (LISTS.B1.has(key)) return "B1";
  return null;
}

/**
 * Resolves a token to a list level.
 *
 * A compound is only as hard as its hardest member: "Straßenbahn" is Straße
 * plus Bahn, both of which an A1 learner knows, so it does not belong in the
 * unknown bucket. Scoring members individually is the whole reason the
 * splitter exists.
 */
function lookupLevel(lemma: string): "A1" | "A2" | "B1" | null {
  const direct = listLevel(lemma);
  if (direct) return direct;

  const members = splitCompound(lemma.toLowerCase());
  if (members.length < 2) return null;

  let worst: "A1" | "A2" | "B1" = "A1";
  for (const member of members) {
    // Strip a linking element before looking the member up.
    const level = listLevel(member) ?? listLevel(member.replace(/(es|s|en|n|er|e)$/, ""));
    if (!level) return null;
    if (LEVEL_ORDER[level] > LEVEL_ORDER[worst]) worst = level;
  }
  return worst;
}

function isProperNoun(token: string): boolean {
  return PROPER.has(token.toLowerCase());
}

export function measureCoverage(text: string): Coverage {
  const tokens = tokenizeWords(text);
  const counts = { A1: 0, A2: 0, B1: 0, out: 0 };
  let compounds = 0;

  let scored = 0;
  for (const token of tokens) {
    if (isProperNoun(token) || /^\d+$/.test(token)) continue;
    scored += 1;
    const { lemma } = lemmatize(token);
    const level = lookupLevel(lemma) ?? lookupLevel(token);
    if (level) counts[level] += 1;
    else counts.out += 1;
    if (isCompound(token.toLowerCase())) compounds += 1;
  }

  const total = Math.max(1, scored);
  return {
    cumulative: {
      A1: counts.A1 / total,
      A2: (counts.A1 + counts.A2) / total,
      B1: (counts.A1 + counts.A2 + counts.B1) / total,
    },
    outOfList: counts.out / total,
    compoundRatio: compounds / total,
    tokenCount: scored,
  };
}

/**
 * Coverage thresholds, in cumulative share of scored tokens per Goethe list.
 *
 * Calibrated against the subsets shipped in data/lexicon/goethe.ts, not against
 * the full published lists. If you swap the full lists in, every number here
 * shifts up by roughly ten points and the bands need re-fitting - run
 * `npm run classify` over texts whose level you already trust and move the
 * thresholds until the labels agree.
 */
const BANDS: Array<{ level: Cefr; minA1: number; minA2: number; minB1: number; maxOut: number }> = [
  { level: "A1", minA1: 0.8, minA2: 0.9, minB1: 0.93, maxOut: 0.07 },
  { level: "A2", minA1: 0.72, minA2: 0.84, minB1: 0.85, maxOut: 0.15 },
  { level: "B1", minA1: 0.55, minA2: 0.64, minB1: 0.7, maxOut: 0.29 },
  { level: "B2", minA1: 0.46, minA2: 0.55, minB1: 0.64, maxOut: 0.36 },
  { level: "C1", minA1: 0.38, minA2: 0.46, minB1: 0.55, maxOut: 0.45 },
];

export interface Classification {
  level: Cefr;
  coverage: Coverage;
  /** Level implied by vocabulary alone, before the speech-rate adjustment. */
  lexicalLevel: Cefr;
  /** How many bands the speech rate pushed the label up. */
  rateAdjustment: number;
  rationale: string;
}

/**
 * Classifies a transcript. Vocabulary sets the base level; delivery speed can
 * push it one band harder, because the same words at 7 syllables per second
 * are a different listening task than at 4.
 */
export function classify(segments: Segment[], syllablesPerSecond: number): Classification {
  const text = segments.map((s) => s.de).join(" ");
  const coverage = measureCoverage(text);

  let lexicalLevel: Cefr = "C2";
  for (const band of BANDS) {
    if (
      coverage.cumulative.A1 >= band.minA1 &&
      coverage.cumulative.A2 >= band.minA2 &&
      coverage.cumulative.B1 >= band.minB1 &&
      coverage.outOfList <= band.maxOut
    ) {
      lexicalLevel = band.level;
      break;
    }
  }

  // Delivery speed can move the label one band. The thresholds are articulation
  // rate, measured across speech only, with inter-sentence pauses excluded.
  let rateAdjustment = 0;
  if (syllablesPerSecond >= 6.0) rateAdjustment = 1;
  else if (syllablesPerSecond > 0 && syllablesPerSecond <= 3.1) rateAdjustment = -1;

  const baseIndex = CEFR_LEVELS.indexOf(lexicalLevel);
  const index = Math.min(
    CEFR_LEVELS.length - 1,
    Math.max(0, baseIndex + rateAdjustment),
  );
  const level = CEFR_LEVELS[index];

  const rationale = [
    `${(coverage.cumulative.B1 * 100).toFixed(0)}% of tokens sit inside the Goethe A1-B1 lists`,
    `${(coverage.outOfList * 100).toFixed(0)}% fall outside them`,
    `${(coverage.compoundRatio * 100).toFixed(0)}% are compounds`,
    `delivery runs at ${syllablesPerSecond.toFixed(1)} syllables per second`,
  ].join(", ");

  return { level, coverage, lexicalLevel, rateAdjustment, rationale };
}

export function goetheCoverageForMetrics(coverage: Coverage): Pick<EpisodeMetrics, "goetheCoverage" | "outOfListRatio"> {
  return {
    goetheCoverage: {
      A1: Number(coverage.cumulative.A1.toFixed(3)),
      A2: Number(coverage.cumulative.A2.toFixed(3)),
      B1: Number(coverage.cumulative.B1.toFixed(3)),
    },
    outOfListRatio: Number(coverage.outOfList.toFixed(3)),
  };
}

export const CEFR_DESCRIPTIONS: Record<Cefr, string> = {
  A1: "Slow, scripted speech about everyday things. Short sentences, present tense.",
  A2: "Clear speech on familiar topics. Simple past appears, clauses stay short.",
  B1: "Normal-paced speech on work, news and opinion. Subordinate clauses throughout.",
  B2: "Native-paced discussion with abstract argument and idiom.",
  C1: "Fast, unscripted native speech. Irony, register shifts, specialist vocabulary.",
  C2: "Anything a native audience gets, including regional colour and wordplay.",
};
