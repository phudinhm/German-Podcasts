import { assertPublicUrl } from "@/lib/server/feed";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Same-origin passthrough for podcast audio.
 *
 * This exists for one reason. A browser will not let Web Audio read a
 * cross-origin media element unless the CDN sends CORS headers, and podcast
 * CDNs almost never do. Without readable audio there is no way to transcribe a
 * stream in the browser, which is why captions previously had to go round
 * through the microphone and the speakers.
 *
 * Routing the bytes through this origin makes the element same-origin, so the
 * audio graph can read it and captions work with headphones on, in a quiet
 * carriage, in a library.
 *
 * The cost is real and worth stating: this is the one place where media
 * bandwidth lands on our server instead of the publisher's. So it is opt-in,
 * used only when internal-audio captions are switched on, and never for
 * ordinary playback.
 *
 * Range requests are forwarded and mirrored so seeking still works, and the
 * body is streamed rather than buffered so memory does not track episode
 * length.
 */
export async function GET(request: Request) {
  const target = new URL(request.url).searchParams.get("url");
  if (!target) return new Response("url is required", { status: 400 });

  let url: URL;
  try {
    url = assertPublicUrl(target);
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Invalid URL", { status: 400 });
  }

  const range = request.headers.get("range") ?? undefined;

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      headers: {
        "User-Agent": "Hoerbar/0.1 (audio passthrough)",
        Accept: "audio/*,video/*;q=0.9,*/*;q=0.8",
        ...(range ? { Range: range } : {}),
      },
      redirect: "follow",
      signal: AbortSignal.timeout(30_000),
      cache: "no-store",
    });
  } catch {
    return new Response("The audio source could not be reached.", { status: 502 });
  }

  if (!upstream.ok && upstream.status !== 206) {
    return new Response(`The audio source responded ${upstream.status}.`, { status: 502 });
  }

  const type = upstream.headers.get("content-type") ?? "audio/mpeg";
  // Refuse anything that is plainly a web page rather than media: without this
  // an HTML error page would be handed to the decoder as if it were audio.
  if (/^text\/html/i.test(type)) {
    return new Response("That address returns a web page, not a media file.", { status: 415 });
  }

  const headers = new Headers({
    "Content-Type": type,
    "Accept-Ranges": "bytes",
    // Same-origin already, but explicit CORS keeps it working if the app is
    // ever embedded or served from a different host than the API.
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "public, max-age=3600",
  });
  for (const header of ["content-length", "content-range", "last-modified", "etag"]) {
    const value = upstream.headers.get(header);
    if (value) headers.set(header, value);
  }

  return new Response(upstream.body, { status: upstream.status, headers });
}
