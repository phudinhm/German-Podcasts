/**
 * Coverage bookkeeping for live captions.
 *
 * Captions are stamped in media time, so replaying a passage must reuse the
 * text already captured rather than transcribing it again. That turns into a
 * small interval problem: remember which stretches of the episode have text,
 * and ask whether a given position falls inside one.
 *
 * Kept out of the component so the arithmetic can be tested without a browser,
 * a microphone or a speech engine.
 */

export interface Interval {
  from: number;
  to: number;
}

/**
 * How early a phrase actually began relative to its first interim result.
 *
 * Recognition needs a moment of audio before it emits anything, so even the
 * first interim lags the speech. Stamping on the final result was worse: it
 * lands after the phrase has finished, which is why clicking a line used to
 * jump past the words it showed.
 */
export const INTERIM_LEAD_SECONDS = 0.7;

/** Positions within this many seconds of a covered stretch count as covered. */
export const COVERAGE_SLACK = 0.75;

/** Adds an interval, merging anything it touches or overlaps. */
export function mergeInterval(list: Interval[], next: Interval): Interval[] {
  const candidate = { from: Math.min(next.from, next.to), to: Math.max(next.from, next.to) };
  const merged: Interval[] = [];
  let working = candidate;

  for (const item of [...list].sort((a, b) => a.from - b.from)) {
    const disjoint = item.to < working.from - COVERAGE_SLACK || item.from > working.to + COVERAGE_SLACK;
    if (disjoint) {
      merged.push(item);
    } else {
      working = { from: Math.min(item.from, working.from), to: Math.max(item.to, working.to) };
    }
  }

  merged.push(working);
  return merged.sort((a, b) => a.from - b.from);
}

export function covers(list: Interval[], time: number): boolean {
  return list.some((item) => time >= item.from - COVERAGE_SLACK && time <= item.to + COVERAGE_SLACK);
}

export function coveredSeconds(list: Interval[]): number {
  return list.reduce((total, item) => total + (item.to - item.from), 0);
}

/**
 * Where a phrase began, given the media position when its first interim result
 * arrived. Never negative, because an utterance at the very start of a stream
 * would otherwise be stamped before the stream itself.
 */
export function utteranceStart(firstInterimAt: number): number {
  return Math.max(0, firstInterimAt - INTERIM_LEAD_SECONDS);
}
