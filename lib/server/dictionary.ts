import { lemmatize, reuniteSeparable, SEPARABLE_PREFIXES } from "../german/lemma";
import { tokenizeWords, stripPunctuation } from "../german/orthography";
import { analyseWord } from "../german/phonetics";
import type { LookupResult, TargetLang } from "../types";
import { askClaude, extractJson, translate } from "./translate";
import { CORE_LEXICON } from "../../data/lexicon/core";

export interface CoreEntry {
  /** Part of speech: n, v, adj, adv, prep, conj, pron, num, art, part. */
  p: string;
  /** Article for nouns. */
  g?: "der" | "die" | "das";
  /** Plural form for nouns. */
  pl?: string;
  /** English glosses. */
  en: string[];
  /** Vietnamese glosses. */
  vi: string[];
  /** Note shown under the entry, e.g. case governed by a preposition. */
  n?: string;
}

const CORE = CORE_LEXICON as unknown as Record<string, CoreEntry>;

const POS_LABEL: Record<string, string> = {
  n: "noun",
  v: "verb",
  adj: "adjective",
  adv: "adverb",
  prep: "preposition",
  conj: "conjunction",
  pron: "pronoun",
  num: "numeral",
  art: "article",
  part: "particle",
};

function findCore(candidate: string): { key: string; entry: CoreEntry } | null {
  const direct = CORE[candidate];
  if (direct) return { key: candidate, entry: direct };
  const capitalised = candidate.charAt(0).toUpperCase() + candidate.slice(1);
  if (CORE[capitalised]) return { key: capitalised, entry: CORE[capitalised] };
  const lower = candidate.toLowerCase();
  if (CORE[lower]) return { key: lower, entry: CORE[lower] };
  return null;
}

export interface LookupInput {
  word: string;
  sentence: string;
  lang: TargetLang;
  /** Episode-scoped glossary produced by the ingest worker, checked first. */
  glossary?: Record<string, CoreEntry> | null;
}

/**
 * Resolves a clicked token to a dictionary entry.
 *
 * Order matters: the episode glossary is authoritative because the ingest
 * worker had the whole sentence in view when it was built; the shipped core
 * lexicon comes next because it is instant and free; a model call is the last
 * resort, and only fires when a key is configured.
 */
export async function lookup(input: LookupInput): Promise<LookupResult> {
  const surface = stripPunctuation(input.word);
  const tokens = tokenizeWords(input.sentence);
  const tokenIndex = tokens.findIndex((t) => stripPunctuation(t) === surface);

  const guess = lemmatize(surface, { capitalised: /^[A-ZÄÖÜ]/.test(surface) });

  // A finite verb with its prefix stranded at the clause end: "steht ... auf".
  let separable: LookupResult["separable"] | undefined;
  if (guess.pos === "verb" && tokenIndex >= 0) {
    const reunited = reuniteSeparable(input.sentence, tokenIndex, tokens);
    if (reunited) {
      separable = { prefix: reunited.prefix, stem: guess.lemma };
      guess.lemma = reunited.prefix + guess.lemma;
    }
  }
  if (guess.separable) separable = guess.separable;

  const candidates = [
    guess.lemma,
    surface,
    surface.toLowerCase(),
    ...(separable ? [separable.prefix + separable.stem] : []),
  ];

  for (const candidate of candidates) {
    const fromGlossary = input.glossary?.[candidate] ?? input.glossary?.[candidate.toLowerCase()];
    if (fromGlossary) {
      return build(surface, candidate, fromGlossary, separable, "lexicon", input);
    }
  }
  for (const candidate of candidates) {
    const hit = findCore(candidate);
    if (hit) return build(surface, hit.key, hit.entry, separable, "lexicon", input);
  }

  // Nothing offline. Ask the model for a structured entry when we can.
  const fromModel = await lookupWithModel(surface, input);
  if (fromModel) return fromModel;

  // Last resort: machine-translate the bare word so the user still gets a gloss.
  const [wordTranslation, sentenceTranslation] = await Promise.all([
    translate(guess.lemma, input.lang),
    translate(input.sentence, input.lang),
  ]);

  const analysis = analyseWord(surface);
  return {
    surface,
    lemma: guess.lemma,
    pos: guess.pos,
    separable,
    translations: {
      en: input.lang === "en" && wordTranslation.text ? [wordTranslation.text] : [],
      vi: input.lang === "vi" && wordTranslation.text ? [wordTranslation.text] : [],
    },
    sentence: {
      de: input.sentence,
      [input.lang]: sentenceTranslation.text ?? undefined,
    } as LookupResult["sentence"],
    source: wordTranslation.text ? "mt" : "heuristic",
    notes:
      wordTranslation.text
        ? undefined
        : `No offline entry for "${surface}". Set DEEPL_API_KEY or ANTHROPIC_API_KEY for live lookups. Stress: ${analysis.syllables.join("-")}.`,
  };
}

