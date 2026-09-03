"use client";

import type { MediaSource } from "./types";

/**
 * Media attached by the learner, kept per episode in this browser.
 *
 * A curated episode ships with a transcript and no recording, or with a
 * recording the catalog cannot legally point at for everyone. Rather than
 * leaving those unplayable, anyone can attach their own stream URL and the same
 * synchronised view plays it. Object URLs from a local file are session-only,
 * because a blob: URL means nothing after a reload.
 */

const KEY = "hoerbar.media.v1";

export interface StoredMedia {
  source: MediaSource;
  label: string;
  attachedAt: string;
  /** True for a local file, which cannot survive a page reload. */
  ephemeral?: boolean;
}

type Store = Record<string, StoredMedia>;

function read(): Store {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    return {};
  }
}

function write(store: Store): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(store));
  window.dispatchEvent(new CustomEvent("hoerbar:media-changed"));
}

export function getMedia(slug: string): StoredMedia | null {
  return read()[slug] ?? null;
}

export function setMedia(slug: string, media: StoredMedia): void {
  if (media.ephemeral) {
    // A blob: URL is dead on reload, so it stays in memory only.
    ephemeral.set(slug, media);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("hoerbar:media-changed"));
    }
    return;
  }
  const store = read();
  store[slug] = media;
  write(store);
}

export function clearMedia(slug: string): void {
  ephemeral.delete(slug);
  const store = read();
  delete store[slug];
  write(store);
}

/** Session-only attachments, keyed by slug. */
const ephemeral = new Map<string, StoredMedia>();

export function resolveMedia(slug: string): StoredMedia | null {
  return ephemeral.get(slug) ?? getMedia(slug);
}
