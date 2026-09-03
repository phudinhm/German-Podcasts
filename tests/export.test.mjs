import test from "node:test";
import assert from "node:assert/strict";

const { toSrt, toVtt, toQuizlet, toNotionCsv, toObsidianMarkdown, makeCloze } = await import(
  "../.scripts-out/lib/export.js"
);

const LINES = [
  { at: 0.2, until: 3.04, de: "Guten Morgen aus Leipzig.", translation: "Good morning from Leipzig." },
  { at: 3.04, until: 6.5, de: "Heute geht es um die Sprache der Stadt.", translation: "Today is about the city's language." },
  { at: 6.5, until: 6.5, de: "Ohne Übersetzung." },
];

test("SRT numbers cues from one and uses comma milliseconds", () => {
  const srt = toSrt(LINES, "original");
  assert.match(srt, /^1\n00:00:00,200 --> 00:00:03,040\nGuten Morgen aus Leipzig\./);
  assert.match(srt, /\n2\n00:00:03,040 --> 00:00:06,500\n/);
});

test("a zero-length cue is given a duration, or no player will draw it", () => {
  const srt = toSrt(LINES, "original");
  assert.match(srt, /00:00:06,500 --> 00:00:06,700\nOhne Übersetzung\./);
});

test("bilingual cues put the translation on its own line", () => {
  const srt = toSrt(LINES, "both");
  assert.match(srt, /Guten Morgen aus Leipzig\.\nGood morning from Leipzig\./);
});

test("translation-only skips lines that have none rather than emitting an empty cue", () => {
  const srt = toSrt(LINES, "translated");
  assert.ok(!srt.includes("Ohne Übersetzung"));
  assert.equal((srt.match(/-->/g) ?? []).length, 2);
  // Renumbering must stay contiguous after a skip.
  assert.match(srt, /^1\n/);
  assert.match(srt, /\n2\n/);
});

test("VTT carries its header and dotted milliseconds", () => {
  const vtt = toVtt(LINES, "original");
  assert.match(vtt, /^WEBVTT\n/);
  assert.match(vtt, /00:00:00\.200 --> 00:00:03\.040/);
  assert.ok(!vtt.includes(","), "VTT must not use comma separators");
});

const ENTRY = {
  id: "1",
  surface: "Zinswende",
  lemma: "Zinswende",
  article: "die",
  plural: "Zinswenden",
  pos: "n",
  translations: { en: ["interest rate turnaround"], vi: ["bước ngoặt lãi suất"] },
  context: {
    de: "Die Zinswende trifft den Mittelstand.",
    en: "The rate turn hits the Mittelstand.",
    vi: "",
    episodeTitle: "Wirtschaft heute",
    episodeSlug: "wirtschaft-heute",
    segmentId: "s1",
    start: 62.5,
    cefr: "B2",
  },
  savedAt: "2026-03-01T10:00:00.000Z",
  srs: { due: "2026-03-04", interval: 3, ease: 2.5, reps: 1, lapses: 0 },
  history: [],
};

test("Quizlet emits one tab per card and nothing else", () => {
  const line = toQuizlet([ENTRY], { lang: "en" });
  assert.equal(line.split("\t").length, 2, "a stray tab would split the card wrongly");
  assert.match(line, /^die Zinswende\t/);
  assert.match(line, /Die Zinswende trifft den Mittelstand\./);
});

test("Notion CSV keeps the header and quotes every field", () => {
  const csv = toNotionCsv([ENTRY], { lang: "en" });
  const [header, row] = csv.split("\n");
  assert.match(header, /^Word,Article,Plural/);
  assert.equal(header.split(",").length, row.split(",").length);
  assert.match(row, /"2026-03-04"/);
});

test("Obsidian writes a front::back line the review plugin can read", () => {
  const md = toObsidianMarkdown([ENTRY], { lang: "en" });
  assert.match(md, /^---\ntags: \[german, hoerbar\]/);
  assert.match(md, /## Wirtschaft heute/);
  assert.match(md, /\*\*die Zinswende \(pl\. Zinswenden\)\*\*::interest rate turnaround/);
  assert.match(md, /> Die Zinswende trifft den Mittelstand\./);
});

test("a cloze blanks the word as it was actually written", () => {
  assert.equal(
    makeCloze("Die Zinswende trifft den Mittelstand.", "zinswende"),
    "Die {{c1::Zinswende}} trifft den Mittelstand.",
  );
});
