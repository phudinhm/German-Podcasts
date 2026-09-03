import type { MediaSource } from "./types";

/**
 * Turning a pasted URL into something playable.
 *
 * The app never proxies or re-hosts media: whatever we resolve here is handed
 * straight to a YouTube iframe or a media element, and the bytes travel from
 * the publisher's CDN to the listener. That is the whole reason bandwidth cost
 * does not scale with usage.
 */

const VIDEO_EXTENSIONS = /\.(mp4|m4v|webm|ogv|mov)(\?|#|$)/i;
const AUDIO_EXTENSIONS = /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac)(\?|#|$)/i;
/** HLS. Safari plays it natively; other browsers need hls.js, which we do not bundle. */
const HLS_EXTENSION = /\.m3u8(\?|#|$)/i;

/**
 * Podcast feeds are full of `http://` enclosures, and a browser on an https
 * page refuses to load them as mixed content, which surfaces as an unhelpful
 * "format not supported". Most of those CDNs serve the same path over https, so
 * upgrading is the fix.
 *
 * It only applies on a secure page. On plain http there is no mixed-content
 * rule to satisfy, and rewriting the scheme there breaks hosts that genuinely
 * have no TLS - a local file server during development, most obviously.
 */
export function upgradeToHttps(raw: string): string {
  if (!raw.startsWith("http://")) return raw;
  if (typeof window !== "undefined" && window.location.protocol !== "https:") return raw;
  return `https://${raw.slice("http://".length)}`;
}

/** True when this URL would be blocked as mixed content on the current page. */
export function isMixedContent(raw: string): boolean {
  if (typeof window === "undefined") return false;
  return window.location.protocol === "https:" && raw.startsWith("http://");
}

export function parseYouTubeId(raw: string): string | null {
  const value = raw.trim();
  // A bare 11-character id is the most common thing people paste.
  if (/^[\w-]{11}$/.test(value)) return value;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, "");
  if (host === "youtu.be") {
    const id = url.pathname.slice(1).split("/")[0];
    return /^[\w-]{11}$/.test(id) ? id : null;
  }
  if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
    const v = url.searchParams.get("v");
    if (v && /^[\w-]{11}$/.test(v)) return v;
    const match = url.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{11})/);
    if (match) return match[1];
  }
  return null;
}

export interface ParsedMedia {
  source: MediaSource;
  /** What the UI should say about this choice. */
  label: string;
}

/**
 * Resolves a pasted string to a media source. Returns null when nothing about
 * it looks playable, so the caller can say so rather than mounting a player
 * that will silently fail.
 */
export function parseMediaUrl(raw: string): ParsedMedia | null {
  const value = raw.trim();
  if (!value) return null;

  const youtubeId = parseYouTubeId(value);
  if (youtubeId) {
    return {
      source: { kind: "youtube", youtubeId, pageUrl: `https://www.youtube.com/watch?v=${youtubeId}` },
      label: "YouTube",
    };
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  if (VIDEO_EXTENSIONS.test(url.pathname)) {
    return { source: { kind: "video", videoUrl: url.toString(), pageUrl: url.toString() }, label: "Video-Stream" };
  }
  if (HLS_EXTENSION.test(url.pathname)) {
    return { source: { kind: "video", videoUrl: url.toString(), pageUrl: url.toString() }, label: "HLS-Stream" };
  }
  if (AUDIO_EXTENSIONS.test(url.pathname)) {
    return { source: { kind: "audio", audioUrl: url.toString(), pageUrl: url.toString() }, label: "Audio-Stream" };
  }

  // Podcast enclosures very often carry no file extension at all, because the
  // path is a tracking redirect. Treat an unknown http(s) URL as audio and let
  // the element's own error handling report it if that guess was wrong.
  return { source: { kind: "audio", audioUrl: url.toString(), pageUrl: url.toString() }, label: "Stream (Typ wird beim Laden erkannt)" };
}

export function isStreamable(source: MediaSource): boolean {
  return source.kind === "youtube" || source.kind === "audio" || source.kind === "video";
}

export function describeSource(source: MediaSource): string {
  switch (source.kind) {
    case "youtube":
      return "YouTube";
    case "audio":
      return "Audio-Stream";
    case "video":
      return "Video-Stream";
    case "timeline":
      return "Zeitachse ohne Ton";
    default:
      return "noch nicht eingelesen";
  }
}
