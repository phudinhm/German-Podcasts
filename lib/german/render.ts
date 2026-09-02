import { analyseWord, type Hazard, type HazardKind } from "./phonetics";
import { stripPunctuation } from "./orthography";

export interface RenderedPiece {
  text: string;
  hazard?: Hazard;
}

export interface RenderedWord {
  /** Punctuation and whitespace that precede the word. */
  lead: string;
  /** The word itself, split into hazard-annotated pieces. */
  pieces: RenderedPiece[];
  /** Trailing punctuation. */
  trail: string;
  /** Clean token used for dictionary lookups. */
  token: string;
  /** Syllabified form, e.g. "wirt-schafts-kri-se". */
  syllables: string[];
  stressIndex: number;
  parts: string[];
  hazards: Hazard[];
}

export const HAZARD_CLASS: Record<HazardKind, string> = {
  "ich-laut": "hz hz-ich",
  "ach-laut": "hz hz-ach",
  "final-devoicing": "hz hz-devoice",
  cluster: "hz hz-cluster",
  "s-onset": "hz hz-onset",
  "r-vocalisation": "hz hz-r",
  "vowel-length": "hz",
  "compound-stress": "hz",
};

export const HAZARD_LABEL: Record<HazardKind, string> = {
  "ich-laut": "Ich-Laut [ç]",
  "ach-laut": "Ach-Laut [x]",
  "final-devoicing": "Auslautverhärtung",
  cluster: "Konsonantencluster",
  "s-onset": "st/sp als scht/schp",
  "r-vocalisation": "Vokalisiertes r [ɐ]",
  "vowel-length": "Vokallänge",
  "compound-stress": "Kompositum-Betonung",
};

/**
 * Splits a raw transcript token into renderable pieces with the phonetic
 * hazards marked.
 *
 * Hazard offsets are computed on the normalised word, so this only applies them
 * when the normalised form lines up character-for-character with the stripped
 * token. Anything with internal punctuation renders plain rather than with a
 * misplaced highlight.
 */
export function renderWord(raw: string, options: { hazards?: boolean } = {}): RenderedWord {
  const token = stripPunctuation(raw);
  const leadLength = raw.indexOf(token);
  const lead = leadLength > 0 ? raw.slice(0, leadLength) : "";
  const trail = leadLength >= 0 ? raw.slice(leadLength + token.length) : "";

  const analysis = analyseWord(token);
  const aligned =
    options.hazards !== false &&
    analysis.normalised.length === token.length &&
    analysis.hazards.length > 0;

  if (!aligned) {
    return {
      lead,
      trail,
      token,
      pieces: [{ text: token }],
      syllables: analysis.syllables,
      stressIndex: analysis.stressIndex,
      parts: analysis.parts,
      hazards: analysis.hazards,
    };
  }

  // Keep only non-overlapping hazards, preferring the longest at each start.
  const chosen: Hazard[] = [];
  for (const hazard of analysis.hazards) {
    if (chosen.some((c) => hazard.start < c.end && hazard.end > c.start)) continue;
    chosen.push(hazard);
  }
  chosen.sort((a, b) => a.start - b.start);

  const pieces: RenderedPiece[] = [];
  let cursor = 0;
  for (const hazard of chosen) {
    if (hazard.start > cursor) pieces.push({ text: token.slice(cursor, hazard.start) });
    pieces.push({ text: token.slice(hazard.start, hazard.end), hazard });
    cursor = hazard.end;
  }
  if (cursor < token.length) pieces.push({ text: token.slice(cursor) });

  return {
    lead,
    trail,
    token,
    pieces,
    syllables: analysis.syllables,
    stressIndex: analysis.stressIndex,
    parts: analysis.parts,
    hazards: analysis.hazards,
  };
}

/** Splits a sentence into raw tokens, keeping punctuation attached. */
export function splitSentence(sentence: string): string[] {
  return sentence.split(/(\s+)/).filter((piece) => piece.length > 0);
}
