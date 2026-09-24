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

const GERMAN_CHECK_RE =
  /[äöüßÄÖÜ]|\b(und|der|die|das|nicht|mit|ist|sind|auch|eine|einen|ich|wir|sie|für|von|dass|über|wenn|haben|werden|oder|aber)\b/i;

function looksLikeGerman(text: string): boolean {
  return GERMAN_CHECK_RE.test(text);
}

export async function translate(
  text: string,
  targetLang: Lang,
  sourceLang: Lang = "de",
  engine: string = "auto",
): Promise<TranslationResult> {
  if (!text.trim()) return { text: null, source: "none" };
  // Only skip translation if targetLang matches sourceLang AND the text does not look like German when target is English/Vietnamese
  if (targetLang === sourceLang && (targetLang === "de" || !looksLikeGerman(text))) {
    return { text, source: "none" };
  }

  const effectiveSource: Lang =
    targetLang !== "de" && looksLikeGerman(text) ? "de" : sourceLang === targetLang ? "de" : sourceLang;

  const deepl = await translateWithDeepL(text, targetLang);
  if (deepl) return { text: deepl, source: "deepl" };

  const google = await translateWithGoogle(text, targetLang);
  if (google) return { text: google, source: "google" };

  const llm = await translateWithLLM(text, targetLang, effectiveSource, engine);
  if (llm) return { text: llm, source: "anthropic" };

  const gtx = await translateWithGoogleGTX(text, targetLang, "auto");
  if (gtx) return { text: gtx, source: "google" };

  const free = await translateWithMyMemory(text, targetLang, effectiveSource);
  if (free) return { text: free, source: "mymemory" };

  return { text: null, source: "none" };
}

/** Longest string MyMemory accepts in one request. */
const MYMEMORY_LIMIT = 500;

