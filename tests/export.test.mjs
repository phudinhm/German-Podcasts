import test from "node:test";
import assert from "node:assert/strict";

const { toSrt, toVtt } = await import("../.scripts-out/lib/export.js");

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
