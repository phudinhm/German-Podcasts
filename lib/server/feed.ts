/**
 * Podcast feed parsing.
 *
 * Kept separate from the route so it can be tested without a network: feeds in
 * the wild are inconsistent enough that the parser, not the fetch, is where the
 * bugs live.
 */

/**
 * How many entries to return. The client pages through these locally, so this
 * is a memory bound rather than a page size: a long-running weekly show has
 * hundreds of episodes and cutting at 60 hides most of the back catalogue.
 */
const MAX_ITEMS = 300;

export interface FeedEpisode {
  guid: string;
  title: string;
  description: string;
  /** The enclosure - what actually gets streamed. Empty for a YouTube entry. */
  url: string;
  type: string;
  durationSec: number | null;
  publishedAt: string | null;
  image: string | null;
  /** Set when the entry is a YouTube video rather than a media enclosure. */
  youtubeId?: string;
  /** The episode's own page, for linking out. */
  pageUrl?: string;
}

export interface FeedResult {
  title: string;
  description: string;
  image: string | null;
  link: string | null;
  /** "rss" for a podcast feed, "youtube" for a channel or playlist feed. */
  format: "rss" | "youtube";
  episodes: FeedEpisode[];
}

/**
 * Rejects the obvious SSRF targets. The feed route fetches a URL the caller
 * supplies, so it must never be usable to probe the deploy's own network or a
 * cloud metadata endpoint.
 */
export function assertPublicUrl(raw: string): URL {
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Es werden nur http- und https-Feeds unterstützt.");
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host.endsWith(".localhost") ||
    host.endsWith(".internal") ||
    host.endsWith(".local")
  ) {
    throw new Error("Dieser Host ist von hier aus nicht erreichbar.");
  }
  if (
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host === "::1" ||
    /^fc/i.test(host) ||
    /^fd/i.test(host)
  ) {
    throw new Error("Dieser Host ist von hier aus nicht erreichbar.");
  }
  return url;
}

export function decodeXmlText(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function tag(block: string, name: string): string | null {
  const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return match ? decodeXmlText(match[1]) : null;
}

function attr(block: string, name: string, attribute: string): string | null {
  const match = block.match(new RegExp(`<${name}\\s[^>]*${attribute}\\s*=\\s*["']([^"']+)["']`, "i"));
  return match ? decodeXmlText(match[1]) : null;
}

/** iTunes durations arrive as seconds, mm:ss or hh:mm:ss. */
export function parseDuration(value: string | null): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  if (!/^\d{1,2}(:\d{1,2}){1,2}$/.test(trimmed)) return null;
  return trimmed.split(":").map(Number).reduce((total, part) => total * 60 + part, 0);
}

/**
 * YouTube publishes channel and playlist feeds as Atom, with the video id in a
 * yt: namespace and no enclosure at all - the "media" is a page the IFrame
 * player loads. Parsing it here means a channel behaves exactly like a podcast
 * everywhere downstream.
 */
export function parseYouTubeFeed(xml: string, fallbackTitle: string): FeedResult {
  const header = xml.split(/<entry[\s>]/i)[0];
  const entries = xml.match(/<entry(?:\s[^>]*)?>[\s\S]*?<\/entry>/gi) ?? [];
  const episodes: FeedEpisode[] = [];

  for (const entry of entries.slice(0, MAX_ITEMS)) {
    const videoId = tag(entry, "yt:videoId");
    if (!videoId || !/^[\w-]{11}$/.test(videoId)) continue;
    episodes.push({
      guid: `yt:${videoId}`,
      title: tag(entry, "title") ?? "Ohne Titel",
      description: (tag(entry, "media:description") ?? "").slice(0, 600),
      url: "",
      type: "video/youtube",
      durationSec: null,
      publishedAt: tag(entry, "published"),
      image: attr(entry, "media:thumbnail", "url"),
      youtubeId: videoId,
      pageUrl: `https://www.youtube.com/watch?v=${videoId}`,
    });
  }

  return {
    title: tag(header, "title") ?? fallbackTitle,
    description: "",
    image: null,
    link: attr(header, "link", "href"),
    format: "youtube",
    episodes,
  };
}

export function parseFeed(xml: string, fallbackTitle: string): FeedResult {
  // A YouTube channel feed is Atom with a yt: namespace, not RSS.
  if (/<yt:videoId>/i.test(xml) || /xmlns:yt=/i.test(xml)) {
    return parseYouTubeFeed(xml, fallbackTitle);
  }

  const channelMatch = xml.match(/<channel[\s\S]*?>([\s\S]*)<\/channel>/i);
  const channel = channelMatch ? channelMatch[1] : xml;
  const header = channel.split(/<item[\s>]/i)[0];

  const items = xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi) ?? [];
  const episodes: FeedEpisode[] = [];

  for (const item of items.slice(0, MAX_ITEMS)) {
    const enclosureUrl = attr(item, "enclosure", "url");
    if (!enclosureUrl) continue;
    let safeUrl: string;
    try {
      const parsed = new URL(enclosureUrl);
      // An enclosure pointing at a private address would be streamed by the
      // browser, not by us, but there is no reason to hand one out.
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") continue;
      safeUrl = parsed.toString();
    } catch {
      continue;
    }
    episodes.push({
      guid: tag(item, "guid") ?? safeUrl,
      pageUrl: tag(item, "link") ?? undefined,
      title: tag(item, "title") ?? "Ohne Titel",
      description: (tag(item, "description") ?? tag(item, "itunes:summary") ?? "").slice(0, 600),
      url: safeUrl,
      type: attr(item, "enclosure", "type") ?? "audio/mpeg",
      durationSec: parseDuration(tag(item, "itunes:duration")),
      publishedAt: tag(item, "pubDate"),
      image: attr(item, "itunes:image", "href"),
    });
  }

  return {
    title: tag(header, "title") ?? fallbackTitle,
    description: (tag(header, "description") ?? "").slice(0, 600),
    image: attr(header, "itunes:image", "href"),
    link: tag(header, "link"),
    format: "rss",
    episodes,
  };
}
