export const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export type Cefr = (typeof CEFR_LEVELS)[number];

export type TargetLang = "en" | "vi";

/** A single word with forced-alignment timings, in seconds. */
export interface WordToken {
  /** Surface form exactly as spoken, punctuation stripped. */
  w: string;
  /** Start offset in seconds. */
  s: number;
  /** End offset in seconds. */
  e: number;
}

export interface Segment {
  id: string;
  /** Seconds from the start of the media. */
  start: number;
  end: number;
  /** German source sentence, with punctuation. */
  de: string;
  /** Translations keyed by target language. */
  en: string;
  vi: string;
  /** Word-level alignment. Absent when only sentence-level timing exists. */
  words?: WordToken[];
  speaker?: string;
  /**
   * Native fundamental-frequency contour, sampled evenly across the segment.
   * Hz values, 0 for unvoiced frames. Produced by the ingest worker.
   */
  f0?: number[];
}

export interface EpisodeMetrics {
  /** Speech rate. The single strongest predictor of shadowing difficulty. */
  syllablesPerSecond: number;
  /** Type-token ratio over lemmas, 0..1. */
  lexicalDiversity: number;
  /** Share of tokens carrying a flagged phonetic hazard, 0..1. */
  phoneticComplexity: number;
  /** Composite Shadowing Difficulty Metric, 0..100. */
  sdm: number;
  /** Share of tokens found in the Goethe list at or below each level. */
  goetheCoverage: Partial<Record<Cefr, number>>;
  /** Share of tokens outside every Goethe list we ship. */
  outOfListRatio: number;
}

export type MediaSource =
  /** Streamed from YouTube through the IFrame Player API. */
  | { kind: "youtube"; youtubeId: string; pageUrl?: string }
  /** Streamed straight from a podcast CDN as an <audio> element. */
  | { kind: "audio"; audioUrl: string; pageUrl?: string }
  /**
   * No media attached yet. The player runs a virtual clock over the transcript
   * timeline, so every sync, loop and drill feature still works while the
   * ingest worker has not been pointed at a real recording.
   */
  | { kind: "timeline"; pageUrl?: string }
  /** Curated but not yet ingested - the catalog card links out instead. */
  | { kind: "pending"; pageUrl?: string; ingestHint?: string };

export interface QuizQuestion {
  id: string;
  /** Seconds - where in the media the answer is supported. */
  anchor: number;
  prompt: string;
  choices: string[];
  answerIndex: number;
  explanation?: string;
}

export interface Episode {
  id: string;
  slug: string;
  title: string;
  publisher: string;
  description: string;
  source: MediaSource;
  cefr: Cefr;
  /** Editorial override note when the automatic classifier was adjusted. */
  cefrNote?: string;
  topics: string[];
  durationSec: number;
  publishedAt?: string;
  /** Podcast RSS feed the episode came from, when applicable. */
  feedUrl?: string;
  license: string;
  metrics: EpisodeMetrics;
  /** "ready" once the ingest worker has attached real media and alignment. */
  transcriptStatus: "ready" | "demo" | "pending";
  /** Per-episode dictionary, precomputed so word clicks resolve with no I/O. */
  glossary: Record<string, GlossaryEntry>;
  transcript: Segment[];
  quiz: QuizQuestion[];
  /** Segment ids selected for the five-minute micro-drill. */
  drillSegmentIds: string[];
}

export interface GlossaryEntry {
  /** Part of speech code: n, v, adj, adv, prep, conj, pron, num, art, part. */
  p: string;
  g?: "der" | "die" | "das";
  pl?: string;
  en: string[];
  vi: string[];
  n?: string;
}

/** Catalog row - everything the grid needs, without the transcript payload. */
export type EpisodeSummary = Omit<Episode, "transcript" | "quiz" | "drillSegmentIds" | "glossary">;

export interface LookupNoun {
  gender: "der" | "die" | "das";
  plural?: string;
}

export interface LookupResult {
  surface: string;
  lemma: string;
  pos: string;
  noun?: LookupNoun;
  /** Separable verb prefix reunited with its stem, e.g. "steht ... auf" -> aufstehen. */
  separable?: { prefix: string; stem: string };
  translations: { en: string[]; vi: string[] };
  /** Whole-sentence translation, for idiomatic clarity. */
  sentence?: { de: string; en?: string; vi?: string };
  source: "lexicon" | "llm" | "mt" | "heuristic";
  notes?: string;
}
