import test from "node:test";
import assert from "node:assert/strict";

const { completeSentences, similarity, editDistance, isNearDuplicate, PUNC_EOS } = await import(
  "../.scripts-out/lib/audio/stabilise.js"
);

test("keeps whole sentences and drops the trailing fragment", () => {
  assert.equal(
    completeSentences("Guten Morgen. Heute geht es um die Sprache der"),
    "Guten Morgen.",
  );
});

test("text with no sentence end yields nothing to translate yet", () => {
  assert.equal(completeSentences("Heute geht es um die"), "");
});

test("every end mark counts, including questions and exclamations", () => {
  for (const punc of PUNC_EOS) {
    assert.equal(completeSentences(`Ein Satz${punc} und mehr`), `Ein Satz${punc}`);
  }
});

test("a growing caption counts as the same line, not a new one", () => {
  assert.equal(similarity("Heute geht es", "Heute geht es um Sprache"), 1);
});

test("a seam repeat is caught where an exact match would miss it", () => {
  // The overlap makes the recogniser produce the same words with a small
  // difference at one end; exact comparison would print both.
  assert.ok(isNearDuplicate("und um die Stadt Leipzig.", "und um die Stadt Leipzig"));
  assert.ok(isNearDuplicate("Heute geht es um Sprache.", "Heute geht es um Sprache!"));
});

test("two different sentences are not duplicates", () => {
  assert.equal(isNearDuplicate("Guten Morgen aus Leipzig.", "Das Wetter ist freundlich."), false);
});

test("edit distance is symmetric and zero for equal strings", () => {
  assert.equal(editDistance("Sprache", "Sprache"), 0);
  assert.equal(editDistance("Sprache", "Sprachen"), 1);
  assert.equal(editDistance("abc", "xyz"), editDistance("xyz", "abc"));
});

test("empty input never divides by zero", () => {
  assert.equal(similarity("", ""), 1);
  assert.equal(similarity("etwas", ""), 0);
  assert.equal(completeSentences(""), "");
});
