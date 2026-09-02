import { normaliseWord, syllabify, tokenizeWords } from "./orthography";
import { splitCompound } from "./compound";

export type HazardKind =
  | "final-devoicing"
  | "ich-laut"
  | "ach-laut"
  | "cluster"
  | "s-onset"
  | "vowel-length"
  | "r-vocalisation"
  | "compound-stress";

export interface Hazard {
  kind: HazardKind;
  /** Character offsets inside the token the hazard applies to. */
  start: number;
  end: number;
  /** The orthographic slice being flagged. */
  text: string;
  /** How it is actually pronounced. */
  realised: string;
  ipa: string;
  hint: string;
}

export interface WordAnalysis {
  token: string;
  normalised: string;
  syllables: string[];
  /** Compound parts, empty when the word is not a compound. */
  parts: string[];
  /** Index into `syllables` carrying primary stress. */
  stressIndex: number;
  hazards: Hazard[];
  /** 0..1 - how much articulatory preparation this word demands. */
  difficulty: number;
}

const FRONT_VOWEL_CONTEXT = /[eiäöüy]$|ei$|eu$|äu$|[lnr]$/;
const BACK_VOWEL_CONTEXT = /[aou]$|au$/;

/** Consonant letters after digraph folding, used for cluster detection. */
function foldDigraphs(word: string): { folded: string; map: number[] } {
  const replacements: Array<[string, string]> = [
    ["sch", "S"],
    ["tsch", "C"],
    ["ch", "X"],
    ["ck", "k"],
    ["ph", "f"],
    ["th", "t"],
    ["qu", "kv"],
    ["ss", "s"],
    ["ß", "s"],
  ];
  let folded = "";
  const map: number[] = [];
  let i = 0;
  outer: while (i < word.length) {
    for (const [from, to] of replacements) {
      if (word.startsWith(from, i)) {
        for (const ch of to) {
          folded += ch;
          map.push(i);
        }
        i += from.length;
        continue outer;
      }
    }
    folded += word[i];
    map.push(i);
    i += 1;
  }
  return { folded, map };
}

const FOLDED_VOWELS = new Set("aeiouäöüy".split(""));

function isFoldedConsonant(ch: string): boolean {
  return !FOLDED_VOWELS.has(ch);
}

/**
 * Final devoicing (Auslautverhärtung): b, d, g, s, v lose their voicing at the
 * end of a syllable or morpheme. Applies word-finally, before a syllable-final
 * consonant, and at the seam of a compound.
 */
function findFinalDevoicing(word: string, morphemeEnds: Set<number>): Hazard[] {
  const table: Record<string, { ipa: string; letter: string }> = {
    b: { ipa: "p", letter: "p" },
    d: { ipa: "t", letter: "t" },
    g: { ipa: "k", letter: "k" },
    v: { ipa: "f", letter: "f" },
  };
  const hazards: Hazard[] = [];

  for (let i = 0; i < word.length; i += 1) {
    const ch = word[i];
    const entry = table[ch];
    if (!entry) continue;

    const next = word[i + 1];
    const atWordEnd = i === word.length - 1;
    const atMorphemeEnd = morphemeEnds.has(i + 1);
    // Devoicing also applies before a final consonant, e.g. "sagst", "lebt".
    const beforeFinalConsonant =
      next !== undefined && !FOLDED_VOWELS.has(next) && !/[lrmn]/.test(next);

    if (!atWordEnd && !atMorphemeEnd && !beforeFinalConsonant) continue;
    // "-ig" word-finally is [ɪç], handled by the ich-Laut rule instead.
    if (ch === "g" && atWordEnd && word.endsWith("ig")) continue;

    hazards.push({
      kind: "final-devoicing",
      start: i,
      end: i + 1,
      text: ch,
      realised: entry.letter,
      ipa: `[${entry.ipa}]`,
      hint: `Final ${ch} hardens to ${entry.letter}. Say it voiceless.`,
    });
  }
  return hazards;
}

