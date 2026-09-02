"use client";

import { initialSrsState, type SrsState } from "./srs";
import type { Cefr, TargetLang } from "./types";

/**
 * The vocabulary vault lives in localStorage so the app is useful with no
 * account and no database. `syncEndpoint` mirrors it to Supabase when the
 * user opts in, but nothing here depends on that.
 */

export interface VaultEntry {
  id: string;
  /** Word exactly as it appeared in the transcript. */
  surface: string;
  lemma: string;
  pos: string;
  article?: "der" | "die" | "das";
  plural?: string;
  translations: { en: string[]; vi: string[] };
  /** The real-world sentence the word was captured in. */
  context: {
    de: string;
    en?: string;
    vi?: string;
    episodeSlug: string;
    episodeTitle: string;
    segmentId: string;
    /** Seconds - deep-links straight back to the frame. */
    start: number;
    end: number;
    cefr: Cefr;
  };
  savedAt: string;
  srs: SrsState;
  /** Review outcomes, newest last. Kept for the vault statistics view. */
  history: Array<{ at: string; grade: number }>;
}

const STORAGE_KEY = "hoerbar.vault.v1";
const SETTINGS_KEY = "hoerbar.settings.v1";

export interface Settings {
  targetLang: TargetLang;
  showDual: boolean;
  playbackRate: number;
  echoEnabled: boolean;
  echoGapFactor: number;
  loopCount: number;
  tempoRamp: number[];
  hazardsEnabled: boolean;
  karaoke: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  targetLang: "en",
  showDual: true,
  playbackRate: 1,
  echoEnabled: false,
  echoGapFactor: 1.2,
  loopCount: 3,
  tempoRamp: [0.75, 0.85, 1, 1.1],
  hazardsEnabled: true,
  karaoke: true,
};

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...(JSON.parse(raw) as T) };
  } catch {
    return fallback;
  }
}

export function loadVault(): VaultEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as VaultEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveVault(entries: VaultEntry[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  window.dispatchEvent(new CustomEvent("hoerbar:vault-changed"));
}

export function entryKey(lemma: string, episodeSlug: string): string {
  return `${lemma.toLowerCase()}::${episodeSlug}`;
}

export function addEntry(entry: Omit<VaultEntry, "id" | "savedAt" | "srs" | "history">): VaultEntry[] {
  const entries = loadVault();
  const id = entryKey(entry.lemma, entry.context.episodeSlug);
  if (entries.some((e) => e.id === id)) return entries;
  const next: VaultEntry = {
    ...entry,
    id,
    savedAt: new Date().toISOString(),
    srs: initialSrsState(),
    history: [],
  };
  const updated = [next, ...entries];
  saveVault(updated);
  return updated;
}

export function removeEntry(id: string): VaultEntry[] {
  const updated = loadVault().filter((e) => e.id !== id);
  saveVault(updated);
  return updated;
}

export function updateEntry(id: string, patch: Partial<VaultEntry>): VaultEntry[] {
  const updated = loadVault().map((e) => (e.id === id ? { ...e, ...patch } : e));
  saveVault(updated);
  return updated;
}

export function hasEntry(lemma: string, episodeSlug: string): boolean {
  return loadVault().some((e) => e.id === entryKey(lemma, episodeSlug));
}

export function loadSettings(): Settings {
  return readJson<Settings>(SETTINGS_KEY, DEFAULT_SETTINGS);
}

export function saveSettings(settings: Settings): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
