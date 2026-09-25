import { NextRequest, NextResponse } from "next/server";
import { assertPublicUrl } from "@/lib/server/feed";

export const runtime = "nodejs";

const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

async function proxyMediaRequest(req: NextRequest, isHead: boolean) {
  const targetUrl = req.nextUrl.searchParams.get("url");

  if (!targetUrl || !/^https?:\/\//i.test(targetUrl.trim())) {
    return NextResponse.json({ error: "Missing or invalid url parameter" }, { status: 400 });
  }

  let validatedUrl: URL;
  try {
    validatedUrl = assertPublicUrl(targetUrl.trim());
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Blocked target host";
    return NextResponse.json({ error: message }, { status: 403 });
  }

  const range = req.headers.get("range");
  const upstreamHeaders: Record<string, string> = {
    "User-Agent": BROWSER_USER_AGENT,
    Accept: "*/*",
    "Accept-Encoding": "identity",
  };

  if (range) {
    upstreamHeaders["Range"] = range;
  }

  try {
    const upstream = await fetch(validatedUrl.toString(), {
      method: isHead ? "HEAD" : "GET",
      headers: upstreamHeaders,
      redirect: "follow",
      signal: req.signal,
    });

    if (!upstream.ok && upstream.status !== 206) {
      return NextResponse.json(
        {
          error: `Upstream server returned HTTP ${upstream.status}`,
          status: upstream.status,
          finalUrl: upstream.url,
        },
        { status: upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502 }
      );
    }

    const contentType = upstream.headers.get("content-type") || "audio/mpeg";

    // If upstream redirected to an HTML page (paywall, login, error page)
    if (contentType.toLowerCase().includes("text/html")) {
      return NextResponse.json(
        {
          error: "Upstream returned HTML web page instead of media file",
          isHtml: true,
          finalUrl: upstream.url,
        },
        { status: 422 }
      );
    }

    const responseHeaders = new Headers();
    responseHeaders.set("Content-Type", contentType);
    responseHeaders.set("Accept-Ranges", "bytes");
    responseHeaders.set("Access-Control-Allow-Origin", "*");
    responseHeaders.set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges");
    responseHeaders.set("Cache-Control", "public, max-age=7200");

    const contentRange = upstream.headers.get("content-range");
    if (contentRange) responseHeaders.set("Content-Range", contentRange);

    const contentLength = upstream.headers.get("content-length");
    if (contentLength) responseHeaders.set("Content-Length", contentLength);

    if (isHead) {
      return new NextResponse(null, {
        status: upstream.status,
        headers: responseHeaders,
      });
    }

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (err: unknown) {
    if (req.signal.aborted) {
      return new NextResponse(null, { status: 499 });
    }
    const message = err instanceof Error ? err.message : "Media streaming proxy error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function GET(req: NextRequest) {
  return proxyMediaRequest(req, false);
}

export async function HEAD(req: NextRequest) {
  return proxyMediaRequest(req, true);
}
