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
