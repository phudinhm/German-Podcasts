/**
 * What language an episode is actually spoken in.
 *
 * This app is built around German podcasts, but a published transcript can
 * belong to an English-language show too - and the two need translating in
 * opposite directions (German transcripts get English and Vietnamese lines;
 * English ones get German and Vietnamese). Getting this wrong means running
 * a transcript through the translator backwards, which for a same-language
 * pair like German-to-German silently returns the input unchanged rather
 * than failing loudly, so it is worth spending a little effort to get right.
 */
export type SpokenLang = "de" | "en";

/** A feed's own <language> tag ("de-DE", "en_US", "DE"...) is the most
 * reliable signal there is - it is the publisher saying what the show is in. */
export function langFromTag(tag: string | null | undefined): SpokenLang | null {
  if (!tag) return null;
  const code = tag.trim().slice(0, 2).toLowerCase();
  if (code === "de") return "de";
  if (code === "en") return "en";
  return null;
}

const GERMAN_WORDS = /\b(und|der|die|das|nicht|mit|ist|sind|auch|eine|einen|ich|wir|sie|für|von|dass|über|wenn)\b/gi;
const ENGLISH_WORDS = /\b(the|and|is|are|with|not|for|from|that|this|you|we|they|about|when)\b/gi;

/**
 * A fallback for feeds with no <language> tag. German has characters
 * (ä ö ü ß) and function words plain English essentially never has, so a
 * page of real dialogue is easy to call correctly without a proper
 * language-detection library. Defaults to German - the shows this app was
 * built for - when the sample is too short or too even to call either way.
 */
export function guessLangFromText(text: string): SpokenLang {
  const sample = text.slice(0, 2000);
  if (/[äöüßÄÖÜ]/.test(sample)) return "de";
  const germanHits = (sample.match(GERMAN_WORDS) ?? []).length;
  const englishHits = (sample.match(ENGLISH_WORDS) ?? []).length;
  return englishHits > germanHits + 1 ? "en" : "de";
}

export function detectSpokenLang(feedLanguageTag: string | null | undefined, sampleText: string): SpokenLang {
  return langFromTag(feedLanguageTag) ?? guessLangFromText(sampleText);
}

/** The two languages a transcript in `source` should be auto-translated into. */
export function translationTargetsFor(source: SpokenLang): Array<"de" | "en" | "vi"> {
  return source === "de" ? ["en", "vi"] : ["de", "vi"];
}
