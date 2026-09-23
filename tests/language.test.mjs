import test from "node:test";
import assert from "node:assert/strict";

const { langFromTag, guessLangFromText, detectSpokenLang, translationTargetsFor } = await import(
  "../.scripts-out/lib/language.js"
);

test("reads a language code off a feed's <language> tag", () => {
  assert.equal(langFromTag("de-DE"), "de");
  assert.equal(langFromTag("en_US"), "en");
  assert.equal(langFromTag("DE"), "de");
  assert.equal(langFromTag(null), null);
  assert.equal(langFromTag("fr-FR"), null);
});

test("guesses German from umlauts even with no other signal", () => {
  assert.equal(guessLangFromText("Über die Wirtschaft"), "de");
});

test("guesses English from a clearly English sample", () => {
  const sample =
    "This is a show about the news and the world. We talk about the things that matter, and this is where you hear about them.";
  assert.equal(guessLangFromText(sample), "en");
});

test("defaults to German on a short or ambiguous sample", () => {
  assert.equal(guessLangFromText(""), "de");
  assert.equal(guessLangFromText("OK."), "de");
});

test("a language tag wins over the text heuristic", () => {
  assert.equal(detectSpokenLang("en-US", "Über die Wirtschaft"), "en");
  assert.equal(detectSpokenLang(null, "Über die Wirtschaft"), "de");
});

test("translation targets are the two other languages", () => {
  assert.deepEqual(translationTargetsFor("de"), ["en", "vi"]);
  assert.deepEqual(translationTargetsFor("en"), ["de", "vi"]);
});
