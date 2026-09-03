import { NextResponse } from "next/server";
import { assertPublicUrl } from "@/lib/server/feed";
import {
  classifyInput,
  cleanSpotifyTitle,
  extractChannelId,
  extractFeedLinks,
  extractOpenGraph,
  isYouTubeHandle,
  itunesLookupUrl,
  itunesSearchUrl,
  mapITunesResults,
  spotifyBridgeNote,
  spotifyShowUrl,
  youtubeChannelFeed,
  youtubePlaylistFeed,
  type DiscoverResult,
  type ITunesPodcast,
} from "@/lib/server/discover";

export const runtime = "nodejs";
export const maxDuration = 25;

const TIMEOUT_MS = 10_000;
const MAX_HTML_BYTES = 2 * 1024 * 1024;

/**
 * One box, any source.
 *
 * Apple Podcasts is the primary index because its search API needs no key and
 * hands back the show's real RSS feed. YouTube channels and playlists come from
 * their keyless Atom feeds. Spotify links are identified and then bridged to a
 * public feed, because Spotify does not permit third-party streaming of its
 * audio. Anything else is fetched and searched for a feed link.
 */
export async function POST(request: Request) {
  let query: string;
  let country: string;
  try {
    const body = (await request.json()) as { q?: string; country?: string };
    query = (body.q ?? "").trim().slice(0, 300);
    country = /^[A-Za-z]{2}$/.test(body.country ?? "") ? (body.country as string).toUpperCase() : "DE";
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!query) return NextResponse.json({ error: "q is required" }, { status: 400 });

  const handle = isYouTubeHandle(query);
  const input = handle ? ({ kind: "youtube-handle", handle } as const) : classifyInput(query);

  try {
    switch (input.kind) {
      case "apple-podcast":
        return json(await fromApplePodcast(input.id));
      case "spotify-show":
      case "spotify-episode":
        return json(await fromSpotify(input.id, country));
      case "youtube-channel":
        return json([await fromYouTubeChannel(input.channelId)]);
      case "youtube-handle":
        return json(await fromYouTubeHandle(input.handle));
      case "youtube-playlist":
        return json([
          {
            id: `yt:playlist:${input.playlistId}`,
            title: "YouTube-Playlist",
            publisher: "YouTube",
            description: "Alle Videos dieser Playlist.",
            artwork: null,
            feedUrl: youtubePlaylistFeed(input.playlistId),
            origin: "youtube" as const,
            pageUrl: `https://www.youtube.com/playlist?list=${input.playlistId}`,
          },
        ]);
      case "youtube-video":
        return json([
          {
            id: `yt:video:${input.videoId}`,
            title: "YouTube-Video",
            publisher: "YouTube",
            description: "Einzelnes Video, direkt abspielbar.",
            artwork: `https://i.ytimg.com/vi/${input.videoId}/hqdefault.jpg`,
            feedUrl: null,
            youtubeId: input.videoId,
            origin: "youtube" as const,
            pageUrl: `https://www.youtube.com/watch?v=${input.videoId}`,
          },
        ]);
      case "feed":
        return json([
          {
            id: `rss:${input.url}`,
            title: "Direkter Feed",
            publisher: new URL(input.url).hostname,
            description: "Als RSS-Adresse erkannt.",
            artwork: null,
            feedUrl: input.url,
            origin: "rss" as const,
            pageUrl: input.url,
          },
        ]);
      case "webpage":
        return json(await fromWebpage(input.url));
      case "search":
      default:
        return json(await fromSearch(input.kind === "search" ? input.term : query, country));
    }
  } catch (error) {
    console.error("[api/discover]", error);
    const message =
      error instanceof Error && error.name === "TimeoutError"
        ? "Die Quelle hat zu lange gebraucht."
        : error instanceof Error
          ? error.message
          : "Die Suche ist fehlgeschlagen.";
    return NextResponse.json({ results: [], error: message }, { status: 200 });
  }
}

function json(results: DiscoverResult[]) {
  return NextResponse.json(
    { results, count: results.length },
    { headers: { "Cache-Control": "public, max-age=600, stale-while-revalidate=3600" } },
  );
}

