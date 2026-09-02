import { tokenizeWords, stripPunctuation } from "./orthography";
import { SEPARABLE_PREFIXES } from "./lemma";

/**
 * Rule-based sentence deconstruction.
 *
 * German word order is regular enough that most of what trips a learner up can
 * be found without a model: which conjunction pushed the verb to the end, where
 * the verb bracket opens and closes, which preposition governs which case. The
 * LLM route builds on top of this, it does not replace it - which is why the
 * Breakdown button still works with no API key configured.
 */

export interface SyntaxNote {
  kind: "clause" | "bracket" | "separable" | "case" | "tense" | "order";
  /** Short headline, shown in bold. */
  title: string;
  /** One line of explanation. */
  detail: string;
  /** Words in the sentence this note points at. */
  focus: string[];
}

const SUBORDINATING = new Map<string, string>([
  ["weil", "gives a reason"],
  ["da", "gives a reason, more formal than weil"],
  ["dass", "introduces a content clause"],
  ["wenn", "if or whenever"],
  ["falls", "in case"],
  ["ob", "whether"],
  ["obwohl", "although"],
  ["während", "while or whereas"],
  ["damit", "so that, purpose"],
  ["bevor", "before"],
  ["nachdem", "after"],
  ["seit", "since"],
  ["seitdem", "ever since"],
  ["sobald", "as soon as"],
  ["solange", "as long as"],
  ["sodass", "with the result that"],
  ["indem", "by doing"],
  ["wer", "whoever, at the start of a clause"],
  ["wo", "where"],
  ["bis", "until"],
]);

const COORDINATING = new Set(["und", "aber", "oder", "denn", "sondern"]);

const CASE_PREPOSITIONS: Array<{ words: string[]; label: string; detail: string }> = [
  {
    words: ["mit", "nach", "aus", "zu", "von", "bei", "seit", "gegenüber", "außer", "entgegen"],
    label: "dative",
    detail: "always takes the dative",
  },
  {
    words: ["für", "gegen", "ohne", "um", "durch", "bis", "entlang"],
    label: "accusative",
    detail: "always takes the accusative",
  },
  {
    words: ["in", "an", "auf", "über", "unter", "vor", "hinter", "neben", "zwischen"],
    label: "two-way",
    detail: "dative for a location, accusative for a direction",
  },
  {
    words: ["wegen", "trotz", "während", "statt", "anstatt", "innerhalb", "außerhalb", "aufgrund"],
    label: "genitive",
    detail: "takes the genitive in written German",
  },
];

const MODALS = new Set([
  "kann","kannst","können","könnt","konnte","könnte","könnten",
  "muss","musst","müssen","müsst","musste","müsste","müssten",
  "soll","sollst","sollen","sollt","sollte","sollten",
  "will","willst","wollen","wollt","wollte","wollten",
  "darf","darfst","dürfen","dürft","durfte","dürfte",
  "mag","magst","mögen","möchte","möchten",
]);

const AUXILIARIES = new Set([
  "habe","hast","hat","haben","habt","hatte","hatten","hätte","hätten",
  "bin","bist","ist","sind","seid","war","waren","wäre","wären",
  "werde","wirst","wird","werden","werdet","wurde","wurden","würde","würden",
]);

const INSEPARABLE = ["be", "emp", "ent", "er", "miss", "ver", "zer", "voll", "wider", "hinter", "über", "unter"];

/**
 * Strong participles that carry an inseparable prefix and therefore no ge-.
 * Rule-derivable forms are handled by the regexes; these are the ones where a
 * vowel change also hides the stem.
 */
const BARE_PARTICIPLES = new Set([
  "verstanden","begonnen","empfohlen","verloren","entschieden","erhalten","bekommen","verschwunden",
  "vergessen","verbunden","übernommen","versprochen","entstanden","erschienen","beschlossen","geschehen",
  "betroffen","gebrochen","behalten","besessen","gewonnen","zerbrochen","unterschrieben","verglichen",
  "erfunden","empfangen","entnommen","vertrieben","erwiesen","verschoben","unterlassen","verziehen",
]);

function isParticiple(word: string): boolean {
  const lower = word.toLowerCase();
  if (BARE_PARTICIPLES.has(lower)) return true;
  if (/^ge\p{L}{2,}(t|en)$/u.test(lower)) return true;
  // Separable participles keep the ge- inside: aufgestanden, mitgenommen.
  if (SEPARABLE_PREFIXES.some((prefix) => lower.startsWith(prefix) && /^ge\p{L}{2,}(t|en)$/u.test(lower.slice(prefix.length)))) {
    return true;
  }
  // Inseparable prefixes drop the ge-: erfasst, bezahlt, verkauft.
  return INSEPARABLE.some((prefix) => lower.startsWith(prefix) && /^\p{L}{2,}t$/u.test(lower.slice(prefix.length)));
}

/** Adjectives and adverbs that turn "zu" into an intensifier, not a preposition. */
const INTENSIFIED = new Set([
  "viel","wenig","spät","früh","schnell","langsam","groß","klein","teuer","billig","hoch","niedrig",
  "lang","kurz","stark","schwach","schwer","leicht","laut","leise","weit","nah","oft","selten","gut",
]);

