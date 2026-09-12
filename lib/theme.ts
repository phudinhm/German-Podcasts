"use client";

import { createContext, useContext } from "react";

/**
 * Appearance.
 *
 * "system" is the default and follows the operating system, which is what most
 * people actually want. The two explicit choices exist for the people it gets
 * wrong: a phone that flips to dark at sunset while you are still reading in a
 * bright room, or a laptop pinned to light by a work policy.
 */
export type Theme = "system" | "light" | "dark";

export const THEMES: Theme[] = ["system", "light", "dark"];

export const THEME_KEY = "hoerbar.theme.v1";

/**
 * The accent hue that carries every "this is the one" signal - the row
 * playing, the level in force, the filter you chose. "amber" is the default
 * and needs no attribute of its own, since the base stylesheet rules already
 * paint it with nothing set - the same reasoning "system" gets for Theme.
 */
export type AccentColor = "amber" | "blue" | "green" | "purple" | "rose";

export const ACCENT_COLORS: AccentColor[] = ["amber", "blue", "green", "purple", "rose"];

export const ACCENT_KEY = "hoerbar.accent.v1";

const NON_DEFAULT_ACCENTS = ACCENT_COLORS.filter((color) => color !== "amber");

/**
 * Runs before first paint, from a blocking script in <head>.
 *
 * Without it the page renders light, then React reads localStorage and swaps to
 * dark, and a dark-mode user gets a white flash on every navigation. That flash
 * is the whole reason this is inline and synchronous rather than an effect.
 *
 * It writes an explicit attribute only for an explicit choice: "system" leaves
 * the attribute off so the prefers-color-scheme rules in the stylesheet stay in
 * charge, which is also what happens when storage is unavailable. The accent
 * hue follows the same rule - "amber" leaves data-accent off entirely.
 */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_KEY,
)});if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t);}}catch(e){}try{var a=localStorage.getItem(${JSON.stringify(
  ACCENT_KEY,
)});if(a&&${JSON.stringify(NON_DEFAULT_ACCENTS)}.indexOf(a)>-1){document.documentElement.setAttribute("data-accent",a);}}catch(e){}})();`;

export interface ThemeContextValue {
  theme: Theme;
  /** What is actually on screen right now, with "system" already resolved. */
  resolved: "light" | "dark";
  setTheme: (next: Theme) => void;
  accent: AccentColor;
  setAccent: (next: AccentColor) => void;
}

export const ThemeContext = createContext<ThemeContextValue>({
  theme: "system",
  resolved: "light",
  setTheme: () => {},
  accent: "amber",
  setAccent: () => {},
});

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