async function fetchText(url: string, accept: string, limit = MAX_HTML_BYTES): Promise<string> {
  assertPublicUrl(url);
  const response = await fetch(url, {
    headers: {
      // Some sites serve a stub to unknown agents; a normal UA gets the markup
      // that actually carries the feed link and the og: tags.
      "User-Agent":
        "Mozilla/5.0 (compatible; Hoerbar/0.1; +https://github.com/phudinhm/German-Podcasts)",
      Accept: accept,
      "Accept-Language": "de,en;q=0.8",
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: "follow",
    next: { revalidate: 900 },
  });
  if (!response.ok) throw new Error(`Die Quelle antwortete mit ${response.status}.`);
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > limit) throw new Error("Die Antwort war zu groß.");
  return new TextDecoder("utf-8").decode(buffer);
}

function parseITunes(raw: string): { results?: ITunesPodcast[] } {
  const parsed = JSON.parse(raw) as unknown;
  if (parsed && typeof parsed === "object" && Array.isArray((parsed as { results?: unknown }).results)) {
    return parsed as { results: ITunesPodcast[] };
  }
  return { results: [] };
}

async function fromSearch(term: string, country: string): Promise<DiscoverResult[]> {
  if (!term) return [];
  const raw = await fetchText(itunesSearchUrl(term, country), "application/json");
  const results = mapITunesResults(parseITunes(raw));
  const youtube = await searchYouTube(term);
  return [...results, ...youtube];
}

async function fromApplePodcast(id: string): Promise<DiscoverResult[]> {
  const raw = await fetchText(itunesLookupUrl(id), "application/json");
  const results = mapITunesResults(parseITunes(raw));
  if (results.length === 0) {
    throw new Error("Zu diesem Apple-Podcast-Link ist kein RSS-Feed hinterlegt.");
  }
  return results;
}

async function fromYouTubeChannel(channelId: string): Promise<DiscoverResult> {
  return {
    id: `yt:channel:${channelId}`,
    title: "YouTube-Kanal",
    publisher: "YouTube",
    description: "Die neuesten Videos dieses Kanals.",
    artwork: null,
    feedUrl: youtubeChannelFeed(channelId),
    origin: "youtube",
    pageUrl: `https://www.youtube.com/channel/${channelId}`,
  };
}

async function fromYouTubeHandle(handle: string): Promise<DiscoverResult[]> {
  const html = await fetchText(`https://www.youtube.com/@${handle}`, "text/html");
  const channelId = extractChannelId(html);
  if (!channelId) {
    throw new Error(`Zu @${handle} ließ sich keine Kanal-ID finden. Der Kanal-Link mit /channel/UC… funktioniert sicher.`);
  }
  const title = extractOpenGraph(html, "title") ?? `@${handle}`;
  return [
    {
      id: `yt:channel:${channelId}`,
      title,
      publisher: "YouTube",
      description: extractOpenGraph(html, "description")?.slice(0, 300) ?? "",
      artwork: extractOpenGraph(html, "image"),
      feedUrl: youtubeChannelFeed(channelId),
      origin: "youtube",
      pageUrl: `https://www.youtube.com/channel/${channelId}`,
    },
  ];
}

/**
 * Keyword search on YouTube needs the Data API, which needs a key. Without one
 * this returns nothing rather than guessing, and the Apple results carry the
 * search on their own.
 */
async function searchYouTube(term: string): Promise<DiscoverResult[]> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return [];
  try {
    const params = new URLSearchParams({
      part: "snippet",
      type: "channel",
      maxResults: "6",
      relevanceLanguage: "de",
      q: term,
      key,
    });
    const raw = await fetchText(`https://www.googleapis.com/youtube/v3/search?${params}`, "application/json");
    const data = JSON.parse(raw) as {
      items?: Array<{
        id?: { channelId?: string };
        snippet?: { title?: string; description?: string; thumbnails?: { high?: { url?: string } } };
      }>;
    };
    return (data.items ?? [])
      .filter((item) => item.id?.channelId)
      .map((item) => ({
        id: `yt:channel:${item.id!.channelId}`,
        title: item.snippet?.title ?? "YouTube-Kanal",
        publisher: "YouTube",
        description: (item.snippet?.description ?? "").slice(0, 300),
        artwork: item.snippet?.thumbnails?.high?.url ?? null,
        feedUrl: youtubeChannelFeed(item.id!.channelId!),
        origin: "youtube" as const,
        pageUrl: `https://www.youtube.com/channel/${item.id!.channelId}`,
      }));
  } catch (error) {
    console.error("[discover] YouTube search failed:", error);
    return [];
  }
}

