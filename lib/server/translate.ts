import type { TargetLang } from "../types";

/**
 * Machine-translation providers, tried in order of quality for German:
 * DeepL, then Google, then Anthropic. Every one of them is optional; when no
 * key is configured the caller falls back to the bundled lexicon and says so
 * in the response, rather than silently returning nothing.
 *
 * Every provider here was originally built assuming the source is always
 * German, since that covered every caller: word lookups and live-caption
 * polishing both work from German speech. The published-transcript feature
 * added a source that can be English too (an English-language show
 * translated into German and Vietnamese), so `Lang` widens the target set
 * to include "de" and every provider now takes an explicit source - callers
 * that only ever had German audio just don't pass one.
 */
export type Lang = "de" | TargetLang;

const DEEPL_LANG: Record<Lang, string> = { de: "DE", en: "EN-GB", vi: "VI" };

export type TranslationSource = "deepl" | "google" | "anthropic" | "groq" | "mymemory" | "none";

export interface TranslationResult {
  text: string | null;
  source: TranslationSource;
}

/**
 * There is always a provider now: MyMemory needs no key. The configured ones
 * are better and are tried first, but translation is never simply unavailable,
 * which matters because captions are useless to a learner without it.
 */
export function hasTranslationProvider(): boolean {
  return true;
}

export function hasKeyedProvider(): boolean {
  return Boolean(
    process.env.DEEPL_API_KEY ||
      process.env.GOOGLE_TRANSLATE_API_KEY ||
      process.env.ANTHROPIC_API_KEY ||
      process.env.GROQ_API_KEY,
  );
}

export async function translate(
  text: string,
  targetLang: Lang,
  sourceLang: Lang = "de",
): Promise<TranslationResult> {
  if (!text.trim()) return { text: null, source: "none" };
  if (targetLang === sourceLang) return { text, source: "none" };

  const deepl = await translateWithDeepL(text, targetLang, sourceLang);
  if (deepl) return { text: deepl, source: "deepl" };

  const google = await translateWithGoogle(text, targetLang, sourceLang);
  if (google) return { text: google, source: "google" };

  const anthropic = await translateWithAnthropic(text, targetLang, sourceLang);
  if (anthropic) return { text: anthropic, source: "anthropic" };

  // Groq needs a key too, but it is the one every listener here already has
  // for "Generate transcript with AI" - reusing it makes translation reliable
  // out of the box for anyone who already set that up, without a second
  // signup. Tried before the keyless fallback below for exactly that reason.
  const groq = await translateWithGroq(text, targetLang, sourceLang);
  if (groq) return { text: groq, source: "groq" };

  const free = await translateWithMyMemory(text, targetLang, sourceLang);
  if (free) return { text: free, source: "mymemory" };

  return { text: null, source: "none" };
}

/** Longest string MyMemory accepts in one request. */
const MYMEMORY_LIMIT = 500;

/**
 * MyMemory: a public translation API with no key and a daily quota.
 *
 * It is the fallback rather than the default because quality is well below
 * DeepL, and because an anonymous quota is shared across everyone deploying
 * this. But it means a fresh clone translates captions out of the box, which
 * is the difference between the feature existing and not.
 */
async function translateWithMyMemory(text: string, lang: Lang, sourceLang: Lang): Promise<string | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // Long input is split on sentence boundaries and reassembled.
  const parts: string[] = [];
  if (trimmed.length <= MYMEMORY_LIMIT) {
    parts.push(trimmed);
  } else {
    let buffer = "";
    for (const sentence of trimmed.split(/(?<=[.!?])\s+/)) {
      if ((buffer + " " + sentence).trim().length > MYMEMORY_LIMIT) {
        if (buffer) parts.push(buffer.trim());
        buffer = sentence.slice(0, MYMEMORY_LIMIT);
      } else {
        buffer = `${buffer} ${sentence}`.trim();
      }
    }
    if (buffer) parts.push(buffer.trim());
  }

  const out: string[] = [];
  for (const part of parts) {
    try {
      const params = new URLSearchParams({ q: part, langpair: `${sourceLang}|${lang}` });
      const email = process.env.MYMEMORY_EMAIL;
      // Supplying a contact address raises the anonymous quota.
      if (email) params.set("de", email);
      const response = await fetch(`https://api.mymemory.translated.net/get?${params}`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(9000),
        // Next.js's own fetch extension, not in the standard RequestInit
        // type the standalone test build compiles against; still honored at
        // runtime inside Next.js, and harmlessly ignored outside it.
        next: { revalidate: 86_400 },
      } as RequestInit);
      if (!response.ok) return null;
      const data = (await response.json()) as {
        responseStatus?: number | string;
        responseData?: { translatedText?: string };
      };
      const status = Number(data.responseStatus);
      const translated = data.responseData?.translatedText;
      // The service reports quota and error conditions in the payload text.
      if (status !== 200 || !translated || /MYMEMORY WARNING|QUERY LENGTH LIMIT/i.test(translated)) {
        return null;
      }
      out.push(translated);
    } catch (error) {
      console.error("[translate] MyMemory request failed:", error);
      return null;
    }
  }

  return out.join(" ") || null;
}

