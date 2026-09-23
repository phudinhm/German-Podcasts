import test from "node:test";
import assert from "node:assert/strict";

const { parseTranscript, pickBestTranscript } = await import("../.scripts-out/lib/server/transcript.js");

const SRT = `1
00:00:01,000 --> 00:00:04,500
Hallo und willkommen.

2
00:00:04,500 --> 00:00:08,250
Heute geht es um <b>Zinsen</b>.
`;

const VTT = `WEBVTT

00:00:01.000 --> 00:00:04.500
Hallo und willkommen.

00:00:04.500 --> 00:00:08.250 align:start position:0%
Heute geht es um Zinsen.
`;

const JSON_TRANSCRIPT = JSON.stringify({
  version: "1.0.0",
  segments: [
    { speaker: "Host", startTime: 0.5, endTime: 3.2, body: "Hallo und willkommen." },
    { speaker: "Host", endTime: 8.0, startTime: 3.2, body: "Heute geht es um Zinsen." },
    { startTime: 8.0, endTime: 8.0, body: "" },
  ],
});

test("parses SRT timing and strips inline markup", () => {
  const segments = parseTranscript(SRT, "application/srt");
  assert.equal(segments.length, 2);
  assert.equal(segments[0].start, 1);
  assert.equal(segments[0].end, 4.5);
  assert.equal(segments[0].text, "Hallo und willkommen.");
  assert.equal(segments[1].text, "Heute geht es um Zinsen.");
});

test("parses WEBVTT, tolerating cue settings after the timestamp", () => {
  const segments = parseTranscript(VTT, "text/vtt");
  assert.equal(segments.length, 2);
  assert.equal(segments[1].start, 4.5);
  assert.equal(segments[1].end, 8.25);
});

test("parses the Podcasting 2.0 JSON transcript shape", () => {
  const segments = parseTranscript(JSON_TRANSCRIPT, "application/json");
  // The empty-body third segment is dropped rather than shown as a blank line.
  assert.equal(segments.length, 2);
  assert.equal(segments[0].start, 0.5);
  assert.equal(segments[1].end, 8);
});

test("sniffs content even when the declared type is wrong", () => {
  const segments = parseTranscript(JSON_TRANSCRIPT, "text/plain");
  assert.equal(segments.length, 2);
});

test("plain text with no timing becomes one readable segment", () => {
  const segments = parseTranscript("Ein langer Absatz ohne Zeitstempel.", "text/plain");
  assert.equal(segments.length, 1);
  assert.equal(segments[0].start, 0);
  assert.equal(segments[0].text, "Ein langer Absatz ohne Zeitstempel.");
});

test("empty input produces no segments", () => {
  assert.deepEqual(parseTranscript("", "text/plain"), []);
  assert.deepEqual(parseTranscript("   ", "application/json"), []);
});

test("picks JSON over VTT over SRT over plain text", () => {
  const options = [
    { url: "a", type: "text/plain" },
    { url: "b", type: "application/srt" },
    { url: "c", type: "application/json" },
    { url: "d", type: "text/vtt" },
  ];
  assert.equal(pickBestTranscript(options).url, "c");
  assert.equal(pickBestTranscript([options[0], options[1]]).url, "b");
  assert.equal(pickBestTranscript([]), null);
});
