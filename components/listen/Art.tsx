"use client";

import { useState } from "react";

/** Artwork with a placeholder, because podcast CDNs 404 often enough. */
export function Art({ src, alt, size }: { src: string | null; alt: string; size: number }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <span
        className="art flex shrink-0 items-center justify-center text-[var(--ink-faint)]"
        style={{ width: size, height: size, fontSize: Math.max(12, size / 3.2) }}
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
