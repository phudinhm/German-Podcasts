import { decodeXmlText } from "./feed";

/**
 * Source discovery.
 *
 * The point is that nobody should have to find an RSS URL by hand. Paste an
 * Apple Podcasts link, a Spotify show, a YouTube channel or handle, a podcast's
 * own website, or just the name of a show, and this works out what can actually
 * be played.
 *
 * What each source allows is not the same, and the difference is not cosmetic:
 *
 *  - Apple Podcasts runs a keyless search API that returns the show's real RSS
 *    feed. That makes it the best discovery front door by a distance: one
 *    request, no credentials, and the answer is a feed we can already stream.
 *  - YouTube publishes per-channel and per-playlist Atom feeds with no key at
 *    all. Videos then play through the IFrame API.
 *  - Spotify does not let anyone else stream its audio. What we can do is
 *    identify the show and look for the same programme's public RSS, which most
 *    podcasts also publish. Where a show is a Spotify exclusive there is no
 *    honest way to play it here, and the UI says so rather than failing oddly.
 *  - Anything else: fetch the page and look for a feed link in the markup,
 *    which is how most podcast websites advertise their feed.
 */

export type DiscoverOrigin = "apple" | "youtube" | "spotify" | "rss" | "web";

export interface DiscoverResult {
  id: string;
  title: string;
  publisher: string;
  description: string;
  artwork: string | null;
  /** Where the episode list comes from. Null when nothing playable was found. */
  feedUrl: string | null;
  /** Set when the result is a single video rather than a show. */
  youtubeId?: string;
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
  | { kind: "youtube-channel"; channelId: string }
  | { kind: "youtube-handle"; handle: string }
  | { kind: "youtube-playlist"; playlistId: string }
  | { kind: "youtube-video"; videoId: string }
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

  // A bare YouTube video id.
  if (/^[\w-]{11}$/.test(value) && /[A-Z_-]/.test(value)) {
    return { kind: "youtube-video", videoId: value };
  }

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

  if (YOUTUBE_HOSTS.has(host)) {
    if (host === "youtu.be") {
      const id = url.pathname.slice(1).split("/")[0];
      if (/^[\w-]{11}$/.test(id)) return { kind: "youtube-video", videoId: id };
    }
    const v = url.searchParams.get("v");
    if (v && /^[\w-]{11}$/.test(v)) return { kind: "youtube-video", videoId: v };

    const list = url.searchParams.get("list");
    if (list && /^[\w-]{2,}$/.test(list)) return { kind: "youtube-playlist", playlistId: list };

    const channel = url.pathname.match(/\/channel\/(UC[\w-]{22})/);
    if (channel) return { kind: "youtube-channel", channelId: channel[1] };

    const handle = url.pathname.match(/\/@([\w.-]+)/);
    if (handle) return { kind: "youtube-handle", handle: handle[1] };

    const legacy = url.pathname.match(/\/(?:c|user)\/([\w.-]+)/);
    if (legacy) return { kind: "youtube-handle", handle: legacy[1] };

    const shorts = url.pathname.match(/\/(?:shorts|embed|live|v)\/([\w-]{11})/);
    if (shorts) return { kind: "youtube-video", videoId: shorts[1] };
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

// ---------------------------------------------------------------------------
// YouTube
// ---------------------------------------------------------------------------

export function youtubeChannelFeed(channelId: string): string {
  return `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
}

export function youtubePlaylistFeed(playlistId: string): string {
  return `https://www.youtube.com/feeds/videos.xml?playlist_id=${encodeURIComponent(playlistId)}`;
}

/**
 * Pulls the channel id out of a channel page. A handle like @easygerman is not
 * usable in the feed URL, and there is no keyless endpoint that converts one,
 * so the page itself is the lookup table.
 */
export function extractChannelId(html: string): string | null {
  const patterns = [
    /"channelId"\s*:\s*"(UC[\w-]{22})"/,
    /<meta\s+itemprop="identifier"\s+content="(UC[\w-]{22})"/,
    /<link[^>]+rel="canonical"[^>]+href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/,
    /"externalId"\s*:\s*"(UC[\w-]{22})"/,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return match[1];
  }
  return null;
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

/**
 * Channels found in a YouTube search results page.
 *
 * There is no keyless API for this, but the results page carries its data as a
 * JSON blob in the markup, and every channel in it appears as a
 * `channelRenderer`. Reading that is the same technique already used to turn a
 * handle into a channel id, and it removes the need to hard-code handles -
 * which is worth doing, because a hard-coded handle that is even slightly wrong
 * fails as a flat 404 with nothing to suggest what the right one was.
 */
export interface YouTubeChannel {
  channelId: string;
  title: string;
  description: string;
  artwork: string | null;
}

export function youtubeSearchUrl(term: string): string {
  // sp=EgIQAg%3D%3D is the "Channels" filter, so videos do not crowd out the
  // one thing we are looking for.
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(term)}&sp=EgIQAg%3D%3D`;
}

/** Decodes the \u-escapes and entities YouTube leaves in its embedded JSON. */
function decodeJsonText(value: string): string {
  return value
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
}

export function extractSearchChannels(html: string, limit = 6): YouTubeChannel[] {
  const found: YouTubeChannel[] = [];
  const seen = new Set<string>();

  // Each block starts at a channelRenderer and is read only as far as the next
  // one, so a title can never be picked up from the neighbouring channel.
  const blocks = html.split('"channelRenderer"');
  for (const block of blocks.slice(1)) {
    if (found.length >= limit) break;
    const window = block.slice(0, 4000);

    const id = window.match(/"channelId"\s*:\s*"(UC[\w-]{22})"/);
    if (!id || seen.has(id[1])) continue;

    const title =
      window.match(/"title"\s*:\s*\{\s*"simpleText"\s*:\s*"((?:[^"\\]|\\.)*)"/) ??
      window.match(/"title"\s*:\s*\{[^}]*"text"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    const description = window.match(/"descriptionSnippet"[\s\S]{0,200}?"text"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    const artwork = window.match(/"url"\s*:\s*"(\/\/yt3\.[^"]+?)"/);

    seen.add(id[1]);
    found.push({
      channelId: id[1],
      title: title ? decodeJsonText(title[1]) : "YouTube-Kanal",
      description: description ? decodeJsonText(description[1]).slice(0, 300) : "",
      artwork: artwork ? `https:${artwork[1].replace(/\\\//g, "/")}` : null,
    });
  }

  return found;
}

/**
 * The addresses a channel might answer on, in the order worth trying.
 *
 * Handles are the modern form, but plenty of older channels still live at /c/
 * or /user/, and a name typed by a person is not a URL at all. Trying each in
 * turn costs one request that usually is not needed and saves a dead end that
 * always is.
 */
export function channelPageCandidates(name: string): string[] {
  const trimmed = name.trim().replace(/^@/, "");
  const compact = trimmed.replace(/[^\p{L}\p{N}]/gu, "");
  const candidates = [
    `https://www.youtube.com/@${encodeURIComponent(trimmed)}`,
    `https://www.youtube.com/c/${encodeURIComponent(trimmed)}`,
    `https://www.youtube.com/user/${encodeURIComponent(trimmed)}`,
  ];
  if (compact && compact !== trimmed) {
    candidates.unshift(`https://www.youtube.com/@${encodeURIComponent(compact)}`);
  }
  return [...new Set(candidates)];
}
