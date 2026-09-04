import test from "node:test";
import assert from "node:assert/strict";

const { planChunks, mergePieces, CHUNK_SECONDS, OVERLAP_SECONDS } = await import(
  "../.scripts-out/lib/audio/chunks.js"
);

const RATE = 16000;

test("a short episode is a single window", () => {
  const chunks = planChunks(RATE * 10, RATE);
  assert.equal(chunks.length, 1);
  assert.deepEqual(chunks[0], { from: 0, to: RATE * 10, at: 0 });
});

test("windows overlap by the stated amount", () => {
  const chunks = planChunks(RATE * 120, RATE);
  const step = (CHUNK_SECONDS - OVERLAP_SECONDS) * RATE;
  assert.equal(chunks[1].from - chunks[0].from, step);
  assert.ok(chunks[0].to > chunks[1].from, "windows must overlap, not merely touch");
});

test("timestamps stay exact across a long episode, not drifting", () => {
  const chunks = planChunks(RATE * 3600, RATE);
  for (const chunk of chunks) {
    assert.equal(chunk.at, chunk.from / RATE);
  }
  const last = chunks[chunks.length - 1];
  assert.equal(last.to, RATE * 3600, "the final window must reach the end exactly");
});

test("every sample is covered by some window", () => {
  const total = RATE * 200;
  const chunks = planChunks(total, RATE);
  let reach = 0;
  for (const chunk of chunks) {
    assert.ok(chunk.from <= reach, `gap before ${chunk.from}`);
    reach = Math.max(reach, chunk.to);
  }
  assert.equal(reach, total);
});

test("an empty or nonsensical buffer plans nothing", () => {
  assert.deepEqual(planChunks(0, RATE), []);
  assert.deepEqual(planChunks(RATE, 0), []);
});

test("merging drops the overlap rather than printing the seam twice", () => {
  const first = [
    { text: "Guten Morgen.", at: 0, until: 2 },
    { text: "Heute geht es um Sprache.", at: 2, until: 6 },
  ];
  const second = [
    { text: "Heute geht es um Sprache.", at: 2, until: 6 },
    { text: "Und um die Stadt.", at: 6, until: 9 },
  ];
  const merged = mergePieces(first, second);
  assert.equal(merged.length, 3);
  assert.equal(merged[2].text, "Und um die Stadt.");
});

test("merging keeps the result in order", () => {
  const merged = mergePieces(
    [{ text: "eins", at: 0, until: 2 }],
    [{ text: "zwei", at: 2, until: 4 }, { text: "drei", at: 4, until: 6 }],
  );
  assert.deepEqual(merged.map((p) => p.text), ["eins", "zwei", "drei"]);
});

test("empty text is never added", () => {
  const merged = mergePieces([], [{ text: "   ", at: 0, until: 2 }]);
  assert.deepEqual(merged, []);
});
