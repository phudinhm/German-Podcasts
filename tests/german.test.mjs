import test from "node:test";
import assert from "node:assert/strict";

const { countSyllables, syllabify, tokenizeWords } = await import("../.scripts-out/lib/german/orthography.js");
const { analyseWord, stressPattern, phoneticComplexity } = await import("../.scripts-out/lib/german/phonetics.js");
const { splitCompound, isCompound } = await import("../.scripts-out/lib/german/compound.js");
const { lemmatize, reuniteSeparable } = await import("../.scripts-out/lib/german/lemma.js");
const { deconstruct } = await import("../.scripts-out/lib/german/syntax.js");

test("counts syllables across German vowel patterns", () => {
  assert.equal(countSyllables("Haus"), 1);
  assert.equal(countSyllables("Freude"), 2);
  assert.equal(countSyllables("Arbeit"), 2);
  assert.equal(countSyllables("Wirtschaft"), 2);
  assert.equal(countSyllables("Entwicklung"), 3);
  assert.equal(countSyllables("Nation"), 3);
});

test("syllabifies with the maximal-onset rule and keeps digraphs intact", () => {
  assert.deepEqual(syllabify("Fenster"), ["fens", "ter"]);
  assert.deepEqual(syllabify("Sprache"), ["spra", "che"]);
  assert.deepEqual(syllabify("Wecker"), ["we", "cker"]);
  assert.deepEqual(syllabify("waschen"), ["wa", "schen"]);
});

test("splits at morpheme boundaries before phonological ones", () => {
  assert.deepEqual(syllabify("Wirtschaftskrise"), ["wirt", "schafts", "kri", "se"]);
  assert.deepEqual(syllabify("Angstschweiß"), ["angst", "schweiß"]);
  assert.deepEqual(syllabify("verstehen"), ["ver", "ste", "hen"]);
});

test("refuses to split a compound when the tail is not a real stem", () => {
  // "angsts + chweiß" was the failure this guards against.
  assert.deepEqual(splitCompound("angstschweiß"), ["angst", "schweiß"]);
  assert.deepEqual(splitCompound("quatschwortnix"), ["quatschwortnix"]);
});

test("splits compounds into their members", () => {
  assert.deepEqual(splitCompound("wirtschaftskrise"), ["wirtschafts", "krise"]);
  assert.deepEqual(splitCompound("arbeitszeit"), ["arbeits", "zeit"]);
  assert.equal(isCompound("straßenbahn"), true);
  assert.equal(isCompound("wirtschaft"), false);
});

test("marks the primary stress on the first compound member", () => {
  const analysis = analyseWord("Wirtschaftskrise");
  assert.equal(analysis.stressIndex, 0);
  assert.match(stressPattern(analysis), /^WIRT-/);
});

test("moves the stress off an unstressed verb prefix", () => {
  const analysis = analyseWord("verstehen");
  assert.equal(analysis.stressIndex, 1);
});

test("distinguishes ich-Laut from ach-Laut by the preceding vowel", () => {
  const ich = analyseWord("sprechen").hazards.find((h) => h.kind === "ich-laut");
  const ach = analyseWord("Sprache").hazards.find((h) => h.kind === "ach-laut");
  assert.ok(ich, "sprechen should carry an ich-Laut");
  assert.ok(ach, "Sprache should carry an ach-Laut");
});

test("flags final devoicing but not word-final -ig", () => {
  const tag = analyseWord("Tag").hazards.filter((h) => h.kind === "final-devoicing");
  assert.equal(tag.length, 1);
  assert.equal(tag[0].realised, "k");

  const billig = analyseWord("billig");
  assert.equal(billig.hazards.filter((h) => h.kind === "final-devoicing").length, 0);
  assert.ok(billig.hazards.some((h) => h.kind === "ich-laut"));
});

test("flags dense consonant clusters", () => {
  assert.ok(analyseWord("Herbst").hazards.some((h) => h.kind === "cluster"));
  assert.ok(analyseWord("Pferd").hazards.some((h) => h.kind === "cluster"));
  assert.equal(analyseWord("Haus").hazards.filter((h) => h.kind === "cluster").length, 0);
});

test("flags st- and sp- onsets as sch-sounds", () => {
  const onset = analyseWord("Stadt").hazards.find((h) => h.kind === "s-onset");
  assert.equal(onset?.realised, "ʃt");
});

test("phonetic complexity rises with harder text", () => {
  const easy = phoneticComplexity("Ich habe ein Haus und ein Auto.");
  const hard = phoneticComplexity("Herbstliche Angstschweiß-Wirtschaftskrise im Pferdestall.");
  assert.ok(hard > easy, `expected ${hard} > ${easy}`);
});

test("lemmatises irregular participles and finite forms", () => {
  assert.equal(lemmatize("gesprochen").lemma, "sprechen");
  assert.equal(lemmatize("wurde").lemma, "werden");
  assert.equal(lemmatize("hat").lemma, "haben");
  assert.equal(lemmatize("gingen").lemma, "gehen");
});

test("singularises nouns", () => {
  assert.equal(lemmatize("Trends", { capitalised: true }).lemma, "Trend");
  assert.equal(lemmatize("Entwicklungen", { capitalised: true }).lemma, "Entwicklung");
});

test("reunites a stranded separable prefix with its verb", () => {
  const sentence = "Er steht jeden Tag um halb sieben auf";
  const tokens = tokenizeWords(sentence);
  const result = reuniteSeparable(sentence, tokens.indexOf("steht"), tokens);
  assert.deepEqual(result, { prefix: "auf", verb: "steht" });
});

test("finds the subordinate clause and its clause-final verb", () => {
  const notes = deconstruct("Wenn ein Mitarbeiter zu viel arbeitet, sieht die Personalabteilung das sofort.");
  const clause = notes.find((note) => note.kind === "clause");
  assert.ok(clause);
  assert.match(clause.detail, /arbeitet/);
  // "zu viel" is an intensifier, not a dative preposition.
  assert.equal(notes.some((note) => note.kind === "case" && note.focus.includes("zu")), false);
});

test("does not mistake a capitalised noun for the infinitive closing a verb bracket", () => {
  const notes = deconstruct("Viele Geschäftsführer haben ihre Investitionen deshalb schlicht verschoben.");
  const bracket = notes.find((note) => note.kind === "bracket");
  assert.ok(bracket);
  assert.match(bracket.title, /verschoben/);
  assert.doesNotMatch(bracket.title, /Investitionen/);
});

test("attributes a stranded prefix to the finite verb, not the last noun", () => {
  const notes = deconstruct("Ich stehe jeden Tag um halb sieben auf.");
  const separable = notes.find((note) => note.kind === "separable");
  assert.ok(separable);
  assert.match(separable.detail, /aufstehe/);
});

test("recognises the perfect tense and the passive", () => {
  const perfect = deconstruct("Wir haben das Angebot gestern geprüft.");
  assert.ok(perfect.some((note) => note.title === "Perfect tense"));
  const passive = deconstruct("Die Stunden werden inzwischen digital erfasst.");
  assert.ok(passive.some((note) => note.title === "Passive voice"));
});
