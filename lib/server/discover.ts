import { decodeXmlText } from "./feed";

/**
 * Source discovery.
 *
 * The point is that nobody should have to find an RSS URL by hand. Paste an
 * Apple Podcasts link, a Spotify show, a podcast's
 * own website, or just the name of a show, and this works out what can actually
 * be played.
 *
 * What each source allows is not the same, and the difference is not cosmetic:
 *
 *  - Apple Podcasts runs a keyless search API that returns the show's real RSS
 *    feed. That makes it the best discovery front door by a distance: one
 *    request, no credentials, and the answer is a feed we can already stream.
 *  - Spotify does not let anyone else stream its audio. What we can do is
 *    identify the show and look for the same programme's public RSS, which most
 *    podcasts also publish. Where a show is a Spotify exclusive there is no
 *    honest way to play it here, and the UI says so rather than failing oddly.
 *  - Anything else: fetch the page and look for a feed link in the markup,
 *    which is how most podcast websites advertise their feed.
 */

export type DiscoverOrigin = "apple" | "spotify" | "rss" | "web";

export interface DiscoverResult {
  id: string;
  title: string;
  publisher: string;
  description: string;
  artwork: string | null;
  /** Where the episode list comes from. Null when nothing playable was found. */
  feedUrl: string | null;
  /** Set when the result is a single video rather than a show. */
  origin: DiscoverOrigin;
  pageUrl: string | null;
  /** Shown under the result when there is something the user needs to know. */
  note?: string;
  /** Language or country hint from the source, when it gives one. */
  language?: string;
}

export type InputKind =
  | { kind: "apple-podcast"; id: string }
  | { kind: "spotify-show"; id: string }
  | { kind: "spotify-episode"; id: string }
  | { kind: "feed"; url: string }
  | { kind: "webpage"; url: string }
  | { kind: "search"; term: string };

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
]);

/**
 * Works out what the user actually pasted. Deliberately does no I/O, so the
 * routing decisions are testable on their own.
 */
export function classifyInput(raw: string): InputKind {
  const value = raw.trim();
  if (!value) return { kind: "search", term: "" };

  let url: URL | null = null;
  try {
    url = new URL(value.startsWith("http") ? value : `https://${value}`);
    // Something like "easy german" parses as a hostname without a dot.
    if (!url.hostname.includes(".")) url = null;
  } catch {
    url = null;
  }
  if (!url || (url.protocol !== "http:" && url.protocol !== "https:")) {
    return { kind: "search", term: value };
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, "");

  if (host === "podcasts.apple.com" || host === "itunes.apple.com") {
    const match = url.pathname.match(/\/id(\d+)/);
    if (match) return { kind: "apple-podcast", id: match[1] };
    return { kind: "search", term: decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() ?? "").replace(/-/g, " ") };
  }

  if (host === "open.spotify.com" || host === "spotify.com") {
    const show = url.pathname.match(/\/show\/([A-Za-z0-9]+)/);
    if (show) return { kind: "spotify-show", id: show[1] };
    const episode = url.pathname.match(/\/episode\/([A-Za-z0-9]+)/);
    if (episode) return { kind: "spotify-episode", id: episode[1] };
  }

  // A URL that already looks like a feed.
  if (/\.(xml|rss|atom)$/i.test(url.pathname) || /\/(feed|rss|podcast)\/?$/i.test(url.pathname)) {
    return { kind: "feed", url: url.toString() };
  }

  return { kind: "webpage", url: url.toString() };
}

/** A YouTube handle typed on its own, e.g. "@easygerman". */
export function isYouTubeHandle(value: string): string | null {
  const match = value.trim().match(/^@([\w.-]{3,30})$/);
  return match ? match[1] : null;
}

/** Any YouTube address, in any of the shapes people paste. */
export function isYouTubeInput(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  try {
    const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    return YOUTUBE_HOSTS.has(url.hostname.toLowerCase().replace(/^www\./, ""));
  } catch {
    return false;
  }
}

/**
 * What to say when someone pastes a YouTube link.
 *
 * The channel feeds were readable and the player worked, but a large share of
 * German broadcasters forbid playback outside YouTube, so for exactly the
 * publishers a learner searches for the result was a black rectangle. An
 * honest "not here, and here is why" beats a feature that fails on its best
 * candidates.
 */
export const YOUTUBE_UNSUPPORTED =
  "YouTube is not a source here. Many German channels block playback outside YouTube, so it failed for the shows worth watching. Podcast feeds, Apple Podcasts, Spotify shows and news sites all work.";

// ---------------------------------------------------------------------------
// Apple Podcasts
// ---------------------------------------------------------------------------

