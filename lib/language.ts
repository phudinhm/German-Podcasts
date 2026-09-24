/**
 * Spoken and translation language utilities.
 */
export type SpokenLang = "de" | "en";

export function langFromTag(tag: string | null | undefined): SpokenLang | null {
  if (!tag) return null;
  const code = tag.trim().slice(0, 2).toLowerCase();
  if (code === "de") return "de";
  if (code === "en") return "en";
  return null;
}

const GERMAN_WORDS =
  /\b(und|der|die|das|nicht|mit|ist|sind|auch|eine|einen|ich|wir|sie|für|von|dass|über|wenn|haben|werden|oder|aber|wie|noch|nur|kann|schon|immer|heute|hallo|willkommen)\b/gi;
const ENGLISH_WORDS =
  /\b(the|and|is|are|with|not|for|from|that|this|you|we|they|about|when|have|will|would|could|should|welcome|episode)\b/gi;

export function guessLangFromText(text: string): SpokenLang {
  const sample = text.slice(0, 2000);
  if (/[äöüßÄÖÜ]/.test(sample)) return "de";
  const germanHits = (sample.match(GERMAN_WORDS) ?? []).length;
  const englishHits = (sample.match(ENGLISH_WORDS) ?? []).length;
  return englishHits > germanHits + 2 ? "en" : "de";
}

export function detectSpokenLang(
  feedLanguageTag: string | null | undefined,
  sampleText: string
): SpokenLang {
  // Many German-learning podcasts (e.g. Coffee Break German, Slow German, DW)
  // have English RSS metadata (<language>en</language>) even though the spoken
  // dialogue is German. Always check if sampleText has German signals first.
  if (/[äöüßÄÖÜ]/.test(sampleText) || (sampleText.match(GERMAN_WORDS) ?? []).length >= 2) {
    return "de";
  }
  return langFromTag(feedLanguageTag) ?? guessLangFromText(sampleText);
}

/**
 * In a German podcast app, users always want translations into Vietnamese ("vi")
 * and English ("en"). Never replace "en" with "de" automatically.
 */
export function translationTargetsFor(_source: SpokenLang): Array<"de" | "en" | "vi"> {
  return ["vi", "en"];
}

export type TranslationLangPreference = "auto" | "de" | "en" | "vi";

/**
 * Always honor the user's explicit translation language choice ("vi", "en", or "de").
 * Previously, when a feed had source="en", choosing preferred="en" fell back to "de",
 * causing English translations to display German text!
 */
export function resolveTranslationLang(
  _source: SpokenLang,
  preferred: TranslationLangPreference
): "de" | "en" | "vi" {
  if (preferred === "vi" || preferred === "en" || preferred === "de") {
    return preferred;
  }
  return "vi";
}
