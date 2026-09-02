import { NextResponse } from "next/server";
import { translate, hasTranslationProvider } from "@/lib/server/translate";
import type { TargetLang } from "@/lib/types";

export const runtime = "nodejs";

/** On-demand sentence translation, for transcripts ingested without one. */
export async function POST(request: Request) {
  let text: string;
  let lang: TargetLang;
  try {
    const body = (await request.json()) as { text?: string; lang?: TargetLang };
    text = (body.text ?? "").trim().slice(0, 2000);
    lang = body.lang === "vi" ? "vi" : "en";
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!text) return NextResponse.json({ error: "text is required" }, { status: 400 });

  if (!hasTranslationProvider()) {
    return NextResponse.json(
      { text: null, source: "none", note: "No translation provider configured." },
      { status: 200 },
    );
  }

  const result = await translate(text, lang);
  return NextResponse.json(result);
}
