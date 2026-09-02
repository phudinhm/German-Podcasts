/**
 * Classifies German text against the shipped Goethe lists and prints the
 * reasoning, so an editorial CEFR label can be checked rather than guessed.
 *
 *   npm run classify -- data/sources/feierabend-arbeitskultur.json
 *   cat transcript.txt | npm run classify
 */

import fs from "node:fs";
import { classify, measureCoverage, CEFR_DESCRIPTIONS } from "../lib/cefr";
import { analyseSegments } from "../lib/sdm";
import { analyseWord } from "../lib/german/phonetics";
import { tokenizeWords } from "../lib/german/orthography";
import type { Segment } from "../lib/types";

function segmentsFromText(text: string): Segment[] {
  // Fall back to a nominal 4.5 syllables per second when there are no timings.
  const sentences = text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  let cursor = 0;
  return sentences.map((sentence, index) => {
    const duration = Math.max(1, tokenizeWords(sentence).length / 2.2);
    const segment: Segment = {
      id: `s${index}`,
      start: cursor,
      end: cursor + duration,
      de: sentence,
      en: "",
      vi: "",
    };
    cursor += duration + 0.3;
    return segment;
  });
}

function loadSegments(argPath: string | undefined): Segment[] {
  if (!argPath) {
    const stdin = fs.readFileSync(0, "utf8");
    return segmentsFromText(stdin);
  }
  const raw = fs.readFileSync(argPath, "utf8");
  if (argPath.endsWith(".json")) {
    const parsed = JSON.parse(raw) as { segments?: Array<{ de: string }>; transcript?: Segment[] };
    if (parsed.transcript?.length) return parsed.transcript;
    if (parsed.segments?.length) return segmentsFromText(parsed.segments.map((s) => s.de).join(" "));
  }
  return segmentsFromText(raw);
}

function main(): void {
  const target = process.argv[2];
  const segments = loadSegments(target);
  if (segments.length === 0) {
    console.error("No text to classify.");
    process.exit(1);
  }

  const metrics = analyseSegments(segments);
  const result = classify(segments, metrics.syllablesPerSecond);
  const text = segments.map((s) => s.de).join(" ");
  const coverage = measureCoverage(text);

  console.log(`\nLevel: ${result.level}   (vocabulary alone said ${result.lexicalLevel})`);
  console.log(`${CEFR_DESCRIPTIONS[result.level]}\n`);
  console.log("Lexical coverage against the Goethe lists");
  console.log(`  in A1            ${(coverage.cumulative.A1 * 100).toFixed(1)}%`);
  console.log(`  in A1-A2         ${(coverage.cumulative.A2 * 100).toFixed(1)}%`);
  console.log(`  in A1-B1         ${(coverage.cumulative.B1 * 100).toFixed(1)}%`);
  console.log(`  outside the lists${(coverage.outOfList * 100).toFixed(1).padStart(6)}%`);
  console.log(`  compounds        ${(coverage.compoundRatio * 100).toFixed(1)}%`);
  console.log(`  tokens           ${coverage.tokenCount}\n`);
  console.log("Shadowing Difficulty Metric");
  console.log(`  syllables/second ${metrics.syllablesPerSecond}`);
  console.log(`  lexical diversity${metrics.lexicalDiversity.toFixed(3).padStart(7)}`);
  console.log(`  phonetic load    ${metrics.phoneticComplexity.toFixed(3)}`);
  console.log(`  SDM              ${metrics.sdm}/100\n`);

  const hardest = tokenizeWords(text)
    .map((token) => analyseWord(token))
    .filter((a) => a.difficulty > 0)
    .sort((a, b) => b.difficulty - a.difficulty)
    .slice(0, 8);
  if (hardest.length) {
    console.log("Hardest words to articulate");
    for (const word of hardest) {
      const kinds = [...new Set(word.hazards.map((h) => h.kind))].join(", ");
      console.log(`  ${word.token.padEnd(24)} ${word.syllables.join("-").padEnd(26)} ${kinds}`);
    }
    console.log();
  }
}

main();
