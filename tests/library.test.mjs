import test from "node:test";
import assert from "node:assert/strict";

const { mergeLibraries, MAX_RECENTS } = await import("../.scripts-out/lib/library.js");

const show = (feedUrl, savedAt) => ({
  feedUrl, title: feedUrl, publisher: "P", artwork: null, origin: "rss", savedAt,
});
const ep = (id, position, playedAt, finished = false) => ({
  id, title: id, showTitle: "S", feedUrl: null, url: `https://x/${id}.mp3`,
  artwork: null, durationSec: 1000, publishedAt: null, description: "",
  position, finished, playedAt,
});

test("a show saved on either device survives the merge", () => {
  const a = { shows: [show("a", "2026-01-01T00:00:00Z")], recents: [], updatedAt: "2026-01-01T00:00:00Z" };
  const b = { shows: [show("b", "2026-02-01T00:00:00Z")], recents: [], updatedAt: "2026-02-01T00:00:00Z" };
  const merged = mergeLibraries(a, b);
  assert.deepEqual(merged.shows.map((s) => s.feedUrl).sort(), ["a", "b"]);
});

test("the same show twice is kept once, with the earliest save date", () => {
  const a = { shows: [show("a", "2026-03-01T00:00:00Z")], recents: [], updatedAt: "" };
  const b = { shows: [show("a", "2026-01-01T00:00:00Z")], recents: [], updatedAt: "" };
  const merged = mergeLibraries(a, b);
  assert.equal(merged.shows.length, 1);
  assert.equal(merged.shows[0].savedAt, "2026-01-01T00:00:00Z");
});

test("the furthest listening position wins", () => {
  const a = { shows: [], recents: [ep("e1", 120, "2026-01-01T00:00:00Z")], updatedAt: "" };
  const b = { shows: [], recents: [ep("e1", 600, "2026-01-02T00:00:00Z")], updatedAt: "" };
  assert.equal(mergeLibraries(a, b).recents[0].position, 600);
  // Order of arguments must not change the answer.
  assert.equal(mergeLibraries(b, a).recents[0].position, 600);
});

test("an episode finished anywhere stays finished", () => {
  const a = { shows: [], recents: [ep("e1", 990, "2026-01-02T00:00:00Z", true)], updatedAt: "" };
  const b = { shows: [], recents: [ep("e1", 100, "2026-01-03T00:00:00Z", false)], updatedAt: "" };
  assert.equal(mergeLibraries(a, b).recents[0].finished, true);
});

test("recents come back newest first", () => {
  const a = { shows: [], recents: [ep("old", 10, "2026-01-01T00:00:00Z")], updatedAt: "" };
  const b = { shows: [], recents: [ep("new", 10, "2026-05-01T00:00:00Z")], updatedAt: "" };
  assert.deepEqual(mergeLibraries(a, b).recents.map((e) => e.id), ["new", "old"]);
});

test("the recents list is capped so the synced file cannot grow forever", () => {
  const many = Array.from({ length: MAX_RECENTS + 40 }, (_, i) =>
    ep(`e${i}`, 10, new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString()),
  );
  const merged = mergeLibraries({ shows: [], recents: many, updatedAt: "" }, { shows: [], recents: [], updatedAt: "" });
  assert.equal(merged.recents.length, MAX_RECENTS);
});

test("merging two empty libraries is empty, not broken", () => {
  const merged = mergeLibraries({ shows: [], recents: [], updatedAt: "" }, { shows: [], recents: [], updatedAt: "" });
  assert.deepEqual(merged.shows, []);
  assert.deepEqual(merged.recents, []);
});

test("the newer updatedAt is carried forward", () => {
  const merged = mergeLibraries(
    { shows: [], recents: [], updatedAt: "2026-01-01T00:00:00Z" },
    { shows: [], recents: [], updatedAt: "2026-09-01T00:00:00Z" },
  );
  assert.equal(merged.updatedAt, "2026-09-01T00:00:00Z");
});