/**
 * Index just past the end of the clause starting at `from`: the next comma in
 * the original sentence, or the end of the token list.
 */
function findClauseEnd(sentence: string, tokens: string[], from: number): number {
  let cursor = 0;
  for (let i = 0; i < tokens.length; i += 1) {
    const at = sentence.indexOf(tokens[i], cursor);
    if (at < 0) continue;
    cursor = at + tokens[i].length;
    if (i > from && /^\s*[,;:]/.test(sentence.slice(cursor))) return i + 1;
  }
  return tokens.length;
}

/** Lowercase words ending in -en that are not verbs. */
const NOT_A_VERB = new Set([
  "inzwischen","zwischen","oben","unten","hinten","vorn","vorne","innen","außen","eben","übrigens",
  "wegen","gegen","neben","sieben","morgen","dagegen","daneben","deswegen","hingegen","indessen",
  "seinen","ihren","meinen","deinen","keinen","einen","jeden","allen","denen","diesen","jenen","welchen",
  "unseren","euren","großen","kleinen","langen","kurzen","guten","neuen","alten","letzten","ersten",
  "gestern","modern","besondern","andern","anderen","weiteren","vielen","wenigen","beiden","meisten",
]);

/**
 * German capitalises every noun, which is the cheapest disambiguation signal
 * available: "Investitionen" ends in -en but is never an infinitive.
 */
function isInfinitive(word: string): boolean {
  if (/^[A-ZÄÖÜ]/.test(word)) return false;
  const lower = word.toLowerCase();
  if (NOT_A_VERB.has(lower)) return false;
  return /\p{L}{3,}(en|ern|eln)$/u.test(lower) && !isParticiple(lower);
}

/** Words that can never be the finite verb, so the scan does not stop on them. */
const NEVER_FINITE = new Set([
  "ich","du","er","sie","es","wir","ihr","man","mich","dich","sich","uns","euch","mir","dir","ihm","ihn",
  "der","die","das","den","dem","des","ein","eine","einen","einem","einer","eines","kein","keine",
  "mein","dein","sein","ihre","ihren","unser","euer","jeden","jede","jeder","jedes","alle","allen",
  "und","aber","oder","denn","sondern","dass","weil","wenn","als","wie","wo","nicht","nur","auch",
  "sehr","schon","noch","immer","halb","hier","dort","heute","morgen","gestern","dann","doch","mal",
  "in","an","auf","aus","bei","mit","nach","seit","von","vor","zu","um","über","unter","für","gegen",
  "ohne","durch","bis","zwischen","hinter","neben","während","trotz","wegen","statt",
]);

/**
 * Finds the finite verb of a main clause by scanning from the left. In German
 * it sits in second position, so the first token that inflects like a verb and
 * is not a pronoun, article or preposition is almost always the right one.
 */
function findFiniteVerb(tokens: string[]): string | undefined {
  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (NEVER_FINITE.has(lower)) continue;
    if (/^[A-ZÄÖÜ]/.test(token) && token !== tokens[0]) continue;
    if (AUXILIARIES.has(lower) || MODALS.has(lower)) return token;
    if (/^\p{Ll}\p{L}{2,}(e|st|t|te|ten|en)$/u.test(lower) && !isParticiple(lower) && !NOT_A_VERB.has(lower)) return token;
  }
  return undefined;
}

