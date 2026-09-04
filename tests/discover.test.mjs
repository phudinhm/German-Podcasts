import test from "node:test";
import assert from "node:assert/strict";

const {
  classifyInput, isYouTubeHandle, isYouTubeInput, mapITunesResults,
  extractFeedLinks, extractOpenGraph, cleanSpotifyTitle, itunesSearchUrl,
} = await import("../.scripts-out/lib/server/discover.js");
const { parseFeed } = await import("../.scripts-out/lib/server/feed.js");

test("routes Apple Podcasts links to a lookup by id", () => {
  assert.deepEqual(
    classifyInput("https://podcasts.apple.com/de/podcast/easy-german/id1364325485"),
    { kind: "apple-podcast", id: "1364325485" },
  );
  assert.deepEqual(
    classifyInput("https://podcasts.apple.com/us/podcast/x/id42?i=99"),
    { kind: "apple-podcast", id: "42" },
  );
});

test("routes Spotify shows and episodes", () => {
  assert.deepEqual(
    classifyInput("https://open.spotify.com/show/4rOoJ6Egrf8K2IrywzwOMk"),
    { kind: "spotify-show", id: "4rOoJ6Egrf8K2IrywzwOMk" },
  );
  assert.equal(classifyInput("https://open.spotify.com/episode/abc123").kind, "spotify-episode");
});


test("treats a bare handle and a plain name correctly", () => {
  assert.equal(isYouTubeHandle("@easygerman"), "easygerman");
  assert.equal(isYouTubeHandle("easygerman"), null);
  assert.deepEqual(classifyInput("Easy German"), { kind: "search", term: "Easy German" });
  assert.deepEqual(classifyInput("Handelsblatt Today"), { kind: "search", term: "Handelsblatt Today" });
});

test("recognises feed URLs and falls back to treating a page as a page", () => {
  assert.equal(classifyInput("https://slowgerman.com/feed/podcast/").kind, "feed");
  assert.equal(classifyInput("https://example.de/podcast.xml").kind, "feed");
  assert.equal(classifyInput("https://example.de/shows/my-show").kind, "webpage");
});

test("maps iTunes results and drops shows with no feed", () => {
  const mapped = mapITunesResults({
    results: [
      { collectionId: 1, collectionName: "Mit Feed", artistName: "ARD", feedUrl: "https://e.de/f.xml", artworkUrl600: "https://e.de/a.jpg", trackCount: 120, primaryGenreName: "News" },
      { collectionId: 2, collectionName: "Ohne Feed", artistName: "X" },
      { collectionId: 3, feedUrl: "https://e.de/g.xml" },
    ],
  });
  assert.equal(mapped.length, 1);
  assert.equal(mapped[0].title, "Mit Feed");
  assert.equal(mapped[0].feedUrl, "https://e.de/f.xml");
  assert.match(mapped[0].description, /News/);
  assert.match(mapped[0].description, /120 Folgen/);
});



test("finds feed links advertised in page markup, resolving relative hrefs", () => {
  const html = `<html><head>
    <link rel="alternate" type="application/rss+xml" title="Podcast" href="/feed/podcast.xml">
    <link rel="alternate" type="application/atom+xml" href="https://cdn.example.de/atom.xml">
    <link rel="stylesheet" href="/style.css">
  </head></html>`;
  const links = extractFeedLinks(html, "https://example.de/show");
  assert.ok(links.includes("https://example.de/feed/podcast.xml"));
  assert.ok(links.includes("https://cdn.example.de/atom.xml"));
  assert.equal(links.length, 2);
});

test("reads Open Graph tags in either attribute order", () => {
  assert.equal(extractOpenGraph('<meta property="og:title" content="Mein Podcast">', "title"), "Mein Podcast");
  assert.equal(extractOpenGraph('<meta content="Mein Podcast" property="og:title">', "title"), "Mein Podcast");
  assert.equal(extractOpenGraph("<html></html>", "title"), null);
});

test("strips the Spotify suffix from an og:title", () => {
  assert.equal(cleanSpotifyTitle("Fest & Flauschig | Podcast on Spotify"), "Fest & Flauschig");
  assert.equal(cleanSpotifyTitle("Lage der Nation"), "Lage der Nation");
});

const YT_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">
  <title>Easy German</title>
  <link rel="alternate" href="https://www.youtube.com/channel/UCbxb2fqe9oNgglAoYqsYOtQ"/>
  <entry>
    <id>yt:video:dQw4w9WgXcQ</id>
    <yt:videoId>dQw4w9WgXcQ</yt:videoId>
    <title>Wie wohnen die Deutschen?</title>
    <published>2025-04-01T10:00:00+00:00</published>
    <media:group>
      <media:description>Straßeninterviews in Berlin.</media:description>
      <media:thumbnail url="https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"/>
    </media:group>
  </entry>
  <entry>
    <id>yt:video:broken</id>
    <title>Kein gültiges Video</title>
  </entry>
</feed>`;



test("parseFeed still reports rss for a podcast feed", () => {
  const rss = `<rss><channel><title>P</title><item><title>E</title>
    <enclosure url="https://cdn.example.de/a.mp3" type="audio/mpeg"/></item></channel></rss>`;
  const feed = parseFeed(rss, "fallback");
  assert.equal(feed.format, "rss");
  assert.equal(feed.episodes[0].youtubeId, undefined);
});



// Shaped like the ytInitialData blob a results page actually carries: escaped
// unicode in titles, protocol-relative thumbnails, and video renderers mixed in.
const SEARCH_HTML = `<!DOCTYPE html><html><script>var ytInitialData = {"contents":{"items":[
{"channelRenderer":{"channelId":"UCbxb2fqe9oNgglAoYqsYOtQ","title":{"simpleText":"Easy German"},
"thumbnail":{"thumbnails":[{"url":"//yt3.ggpht.com/ytc/easy=s88","width":88}]},
"descriptionSnippet":{"runs":[{"text":"Deutsch lernen mit Stra\\u00dfeninterviews"}]}}},
{"videoRenderer":{"videoId":"abcdefghijk","title":{"runs":[{"text":"Nicht ein Kanal"}]}}},
{"channelRenderer":{"channelId":"UCMM7ZQ5nRQAOFEJgJvpaMbA","title":{"simpleText":"Dinge Erkl\\u00e4rt \\u2013 Kurzgesagt"},
"thumbnail":{"thumbnails":[{"url":"//yt3.ggpht.com/ytc/kurz=s88"}]},
"descriptionSnippet":{"runs":[{"text":"Gro\\u00dfe Fragen, kurz erkl\\u00e4rt"}]}}}
]}};</script></html>`;








test("every shape of YouTube address is recognised, so it can be refused clearly", () => {
  for (const value of [
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtu.be/dQw4w9WgXcQ",
    "youtube.com/@easygerman",
    "https://m.youtube.com/playlist?list=PL123",
  ]) {
    assert.equal(isYouTubeInput(value), true, value);
  }
});

test("a podcast address is not mistaken for YouTube", () => {
  assert.equal(isYouTubeInput("https://feeds.deutschlandfunk.de/nachrichtenleicht.xml"), false);
  assert.equal(isYouTubeInput("Easy German"), false);
  assert.equal(isYouTubeInput(""), false);
});

test("a YouTube URL no longer classifies as a playable source", () => {
  const input = classifyInput("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  assert.ok(!String(input.kind).startsWith("youtube"), `still routed as ${input.kind}`);
});
