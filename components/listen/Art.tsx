"use client";

import { useState } from "react";

/**
 * Six muted duotones for artwork that is missing or refuses to load.
 *
 * A grid of identical grey squares with a music note gave a page of unillustrated
 * shows nothing to tell one row from the next. Picking the pair from the title
 * means the same show keeps the same colour on every visit and in every list,
 * so the block becomes a weak landmark rather than noise.
 */
const TINTS: Array<[string, string]> = [
  ["#c8865a", "#8a5433"],
  ["#6a8fae", "#3f5f7d"],
  ["#7fa07a", "#4d6f4a"],
  ["#a97fa5", "#6f4d6c"],
  ["#c2a15c", "#836a33"],
  ["#8d8fb0", "#575a7d"],
];

function tintFor(seed: string): [string, string] {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) | 0;
  }
  return TINTS[Math.abs(hash) % TINTS.length];
}

/** Artwork with a placeholder, because podcast CDNs 404 often enough. */
export function Art({
  src,
  alt,
  size,
  seed,
}: {
  src: string | null;
  alt: string;
  size: number;
  /** Usually the show or episode title. Decides the placeholder colour. */
  seed?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    const [from, to] = tintFor(seed ?? alt ?? "");
    return (
      <span
        className="art flex shrink-0 items-center justify-center font-semibold text-white/85"
        style={{
          width: size,
          height: size,
          fontSize: Math.max(11, size / 3.4),
          backgroundImage: `linear-gradient(140deg, ${from}, ${to})`,
        }}
        aria-hidden
      >
        ♪
      </span>
    );
  }
  return (
    // Artwork comes from hundreds of podcast CDNs; a plain img avoids having to
    // allowlist every host for next/image.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
      className="art shrink-0"
      style={{ width: size, height: size }}
    />
  );
}
