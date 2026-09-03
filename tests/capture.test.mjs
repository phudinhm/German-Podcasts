import test from "node:test";
import assert from "node:assert/strict";

const { WindowBuffer, resample, toMono, rms, TARGET_SAMPLE_RATE } =
  await import("../.scripts-out/lib/audio/capture.js");

test("resamples to the target rate, preserving duration", () => {
  const input = new Float32Array(48_000); // 1s at 48 kHz
  for (let i = 0; i < input.length; i += 1) input[i] = Math.sin(i / 50);
  const output = resample(input, 48_000, TARGET_SAMPLE_RATE);
  assert.equal(output.length, TARGET_SAMPLE_RATE, "one second in, one second out");
});

test("resampling is a no-op at the same rate", () => {
  const input = new Float32Array([0.1, 0.2, 0.3]);
  assert.strictEqual(resample(input, 16_000, 16_000), input);
});

test("averages channels to mono", () => {
  const left = new Float32Array([1, 0, -1]);
  const right = new Float32Array([0, 0, 1]);
  assert.deepEqual([...toMono([left, right])], [0.5, 0, 0]);
  assert.strictEqual(toMono([left]), left, "a mono source is passed through");
});

test("measures level, so silent windows can be skipped", () => {
  assert.equal(rms(new Float32Array(100)), 0);
  assert.ok(rms(new Float32Array([1, -1, 1, -1])) > 0.9);
});

test("emits a window once it fills, timestamped from the media clock", () => {
  const emitted = [];
  // 1s windows, no overlap, at 16 kHz.
  const buffer = new WindowBuffer(16_000, 1, 0, (w) => emitted.push(w));
  buffer.push(new Float32Array(16_000), 30);
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].at, 30);
  assert.equal(emitted[0].until, 31);
  assert.equal(emitted[0].samples.length, 16_000);
});

test("carries an overlap so a word on the seam is not lost", () => {
  const emitted = [];
  // 1s windows with 0.25s overlap.
  const buffer = new WindowBuffer(16_000, 1, 0.25, (w) => emitted.push(w));
  buffer.push(new Float32Array(16_000), 10);
  assert.equal(emitted.length, 1);
  // The overlap is retained, so the next window starts already part full.
  assert.equal(buffer.buffered, 4_000);
  buffer.push(new Float32Array(12_000), 11);
  assert.equal(emitted.length, 2);
  // Second window begins where the overlap began, not at the join.
  assert.ok(Math.abs(emitted[1].at - 10.75) < 1e-6, `got ${emitted[1].at}`);
});

test("splits a long push across several windows", () => {
  const emitted = [];
  const buffer = new WindowBuffer(16_000, 1, 0, (w) => emitted.push(w));
  buffer.push(new Float32Array(16_000 * 3), 0);
  assert.equal(emitted.length, 3);
  assert.deepEqual(emitted.map((w) => w.at), [0, 1, 2]);
});

test("flush emits a partial window rather than dropping it", () => {
  const emitted = [];
  const buffer = new WindowBuffer(16_000, 2, 0, (w) => emitted.push(w));
  buffer.push(new Float32Array(8_000), 5);
  assert.equal(emitted.length, 0, "half a window waits");
  buffer.flush();
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].samples.length, 8_000);
  assert.equal(emitted[0].until, 5.5);
});

test("flushing an empty buffer emits nothing", () => {
  const emitted = [];
  const buffer = new WindowBuffer(16_000, 1, 0, (w) => emitted.push(w));
  buffer.flush();
  assert.equal(emitted.length, 0);
});

// --- passthrough range arithmetic -------------------------------------------

const { parseRange, totalFromContentRange, boundedRange } = await import(
  "../.scripts-out/lib/server/range.js"
);

test("a plain range is read as written", () => {
  assert.deepEqual(parseRange("bytes=100-199"), { start: 100, end: 199 });
});

test("an open-ended range has no end", () => {
  assert.deepEqual(parseRange("bytes=0-"), { start: 0, end: undefined });
});

test("nonsense and suffix ranges are refused rather than guessed at", () => {
  assert.equal(parseRange(null), null);
  assert.equal(parseRange("bytes=-500"), null, "a suffix range needs the total length");
  assert.equal(parseRange("items=0-10"), null);
  assert.equal(parseRange("bytes=200-100"), null, "an inverted range is not a range");
});

test("an open-ended request is capped, so no single response is unbounded", () => {
  assert.deepEqual(boundedRange("bytes=0-", 1000), { start: 0, end: 999 });
  assert.deepEqual(boundedRange(null, 1000), { start: 0, end: 999 });
  assert.deepEqual(boundedRange("bytes=5000-", 1000), { start: 5000, end: 5999 });
});

test("a request smaller than the cap is honoured exactly", () => {
  assert.deepEqual(boundedRange("bytes=10-19", 1000), { start: 10, end: 19 });
});

test("a request larger than the cap is trimmed, not refused", () => {
  assert.deepEqual(boundedRange("bytes=0-999999", 1000), { start: 0, end: 999 });
});

test("the total length is read off a Content-Range", () => {
  assert.equal(totalFromContentRange("bytes 0-999/45678"), 45678);
  assert.equal(totalFromContentRange("bytes 0-999/*"), null);
  assert.equal(totalFromContentRange(null), null);
});
