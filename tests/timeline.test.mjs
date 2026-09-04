import test from "node:test";
import assert from "node:assert/strict";

const { findActive, insertSorted, ACTIVE_SLACK } = await import(
  "../.scripts-out/lib/audio/timeline.js"
);

const LINES = [
  { at: 0, until: 4 },
  { at: 4, until: 8 },
  { at: 8, until: 12 },
  { at: 20, until: 24 },
];

test("finds the line covering a moment", () => {
  assert.equal(findActive(LINES, 5), 1);
  assert.equal(findActive(LINES, 9.5), 2);
  assert.equal(findActive(LINES, 22), 3);
});

test("the hint answers the common case without searching", () => {
  assert.equal(findActive(LINES, 5, 1), 1);
  // Playback crossing into the next line is the other common case.
  assert.equal(findActive(LINES, 9, 1), 2);
});

test("a stale hint does not give a wrong answer", () => {
  // Seeking backwards past the hint must still land correctly.
  assert.equal(findActive(LINES, 1, 3), 0);
  assert.equal(findActive(LINES, 21, 0), 3);
});

test("a moment well outside every line matches nothing", () => {
  assert.equal(findActive(LINES, 16), -1);
  assert.equal(findActive(LINES, 100), -1);
  assert.equal(findActive([], 5), -1);
});

test("the slack pulls a moment just off a line back onto it", () => {
  assert.equal(findActive(LINES, 24 + ACTIVE_SLACK / 2), 3);
  assert.equal(findActive(LINES, 20 - ACTIVE_SLACK / 2), 3);
});

test("hinted and unhinted searches always agree", () => {
  for (let time = -1; time < 30; time += 0.25) {
    const plain = findActive(LINES, time);
    for (let hint = -1; hint < LINES.length; hint += 1) {
      assert.equal(findActive(LINES, time, hint), plain, `t=${time} hint=${hint}`);
    }
  }
});

test("an in-order line is appended", () => {
  const out = insertSorted(LINES, { at: 30, until: 34 });
  assert.equal(out.length, 5);
  assert.equal(out[4].at, 30);
});

test("an out-of-order line lands in the right place", () => {
  const out = insertSorted(LINES, { at: 14, until: 18 });
  assert.deepEqual(out.map((l) => l.at), [0, 4, 8, 14, 20]);
});

test("inserting never mutates the original", () => {
  const before = [...LINES];
  insertSorted(LINES, { at: 2, until: 3 });
  assert.deepEqual(LINES, before);
});
