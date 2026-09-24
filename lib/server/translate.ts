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

export async function translate(
  text: string,
  targetLang: Lang,
  sourceLang: Lang = "de",
  engine: string = "auto",
): Promise<TranslationResult> {
  if (!text.trim()) return { text: null, source: "none" };
  if (targetLang === sourceLang) return { text, source: "none" };

  const deepl = await translateWithDeepL(text, targetLang, sourceLang);
  if (deepl) return { text: deepl, source: "deepl" };

  const google = await translateWithGoogle(text, targetLang, sourceLang);
  if (google) return { text: google, source: "google" };

  const llm = await translateWithLLM(text, targetLang, sourceLang, engine);
  if (llm) return { text: llm, source: "anthropic" };

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

async function translateWithLLM(text: string, lang: Lang, sourceLang: Lang, engine: string): Promise<string | null> {
  const result = await askLLM({
    system: `You are a translator. Translate the ${LANG_NAME[sourceLang]} input into natural ${LANG_NAME[lang]}. Reply with the translation only, no quotes and no commentary.`,
    user: text,
    maxTokens: 400,
  }, engine);
  return result?.trim() ?? null;
}

export async function translateBatchWithLLM(texts: string[], lang: Lang, sourceLang: Lang, engine: string): Promise<string[] | null> {
  const inputObj: Record<string, string> = {};
  texts.forEach((t, i) => { inputObj[String(i)] = t; });

  const result = await askLLM({
    system: `You are a translator. You will receive a JSON object of text snippets in ${LANG_NAME[sourceLang]}. Translate each snippet into natural ${LANG_NAME[lang]}.
Return ONLY a JSON object where keys are the same indices and values are the translated strings. Do not combine or drop any snippets.`,
    user: JSON.stringify(inputObj),
    maxTokens: 2500,
    json: true,
  }, engine);
  if (!result) return null;
  
  try {
    let raw = result.trim();
    if (raw.startsWith("```json")) raw = raw.replace(/^```json\n?/, "").replace(/\n?```$/, "");
    if (raw.startsWith("```")) raw = raw.replace(/^```\n?/, "").replace(/\n?```$/, "");
    
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null) {
      // Map it back to array based on the original indices
      return texts.map((_, i) => String(parsed[String(i)] || ""));
    }
    return null;
  } catch (e) {
    console.error("[translateBatchWithLLM] failed to parse JSON:", e);
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

async function askOpenAIFormat(
  request: ClaudeRequest,
  url: string,
  key: string,
  model: string,
  authHeader = "Bearer"
): Promise<string | null> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (authHeader === "Bearer") {
      headers["Authorization"] = `Bearer ${key}`;
    } else if (authHeader === "api-key") {
      headers["api-key"] = key;
    }

    const payload: any = {
      model,
      messages: [
        { role: "system", content: request.system },
        { role: "user", content: request.user }
      ],
      max_tokens: request.maxTokens ?? 512,
    };
    
    if (request.json) {
      payload.response_format = { type: "json_object" };
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error(`[openai-format ${model}]`, response.status, await response.text());
      return null;
    }
    const data = await response.json();
    return data.choices?.[0]?.message?.content ?? null;
  } catch (error) {
    console.error(`[openai-format ${model}] request failed:`, error);
    return null;
  }
}

export async function askLLM(request: ClaudeRequest, engine: string = "auto"): Promise<string | null> {
  // Determine engine
  let activeEngine = engine;
  if (activeEngine === "auto") {
    if (process.env.GEMINI_API_KEY) activeEngine = "gemini";
    else if (process.env.GROQ_API_KEY) activeEngine = "groq";
    else if (process.env.DEEPSEEK_API_KEY) activeEngine = "deepseek";
    else if (process.env.OPENAI_API_KEY) activeEngine = "openai";
    else if (process.env.ANTHROPIC_API_KEY) activeEngine = "anthropic";
    else if (process.env.OPENROUTER_API_KEY) activeEngine = "openrouter";
  }

  switch (activeEngine) {
    case "gemini":
      if (process.env.GEMINI_API_KEY) {
        return askOpenAIFormat(
          request,
          "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
          process.env.GEMINI_API_KEY,
          "gemini-1.5-flash"
        );
      }
      break;
    case "groq":
      if (process.env.GROQ_API_KEY) {
        return askOpenAIFormat(
          request,
          "https://api.groq.com/openai/v1/chat/completions",
          process.env.GROQ_API_KEY,
          "llama-3.3-70b-versatile"
        );
      }
      break;
    case "deepseek":
      if (process.env.DEEPSEEK_API_KEY) {
        return askOpenAIFormat(
          request,
          "https://api.deepseek.com/chat/completions",
          process.env.DEEPSEEK_API_KEY,
          "deepseek-chat"
        );
      }
      break;
    case "openai":
      if (process.env.OPENAI_API_KEY) {
        return askOpenAIFormat(
          request,
          "https://api.openai.com/v1/chat/completions",
          process.env.OPENAI_API_KEY,
          "gpt-4o"
        );
      }
      break;
    case "openrouter":
      if (process.env.OPENROUTER_API_KEY) {
        return askOpenAIFormat(
          request,
          "https://openrouter.ai/api/v1/chat/completions",
          process.env.OPENROUTER_API_KEY,
          "anthropic/claude-3.5-sonnet"
        );
      }
      break;
    case "anthropic":
      if (process.env.ANTHROPIC_API_KEY) {
        return askClaude(request);
      }
      break;
  }
  
  // Fallback
  if (process.env.GEMINI_API_KEY) {
    return askOpenAIFormat(request, "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", process.env.GEMINI_API_KEY, "gemini-1.5-flash");
  }
  return askClaude(request);
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
