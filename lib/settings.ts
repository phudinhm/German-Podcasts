"use client";

import type { TargetLang } from "./types";

/**
 * The listener's own preferences.
 *
 * These used to sit in the vocabulary store, which meant removing the
 * vocabulary tab would have taken playback rate, echo timing and the tempo
 * ramp with it. They are a different thing entirely: how someone likes to
 * practise, not what they have collected.
 */
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

export function loadSettings(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Settings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // A full or disabled store simply means preferences do not persist.
  }
}
