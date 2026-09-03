/**
 * Whether a media URL needs to be routed through this origin before the audio
 * graph can read it.
 *
 * Same-origin and blob URLs are already readable. Everything else is assumed to
 * lack CORS headers, because podcast CDNs overwhelmingly do.
 */
export function needsProxy(src: string): boolean {
  if (!src) return false;
  if (src.startsWith("blob:") || src.startsWith("data:")) return false;
  if (typeof window === "undefined") return true;
  try {
    return new URL(src, window.location.href).origin !== window.location.origin;
  } catch {
    return false;
  }
}

/** Rewrites a media URL to the same-origin passthrough. */
export function proxied(src: string): string {
  if (!needsProxy(src)) return src;
  return `/api/audio?url=${encodeURIComponent(src)}`;
}
