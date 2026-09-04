"use client";

/**
 * What the listener has collected: shows they follow, and where they got to.
 *
 * Local first. Everything works signed out, stored in this browser, and sync
 * is something that happens to a library that already exists rather than a
 * precondition for having one. That ordering matters: a podcast app that
 * demands an account before it will remember anything is asking for trust it
 * has not earned yet.
 */

const SHOWS_KEY = "hoerbar.library.shows.v1";
const RECENTS_KEY = "hoerbar.library.recents.v1";

/** Kept small deliberately: this is what travels to Drive and back. */
export interface SavedShow {
  feedUrl: string;
  title: string;
  publisher: string;
  artwork: string | null;
  origin: string;
  pageUrl?: string;
  savedAt: string;
}

export interface RecentEpisode {
  /** Feed guid where there is one, else the media URL. */
  id: string;
  title: string;
  showTitle: string;
  feedUrl: string | null;
  url: string;
  artwork: string | null;
  durationSec: number | null;
  publishedAt: string | null;
  description: string;
  /** Seconds reached. */
  position: number;
  /** True once played to the end, so it can be shown as finished. */
  finished: boolean;
  playedAt: string;
}

export interface Library {
  shows: SavedShow[];
  recents: RecentEpisode[];
  /** Last write, used to decide which side of a sync is newer. */
  updatedAt: string;
}

export const MAX_RECENTS = 60;

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent("hoerbar:library-changed"));
  } catch {
    // A full or disabled store means the library simply does not persist.
  }
}

export function loadLibrary(): Library {
  return {
    shows: read<SavedShow[]>(SHOWS_KEY, []),
    recents: read<RecentEpisode[]>(RECENTS_KEY, []),
    updatedAt: read<string>("hoerbar.library.updatedAt", ""),
  };
}

export function saveLibrary(library: Library): void {
  write(SHOWS_KEY, library.shows);
  write(RECENTS_KEY, library.recents);
  write("hoerbar.library.updatedAt", library.updatedAt || new Date().toISOString());
}

// ---------------------------------------------------------------------------
// Shows
// ---------------------------------------------------------------------------

export function listShows(): SavedShow[] {
  return read<SavedShow[]>(SHOWS_KEY, []).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export function isSaved(feedUrl: string): boolean {
  return listShows().some((show) => show.feedUrl === feedUrl);
}

/** Adds or removes, and reports whether the show is saved afterwards. */
export function toggleShow(entry: Omit<SavedShow, "savedAt">): boolean {
  const shows = read<SavedShow[]>(SHOWS_KEY, []);
  const existing = shows.findIndex((show) => show.feedUrl === entry.feedUrl);
  if (existing >= 0) {
    shows.splice(existing, 1);
    write(SHOWS_KEY, shows);
    touch();
    return false;
  }
  shows.unshift({ ...entry, savedAt: new Date().toISOString() });
  write(SHOWS_KEY, shows);
  touch();
  return true;
}

// ---------------------------------------------------------------------------
// Recently played
// ---------------------------------------------------------------------------

export function listRecents(): RecentEpisode[] {
  return read<RecentEpisode[]>(RECENTS_KEY, []).sort((a, b) => b.playedAt.localeCompare(a.playedAt));
}

/** Where an episode was left, or 0 if it is new or was finished. */
export function resumeAt(id: string): number {
  const entry = read<RecentEpisode[]>(RECENTS_KEY, []).find((item) => item.id === id);
  if (!entry || entry.finished) return 0;
  // Under half a minute in, starting over is what someone means by "play".
  return entry.position > 30 ? entry.position : 0;
}

export function noteplayed(entry: Omit<RecentEpisode, "playedAt" | "position" | "finished">): void {
  const recents = read<RecentEpisode[]>(RECENTS_KEY, []);
  const existing = recents.find((item) => item.id === entry.id);
  const next: RecentEpisode = {
    ...entry,
    position: existing?.position ?? 0,
    finished: existing?.finished ?? false,
    playedAt: new Date().toISOString(),
  };
  write(RECENTS_KEY, [next, ...recents.filter((item) => item.id !== entry.id)].slice(0, MAX_RECENTS));
  touch();
}

/**
 * Records progress. Called often while playing, so it writes only when the
 * position has actually moved by a few seconds.
 */
export function notePosition(id: string, position: number, durationSec: number | null): void {
  const recents = read<RecentEpisode[]>(RECENTS_KEY, []);
  const index = recents.findIndex((item) => item.id === id);
  if (index < 0) return;
  const entry = recents[index];
  if (Math.abs(entry.position - position) < 5) return;

  // "Finished" a little before the true end: trailers and outros mean nobody
  // listens to the last few seconds, and an episode stuck at 98% is a nag.
  const finished = Boolean(durationSec && position >= durationSec - 25);
  recents[index] = { ...entry, position, finished, playedAt: new Date().toISOString() };
  write(RECENTS_KEY, recents);
}

export function forgetRecent(id: string): void {
  write(RECENTS_KEY, read<RecentEpisode[]>(RECENTS_KEY, []).filter((item) => item.id !== id));
  touch();
}

export function clearRecents(): void {
  write(RECENTS_KEY, []);
  touch();
}

function touch(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem("hoerbar.library.updatedAt", new Date().toISOString());
  } catch {
    // Nothing to do; sync will fall back to comparing contents.
  }
}

// ---------------------------------------------------------------------------
// Merging, for sync
// ---------------------------------------------------------------------------

/**
 * Combines two copies of a library without a server to arbitrate.
 *
 * Deliberately additive: a show saved on either device stays saved, and for an
 * episode heard on both, the furthest position wins. Losing a saved show
 * because of a stale copy on an old phone is the failure people actually
 * notice, and it is much worse than keeping one they had removed.
 */
export function mergeLibraries(a: Library, b: Library): Library {
  const shows = new Map<string, SavedShow>();
  for (const show of [...a.shows, ...b.shows]) {
    const existing = shows.get(show.feedUrl);
    if (!existing || show.savedAt < existing.savedAt) shows.set(show.feedUrl, show);
  }

  const recents = new Map<string, RecentEpisode>();
  for (const episode of [...a.recents, ...b.recents]) {
    const existing = recents.get(episode.id);
    if (!existing) {
      recents.set(episode.id, episode);
      continue;
    }
    recents.set(episode.id, {
      ...(episode.playedAt > existing.playedAt ? episode : existing),
      position: Math.max(existing.position, episode.position),
      finished: existing.finished || episode.finished,
      playedAt: episode.playedAt > existing.playedAt ? episode.playedAt : existing.playedAt,
    });
  }

  return {
    shows: [...shows.values()].sort((x, y) => y.savedAt.localeCompare(x.savedAt)),
    recents: [...recents.values()]
      .sort((x, y) => y.playedAt.localeCompare(x.playedAt))
      .slice(0, MAX_RECENTS),
    updatedAt: a.updatedAt > b.updatedAt ? a.updatedAt : b.updatedAt,
  };
}
