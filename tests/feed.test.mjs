import test from "node:test";
import assert from "node:assert/strict";

const { parseFeed, parseDuration, assertPublicUrl, decodeXmlText } = await import("../.scripts-out/lib/server/feed.js");
const { parseMediaUrl } = await import("../.scripts-out/lib/media.js");

/** A feed shaped like the ones actually in the wild: CDATA, namespaces, noise. */
const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title><![CDATA[Wirtschaft &amp; Wandel]]></title>
    <link>https://example.de/podcast</link>
    <description>Ein Podcast über die deutsche Wirtschaft.</description>
    <itunes:image href="https://cdn.example.de/cover.jpg"/>
    <item>
      <title>Folge 12: Zinsen und Mittelstand</title>
      <description><![CDATA[<p>Warum der <b>Mittelstand</b> zögert.</p>]]></description>
      <pubDate>Tue, 15 Apr 2025 05:00:00 +0200</pubDate>
      <itunes:duration>28:41</itunes:duration>
      <guid isPermaLink="false">ep-12</guid>
      <enclosure url="https://cdn.example.de/audio/ep12.mp3" length="27000000" type="audio/mpeg"/>
    </item>
    <item>
      <title>Folge 11</title>
      <itunes:duration>1:02:03</itunes:duration>
      <enclosure url="https://cdn.example.de/redirect/ep11" type="audio/mpeg"/>
    </item>
    <item>
      <title>Video-Folge</title>
      <enclosure url="https://cdn.example.de/video/ep10.mp4" type="video/mp4"/>
    </item>
    <item>
      <title>Kein Anhang</title>
    </item>
    <item>
      <title>Unsicheres Schema</title>
      <enclosure url="javascript:alert(1)" type="audio/mpeg"/>
    </item>
  </channel>
</rss>`;

test("parses a feed's channel metadata", () => {
  const feed = parseFeed(FEED, "fallback");
  assert.equal(feed.title, "Wirtschaft & Wandel");
  assert.equal(feed.link, "https://example.de/podcast");
  assert.equal(feed.image, "https://cdn.example.de/cover.jpg");
});

test("keeps only items with a playable enclosure", () => {
  const feed = parseFeed(FEED, "fallback");
  // Five items, but one has no enclosure and one uses a javascript: URL.
  assert.equal(feed.episodes.length, 3);
  assert.equal(feed.episodes.some((e) => e.title === "Kein Anhang"), false);
  assert.equal(feed.episodes.some((e) => e.url.startsWith("javascript:")), false);
});

test("strips CDATA and markup out of descriptions", () => {
  const [first] = parseFeed(FEED, "fallback").episodes;
  assert.equal(first.description, "Warum der Mittelstand zögert.");
  assert.equal(first.guid, "ep-12");
  assert.equal(first.type, "audio/mpeg");
});

test("reads iTunes durations in every shape they come in", () => {
  const feed = parseFeed(FEED, "fallback");
  assert.equal(feed.episodes[0].durationSec, 28 * 60 + 41);
  assert.equal(feed.episodes[1].durationSec, 3723);
  assert.equal(parseDuration("1800"), 1800);
  assert.equal(parseDuration(null), null);
  assert.equal(parseDuration("egal"), null);
});

test("carries the enclosure type through so video streams render as video", () => {
  const video = parseFeed(FEED, "fallback").episodes.find((e) => e.title === "Video-Folge");
  assert.ok(video);
  assert.equal(video.type, "video/mp4");
});

test("keeps extensionless tracking redirects, which most feeds use", () => {
  const feed = parseFeed(FEED, "fallback");
  assert.ok(feed.episodes.some((e) => e.url === "https://cdn.example.de/redirect/ep11"));
});

test("blocks SSRF targets", () => {
  for (const bad of [
    "http://localhost:8080/feed.xml",
    "http://127.0.0.1/feed",
    "http://[::1]/feed",
    "http://169.254.169.254/latest/meta-data/",
    "http://10.1.2.3/feed",
    "http://192.168.0.5/feed",
    "http://172.20.0.1/feed",
    "http://db.internal/feed",
    "file:///etc/passwd",
    "gopher://example.com/",
  ]) {
    assert.throws(() => assertPublicUrl(bad), undefined, `expected ${bad} to be rejected`);
  }
});

test("allows ordinary public feeds", () => {
  assert.equal(assertPublicUrl("https://example.de/feed.xml").hostname, "example.de");
  assert.equal(assertPublicUrl("http://feeds.example.com/rss").protocol, "http:");
  // 172.32 is outside the private 172.16/12 block and must not be caught.
  assert.doesNotThrow(() => assertPublicUrl("http://172.32.0.1/feed"));
});



test("decodes entities without mangling ampersands", () => {
  assert.equal(decodeXmlText("Wirtschaft &amp; Wandel"), "Wirtschaft & Wandel");
  assert.equal(decodeXmlText("&lt;b&gt;fett&lt;/b&gt;"), "<b>fett</b>");
});

// --- oversized feeds ---------------------------------------------------------

const { truncateToLastEntry } = await import("../.scripts-out/lib/server/feed.js");

test("a feed cut mid-episode is trimmed back to the last whole one", () => {
  const xml =
    "<rss><channel><title>Show</title>" +
    "<item><title>Eins</title></item>" +
    "<item><title>Zwei</title></item>" +
    "<item><title>Drei ist abgeschni";
  const out = truncateToLastEntry(xml);
  assert.ok(out.endsWith("</item>"), "must end on a closed entry");
  assert.ok(out.includes("Zwei"));
  assert.ok(!out.includes("abgeschni"), "the half-read entry must be gone");
});

test("a complete feed is left exactly as it is", () => {
  const xml = "<rss><channel><item><title>Eins</title></item></channel></rss>";
  // The tail after the last </item> is dropped, which the parser does not need.
  assert.ok(truncateToLastEntry(xml).endsWith("</item>"));
});

test("an Atom feed is cut on its own tag", () => {
  const xml = "<feed><entry><title>Eins</title></entry><entry><title>halb";
  assert.ok(truncateToLastEntry(xml).endsWith("</entry>"));
});

test("markup with no entries at all survives untouched", () => {
  const xml = "<html><body>not a feed</body></html>";
  assert.equal(truncateToLastEntry(xml), xml);
});

test("a truncated feed still parses into the episodes it kept", () => {
  const xml =
    '<rss><channel><title>Show</title>' +
    '<item><title>Eins</title><enclosure url="https://x/1.mp3" type="audio/mpeg"/></item>' +
    '<item><title>Zwei</title><enclosure url="https://x/2.mp3" type="audio/mpeg"/></item>' +
    '<item><title>Halb</title><enclosur';
  const result = parseFeed(truncateToLastEntry(xml), "x");
  assert.equal(result.episodes.length, 2);
  assert.equal(result.episodes[0].title, "Eins");
});
