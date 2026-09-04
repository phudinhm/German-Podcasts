import { NextResponse } from "next/server";
import { assertPublicUrl, parseFeed, truncateToLastEntry, type FeedResult } from "@/lib/server/feed";

export const runtime = "nodejs";

export type { FeedEpisode, FeedResult } from "@/lib/server/feed";

/**
 * How much of a feed to read.
 *
 * Long-running shows publish enormous feeds - a thousand episodes with full
 * show notes runs well past ten megabytes - and this used to refuse them
 * outright with "too large to parse". That was the wrong call twice over: the
 * parser only ever looks at the newest three hundred episodes, and those are
 * at the front of the document, so everything needed had already arrived by
 * the time the limit was hit. Reading a prefix and stopping is what the reader
 * wanted all along.
 */
const MAX_BYTES = 12 * 1024 * 1024;
const TIMEOUT_MS = 12_000;

/**
 * Podcast feed reader.
 *
 * This is what makes streaming real without anyone hand-entering URLs: point it
 * at a public RSS feed and it returns the actual enclosure URLs, which the
 * browser then streams from the publisher's CDN. No media is proxied through
 * this app, so the response stays small and the bandwidth is not ours.
 */
/**
 * Reads at most `limit` bytes, then cuts the XML back to the last complete
 * entry.
 *
 * Truncating mid-item would hand the parser half an episode; cutting at the
 * last closing tag hands it a shorter but honest document. Feeds are ordered
 * newest first, so what survives is exactly what a listener wants to see.
 */
async function readPrefix(response: Response, limit: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return new TextDecoder("utf-8").decode(await response.arrayBuffer());

  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < limit) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
  }
  await reader.cancel().catch(() => undefined);

  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder("utf-8").decode(joined);
  return total < limit ? text : truncateToLastEntry(text);
}

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
    xml = await readPrefix(response, MAX_BYTES);
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