export function deconstruct(sentence: string): SyntaxNote[] {
  const tokens = tokenizeWords(sentence).map(stripPunctuation);
  const lower = tokens.map((t) => t.toLowerCase());
  const notes: SyntaxNote[] = [];

  // 1. Subordinate clauses push the finite verb to the very end.
  for (let i = 0; i < lower.length; i += 1) {
    const meaning = SUBORDINATING.get(lower[i]);
    if (!meaning) continue;
    // "wer"/"wo"/"bis" only subordinate at a clause boundary.
    if (["wer", "wo", "bis"].includes(lower[i]) && i !== 0 && !/[,;]/.test(sentence.charAt(sentence.indexOf(tokens[i]) - 2))) {
      continue;
    }
    // The clause runs from the conjunction to the next comma or to the end.
    const clauseEnd = findClauseEnd(sentence, tokens, i);
    const clause = tokens.slice(i + 1, clauseEnd);
    const finalVerb = clause.length > 0 ? clause[clause.length - 1] : undefined;
    notes.push({
      kind: "clause",
      title: `${tokens[i]} opens a subordinate clause`,
      detail: `${tokens[i]} (${meaning}) sends the conjugated verb${
        finalVerb ? ` ${finalVerb}` : ""
      } to the very end of its clause, so the meaning only resolves on the last word.`,
      focus: [tokens[i], ...(finalVerb ? [finalVerb] : [])],
    });
    break;
  }

  // 2. The verb bracket: modal or auxiliary in position two, second verb at the end.
  const firstVerbIndex = lower.findIndex((word) => MODALS.has(word) || AUXILIARIES.has(word));
  if (firstVerbIndex >= 0) {
    // The bracket closes at the end of the clause, so search backwards: the
    // last verbal element wins over any adverb that happens to end in -en.
    let closerIndex = -1;
    for (let index = tokens.length - 1; index > firstVerbIndex; index -= 1) {
      if (isParticiple(tokens[index].toLowerCase()) || isInfinitive(tokens[index])) {
        closerIndex = index;
        break;
      }
    }
    if (closerIndex > firstVerbIndex + 1) {
      const opener = tokens[firstVerbIndex];
      const closer = tokens[closerIndex];
      const inside = tokens.slice(firstVerbIndex + 1, closerIndex).length;
      notes.push({
        kind: "bracket",
        title: `Verb bracket: ${opener} … ${closer}`,
        detail: `The conjugated part comes early and the meaning-carrying part waits at the end, with ${inside} word${inside === 1 ? "" : "s"} in between. Hold ${opener} in memory until ${closer} lands.`,
        focus: [opener, closer],
      });
    }
    if (MODALS.has(lower[firstVerbIndex]) && closerIndex > 0) {
      notes.push({
        kind: "tense",
        title: "Modal verb construction",
        detail: `${tokens[firstVerbIndex]} carries the person and tense; ${tokens[closerIndex]} stays in the infinitive.`,
        focus: [tokens[firstVerbIndex], tokens[closerIndex]],
      });
    } else if (AUXILIARIES.has(lower[firstVerbIndex]) && closerIndex > 0 && isParticiple(lower[closerIndex])) {
      const isPassive = /^(werde|wirst|wird|werden|werdet|wurde|wurden)$/.test(lower[firstVerbIndex]);
      notes.push({
        kind: "tense",
        title: isPassive ? "Passive voice" : "Perfect tense",
        detail: isPassive
          ? `werden plus the participle ${tokens[closerIndex]} makes this passive: the subject is on the receiving end.`
          : `${tokens[firstVerbIndex]} plus the participle ${tokens[closerIndex]} is the spoken past. German prefers it to the simple past in conversation.`,
        focus: [tokens[firstVerbIndex], tokens[closerIndex]],
      });
    }
  }

  // 3. A separable prefix stranded at the end of the clause.
  const lastToken = lower[lower.length - 1];
  if (lastToken && SEPARABLE_PREFIXES.includes(lastToken) && lower.length > 3) {
    const verb = findFiniteVerb(tokens.slice(0, -1));
    notes.push({
      kind: "separable",
      title: "Separable verb split across the clause",
      detail: verb
        ? `${lastToken} at the end belongs to ${verb}: look them up together as ${lastToken}${verb.toLowerCase()}, not as two words.`
        : `${lastToken} at the end is a stranded verb prefix, not a preposition. It belongs to the conjugated verb earlier in the clause.`,
      focus: [lastToken, ...(verb ? [verb] : [])],
    });
  }

  // 4. Prepositions and the case they govern.
  const seen = new Set<string>();
  for (let index = 0; index < lower.length; index += 1) {
    const token = lower[index];
    if (seen.has(token)) continue;
    const rule = CASE_PREPOSITIONS.find((entry) => entry.words.includes(token));
    if (!rule) continue;
    // "zu viel", "zu schnell" and "zu + infinitive" are not prepositional.
    if (token === "zu" && (INTENSIFIED.has(lower[index + 1] ?? "") || isInfinitive(lower[index + 1] ?? ""))) {
      continue;
    }
    // "bis" before a second preposition ("bis zum Ende") governs nothing itself.
    if (token === "bis" && CASE_PREPOSITIONS.some((entry) => entry.words.includes(lower[index + 1] ?? ""))) {
      continue;
    }
    seen.add(token);
    notes.push({
      kind: "case",
      title: `${token} → ${rule.label}`,
      detail: `${token} ${rule.detail}.`,
      focus: [token],
    });
    if (seen.size >= 2) break;
  }

  // 5. Something other than the subject in first position.
  if (tokens.length > 3) {
    const firstIsVerb = MODALS.has(lower[0]) || AUXILIARIES.has(lower[0]);
    const secondIsVerb = MODALS.has(lower[1]) || AUXILIARIES.has(lower[1]) || /\p{L}{3,}(t|te|st)$/u.test(lower[1]);
    const startsWithAdverbial = !firstIsVerb && secondIsVerb && !/^(ich|du|er|sie|es|wir|ihr|man|der|die|das)$/.test(lower[0]);
    if (startsWithAdverbial) {
      notes.push({
        kind: "order",
        title: "Fronted element, inverted subject",
        detail: `${tokens[0]} occupies first position, so the verb still comes second and the subject moves behind it. This is normal German emphasis, not a question.`,
        focus: [tokens[0], tokens[1]],
      });
    }
  }

  if (COORDINATING.has(lower[0])) {
    notes.push({
      kind: "order",
      title: `${tokens[0]} does not change word order`,
      detail: `und, aber, oder, denn and sondern link two main clauses and leave the verb in second position - unlike weil or dass.`,
      focus: [tokens[0]],
    });
  }

  return notes.slice(0, 4);
}
