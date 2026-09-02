/**
 * Shared orthographic helpers. Everything here works on lowercased German
 * words with umlauts intact - normalise with `normaliseWord` first.
 */
import { splitCompound } from "./compound";

export const VOWELS = "aeiouäöüy";
export const VOWEL_SET = new Set(VOWELS.split(""));

/** Digraphs that behave as a single consonant sound and must never be split. */
export const CONSONANT_DIGRAPHS = ["sch", "ch", "ck", "ph", "th", "sh", "qu", "ss", "ß"];

/** Vowel digraphs and diphthongs, longest first so greedy matching works. */
export const VOWEL_DIGRAPHS = ["eau", "aa", "ee", "oo", "ie", "ei", "ai", "au", "eu", "äu", "ey", "ay", "oi"];

export function normaliseWord(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-zäöüß-]/g, "")
    .replace(/^-+|-+$/g, "");
}

/** Strips edge punctuation but preserves case, for display next to the original. */
export function stripPunctuation(raw: string): string {
  return raw.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

export function isVowel(ch: string): boolean {
  return VOWEL_SET.has(ch);
}

/**
 * Locates every vowel nucleus in a word, treating vowel digraphs as one
 * nucleus so "Freude" yields two rather than four.
 */
export function nucleusPositions(word: string): Array<{ start: number; end: number }> {
  const nuclei: Array<{ start: number; end: number }> = [];
  let i = 0;
  while (i < word.length) {
    if (!isVowel(word[i])) {
      i += 1;
      continue;
    }
    const digraph = VOWEL_DIGRAPHS.find((d) => word.startsWith(d, i));
    if (digraph) {
      nuclei.push({ start: i, end: i + digraph.length });
      i += digraph.length;
      continue;
    }
    let end = i + 1;
    while (end < word.length && isVowel(word[end])) end += 1;
    nuclei.push({ start: i, end });
    i = end;
  }
  return nuclei;
}

/**
 * Counts syllables as the number of vowel nuclei, with a correction for
 * "-ion"/"-ien" endings where the i forms its own syllable (Na-ti-on).
 */
export function countSyllables(raw: string): number {
  const word = normaliseWord(raw);
  if (!word) return 0;
  let count = nucleusPositions(word).length;
  if (/i(on|onen|en|ent)$/.test(word)) count += 1;
  return Math.max(1, count);
}

/** Splits a sentence into word tokens, dropping punctuation-only pieces. */
export function tokenizeWords(text: string): string[] {
  return (text.match(/[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu) ?? []).filter(Boolean);
}

export function countSyllablesInText(text: string): number {
  return tokenizeWords(text).reduce((sum, t) => sum + countSyllables(t), 0);
}

/** Prefixes that always start their own syllable, whatever the vowel pattern. */
const SYLLABIC_PREFIXES = [
  "ver", "zer", "ent", "emp", "miss", "unter", "über", "wider", "hinter", "be", "ge", "er",
  "auf", "aus", "ein", "ab", "an", "vor", "mit", "nach", "zurück", "zusammen", "durch", "um",
];

/**
 * Hyphenates a word into syllables.
 *
 * Three passes, in this order, because German syllable boundaries are
 * morphological before they are phonological: compound members split first,
 * then verb prefixes, and only the remainder goes through the maximal-onset
 * rule. Doing it the other way round yields "wirt-schaftsk-ri-se" instead of
 * "wirt-schafts-kri-se".
 */
export function syllabify(raw: string): string[] {
  const word = normaliseWord(raw);
  if (word.length < 3) return word ? [word] : [];

  const members = splitCompound(word);
  if (members.length > 1) {
    return members.flatMap((member) => syllabifyMorpheme(member));
  }
  return syllabifyMorpheme(word);
}

function syllabifyMorpheme(word: string): string[] {
  for (const prefix of SYLLABIC_PREFIXES) {
    if (word.length >= prefix.length + 3 && word.startsWith(prefix)) {
      // Only peel the prefix off when what remains still looks like a stem.
      const rest = word.slice(prefix.length);
      if (nucleusPositions(rest).length >= 1 && !isVowel(rest[0])) {
        return [prefix, ...syllabifyCore(rest)];
      }
    }
  }
  return syllabifyCore(word);
}

function syllabifyCore(word: string): string[] {
  if (word.length < 3) return word ? [word] : [];
  const nuclei = nucleusPositions(word);
  if (nuclei.length <= 1) return [word];

  const cuts: number[] = [];
  for (let n = 0; n < nuclei.length - 1; n += 1) {
    const clusterStart = nuclei[n].end;
    const clusterEnd = nuclei[n + 1].start;
    const cluster = word.slice(clusterStart, clusterEnd);

    if (cluster.length <= 1) {
      cuts.push(clusterStart);
      continue;
    }

    // A digraph is one sound and moves as a unit. When the whole cluster is a
    // digraph it becomes the next syllable's onset: Spra-che, We-cker, wa-schen.
    const digraph = CONSONANT_DIGRAPHS.find((candidate) => cluster.endsWith(candidate));
    if (digraph && digraph.length === cluster.length) {
      cuts.push(clusterStart);
      continue;
    }
    const cut = digraph ? clusterEnd - digraph.length : clusterEnd - 1;
    cuts.push(Math.max(clusterStart + 1, cut));
  }

  const parts: string[] = [];
  let prev = 0;
  for (const cut of cuts) {
    if (cut > prev && cut < word.length) {
      parts.push(word.slice(prev, cut));
      prev = cut;
    }
  }
  parts.push(word.slice(prev));
  return parts.filter(Boolean);
}
