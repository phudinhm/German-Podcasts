"use client";

/**
 * Followed shows.
 *
 * Kept in this browser rather than behind an account, for the same reason the
 * vocabulary vault is: the app should be useful the first minute, without a
 * sign-up. The stored record is small enough to sync later if an account ever
 * appears.
 */

const KEY = "hoerbar.follows.v1";

export interface Subscription {
  id: string;
  title: string;
  publisher: string;
  artwork: string | null;
  feedUrl: string;
  origin: string;
  pageUrl: string | null;
  followedAt: string;
}

function read(): Subscription[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Subscription[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(items: Subscription[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent("hoerbar:follows-changed"));
}

export function listSubscriptions(): Subscription[] {
  return read().sort((a, b) => b.followedAt.localeCompare(a.followedAt));
}

export function isFollowing(feedUrl: string): boolean {
  return read().some((item) => item.feedUrl === feedUrl);
}

export function follow(entry: Omit<Subscription, "followedAt">): void {
  const items = read();
  if (items.some((item) => item.feedUrl === entry.feedUrl)) return;
  write([{ ...entry, followedAt: new Date().toISOString() }, ...items]);
}

export function unfollow(feedUrl: string): void {
  write(read().filter((item) => item.feedUrl !== feedUrl));
}

export function toggleFollow(entry: Omit<Subscription, "followedAt">): boolean {
  if (isFollowing(entry.feedUrl)) {
    unfollow(entry.feedUrl);
    return false;
  }
  follow(entry);
  return true;
}
