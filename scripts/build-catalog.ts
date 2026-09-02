/**
 * Turns data/sources/*.json into the precomputed payloads in data/catalog.
 *
 * Everything expensive happens here, at build time, so a page load never has to
 * lemmatise, classify or align anything: it reads one JSON file and renders.
 *
 * Run with: npm run build-catalog
 */

import fs from "node:fs";
import path from "node:path";

import { countSyllables, tokenizeWords, stripPunctuation } from "../lib/german/orthography";
import { lemmatize } from "../lib/german/lemma";
import { analyseSegments, selectDrillSegments } from "../lib/sdm";
import { classify, goetheCoverageForMetrics } from "../lib/cefr";
import { CORE_LEXICON } from "../data/lexicon/core";
import type { Cefr, Episode, GlossaryEntry, QuizQuestion, Segment } from "../lib/types";

interface SourceSegment {
  de: string;
  en: string;
  vi: string;
  speaker?: string;
  /** Explicit timings, when the ingest worker produced real alignment. */
  start?: number;
  end?: number;
  words?: Array<{ w: string; s: number; e: number }>;
  f0?: number[];
}

interface SourceQuiz {
  prompt: string;
  choices: string[];
  answerIndex: number;
  anchorSegment: number;
  explanation?: string;
}

interface SourceFile {
  id: string;
  slug: string;
  title: string;
  publisher: string;
  description: string;
  topics: string[];
  editorialCefr?: Cefr;
  license: string;
  source: Episode["source"];
  feedUrl?: string;
  publishedAt?: string;
  /** Target delivery speed in syllables per second, used to synthesise timings. */
  speechRate?: number;
  pauseAfterSentence?: number;
  transcriptStatus?: Episode["transcriptStatus"];
  segments: SourceSegment[];
  quiz?: SourceQuiz[];
}

const ROOT = process.cwd();
const SOURCE_DIR = path.join(ROOT, "data", "sources");
const OUT_DIR = path.join(ROOT, "data", "catalog");

/**
 * Builds sentence and word timings from a target speech rate.
 *
 * Real ingest gives us forced alignment; for scripts that have no recording yet
 * we lay the text out on a timeline at a level-appropriate rate. Word durations
 * are proportional to syllable count with a floor, which is a good enough model
 * of German timing for a karaoke highlight to feel right.
 */
function synthesiseTimings(segments: SourceSegment[], rate: number, pause: number): Segment[] {
  let cursor = 0;
  return segments.map((segment, index) => {
    if (typeof segment.start === "number" && typeof segment.end === "number") {
      return {
        id: `s${index}`,
        start: segment.start,
        end: segment.end,
        de: segment.de,
        en: segment.en,
        vi: segment.vi,
        speaker: segment.speaker,
        words: segment.words,
        f0: segment.f0,
      };
    }

    const tokens = tokenizeWords(segment.de);
    const syllablesPerToken = tokens.map((t) => Math.max(1, countSyllables(t)));
    const totalSyllables = syllablesPerToken.reduce((a, b) => a + b, 0);
    const duration = Math.max(0.8, totalSyllables / rate);

    const start = cursor;
    let wordCursor = start;
    const words = tokens.map((token, tokenIndex) => {
      const share = (syllablesPerToken[tokenIndex] / totalSyllables) * duration;
      const wordStart = wordCursor;
      wordCursor += share;
      return {
        w: stripPunctuation(token),
        s: Number(wordStart.toFixed(3)),
        e: Number(wordCursor.toFixed(3)),
      };
    });

    const end = start + duration;
    cursor = end + pause;

    return {
      id: `s${index}`,
      start: Number(start.toFixed(3)),
      end: Number(end.toFixed(3)),
      de: segment.de,
      en: segment.en,
      vi: segment.vi,
      speaker: segment.speaker,
      words,
    };
  });
}

/**
 * Collects every lemma in the transcript that the shipped lexicon knows about,
 * so the dictionary endpoint answers from the episode payload with no lookup
 * chain at all for the common case.
 */
function buildGlossary(segments: Segment[]): Record<string, GlossaryEntry> {
  const lexicon = CORE_LEXICON as unknown as Record<string, GlossaryEntry>;
  const glossary: Record<string, GlossaryEntry> = {};
  let hits = 0;
  let misses = 0;

  for (const segment of segments) {
    for (const token of tokenizeWords(segment.de)) {
      const surface = stripPunctuation(token);
      const guess = lemmatize(surface, { capitalised: /^[A-ZÄÖÜ]/.test(surface) });
      const candidates = [
        guess.lemma,
        surface,
        surface.toLowerCase(),
        surface.charAt(0).toUpperCase() + surface.slice(1).toLowerCase(),
      ];
      const key = candidates.find((c) => lexicon[c]);
      if (key) {
        glossary[key] = lexicon[key];
        // Index the surface form too, so a click resolves without lemmatising.
        if (!glossary[surface]) glossary[surface] = lexicon[key];
        hits += 1;
      } else {
        misses += 1;
      }
    }
  }

  return Object.assign(glossary, {}, { __stats: { hits, misses } as never });
}

