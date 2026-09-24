import test from "node:test";
import assert from "node:assert/strict";

const { sortEpisodes } = await import("../.scripts-out/lib/episodeSort.js");

const ep = (guid, publishedAt, durationSec) => ({
  guid, title: guid, description: "", url: `https://x/${guid}.mp3`,
  type: "audio/mpeg", durationSec, publishedAt, image: null,
});
const heard = (id, finished) => ({
  id, title: id, showTitle: "S", feedUrl: null, url: `https://x/${id}.mp3`,
  artwork: null, durationSec: 100, publishedAt: null, description: "",
  position: finished ? 100 : 30, finished, playedAt: 1,
});
const ids = (list) => list.map((e) => e.guid);

// A feed that is deliberately out of order, so "newest" cannot pass by accident.
const feed = [
  ep("b", "2026-02-01T00:00:00Z", 600),
  ep("d", "2026-04-01T00:00:00Z", 100),
  ep("a", "2026-01-01T00:00:00Z", 1800),
  ep("c", "2026-03-01T00:00:00Z", 300),
];

test("newest and oldest are real sorts, not the feed order", () => {
  assert.deepEqual(ids(sortEpisodes(feed, "newest")), ["d", "c", "b", "a"]);
  assert.deepEqual(ids(sortEpisodes(feed, "oldest")), ["a", "b", "c", "d"]);
});

test("longest and shortest order by duration", () => {
  assert.deepEqual(ids(sortEpisodes(feed, "longest")), ["a", "b", "c", "d"]);
  assert.deepEqual(ids(sortEpisodes(feed, "shortest")), ["d", "c", "b", "a"]);
});

test("the input array is never mutated", () => {
  const before = ids(feed);
  sortEpisodes(feed, "oldest");
  sortEpisodes(feed, "longest");
  assert.deepEqual(ids(feed), before);
});

test("episodes with no date keep their feed order under every key", () => {
  const undated = [ep("x", null, 10), ep("y", null, 10), ep("z", null, 10)];
  for (const key of ["newest", "oldest", "longest", "shortest", "unplayed"]) {
    assert.deepEqual(ids(sortEpisodes(undated, key)), ["x", "y", "z"], key);
  }
});

test("unknown durations sort last under shortest, not first", () => {
  const mixed = [ep("none", "2026-01-01T00:00:00Z", null), ep("short", "2026-01-01T00:00:00Z", 60)];
  assert.deepEqual(ids(sortEpisodes(mixed, "shortest")), ["short", "none"]);
});

test("a malformed date is treated as absent rather than throwing", () => {
  const bad = [ep("bad", "not-a-date", 60), ep("good", "2026-05-01T00:00:00Z", 60)];
  assert.deepEqual(ids(sortEpisodes(bad, "newest")), ["good", "bad"]);
});

test("unplayed first puts unheard, then part-heard, then finished", () => {
  const recents = [heard("c", false), heard("d", true)];
  // a and b are unheard and keep newest-first among themselves.
  assert.deepEqual(ids(sortEpisodes(feed, "unplayed", recents)), ["b", "a", "c", "d"]);
});

test("unplayed with no history is just newest first", () => {
  assert.deepEqual(ids(sortEpisodes(feed, "unplayed", [])), ids(sortEpisodes(feed, "newest")));
});

test("an unknown key falls back to newest rather than throwing", () => {
  assert.deepEqual(ids(sortEpisodes(feed, "nonsense")), ["d", "c", "b", "a"]);
});

test("titleAsc sorts alphabetically rather than by feed order", () => {
  const named = [ep("1", null, null), ep("2", null, null), ep("3", null, null)];
  named[0].title = "Zebra";
  named[1].title = "Apfel";
  named[2].title = "Birne";
  assert.deepEqual(ids(sortEpisodes(named, "titleAsc")), ["2", "3", "1"]);
});

test("titleAsc is case-insensitive", () => {
  const named = [ep("1", null, null), ep("2", null, null), ep("3", null, null)];
  named[0].title = "Zebra";
  named[1].title = "apfel";
  named[2].title = "Birne";
  assert.deepEqual(ids(sortEpisodes(named, "titleAsc")), ["2", "3", "1"]);
});

test("titleAsc orders numbered titles numerically, not lexically", () => {
  const named = [ep("a", null, null), ep("b", null, null), ep("c", null, null)];
  named[0].title = "Folge 10";
  named[1].title = "Folge 2";
  named[2].title = "Folge 1";
  // Lexical order would put "Folge 10" before "Folge 2"; listeners expect episode order instead.
  assert.deepEqual(ids(sortEpisodes(named, "titleAsc")), ["c", "b", "a"]);
});
