import { NextResponse } from "next/server";
import { lookup, type CoreEntry } from "@/lib/server/dictionary";
import { getEpisode } from "@/lib/catalog";
import type { TargetLang } from "@/lib/types";

export const runtime = "nodejs";

interface Body {
  word?: string;
  sentence?: string;
  lang?: TargetLang;
  slug?: string;
}

/**
 * Dictionary lookup for a clicked word.
 *
 * Answers from the episode's precomputed glossary when it can, which is the
 * common case and costs nothing; falls back through the shipped lexicon, then a
 * model call, then machine translation.
 */
export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const word = body.word?.trim();
  if (!word) return NextResponse.json({ error: "word is required" }, { status: 400 });
  if (word.length > 64) return NextResponse.json({ error: "word is too long" }, { status: 400 });

  const sentence = (body.sentence ?? word).slice(0, 600);
  const lang: TargetLang = body.lang === "vi" ? "vi" : "en";

  let glossary: Record<string, CoreEntry> | null = null;
  if (body.slug) {
    const episode = await getEpisode(body.slug);
    glossary = (episode?.glossary ?? null) as Record<string, CoreEntry> | null;
  }

  try {
    const result = await lookup({ word, sentence, lang, glossary });
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, max-age=300" },
    });
  } catch (error) {
    console.error("[api/lookup]", error);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
}