function buildQuiz(quiz: SourceQuiz[] | undefined, segments: Segment[]): QuizQuestion[] {
  if (!quiz) return [];
  return quiz.map((question, index) => ({
    id: `q${index}`,
    anchor: segments[question.anchorSegment]?.start ?? 0,
    prompt: question.prompt,
    choices: question.choices,
    answerIndex: question.answerIndex,
    explanation: question.explanation,
  }));
}

function build(sourcePath: string): Episode {
  const source = JSON.parse(fs.readFileSync(sourcePath, "utf8")) as SourceFile;
  const rate = source.speechRate ?? 4.5;
  const pause = source.pauseAfterSentence ?? 0.3;
  const segments = synthesiseTimings(source.segments, rate, pause);

  const base = analyseSegments(segments);
  const classification = classify(segments, base.syllablesPerSecond);
  const coverage = goetheCoverageForMetrics(classification.coverage);

  const glossary = buildGlossary(segments);
  const stats = (glossary as unknown as { __stats: { hits: number; misses: number } }).__stats;
  delete (glossary as unknown as Record<string, unknown>).__stats;

  const durationSec = segments.length ? segments[segments.length - 1].end : 0;
  const level = source.editorialCefr ?? classification.level;

  const episode: Episode = {
    id: source.id,
    slug: source.slug,
    title: source.title,
    publisher: source.publisher,
    description: source.description,
    source: source.source,
    cefr: level,
    cefrNote:
      source.editorialCefr && source.editorialCefr !== classification.level
        ? `Editorial label ${source.editorialCefr}; the classifier said ${classification.level} (${classification.rationale}).`
        : classification.rationale,
    topics: source.topics,
    durationSec: Number(durationSec.toFixed(2)),
    publishedAt: source.publishedAt,
    feedUrl: source.feedUrl,
    license: source.license,
    metrics: { ...base, ...coverage },
    transcriptStatus: source.transcriptStatus ?? (source.segments.length ? "demo" : "pending"),
    glossary,
    transcript: segments,
    quiz: buildQuiz(source.quiz, segments),
    drillSegmentIds: selectDrillSegments(segments, 5),
  };

  const covered = stats.hits + stats.misses;
  console.log(
    `  ${source.slug}: ${segments.length} segments, ${durationSec.toFixed(0)}s, ` +
      `SDM ${episode.metrics.sdm}, classifier ${classification.level}, ` +
      `glossary covers ${((stats.hits / Math.max(1, covered)) * 100).toFixed(0)}% of tokens`,
  );

  return episode;
}

function main(): void {
  if (!fs.existsSync(SOURCE_DIR)) {
    console.error(`No source directory at ${SOURCE_DIR}`);
    process.exit(1);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const files = fs.readdirSync(SOURCE_DIR).filter((f) => f.endsWith(".json") && f !== "curated.json");
  console.log(`Building ${files.length} episodes from data/sources`);

  for (const file of files) {
    const episode = build(path.join(SOURCE_DIR, file));
    fs.writeFileSync(
      path.join(OUT_DIR, `${episode.slug}.json`),
      `${JSON.stringify(episode, null, 1)}\n`,
      "utf8",
    );
  }

  buildCurated();
  console.log(`Wrote ${fs.readdirSync(OUT_DIR).length} catalog files to data/catalog`);
}

/**
 * The curated shelf: real German shows with an editorial CEFR label and no
 * transcript yet. They render as cards that link out and tell you the ingest
 * command, rather than pretending to have content they do not have.
 */
function buildCurated(): void {
  const curatedPath = path.join(SOURCE_DIR, "curated.json");
  if (!fs.existsSync(curatedPath)) return;
  const rows = JSON.parse(fs.readFileSync(curatedPath, "utf8")) as Array<{
    id: string;
    slug: string;
    title: string;
    publisher: string;
    description: string;
    cefr: Cefr;
    topics: string[];
    license: string;
    pageUrl?: string;
    feedUrl?: string;
    ingestHint: string;
    estimatedSdm: number;
    estimatedDurationSec: number;
  }>;

  for (const row of rows) {
    const episode: Episode = {
      id: row.id,
      slug: row.slug,
      title: row.title,
      publisher: row.publisher,
      description: row.description,
      source: { kind: "pending", pageUrl: row.pageUrl, ingestHint: row.ingestHint },
      cefr: row.cefr,
      cefrNote: "Editorial label. Run the ingest worker to replace it with a measured one.",
      topics: row.topics,
      durationSec: row.estimatedDurationSec,
      feedUrl: row.feedUrl,
      license: row.license,
      metrics: {
        syllablesPerSecond: 0,
        lexicalDiversity: 0,
        phoneticComplexity: 0,
        sdm: row.estimatedSdm,
        goetheCoverage: {},
        outOfListRatio: 0,
      },
      transcriptStatus: "pending",
      glossary: {},
      transcript: [],
      quiz: [],
      drillSegmentIds: [],
    };
    fs.writeFileSync(
      path.join(OUT_DIR, `${episode.slug}.json`),
      `${JSON.stringify(episode, null, 1)}\n`,
      "utf8",
    );
  }
  console.log(`  curated shelf: ${rows.length} entries awaiting ingest`);
}

main();
