import test from "node:test";
import assert from "node:assert/strict";

const {
  mergeInterval, covers, coveredSeconds, utteranceStart, isFullyCovered,
  INTERIM_LEAD_SECONDS, COVERAGE_SLACK,
} = await import("../.scripts-out/lib/audio/captions.js");

test("stamps an utterance before its first interim result", () => {
  // Recognition lags the speech, so the phrase started earlier than we saw it.
  assert.equal(utteranceStart(10), 10 - INTERIM_LEAD_SECONDS);
  // Never negative: a phrase at the very start cannot precede the stream.
  assert.equal(utteranceStart(0.2), 0);
  assert.equal(utteranceStart(0), 0);
});

test("merges touching and overlapping intervals", () => {
  let list = mergeInterval([], { from: 10, to: 14 });
  assert.deepEqual(list, [{ from: 10, to: 14 }]);

  // Overlapping.
  list = mergeInterval(list, { from: 13, to: 18 });
  assert.deepEqual(list, [{ from: 10, to: 18 }]);

  // Adjacent within the slack.
  list = mergeInterval(list, { from: 18.5, to: 22 });
  assert.deepEqual(list, [{ from: 10, to: 22 }]);

  // Clearly apart stays separate.
  list = mergeInterval(list, { from: 40, to: 44 });
  assert.deepEqual(list, [
    { from: 10, to: 22 },
    { from: 40, to: 44 },
  ]);
});

test("merges an interval that bridges two existing ones", () => {
  const list = mergeInterval(
    [
      { from: 0, to: 5 },
      { from: 20, to: 25 },
    ],
    { from: 4, to: 21 },
  );
  assert.deepEqual(list, [{ from: 0, to: 25 }]);
});

test("normalises a reversed interval instead of storing it backwards", () => {
  assert.deepEqual(mergeInterval([], { from: 9, to: 3 }), [{ from: 3, to: 9 }]);
});

test("knows which positions already have captions", () => {
  const list = [
    { from: 10, to: 20 },
    { from: 40, to: 50 },
  ];
  assert.equal(covers(list, 15), true);
  assert.equal(covers(list, 10), true);
  assert.equal(covers(list, 30), false);
  assert.equal(covers(list, 45), true);
  // Just outside, but inside the slack, still counts: recognition boundaries
  // are not exact and re-transcribing the same second helps nobody.
  assert.equal(covers(list, 20 + COVERAGE_SLACK / 2), true);
  assert.equal(covers(list, 20 + COVERAGE_SLACK * 3), false);
});

test("sums covered time without double counting an overlap", () => {
  let list = mergeInterval([], { from: 0, to: 10 });
  list = mergeInterval(list, { from: 5, to: 15 });
  assert.equal(coveredSeconds(list), 15);
});

test("replaying a captured passage is recognised as covered", () => {
  // A caption lands for 30s-35s, the user scrubs back to 32s.
  const list = mergeInterval([], { from: 30, to: 35 });
  assert.equal(covers(list, 32), true, "must not transcribe this stretch again");
  assert.equal(covers(list, 60), false, "unheard audio is still fair game");
});

test("a window that overlaps the last one but reaches new ground is not skipped", () => {
  const covered = [{ from: 2, to: 8 }];
  // The next capture window starts inside the previous one on purpose, so a
  // word on the seam is heard whole.
  assert.equal(isFullyCovered(covered, 7.2, 13.2), false);
});

test("replayed ground is skipped", () => {
  const covered = [{ from: 2, to: 40 }];
  assert.equal(isFullyCovered(covered, 10, 16), true);
});

test("a window straddling the end of covered ground still counts as new", () => {
  assert.equal(isFullyCovered([{ from: 0, to: 20 }], 18, 24), false);
});