async function translateWithDeepL(text: string, lang: Lang, sourceLang: Lang): Promise<string | null> {
  const key = process.env.DEEPL_API_KEY;
  if (!key) return null;
  const host = process.env.DEEPL_API_HOST ?? "api-free.deepl.com";
  try {
    const response = await fetch(`https://${host}/v2/translate`, {
      method: "POST",
      headers: {
        Authorization: `DeepL-Auth-Key ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: [text],
        source_lang: DEEPL_LANG[sourceLang].replace("-GB", ""),
        target_lang: DEEPL_LANG[lang],
      }),
    });
    if (!response.ok) {
      console.error("[translate] DeepL", response.status, await response.text());
      return null;
    }
    const data = (await response.json()) as { translations?: Array<{ text: string }> };
    return data.translations?.[0]?.text ?? null;
  } catch (error) {
    console.error("[translate] DeepL request failed:", error);
    return null;
  }
}

async function translateWithGoogle(text: string, lang: Lang, sourceLang: Lang): Promise<string | null> {
  const key = process.env.GOOGLE_TRANSLATE_API_KEY;
  if (!key) return null;
  try {
    const response = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: text, source: sourceLang, target: lang, format: "text" }),
    });
    if (!response.ok) {
      console.error("[translate] Google", response.status);
      return null;
    }
    const data = (await response.json()) as {
      data?: { translations?: Array<{ translatedText: string }> };
    };
    return data.data?.translations?.[0]?.translatedText ?? null;
  } catch (error) {
    console.error("[translate] Google request failed:", error);
    return null;
  }
}

const LANG_NAME: Record<Lang, string> = { de: "German", en: "English", vi: "Vietnamese" };

async function translateWithAnthropic(text: string, lang: Lang, sourceLang: Lang): Promise<string | null> {
  const result = await askClaude({
    system: `You are a translator. Translate the ${LANG_NAME[sourceLang]} input into natural ${LANG_NAME[lang]}. Reply with the translation only, no quotes and no commentary.`,
    user: text,
    maxTokens: 400,
  });
  return result?.trim() ?? null;
}

/** Fast, free-tier hosted Llama, used the same way as the Anthropic provider
 * above - a plain instruction prompt, since Groq's chat API is otherwise
 * OpenAI-compatible like its transcription endpoint already used here. */
async function translateWithGroq(text: string, lang: Lang, sourceLang: Lang): Promise<string | null> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;
  const model = process.env.GROQ_TRANSLATE_MODEL ?? "llama-3.3-70b-versatile";

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 400,
        messages: [
          {
            role: "system",
            content: `You are a translator. Translate the ${LANG_NAME[sourceLang]} input into natural ${LANG_NAME[lang]}. Reply with the translation only, no quotes and no commentary.`,
          },
          { role: "user", content: text },
        ],
      }),
      signal: AbortSignal.timeout(9000),
    });
    if (!response.ok) {
      console.error("[translate] Groq", response.status, await response.text().catch(() => ""));
      return null;
    }
    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content?.trim() ?? null;
  } catch (error) {
    console.error("[translate] Groq request failed:", error);
    return null;
  }
}

export interface ClaudeRequest {
  system: string;
  user: string;
  maxTokens?: number;
  /** When set, the model is asked to reply with JSON only. */
  json?: boolean;
}

/** Thin Anthropic Messages API client - no SDK, so the bundle stays small. */
export async function askClaude(request: ClaudeRequest): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const model = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: request.maxTokens ?? 512,
        system: request.system,
        messages: [{ role: "user", content: request.user }],
        ...(request.json ? { stop_sequences: [] } : {}),
      }),
    });

    if (!response.ok) {
      console.error("[claude]", response.status, await response.text());
      return null;
    }
    const data = (await response.json()) as { content?: Array<{ type: string; text?: string }> };
    return data.content?.filter((c) => c.type === "text").map((c) => c.text).join("") ?? null;
  } catch (error) {
    console.error("[claude] request failed:", error);
    return null;
  }
}

/** Pulls the first JSON object or array out of a model reply. */
export function extractJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced?.[1] ?? raw).trim();
  const start = candidate.search(/[[{]/);
  if (start < 0) return null;
  const end = Math.max(candidate.lastIndexOf("}"), candidate.lastIndexOf("]"));
  if (end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}