async function translateWithMyMemory(text: string, lang: Lang, sourceLang: Lang): Promise<string | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;

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

  const actualSource = lang !== "de" && looksLikeGerman(trimmed) ? "de" : sourceLang === lang ? "de" : sourceLang;
  const out: string[] = [];
  for (const part of parts) {
    try {
      const params = new URLSearchParams({ q: part, langpair: `${actualSource}|${lang}` });
      const email = process.env.MYMEMORY_EMAIL;
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

async function translateWithDeepL(text: string, lang: Lang): Promise<string | null> {
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
        // Omit source_lang so DeepL auto-detects German/English per sentence
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

async function translateWithGoogle(text: string, lang: Lang): Promise<string | null> {
  const key = process.env.GOOGLE_TRANSLATE_API_KEY;
  if (!key) return null;
  try {
    const response = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Omit source so Google Cloud Translate auto-detects per sentence
      body: JSON.stringify({ q: text, target: lang, format: "text" }),
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

async function translateWithLLM(text: string, lang: Lang, _sourceLang: Lang, engine: string): Promise<string | null> {
  const result = await askLLM({
    system: `You are a professional translator. Translate the input (which may be in German or English) into natural ${LANG_NAME[lang]} (${lang}). Reply ONLY with the ${LANG_NAME[lang]} translation, no quotes and no commentary. Never reply in German if the target language is ${LANG_NAME[lang]}.`,
    user: text,
    maxTokens: 400,
  }, engine);
  const trimmed = result?.trim() ?? null;
  if (trimmed && lang !== "de" && looksLikeGerman(trimmed) && looksLikeGerman(text)) {
    return translateWithGoogleGTX(text, lang, "de");
  }
  return trimmed;
}

export async function translateWithGoogleGTX(
  text: string,
  lang: Lang,
  sourceLang: Lang | "auto" = "auto",
): Promise<string | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    const sl = sourceLang === lang ? "auto" : sourceLang;
    const params = new URLSearchParams({
      client: "gtx",
      sl,
      tl: lang,
      dt: "t",
      q: trimmed,
    });
    const response = await fetch(`https://translate.googleapis.com/translate_a/single?${params}`, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as unknown;
    if (!Array.isArray(data) || !Array.isArray(data[0])) return null;
    const combined = (data[0] as Array<unknown>)
      .map((part) => (Array.isArray(part) && typeof part[0] === "string" ? part[0] : ""))
      .join("")
      .trim();
    return combined || null;
  } catch {
    return null;
  }
}

export async function translateBatchWithGoogleGTX(
  texts: string[],
  lang: Lang,
  _sourceLang?: Lang,
): Promise<string[]> {
  return Promise.all(
    texts.map(async (t) => {
      if (!t.trim()) return "";
      const res = await translateWithGoogleGTX(t, lang, "auto");
      return res ?? "";
    }),
  );
}

export async function translateBatchWithLLM(texts: string[], lang: Lang, sourceLang: Lang, engine: string): Promise<string[] | null> {
  const inputObj: Record<string, string> = {};
  texts.forEach((t, i) => { inputObj[String(i)] = t; });

  const result = await askLLM({
    system: `You are a translator. You will receive a JSON object of text snippets (primarily German or bilingual German/English). Translate every snippet into natural ${LANG_NAME[lang]} (${lang}).
IMPORTANT: Every single value in the returned JSON MUST be written in ${LANG_NAME[lang]}. Never leave German sentences untranslated when target is ${LANG_NAME[lang]}.
Return ONLY a JSON object where keys are the same indices and values are the translated ${LANG_NAME[lang]} strings.`,
    user: JSON.stringify(inputObj),
    maxTokens: 3000,
    json: true,
  }, engine);

  if (result) {
    try {
      let raw = result.trim();
      if (raw.startsWith("```json")) raw = raw.replace(/^```json\n?/, "").replace(/\n?```$/, "");
      if (raw.startsWith("```")) raw = raw.replace(/^```\n?/, "").replace(/\n?```$/, "");
      
      const parsed = JSON.parse(raw);
      if (typeof parsed === "object" && parsed !== null) {
        const mapped = await Promise.all(
          texts.map(async (orig, i) => {
            const val = String(parsed[String(i)] || "").trim();
            // If LLM returned empty, or returned untouched German when target is English/Vietnamese, re-translate with GTX
            if (val && !(lang !== "de" && looksLikeGerman(val) && looksLikeGerman(orig))) {
              return val;
            }
            if (!orig.trim()) return "";
            return (await translateWithGoogleGTX(orig, lang, "auto")) ?? val;
          }),
        );
        return mapped;
      }
    } catch (e) {
      console.error("[translateBatchWithLLM] failed to parse JSON:", e);
    }
  }

  return translateBatchWithGoogleGTX(texts, lang, sourceLang);
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

const GEMINI_MODELS = [
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3-flash-preview",
  "gemini-2.5-flash-lite",
];

async function askGemini(request: ClaudeRequest, key: string): Promise<string | null> {
  const payload: any = {
    system_instruction: { parts: [{ text: request.system }] },
    contents: [
      { role: "user", parts: [{ text: request.user }] }
    ],
    generationConfig: {
      maxOutputTokens: request.maxTokens ?? 2048,
    }
  };
  if (request.json) {
    payload.generationConfig.responseMimeType = "application/json";
  }

  for (const model of GEMINI_MODELS) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        console.error(`[gemini ${model}]`, response.status, await response.text());
        continue;
      }
      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return text;
    } catch (error) {
      console.error(`[gemini ${model}] failed:`, error);
    }
  }
  return null;
}

/** Parallel multi-engine race: executes available AI engines concurrently and returns whichever responds fastest! */
async function askParallel(request: ClaudeRequest): Promise<string | null> {
  const candidates: Array<Promise<string>> = [];

  if (process.env.GEMINI_API_KEY) {
    candidates.push(
      askGemini(request, process.env.GEMINI_API_KEY).then((res) => {
        if (!res) throw new Error("Gemini failed");
        return res;
      })
    );
  }

  if (process.env.GROQ_API_KEY) {
    candidates.push(
      askOpenAIFormat(
        request,
        "https://api.groq.com/openai/v1/chat/completions",
        process.env.GROQ_API_KEY,
        "llama-3.3-70b-versatile"
      ).then((res) => {
        if (!res) throw new Error("Groq failed");
        return res;
      })
    );
  }

  if (process.env.DEEPSEEK_API_KEY) {
    candidates.push(
      askOpenAIFormat(
        request,
        "https://api.deepseek.com/chat/completions",
        process.env.DEEPSEEK_API_KEY,
        "deepseek-chat"
      ).then((res) => {
        if (!res) throw new Error("DeepSeek failed");
        return res;
      })
    );
  }

  if (process.env.OPENAI_API_KEY) {
    candidates.push(
      askOpenAIFormat(
        request,
        "https://api.openai.com/v1/chat/completions",
        process.env.OPENAI_API_KEY,
        "gpt-4o"
      ).then((res) => {
        if (!res) throw new Error("OpenAI failed");
        return res;
      })
    );
  }

  if (process.env.OPENROUTER_API_KEY) {
    candidates.push(
      askOpenAIFormat(
        request,
        "https://openrouter.ai/api/v1/chat/completions",
        process.env.OPENROUTER_API_KEY,
        "anthropic/claude-3.5-sonnet"
      ).then((res) => {
        if (!res) throw new Error("OpenRouter failed");
        return res;
      })
    );
  }

  if (process.env.ANTHROPIC_API_KEY) {
    candidates.push(
      askClaude(request).then((res) => {
        if (!res) throw new Error("Claude failed");
        return res;
      })
    );
  }

  if (candidates.length === 0) return null;

  try {
    return await Promise.any(candidates);
  } catch {
    return null;
  }
}

export async function askLLM(request: ClaudeRequest, engine: string = "auto"): Promise<string | null> {
  // If engine is auto or parallel, race available engines for maximum speed and 0 downtime
  if (engine === "auto" || engine === "parallel") {
    const fastResult = await askParallel(request);
    if (fastResult) return fastResult;
  }

  switch (engine) {
    case "gemini":
      if (process.env.GEMINI_API_KEY) {
        const res = await askGemini(request, process.env.GEMINI_API_KEY);
        if (res) return res;
      }
      break;
    case "groq":
      if (process.env.GROQ_API_KEY) {
        const res = await askOpenAIFormat(
          request,
          "https://api.groq.com/openai/v1/chat/completions",
          process.env.GROQ_API_KEY,
          "llama-3.3-70b-versatile"
        );
        if (res) return res;
      }
      break;
    case "deepseek":
      if (process.env.DEEPSEEK_API_KEY) {
        const res = await askOpenAIFormat(
          request,
          "https://api.deepseek.com/chat/completions",
          process.env.DEEPSEEK_API_KEY,
          "deepseek-chat"
        );
        if (res) return res;
      }
      break;
    case "openai":
      if (process.env.OPENAI_API_KEY) {
        const res = await askOpenAIFormat(
          request,
          "https://api.openai.com/v1/chat/completions",
          process.env.OPENAI_API_KEY,
          "gpt-4o"
        );
        if (res) return res;
      }
      break;
    case "openrouter":
      if (process.env.OPENROUTER_API_KEY) {
        const res = await askOpenAIFormat(
          request,
          "https://openrouter.ai/api/v1/chat/completions",
          process.env.OPENROUTER_API_KEY,
          "anthropic/claude-3.5-sonnet"
        );
        if (res) return res;
      }
      break;
    case "anthropic":
      if (process.env.ANTHROPIC_API_KEY) {
        const res = await askClaude(request);
        if (res) return res;
      }
      break;
  }

  // Fallback: try parallel race of all available keys
  return askParallel(request);
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
