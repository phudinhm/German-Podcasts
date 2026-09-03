/**
 * Byte-range arithmetic for the audio passthrough.
 *
 * Kept out of the route file because a route may only export handlers, and
 * because this is the part worth testing: an off-by-one in a Content-Range is
 * the kind of thing a media element responds to by simply refusing to play,
 * with nothing in the console to say why.
 */

/** Parses "bytes=100-199" into a start and an optional end. */
export function parseRange(header: string | null): { start: number; end?: number } | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const [, rawStart, rawEnd] = match;
  // A suffix range ("bytes=-500") needs the total length to resolve, so it is
  // left alone rather than guessed at.
  if (!rawStart) return null;
  const start = Number(rawStart);
  if (!Number.isFinite(start) || start < 0) return null;
  const end = rawEnd ? Number(rawEnd) : undefined;
  if (end !== undefined && (!Number.isFinite(end) || end < start)) return null;
  return { start, end };
}

/** Total size out of a "bytes 0-99/12345" response header. */
export function totalFromContentRange(value: string | null): number | null {
  const match = /\/(\d+)\s*$/.exec(value ?? "");
  return match ? Number(match[1]) : null;
}

/**
 * The range to actually ask the source for.
 *
 * Whatever the client wants, no single request is left open-ended: a media
 * element asking for "bytes=0-" would otherwise be handed a whole episode down
 * one connection, which is both a long-running request and a lot of bytes
 * committed before the listener has decided to stay.
 */
export function boundedRange(
  header: string | null,
  chunkBytes: number,
): { start: number; end: number } {
  const requested = parseRange(header);
  const start = requested?.start ?? 0;
  const ceiling = start + chunkBytes - 1;
  const end = requested?.end === undefined ? ceiling : Math.min(requested.end, ceiling);
  return { start, end };
}
