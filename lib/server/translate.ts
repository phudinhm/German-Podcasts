import type { TargetLang } from "../types";

/**
 * Machine-translation providers, tried in order of quality for German:
 * DeepL, then Google, then Anthropic. Every one of them is optional; when no
 * key is configured the caller falls back to the bundled lexicon and says so
 * in the response, rather than silently returning nothing.
 */

const DEEPL_TARGET: Record<TargetLang, string> = { en: "EN-GB", vi: "VI" };

export type TranslationSource = "deepl" | "google" | "anthropic" | "mymemory" | "none";

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
      process.env.ANTHROPIC_API_KEY,
  );
}

export async function translate(text: string, lang: TargetLang): Promise<TranslationResult> {
  if (!text.trim()) return { text: null, source: "none" };

  const deepl = await translateWithDeepL(text, lang);
  if (deepl) return { text: deepl, source: "deepl" };

  const google = await translateWithGoogle(text, lang);
  if (google) return { text: google, source: "google" };

  const anthropic = await translateWithAnthropic(text, lang);
  if (anthropic) return { text: anthropic, source: "anthropic" };

  const free = await translateWithMyMemory(text, lang);
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
async function translateWithMyMemory(text: string, lang: TargetLang): Promise<string | null> {
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
      const params = new URLSearchParams({ q: part, langpair: `de|${lang}` });
      const email = process.env.MYMEMORY_EMAIL;
      // Supplying a contact address raises the anonymous quota.
      if (email) params.set("de", email);
      const response = await fetch(`https://api.mymemory.translated.net/get?${params}`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(9000),
        next: { revalidate: 86_400 },
      });
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

async function translateWithDeepL(text: string, lang: TargetLang): Promise<string | null> {
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
        source_lang: "DE",
        target_lang: DEEPL_TARGET[lang],
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

async function translateWithGoogle(text: string, lang: TargetLang): Promise<string | null> {
  const key = process.env.GOOGLE_TRANSLATE_API_KEY;
  if (!key) return null;
  try {
    const response = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: text, source: "de", target: lang, format: "text" }),
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

async function translateWithAnthropic(text: string, lang: TargetLang): Promise<string | null> {
  const target = lang === "en" ? "English" : "Vietnamese";
  const result = await askClaude({
    system: `You are a translator. Translate the German input into natural ${target}. Reply with the translation only, no quotes and no commentary.`,
    user: text,
    maxTokens: 400,
  });
  return result?.trim() ?? null;
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
