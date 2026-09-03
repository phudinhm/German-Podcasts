import { NextResponse } from "next/server";
import { translate, hasTranslationProvider } from "@/lib/server/translate";
import type { TargetLang } from "@/lib/types";

export const runtime = "nodejs";

/**
 * On-demand translation.
 *
 * Accepts either a single `text` or a batch of `texts`. The batch form exists
 * for episode titles: a feed page shows forty of them at once, and forty
 * separate round trips would be slower than the list is worth.
 */
export async function POST(request: Request) {
  let text: string;
  let texts: string[] | null = null;
  let lang: TargetLang;
  try {
    const body = (await request.json()) as { text?: string; texts?: string[]; lang?: TargetLang };
    text = (body.text ?? "").trim().slice(0, 2000);
    lang = body.lang === "vi" ? "vi" : "en";
    if (Array.isArray(body.texts)) {
      texts = body.texts.slice(0, 60).map((item) => String(item).slice(0, 400));
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!text && !texts?.length) {
    return NextResponse.json({ error: "text or texts is required" }, { status: 400 });
  }

  if (!hasTranslationProvider()) {
    return NextResponse.json(
      {
        text: null,
        texts: texts ? texts.map(() => null) : undefined,
        source: "none",
        note: "No translation provider configured.",
      },
      { status: 200 },
    );
  }

  if (texts?.length) {
    const results = await Promise.all(texts.map((item) => translate(item, lang)));
    return NextResponse.json({
      texts: results.map((result) => result.text),
      source: results[0]?.source ?? "none",
    });
  }

  const result = await translate(text, lang);
  return NextResponse.json(result);
}