/** ch after front vowels or l/n/r is [ç]; after back vowels it is [x]. */
function findChSounds(word: string): Hazard[] {
  const hazards: Hazard[] = [];
  for (let i = 0; i < word.length - 1; i += 1) {
    if (word[i] !== "c" || word[i + 1] !== "h") continue;
    if (word[i - 1] === "s") continue; // part of "sch"
    if (word.startsWith("chs", i) && !word.startsWith("chs", 0)) {
      hazards.push({
        kind: "cluster",
        start: i,
        end: i + 3,
        text: "chs",
        realised: "ks",
        ipa: "[ks]",
        hint: "chs collapses to a plain [ks], as in sechs or Fuchs.",
      });
      i += 2;
      continue;
    }
    const before = word.slice(0, i);
    if (i === 0) {
      // Word-initial ch: [ç] before front vowels (Chemie), [k] otherwise (Chaos).
      const isFront = /^[eiy]/.test(word.slice(2));
      hazards.push({
        kind: isFront ? "ich-laut" : "cluster",
        start: 0,
        end: 2,
        text: "ch",
        realised: isFront ? "ç" : "k",
        ipa: isFront ? "[ç]" : "[k]",
        hint: isFront
          ? "Word-initial ch here is the soft [ç], as in Chemie."
          : "Word-initial ch here is a hard [k], as in Chaos.",
      });
      continue;
    }
    if (BACK_VOWEL_CONTEXT.test(before)) {
      hazards.push({
        kind: "ach-laut",
        start: i,
        end: i + 2,
        text: "ch",
        realised: "x",
        ipa: "[x]",
        hint: "Ach-Laut: scrape it at the back of the throat, as in Sprache.",
      });
    } else if (FRONT_VOWEL_CONTEXT.test(before)) {
      hazards.push({
        kind: "ich-laut",
        start: i,
        end: i + 2,
        text: "ch",
        realised: "ç",
        ipa: "[ç]",
        hint: "Ich-Laut: soft palatal hiss, tongue high and forward, as in sprechen.",
      });
    }
  }
  // Word-final "-ig" is [ɪç] in standard German.
  if (/ig$/.test(word) && word.length > 2) {
    hazards.push({
      kind: "ich-laut",
      start: word.length - 2,
      end: word.length,
      text: "ig",
      realised: "ɪç",
      ipa: "[ɪç]",
      hint: "Standard German says final -ig as [ɪç], not [ɪk].",
    });
  }
  return hazards;
}

/** st- and sp- at the start of a word or morpheme are [ʃt] and [ʃp]. */
function findSOnsets(word: string, morphemeStarts: Set<number>): Hazard[] {
  const hazards: Hazard[] = [];
  for (const start of [0, ...morphemeStarts]) {
    const pair = word.slice(start, start + 2);
    if (pair === "st" || pair === "sp") {
      hazards.push({
        kind: "s-onset",
        start,
        end: start + 2,
        text: pair,
        realised: pair === "st" ? "ʃt" : "ʃp",
        ipa: pair === "st" ? "[ʃt]" : "[ʃp]",
        hint: `${pair}- at the start of a stem is pronounced sch${pair[1]}.`,
      });
    }
  }
  return hazards;
}

/** Runs of three or more consonant sounds need articulatory preparation. */
function findClusters(word: string): Hazard[] {
  const { folded, map } = foldDigraphs(word);
  const hazards: Hazard[] = [];
  let run = 0;
  for (let i = 0; i <= folded.length; i += 1) {
    const ch = folded[i];
    if (ch !== undefined && isFoldedConsonant(ch)) {
      run += 1;
      continue;
    }
    if (run >= 3) {
      const startFolded = i - run;
      const start = map[startFolded];
      const end = i < folded.length ? map[i] : word.length;
      hazards.push({
        kind: "cluster",
        start,
        end,
        text: word.slice(start, end),
        realised: word.slice(start, end),
        ipa: `${run} consonants`,
        hint: `A ${run}-consonant cluster. Set your tongue before you start the syllable.`,
      });
    }
    run = 0;
  }
  // Pf- and Ps- onsets are only two consonants but are still non-native for
  // English and Vietnamese speakers.
  if (/^(pf|ps|kn|gn|tsch|zw)/.test(word)) {
    const length = word.startsWith("tsch") ? 4 : 2;
    hazards.push({
      kind: "cluster",
      start: 0,
      end: length,
      text: word.slice(0, length),
      realised: word.slice(0, length),
      ipa: "onset",
      hint: "Both consonants are pronounced. Do not drop the first one.",
    });
  }
  return hazards;
}

