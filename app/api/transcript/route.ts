import { NextResponse } from "next/server";
import { assertPublicUrl } from "@/lib/server/feed";
import { parseTranscript } from "@/lib/server/transcript";
import { extractDwLessonIdSync, fetchDwOfficialTranscript } from "@/lib/server/dwLearnGerman";
import { splitLongTranscriptSegments } from "@/lib/server/transcribe";

export const runtime = "nodejs";

/** Transcripts run the length of the episode, but they are text, not audio -
 * anything past this is almost certainly not a transcript file. */
const MAX_BYTES = 4 * 1024 * 1024;
const TIMEOUT_MS = 10_000;

/**
 * Fetches a publisher-supplied transcript server-side and turns it into the
 * flat segment list the transcript panel already knows how to render.
 *
 * Server-side because most transcript CDNs do not send CORS headers for
 * arbitrary browser origins, and because the SSRF guard needs to run
 * somewhere the caller cannot bypass it.
 */
export async function POST(request: Request) {
  let url: string;
  let type: string;
  try {
    const body = (await request.json()) as { url?: string; type?: string };
    url = (body.url ?? "").trim();
    type = (body.type ?? "text/plain").trim();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!url) return NextResponse.json({ error: "url is required" }, { status: 400 });

  const dwLessonId = extractDwLessonIdSync({ pageUrl: url });
  if (dwLessonId) {
    const dwSegments = await fetchDwOfficialTranscript(dwLessonId);
    if (dwSegments && dwSegments.length > 0) {
      const segments = splitLongTranscriptSegments(dwSegments).map((seg, index) => ({
        id: `dw-${dwLessonId}-${index}`,
        start: seg.start,
        end: seg.end,
        text: seg.text,
        isFinal: true,
      }));
      return NextResponse.json(
        { segments },
        { headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" } },
      );
    }
  }

  let parsed: URL;
  try {
    parsed = assertPublicUrl(url);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid URL" },
      { status: 400 },
    );
  }

  let body: string;
  try {
    const response = await fetch(parsed, {
      headers: { "User-Agent": "Hoerbar/0.1 (transcript reader)" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "follow",
      next: { revalidate: 3600 },
    });
    if (!response.ok) {
      return NextResponse.json({ error: `Transcript responded with ${response.status}.` }, { status: 502 });
    }
    const contentLength = response.headers.get("content-length");
    if (contentLength && Number(contentLength) > MAX_BYTES) {
      return NextResponse.json({ error: "Transcript is too large." }, { status: 502 });
    }
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_BYTES) {
      return NextResponse.json({ error: "Transcript is too large." }, { status: 502 });
    }
    body = new TextDecoder("utf-8").decode(buffer);
  } catch (error) {
    const message =
      error instanceof Error && error.name === "TimeoutError" ? "Transcript took too long." : "Transcript was not reachable.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const segments = splitLongTranscriptSegments(parseTranscript(body, type)).map((seg, index) => ({
    id: `pub-${index}`,
    start: seg.start,
    end: seg.end,
    text: seg.text,
    isFinal: true,
  }));

  return NextResponse.json(
    { segments },
    { headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" } },
  );
}
