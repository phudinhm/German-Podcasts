/**
 * Cutting a whole episode into pieces a speech model can take.
 *
 * Whisper works on windows of about thirty seconds, so a forty-minute episode
 * is not one request but eighty. The arithmetic of where those windows start
 * and stop is the part worth testing on its own: an off-by-one here shows up
 * as a transcript whose timestamps drift further out the longer you listen,
 * which is the one failure that makes the whole feature worthless.
 */

export interface Chunk {
  /** Index into the sample buffer. */
  from: number;
  to: number;
  /** Seconds into the episode at `from`. */
  at: number;
}

/** Whisper's own window. Longer input is truncated by the model, not by us. */
export const CHUNK_SECONDS = 28;

/**
 * Overlap between windows.
 *
 * A sentence cut in half at a boundary is transcribed badly on both sides, so
 * windows share a couple of seconds. The timestamps Whisper returns are
 * relative to the window, so the overlap is trimmed when the results are
 * merged rather than here.
 */
export const OVERLAP_SECONDS = 2;

export function planChunks(
  totalSamples: number,
  sampleRate: number,
  chunkSeconds = CHUNK_SECONDS,
  overlapSeconds = OVERLAP_SECONDS,
): Chunk[] {
  if (totalSamples <= 0 || sampleRate <= 0) return [];
  const size = Math.max(1, Math.round(chunkSeconds * sampleRate));
  const overlap = Math.max(0, Math.min(size - 1, Math.round(overlapSeconds * sampleRate)));
  const step = size - overlap;

  const chunks: Chunk[] = [];
  for (let from = 0; from < totalSamples; from += step) {
    const to = Math.min(totalSamples, from + size);
    chunks.push({ from, to, at: from / sampleRate });
    if (to >= totalSamples) break;
  }
  return chunks;
}

export interface TimedPiece {
  text: string;
  at: number;
  until: number;
}

/**
 * Merges one window's results into the transcript so far.
 *
 * Pieces that start inside ground the previous windows already covered are
 * dropped: that is the overlap doing its job and then getting out of the way.
 * Anything else would print the seam twice.
 */
export function mergePieces(existing: TimedPiece[], incoming: TimedPiece[]): TimedPiece[] {
  const covered = existing.length > 0 ? existing[existing.length - 1].until : -Infinity;
  const fresh = incoming.filter((piece) => piece.text.trim() && piece.until > covered + 0.05);
  if (fresh.length === 0) return existing;
  return [...existing, ...fresh].sort((a, b) => a.at - b.at);
}
