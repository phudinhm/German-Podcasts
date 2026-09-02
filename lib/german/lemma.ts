import { normaliseWord } from "./orthography";
import { IRREGULAR_VERBS } from "../../data/lexicon/irregular-verbs";

const IRREGULAR: Record<string, string> = IRREGULAR_VERBS;

/** Prefixes that detach in main clauses: "steht ... auf" belongs to "aufstehen". */
export const SEPARABLE_PREFIXES = [
  "ab","an","auf","aus","bei","durch","ein","empor","entgegen","entlang","fest","fort","gegenüber",
  "her","herab","heran","herauf","heraus","herein","herum","herunter","hervor","hin","hinab","hinauf",
  "hinaus","hinein","hinter","hinunter","los","mit","nach","nieder","statt","teil","über","um","unter",
  "vor","voran","voraus","vorbei","vorüber","weg","weiter","wieder","zu","zurecht","zurück","zusammen",
];

/** Prefixes that never detach, so the finite verb keeps them. */
export const INSEPARABLE_PREFIXES = ["be","emp","ent","er","ge","miss","ver","zer","voll","wider","hinter"];

export interface LemmaGuess {
  lemma: string;
  pos: "noun" | "verb" | "adjective" | "other";
  /** Filled when the token is a participle or finite form of a separable verb. */
  separable?: { prefix: string; stem: string };
  confidence: number;
  reason: string;
}

/**
 * Heuristic German lemmatiser. It is deliberately conservative: when nothing
 * matches it returns the surface form with low confidence so the caller can
 * escalate to the dictionary or an LLM.
 */
export function lemmatize(token: string, options: { capitalised?: boolean } = {}): LemmaGuess {
  const surface = normaliseWord(token);
  if (!surface) return { lemma: token, pos: "other", confidence: 0, reason: "empty" };

  const direct = IRREGULAR[surface];
  if (direct) {
    return { lemma: direct, pos: "verb", confidence: 0.95, reason: "irregular table" };
  }

  const looksLikeNoun = options.capitalised ?? /^[A-ZÄÖÜ]/.test(token.trim());

  // Past participles: ge-...-t / ge-...-en, including separable ones (aufgestanden).
  const participle = surface.match(/^(?:(.*?)ge)?(\p{L}+?)(t|en)$/u);
  if (!looksLikeNoun && surface.startsWith("ge") && /(t|en)$/.test(surface)) {
    const stem = surface.replace(/^ge/, "").replace(/(t|en)$/, "");
    const candidate = IRREGULAR[`ge${stem}en`] ?? `${stem}en`;
    return { lemma: candidate, pos: "verb", confidence: 0.6, reason: "ge- participle" };
  }
  if (!looksLikeNoun && participle?.[1]) {
    const prefix = participle[1];
    if (SEPARABLE_PREFIXES.includes(prefix)) {
      const stem = `${participle[2]}en`;
      return {
        lemma: prefix + (IRREGULAR[stem] ?? stem),
        pos: "verb",
        separable: { prefix, stem: IRREGULAR[stem] ?? stem },
        confidence: 0.6,
        reason: "separable participle",
      };
    }
  }

  if (looksLikeNoun) {
    return { lemma: capitalise(singularise(surface)), pos: "noun", confidence: 0.6, reason: "noun plural rules" };
  }

  // Finite verb endings.
  const verbEndings: Array<[RegExp, string]> = [
    [/(.{3,})test$/, "en"],
    [/(.{3,})tet$/, "en"],
    [/(.{3,})ten$/, "en"],
    [/(.{3,})est$/, "en"],
    [/(.{3,})st$/, "en"],
    [/(.{3,})et$/, "en"],
    [/(.{3,})te$/, "en"],
    [/(.{3,})t$/, "en"],
    [/(.{3,})e$/, "en"],
  ];
  for (const [pattern, ending] of verbEndings) {
    const match = surface.match(pattern);
    if (!match) continue;
    const candidate = match[1] + ending;
    if (IRREGULAR[candidate]) {
      return { lemma: IRREGULAR[candidate], pos: "verb", confidence: 0.7, reason: "irregular stem" };
    }
    return { lemma: candidate, pos: "verb", confidence: 0.4, reason: "finite verb ending" };
  }

  // Adjective agreement endings.
  const adjective = surface.match(/^(.{3,}?)(er|es|em|en|e)$/);
  if (adjective && /(lich|isch|ig|bar|sam|haft|los|voll)$/.test(adjective[1])) {
    return { lemma: adjective[1], pos: "adjective", confidence: 0.65, reason: "adjective ending" };
  }

  return { lemma: surface, pos: "other", confidence: 0.3, reason: "surface form" };
}

/** Undoes the most common German plural endings. */
export function singularise(word: string): string {
  const rules: Array<[RegExp, string]> = [
    [/(.{3,})innen$/, "$1in"],
    [/(.{3,})ungen$/, "$1ung"],
    [/(.{3,})heiten$/, "$1heit"],
    [/(.{3,})keiten$/, "$1keit"],
    [/(.{3,})schaften$/, "$1schaft"],
    [/(.{3,})nisse$/, "$1nis"],
    [/(.{4,})en$/, "$1"],
    [/(.{4,})er$/, "$1"],
    [/(.{4,})n$/, "$1"],
    [/(.{4,})s$/, "$1"],
    [/(.{4,})e$/, "$1"],
  ];
  for (const [pattern, replacement] of rules) {
    if (pattern.test(word)) return word.replace(pattern, replacement);
  }
  return word;
}

export function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * Finds a detached separable prefix elsewhere in the sentence and reunites it
 * with the finite verb, so clicking "steht" in "Er steht früh auf" resolves to
 * "aufstehen".
 */
export function reuniteSeparable(
  sentence: string,
  tokenIndex: number,
  tokens: string[],
): { prefix: string; verb: string } | null {
  const verb = normaliseWord(tokens[tokenIndex] ?? "");
  if (!verb || verb.length < 3) return null;
  for (let i = tokens.length - 1; i > tokenIndex; i -= 1) {
    const candidate = normaliseWord(tokens[i]);
    if (SEPARABLE_PREFIXES.includes(candidate)) {
      // A prefix that is also a preposition only counts at the clause end.
      const isClauseFinal = i === tokens.length - 1 || /^[.,!?;:]/.test(sentence.slice(sentence.indexOf(tokens[i]) + tokens[i].length));
      if (!isClauseFinal) continue;
      return { prefix: candidate, verb };
    }
  }
  return null;
}
