import { NextResponse } from "next/server";
import { assertPublicUrl, parseFeed, type FeedResult } from "@/lib/server/feed";

export const runtime = "nodejs";

export type { FeedEpisode, FeedResult } from "@/lib/server/feed";

const MAX_BYTES = 4 * 1024 * 1024;
const TIMEOUT_MS = 12_000;

/**
 * Podcast feed reader.
 *
 * This is what makes streaming real without anyone hand-entering URLs: point it
 * at a public RSS feed and it returns the actual enclosure URLs, which the
 * browser then streams from the publisher's CDN. No media is proxied through
 * this app, so the response stays small and the bandwidth is not ours.
 */
export async function POST(request: Request) {
  let feedUrl: string;
  try {
    const body = (await request.json()) as { url?: string };
    feedUrl = (body.url ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!feedUrl) return NextResponse.json({ error: "url is required" }, { status: 400 });

  let url: URL;
  try {
    url = assertPublicUrl(feedUrl);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid URL" },
      { status: 400 },
    );
  }

  let xml: string;
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Hoerbar/0.1 (podcast reader)",
        Accept: "application/rss+xml, application/xml, text/xml, */*",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "follow",
      next: { revalidate: 900 },
    });
    if (!response.ok) {
      return NextResponse.json(
        { error: `Der Feed antwortete mit ${response.status}. Prüfe die Adresse oder ob der Anbieter Zugriffe blockiert.` },
        { status: 502 },
      );
    }
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_BYTES) {
      return NextResponse.json({ error: "Dieser Feed ist zu groß zum Parsen." }, { status: 413 });
    }
    xml = new TextDecoder("utf-8").decode(buffer);
  } catch (error) {
    const message =
      error instanceof Error && error.name === "TimeoutError"
        ? "Der Feed hat zu lange gebraucht."
        : "Der Feed war nicht erreichbar.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const result: FeedResult = parseFeed(xml, url.hostname);

  if (result.episodes.length === 0) {
    return NextResponse.json(
      { ...result, error: "In diesem Feed stehen keine abspielbaren Mediendateien." },
      { status: 200 },
    );
  }

  return NextResponse.json(result, {
    headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=3600" },
  });
}