/** Unstressed -er and r after a vowel become the vocalic [ɐ]. */
function findRVocalisation(word: string): Hazard[] {
  if (/er$/.test(word) && word.length > 2) {
    return [
      {
        kind: "r-vocalisation",
        start: word.length - 2,
        end: word.length,
        text: "er",
        realised: "ɐ",
        ipa: "[ɐ]",
        hint: "Final -er is a dark vowel [ɐ], closer to uh than to a tapped r.",
      },
    ];
  }
  return [];
}

export function analyseWord(token: string): WordAnalysis {
  const normalised = normaliseWord(token);
  if (!normalised) {
    return {
      token,
      normalised: "",
      syllables: [],
      parts: [],
      stressIndex: 0,
      hazards: [],
      difficulty: 0,
    };
  }

  const parts = splitCompound(normalised);
  const morphemeStarts = new Set<number>();
  const morphemeEnds = new Set<number>();
  if (parts.length > 1) {
    let offset = 0;
    for (const part of parts) {
      if (offset > 0) morphemeStarts.add(offset);
      offset += part.length;
      if (offset < normalised.length) morphemeEnds.add(offset);
    }
  }

  const syllables = syllabify(normalised);
  // Primary stress falls on the first syllable of the first compound element,
  // except for stress-final loan suffixes and unstressed verb prefixes.
  let stressIndex = 0;
  const UNSTRESSED_PREFIXES = ["be", "ge", "er", "ver", "zer", "ent", "emp", "miss"];
  if (syllables.length > 1 && UNSTRESSED_PREFIXES.includes(syllables[0])) {
    stressIndex = 1;
  }
  if (/(ion|ionen|tät|ieren|iert|ismus|ie|ur|anz|enz)$/.test(normalised) && syllables.length > 2) {
    stressIndex = Math.max(0, syllables.length - (/(ionen|ieren)$/.test(normalised) ? 2 : 1));
  }

  const hazards = [
    ...findChSounds(normalised),
    ...findFinalDevoicing(normalised, morphemeEnds),
    ...findSOnsets(normalised, morphemeStarts),
    ...findClusters(normalised),
    ...findRVocalisation(normalised),
  ].sort((a, b) => a.start - b.start || b.end - a.end);

  // Drop hazards fully contained inside an earlier one of the same span.
  const merged: Hazard[] = [];
  for (const hazard of hazards) {
    const overlapping = merged.find(
      (m) => m.kind === hazard.kind && m.start === hazard.start && m.end === hazard.end,
    );
    if (!overlapping) merged.push(hazard);
  }

  const clusterWeight = merged.filter((h) => h.kind === "cluster").length * 0.25;
  const soundWeight = merged.filter((h) => h.kind === "ich-laut" || h.kind === "ach-laut").length * 0.15;
  const lengthWeight = Math.min(0.4, Math.max(0, normalised.length - 8) * 0.04);
  const compoundWeight = parts.length > 1 ? 0.15 * (parts.length - 1) : 0;
  const difficulty = Math.min(1, clusterWeight + soundWeight + lengthWeight + compoundWeight);

  return { token, normalised, syllables, parts, stressIndex, hazards, difficulty };
}

/** Renders "Wirtschaftskrise" as "WIRT-schafts-kri-se". */
export function stressPattern(analysis: WordAnalysis): string {
  return analysis.syllables
    .map((syllable, index) => (index === analysis.stressIndex ? syllable.toUpperCase() : syllable))
    .join("-");
}

/** Share of tokens in a text that carry at least one hazard. */
export function phoneticComplexity(text: string): number {
  const tokens = tokenizeWords(text);
  if (tokens.length === 0) return 0;
  let weighted = 0;
  for (const token of tokens) {
    weighted += analyseWord(token).difficulty;
  }
  return Math.min(1, weighted / tokens.length);
}