/**
 * Identifies a Spotify show and bridges it to a public feed. Spotify's own
 * audio is off limits to third parties, so the alternative to this bridge is
 * not "play it anyway", it is "cannot help".
 */
async function fromSpotify(id: string, country: string): Promise<DiscoverResult[]> {
  let showName = "";
  let artwork: string | null = null;
  let publisher = "";

  const credentials = await spotifyToken();
  if (credentials) {
    try {
      const raw = await fetchText(
        `https://api.spotify.com/v1/shows/${id}?market=${country}`,
        "application/json",
      );
      const show = JSON.parse(raw) as { name?: string; publisher?: string; images?: Array<{ url: string }> };
      showName = show.name ?? "";
      publisher = show.publisher ?? "";
      artwork = show.images?.[0]?.url ?? null;
    } catch (error) {
      console.error("[discover] Spotify API lookup failed:", error);
    }
  }

  if (!showName) {
    // No credentials, or the API refused: the public page still carries og tags.
    const html = await fetchText(spotifyShowUrl(id), "text/html");
    showName = cleanSpotifyTitle(extractOpenGraph(html, "title") ?? "");
    artwork = extractOpenGraph(html, "image");
    if (!showName) throw new Error("Diese Spotify-Adresse ließ sich nicht auflösen.");
  }

  const raw = await fetchText(itunesSearchUrl(showName, country), "application/json");
  const matches = mapITunesResults(parseITunes(raw));
  const best = matches.find(
    (item) => item.title.toLowerCase().trim() === showName.toLowerCase().trim(),
  ) ?? matches[0];

  if (!best) {
    return [
      {
        id: `spotify:${id}`,
        title: showName,
        publisher: publisher || "Spotify",
        description: "",
        artwork,
        feedUrl: null,
        origin: "spotify",
        pageUrl: spotifyShowUrl(id),
        note: spotifyBridgeNote(false, showName),
      },
    ];
  }

  return [
    {
      ...best,
      id: `spotify:${id}`,
      origin: "spotify",
      artwork: artwork ?? best.artwork,
      note: spotifyBridgeNote(true, showName),
    },
  ];
}

/** Client-credentials token. Only used when both Spotify secrets are set. */
async function spotifyToken(): Promise<string | null> {
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) return null;
  try {
    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { access_token?: string };
    return data.access_token ?? null;
  } catch {
    return null;
  }
}

async function fromWebpage(url: string): Promise<DiscoverResult[]> {
  const html = await fetchText(url, "text/html");
  const feeds = extractFeedLinks(html, url);
  const title = extractOpenGraph(html, "title") ?? new URL(url).hostname;
  const artwork = extractOpenGraph(html, "image");

  if (feeds.length === 0) {
    // The page might itself be the feed, mislabelled by its extension.
    if (/<rss|<feed[\s>]/i.test(html.slice(0, 2000))) {
      return [
        {
          id: `rss:${url}`,
          title,
          publisher: new URL(url).hostname,
          description: "Die Seite ist selbst ein Feed.",
          artwork,
          feedUrl: url,
          origin: "rss",
          pageUrl: url,
        },
      ];
    }
    throw new Error("Auf dieser Seite steht kein Podcast-Feed. Suche stattdessen nach dem Namen der Sendung.");
  }

  return feeds.slice(0, 4).map((feedUrl, index) => ({
    id: `web:${feedUrl}`,
    title: index === 0 ? title : `${title} (Feed ${index + 1})`,
    publisher: new URL(url).hostname,
    description: "Auf der Seite verlinkter Feed.",
    artwork,
    feedUrl,
    origin: "web" as const,
    pageUrl: url,
  }));
}
