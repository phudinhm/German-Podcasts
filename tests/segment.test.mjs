import test from "node:test";
import assert from "node:assert/strict";

const { chunkText, timeChunks, splitUtterance, MIN_WORDS, MAX_WORDS } =
  await import("../.scripts-out/lib/audio/segment.js");

test("leaves a short utterance whole", () => {
  const chunks = chunkText("Die Zinswende trifft den Mittelstand.");
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].fromRatio, 0);
  assert.equal(chunks[0].toRatio, 1);
});

test("splits a long utterance on sentence punctuation", () => {
  const text =
    "Die Zinswende hat den Mittelstand hart getroffen. Große Unternehmen finanzieren sich am Kapitalmarkt. Der Mittelstand hängt am Bankkredit.";
  const chunks = chunkText(text);
  assert.equal(chunks.length, 3);
  assert.match(chunks[0].text, /Zinswende/);
  assert.match(chunks[2].text, /Bankkredit/);
});

test("splits an unpunctuated run, which is what recognisers actually emit", () => {
  const text =
    "die zinswende hat den deutschen mittelstand deutlich härter getroffen als die großen konzerne weil diese sich über den kapitalmarkt finanzieren und anleihen begeben können";
  const chunks = chunkText(text);
  assert.ok(chunks.length >= 2, "a 25-word run must not stay as one caption");
  for (const chunk of chunks) {
    const words = chunk.text.split(" ").length;
    assert.ok(words <= MAX_WORDS, `chunk too long: ${words} words`);
  }
});

test("never leaves a stub line shorter than the minimum", () => {
  const words = Array.from({ length: MAX_WORDS + 2 }, (_, i) => `wort${i}`).join(" ");
  const chunks = chunkText(words);
  for (const chunk of chunks) {
    assert.ok(
      chunk.text.split(" ").length >= MIN_WORDS,
      `stub of ${chunk.text.split(" ").length} words survived`,
    );
  }
});

test("ratios are ordered, start at zero and reach one", () => {
  const chunks = chunkText(
    "der erste satz ist hier zu ende und dann kommt noch ein zweiter satz der auch nicht kurz ist und ein dritter",
  );
  assert.equal(chunks[0].fromRatio, 0);
  assert.ok(Math.abs(chunks[chunks.length - 1].toRatio - 1) < 1e-9);
  for (let i = 1; i < chunks.length; i += 1) {
    assert.ok(chunks[i].fromRatio >= chunks[i - 1].toRatio - 1e-9, "chunks must not overlap");
  }
});

test("places chunks across the utterance window", () => {
  const timed = timeChunks(
    [
      { text: "a", fromRatio: 0, toRatio: 0.5 },
      { text: "b", fromRatio: 0.5, toRatio: 1 },
    ],
    10,
    20,
  );
  assert.equal(timed[0].at, 10);
  assert.equal(timed[0].until, 15);
  assert.equal(timed[1].at, 15);
  assert.equal(timed[1].until, 20);
});

test("weights long words as taking longer to say", () => {
  // Two chunks of equal word count but very different length.
  const timed = splitUtterance(
    "Arbeitszeitgesetz Personalabteilung Produktivitätslücke Genehmigungsverfahren Wirtschaftskrise Familienunternehmen und ich du er sie es wir ihr man das",
    0,
    10,
  );
  assert.ok(timed.length >= 2);
  const first = timed[0].until - timed[0].at;
  const last = timed[timed.length - 1].until - timed[timed.length - 1].at;
  assert.ok(first > last, "the compound-heavy chunk should occupy more time");
});

test("a degenerate window still yields usable timings", () => {
  const timed = splitUtterance("kurz und knapp gesagt", 5, 5);
  assert.equal(timed.length, 1);
  assert.equal(timed[0].at, 5);
  assert.ok(timed[0].until > timed[0].at, "zero-length windows are widened");
});

test("empty input yields nothing rather than an empty caption", () => {
  assert.deepEqual(chunkText("   "), []);
});
