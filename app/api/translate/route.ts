import { NextResponse } from "next/server";
import { translate, type Lang } from "@/lib/server/translate";

export const runtime = "nodejs";

function toLang(value: unknown, fallback: Lang): Lang {
  return value === "de" || value === "en" || value === "vi" ? value : fallback;
}

/**
 * On-demand translation.
 *
 * Accepts either a single `text` or a batch of `texts`. The batch form exists
 * for episode titles - a feed page shows forty of them at once - and for a
 * published transcript's lines, which can run into the hundreds.
 *
 * `sourceLang` defaults to German: every caller before the published-transcript
 * feature only ever translated German speech, so an English-language show's
 * transcript is the one case that needs to say otherwise.
 */
export async function POST(request: Request) {
  let text: string;
  let texts: string[] | null = null;
  let lang: Lang;
  let sourceLang: Lang;
  try {
    const body = (await request.json()) as {
      text?: string;
      texts?: string[];
      lang?: string;
      sourceLang?: string;
    };
    text = (body.text ?? "").trim().slice(0, 2000);
    lang = toLang(body.lang, "en");
    sourceLang = toLang(body.sourceLang, "de");
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
    // Sequential rather than parallel: the keyless fallback is rate limited,
    // and forty simultaneous requests is the fastest way to be cut off.
    const results = [];
    for (const item of texts) results.push(await translate(item, lang, sourceLang));
    return NextResponse.json({
      texts: results.map((result) => result.text),
      source: results[0]?.source ?? "none",
    });
  }

  const result = await translate(text, lang, sourceLang);
  return NextResponse.json(result);
}
