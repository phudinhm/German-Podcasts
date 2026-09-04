/**
 * Finding the line that belongs to a moment.
 *
 * The obvious version scans the whole list on every animation frame. That is
 * fine for the first minute and then quietly is not: an hour of captions is
 * well over a thousand lines, and at sixty frames a second the player spends
 * its time walking an array instead of drawing. Two things fix it. Playback
 * almost always advances into the next line, so the previous answer is checked
 * first and is right nearly every time; and when it is wrong - a seek, a jump
 * back - a binary search finds the new place in a dozen comparisons instead of
 * a thousand.
 */

export interface Timed {
  at: number;
  until: number;
}

/** Tolerance around a line, so a moment in a gap still lights the right one. */
export const ACTIVE_SLACK = 0.4;

function holds(line: Timed, time: number, slack: number): boolean {
  return time >= line.at - slack && time <= line.until + slack;
}

/**
 * Index of the line covering `time`, or -1.
 *
 * `hint` is the index that answered last time. Passing it turns the common
 * case - the clock moved forward a little - into two comparisons.
 */
export function findActive(lines: Timed[], time: number, hint = -1, slack = ACTIVE_SLACK): number {
  if (lines.length === 0) return -1;

  // Lines touch, and with slack they overlap, so a moment on a seam sits
  // inside two of them. The answer is always the latest line that has started,
  // and the fast path has to reach the same one the search would or the two
  // disagree at every seam. So it walks forward from the hint - normally none
  // or one step - and gives up to the search if the clock has moved further
  // than that, which means a seek rather than playback.
  if (hint >= 0 && hint < lines.length && lines[hint].at - slack <= time) {
    let index = hint;
    let steps = 0;
    while (index + 1 < lines.length && lines[index + 1].at - slack <= time && steps < 2) {
      index += 1;
      steps += 1;
    }
    const settled = index + 1 >= lines.length || lines[index + 1].at - slack > time;
    if (settled) return holds(lines[index], time, slack) ? index : -1;
  }

  // Binary search for the last line starting at or before `time`.
  let low = 0;
  let high = lines.length - 1;
  let candidate = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (lines[mid].at - slack <= time) {
      candidate = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  if (candidate >= 0 && holds(lines[candidate], time, slack)) return candidate;
  // A moment inside a gap belongs to neither neighbour; the one after can still
  // own it when lines overlap, which they do at every capture seam.
  const after = candidate + 1;
  if (after < lines.length && holds(lines[after], time, slack)) return after;
  return -1;
}

/**
 * Inserts a line into an already-sorted list.
 *
 * Lines arrive in order almost always, so the fast path is a push. Re-sorting
 * the whole list on every arrival, which is what this replaces, is the kind of
 * cost that only shows up in the second hour.
 */
export function insertSorted<T extends Timed>(lines: T[], line: T): T[] {
  if (lines.length === 0 || line.at >= lines[lines.length - 1].at) return [...lines, line];
  let low = 0;
  let high = lines.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (lines[mid].at <= line.at) low = mid + 1;
    else high = mid;
  }
  return [...lines.slice(0, low), line, ...lines.slice(low)];
}