export interface ITunesPodcast {
  collectionId?: number;
  trackId?: number;
  collectionName?: string;
  trackName?: string;
  artistName?: string;
  feedUrl?: string;
  artworkUrl600?: string;
  artworkUrl100?: string;
  collectionViewUrl?: string;
  trackViewUrl?: string;
  primaryGenreName?: string;
  genres?: string[];
  country?: string;
  trackCount?: number;
}

/**
 * Maps the iTunes Search API payload onto our result shape. Entries without a
 * feed URL are dropped: a show we cannot fetch is not a result, it is a dead
 * end, and listing it would only waste a click.
 */
export function mapITunesResults(payload: { results?: ITunesPodcast[] }): DiscoverResult[] {
  const results = payload.results ?? [];
  const out: DiscoverResult[] = [];
  for (const item of results) {
    const feedUrl = item.feedUrl?.trim();
    if (!feedUrl) continue;
    const title = item.collectionName ?? item.trackName;
    if (!title) continue;
    out.push({
      id: `apple:${item.collectionId ?? item.trackId ?? feedUrl}`,
      title,
      publisher: item.artistName ?? "",
      description: [item.primaryGenreName, item.trackCount ? `${item.trackCount} Folgen` : null]
        .filter(Boolean)
        .join(" · "),
      artwork: item.artworkUrl600 ?? item.artworkUrl100 ?? null,
      feedUrl,
      origin: "apple",
      pageUrl: item.collectionViewUrl ?? item.trackViewUrl ?? null,
      language: item.country,
    });
  }
  return out;
}

export function itunesSearchUrl(term: string, country: string): string {
  const params = new URLSearchParams({
    media: "podcast",
    entity: "podcast",
    limit: "24",
    country,
    term,
  });
  return `https://itunes.apple.com/search?${params.toString()}`;
}

export function itunesLookupUrl(id: string): string {
  return `https://itunes.apple.com/lookup?id=${encodeURIComponent(id)}&entity=podcast`;
}

export function extractOpenGraph(html: string, property: string): string | null {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']og:${property}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:${property}["']`, "i"),
    new RegExp(`<meta[^>]+name=["']${property}["'][^>]+content=["']([^"']+)["']`, "i"),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return decodeXmlText(match[1]);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Arbitrary web pages
// ---------------------------------------------------------------------------

/**
 * Finds a feed advertised in a page's markup. This is how a podcast's own
 * website says "here is my RSS", and it is the fallback that makes pasting any
 * show homepage work.
 */
export function extractFeedLinks(html: string, base: string): string[] {
  const links = new Set<string>();
  const tagPattern = /<link\b[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(html)) !== null) {
    const tag = match[0];
    if (!/rel=["']?alternate/i.test(tag)) continue;
    if (!/type=["'](application\/(rss|atom)\+xml|text\/xml)["']/i.test(tag)) continue;
    const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    try {
      links.add(new URL(href, base).toString());
    } catch {
      // A malformed href is not worth failing the whole page for.
    }
  }
  // Some sites only link the feed in the body.
  if (links.size === 0) {
    const inline = html.match(/https?:\/\/[^\s"'<>]+\/(?:feed|rss)(?:\.xml)?\b/gi) ?? [];
    for (const href of inline.slice(0, 3)) links.add(href);
  }
  return [...links];
}

// ---------------------------------------------------------------------------
// Spotify
// ---------------------------------------------------------------------------

/**
 * Spotify audio cannot be streamed by a third party, so a Spotify link is
 * treated as an identification problem: work out which show it is, then look
 * for the same programme's public feed. Most podcasts publish both.
 */
export function spotifyBridgeNote(found: boolean, showName: string): string {
  return found
    ? `Über Spotify gefunden, abgespielt wird der öffentliche RSS-Feed von „${showName}“. Spotify selbst lässt kein Streaming durch andere Apps zu.`
    : `„${showName}“ ließ sich auf Spotify identifizieren, aber es war kein öffentlicher RSS-Feed dazu zu finden. Wahrscheinlich ein Spotify-Exklusivtitel; der lässt sich hier nicht abspielen.`;
}

export function spotifyShowUrl(id: string): string {
  return `https://open.spotify.com/show/${id}`;
}

/** Strips the trailing " | Podcast on Spotify" that their og:title carries. */
export function cleanSpotifyTitle(raw: string): string {
  return raw
    .replace(/\s*[|·-]\s*Podcast on Spotify\s*$/i, "")
    .replace(/\s*[|·-]\s*Podcast auf Spotify\s*$/i, "")
    .trim();
}

