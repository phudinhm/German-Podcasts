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

function isParticiple(word: string): boolean {
  const lower = word.toLowerCase();
  if (/^ge\w{2,}(t|en)$/.test(lower)) return true;
  // Separable participles: aufgestanden, mitgenommen.
  return SEPARABLE_PREFIXES.some((prefix) => lower.startsWith(prefix) && /ge\w{2,}(t|en)$/.test(lower.slice(prefix.length)));
}

function isInfinitive(word: string): boolean {
  const lower = word.toLowerCase();
  return /\w{3,}(en|ern|eln)$/.test(lower) && !isParticiple(lower);
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
    const tail = lower.slice(i + 1);
    const finalVerb = [...tail].reverse().find((word) => isInfinitive(word) || isParticiple(word) || AUXILIARIES.has(word) || MODALS.has(word));
    notes.push({
      kind: "clause",
      title: `${tokens[i]} opens a subordinate clause`,
      detail: `${tokens[i]} ${meaning}, and it sends the conjugated verb${finalVerb ? ` (${finalVerb})` : ""} to the very end of its clause.`,
      focus: [tokens[i], ...(finalVerb ? [finalVerb] : [])],
    });
    break;
  }

  // 2. The verb bracket: modal or auxiliary in position two, second verb at the end.
  const firstVerbIndex = lower.findIndex((word) => MODALS.has(word) || AUXILIARIES.has(word));
  if (firstVerbIndex >= 0) {
    const closerIndex = lower.findIndex(
      (word, index) => index > firstVerbIndex && (isParticiple(word) || isInfinitive(word)),
    );
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
    const verb = lower.slice(0, -1).reverse().find((word) => /\w{3,}(e|st|t|en)$/.test(word));
    notes.push({
      kind: "separable",
      title: `Separable verb split across the clause`,
      detail: `${lastToken} at the end belongs to the verb${verb ? ` ${verb}` : ""}: look them up together as ${lastToken}${verb ?? ""}, not separately.`,
      focus: [lastToken, ...(verb ? [verb] : [])],
    });
  }

  // 4. Prepositions and the case they govern.
  const seen = new Set<string>();
  for (const token of lower) {
    if (seen.has(token)) continue;
    const rule = CASE_PREPOSITIONS.find((entry) => entry.words.includes(token));
    if (!rule) continue;
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
    const secondIsVerb = MODALS.has(lower[1]) || AUXILIARIES.has(lower[1]) || /\w{3,}(t|te|st)$/.test(lower[1]);
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
