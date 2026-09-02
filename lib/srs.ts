/**
 * Spaced repetition. SM-2 drives the schedule; the Leitner box is derived from
 * the SM-2 state purely for display, because a 5-box picture is easier to read
 * at a glance than an ease factor.
 */

export type Grade = 0 | 1 | 2 | 3 | 4 | 5;

export interface SrsState {
  /** Ease factor. SM-2 floors this at 1.3. */
  ease: number;
  /** Current interval in days. */
  interval: number;
  /** Consecutive successful reviews. */
  repetitions: number;
  /** ISO timestamp of the next scheduled review. */
  due: string;
  /** ISO timestamp of the last review, null before the first one. */
  lastReviewed: string | null;
  lapses: number;
}

export const DAY_MS = 86_400_000;

/** The Leitner ladder the UI shows, in days. */
export const LEITNER_INTERVALS = [1, 3, 7, 30, 90];

export function initialSrsState(now: Date = new Date()): SrsState {
  return {
    ease: 2.5,
    interval: 0,
    repetitions: 0,
    due: now.toISOString(),
    lastReviewed: null,
    lapses: 0,
  };
}

/**
 * Applies one SM-2 review. Grades below 3 reset the repetition count and send
 * the card back to a one-day interval, which is what makes the algorithm
 * forgiving of a single bad day without losing the whole history.
 */
export function review(state: SrsState, grade: Grade, now: Date = new Date()): SrsState {
  const ease = Math.max(
    1.3,
    state.ease + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02)),
  );

  if (grade < 3) {
    return {
      ease,
      interval: 1,
      repetitions: 0,
      due: new Date(now.getTime() + DAY_MS).toISOString(),
      lastReviewed: now.toISOString(),
      lapses: state.lapses + 1,
    };
  }

  const repetitions = state.repetitions + 1;
  let interval: number;
  if (repetitions === 1) interval = 1;
  else if (repetitions === 2) interval = 6;
  else interval = Math.round(state.interval * ease);

  return {
    ease,
    interval,
    repetitions,
    due: new Date(now.getTime() + interval * DAY_MS).toISOString(),
    lastReviewed: now.toISOString(),
    lapses: state.lapses,
  };
}

/** Maps SM-2 state onto a 1..5 Leitner box for display. */
export function leitnerBox(state: SrsState): number {
  if (state.repetitions === 0) return 1;
  for (let box = 0; box < LEITNER_INTERVALS.length; box += 1) {
    if (state.interval <= LEITNER_INTERVALS[box]) return box + 1;
  }
  return LEITNER_INTERVALS.length;
}

export function isDue(state: SrsState, now: Date = new Date()): boolean {
  return new Date(state.due).getTime() <= now.getTime();
}

/** Human-readable "in 6 days" / "due now". */
export function describeDue(state: SrsState, now: Date = new Date()): string {
  const deltaMs = new Date(state.due).getTime() - now.getTime();
  if (deltaMs <= 0) return "due now";
  const days = Math.round(deltaMs / DAY_MS);
  if (days === 0) return "due today";
  if (days === 1) return "due tomorrow";
  if (days < 30) return `in ${days} days`;
  const months = Math.round(days / 30);
  return months === 1 ? "in a month" : `in ${months} months`;
}

/** Orders a review queue: overdue first, then closest to due. */
export function sortQueue<T extends { srs: SrsState }>(items: T[], now: Date = new Date()): T[] {
  return [...items].sort(
    (a, b) => new Date(a.srs.due).getTime() - new Date(b.srs.due).getTime(),
  ).filter((item) => isDue(item.srs, now));
}
