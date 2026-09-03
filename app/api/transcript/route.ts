import { NextResponse } from "next/server";
import { loadEpisodes } from "@/lib/catalog";
import type { Segment } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Looks for a catalog transcript that belongs to a streamed episode.
 *
 * The discovery flow plays arbitrary podcast audio, most of which has never
 * been ingested. When an episode *has* been ingested, though, its transcript is
 * already sitting in the catalog and it would be perverse to make the user go
 * and find it. Matching is on the media address, then on the YouTube id, then
 * on an exact title, in that order of confidence.
 */
export async function POST(request: Request) {
  let url: string;
  let youtubeId: string;
  let title: string;
  try {
    const body = (await request.json()) as { url?: string; youtubeId?: string; title?: string };
    url = (body.url ?? "").trim();
    youtubeId = (body.youtubeId ?? "").trim();
    title = (body.title ?? "").trim().toLowerCase();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const episodes = await loadEpisodes();

  const normalise = (value: string) => value.replace(/^https?:\/\//, "").replace(/\?.*$/, "");
  const target = url ? normalise(url) : "";

  const match = episodes.find((episode) => {
    if (episode.transcript.length === 0) return false;
    const source = episode.source;
    if (youtubeId && source.kind === "youtube" && source.youtubeId === youtubeId) return true;
    if (target && source.kind === "audio" && normalise(source.audioUrl) === target) return true;
    if (target && source.kind === "video" && normalise(source.videoUrl) === target) return true;
    if (title && episode.title.toLowerCase() === title) return true;
    return false;
  });

  if (!match) {
    return NextResponse.json({ found: false, segments: [] as Segment[] });
  }

  return NextResponse.json({
    found: true,
    slug: match.slug,
    title: match.title,
    cefr: match.cefr,
    segments: match.transcript,
  });
}
