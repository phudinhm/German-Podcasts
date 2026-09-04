import test from "node:test";
import assert from "node:assert/strict";

const { wordTime } = await import("../.scripts-out/lib/audio/wordtime.js");

const TOKENS = ["Heute", " ", "geht", " ", "es", " ", "um", " ", "Sprache."];

test("the first word starts at the line's start", () => {
  assert.equal(wordTime(TOKENS, 0, 10, 20), 10);
});

test("a later word lands later in the line", () => {
  const early = wordTime(TOKENS, 2, 10, 20);
  const late = wordTime(TOKENS, 8, 10, 20);
  assert.ok(early > 10 && early < late, `${early} < ${late}`);
  assert.ok(late < 20, "a word cannot start after the line ends");
});

test("a long compound is given more of the line than a short word", () => {
  // Same position, different lengths: the word after the compound must start
  // much later than the word after "und".
  const short = wordTime(["und", " ", "ja"], 2, 0, 10);
  const long = wordTime(["Geschwindigkeitsbegrenzung", " ", "ja"], 2, 0, 10);
  assert.ok(long > short + 3, `compound ${long} vs short ${short}`);
});

test("a zero-length line does not divide by zero", () => {
  assert.equal(wordTime(TOKENS, 4, 7, 7), 7);
  assert.equal(wordTime([], 0, 7, 12), 7);
});

test("an index past the end clamps inside the line", () => {
  const time = wordTime(TOKENS, 99, 10, 20);
  assert.ok(time >= 10 && time <= 20, time);
});

test("times never run backwards across a line", () => {
  let previous = -Infinity;
  for (let i = 0; i < TOKENS.length; i += 1) {
    const time = wordTime(TOKENS, i, 5, 15);
    assert.ok(time >= previous, `token ${i} went backwards`);
    previous = time;
  }
});