async function build(
  surface: string,
  lemma: string,
  entry: CoreEntry,
  separable: LookupResult["separable"] | undefined,
  source: LookupResult["source"],
  input: LookupInput,
): Promise<LookupResult> {
  const sentenceTranslation = await translate(input.sentence, input.lang);
  return {
    surface,
    lemma,
    pos: POS_LABEL[entry.p] ?? entry.p,
    noun: entry.g ? { gender: entry.g, plural: entry.pl } : undefined,
    separable,
    translations: { en: entry.en, vi: entry.vi },
    sentence: {
      de: input.sentence,
      ...(input.lang === "en"
        ? { en: sentenceTranslation.text ?? undefined }
        : { vi: sentenceTranslation.text ?? undefined }),
    },
    source,
    notes: entry.n,
  };
}

const LOOKUP_SYSTEM = `You are a German-English-Vietnamese lexicographer serving a language-learning app.
Given a German word and the sentence it appeared in, reply with JSON only, no prose:
{
  "lemma": "dictionary headword, nouns capitalised, verbs in the infinitive",
  "pos": "noun|verb|adjective|adverb|preposition|conjunction|pronoun|numeral|article|particle",
  "gender": "der|die|das or null",
  "plural": "plural form or null",
  "separablePrefix": "prefix or null, when the verb is separable",
  "en": ["up to 3 English glosses, most likely first"],
  "vi": ["up to 3 Vietnamese glosses, most likely first"],
  "sentence_en": "natural English translation of the whole sentence",
  "sentence_vi": "natural Vietnamese translation of the whole sentence",
  "note": "one short clause about case, register or a false friend, or null"
}
Pick the sense that fits the sentence, not the most common sense in isolation.`;

async function lookupWithModel(surface: string, input: LookupInput): Promise<LookupResult | null> {
  const raw = await askClaude({
    system: LOOKUP_SYSTEM,
    user: `Word: ${surface}\nSentence: ${input.sentence}`,
    maxTokens: 600,
  });
  const parsed = extractJson<{
    lemma: string;
    pos: string;
    gender: "der" | "die" | "das" | null;
    plural: string | null;
    separablePrefix: string | null;
    en: string[];
    vi: string[];
    sentence_en: string;
    sentence_vi: string;
    note: string | null;
  }>(raw);
  if (!parsed?.lemma) return null;

  return {
    surface,
    lemma: parsed.lemma,
    pos: parsed.pos ?? "other",
    noun: parsed.gender ? { gender: parsed.gender, plural: parsed.plural ?? undefined } : undefined,
    separable:
      parsed.separablePrefix && SEPARABLE_PREFIXES.includes(parsed.separablePrefix)
        ? { prefix: parsed.separablePrefix, stem: parsed.lemma.slice(parsed.separablePrefix.length) }
        : undefined,
    translations: { en: parsed.en ?? [], vi: parsed.vi ?? [] },
    sentence: { de: input.sentence, en: parsed.sentence_en, vi: parsed.sentence_vi },
    source: "llm",
    notes: parsed.note ?? undefined,
  };
}
