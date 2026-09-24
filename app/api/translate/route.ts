import { NextResponse } from "next/server";
import { translate, translateBatchWithLLM, type Lang } from "@/lib/server/translate";

export const runtime = "nodejs";

function toLang(value: unknown, fallback: Lang): Lang {
  return value === "de" || value === "en" || value === "vi" ? value : fallback;
}

export async function POST(request: Request) {
  let text: string;
  let texts: string[] | null = null;
  let lang: Lang;
  let sourceLang: Lang;
  let engine: string;
  try {
    const body = (await request.json()) as {
      text?: string;
      texts?: string[];
      lang?: string;
      sourceLang?: string;
      engine?: string;
    };
    text = (body.text ?? "").trim().slice(0, 2000);
    lang = toLang(body.lang, "en");
    sourceLang = toLang(body.sourceLang, "de");
    engine = body.engine ?? "auto";
    if (Array.isArray(body.texts)) {
      texts = body.texts.slice(0, 60).map((item) => String(item).slice(0, 400));
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!text && !texts?.length) {
    return NextResponse.json({ error: "text or texts is required" }, { status: 400 });
  }

  if (texts?.length) {
    // Try to translate as a batch if LLM is enabled, as sequential fallback is rate limited and slow.
    if (engine !== "auto" || process.env.GEMINI_API_KEY || process.env.GROQ_API_KEY || process.env.DEEPSEEK_API_KEY || process.env.OPENROUTER_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY) {
      const batchResult = await translateBatchWithLLM(texts, lang, sourceLang, engine);
      if (batchResult) {
        return NextResponse.json({
          texts: batchResult,
          source: "llm-batch",
        });
      }
    }

    // Sequential fallback
    const results = [];
    for (const item of texts) results.push(await translate(item, lang, sourceLang, engine));
    return NextResponse.json({
      texts: results.map((result) => result.text),
      source: results[0]?.source ?? "none",
    });
  }

  const result = await translate(text, lang, sourceLang, engine);
  return NextResponse.json(result);
}
