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
 * Runs before first paint, from a blocking script in <head>.
 *
 * Without it the page renders light, then React reads localStorage and swaps to
 * dark, and a dark-mode user gets a white flash on every navigation. That flash
 * is the whole reason this is inline and synchronous rather than an effect.
 *
 * It writes an explicit attribute only for an explicit choice: "system" leaves
 * the attribute off so the prefers-color-scheme rules in the stylesheet stay in
 * charge, which is also what happens when storage is unavailable.
 */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_KEY,
)});if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t);}}catch(e){}})();`;

export interface ThemeContextValue {
  theme: Theme;
  /** What is actually on screen right now, with "system" already resolved. */
  resolved: "light" | "dark";
  setTheme: (next: Theme) => void;
}

export const ThemeContext = createContext<ThemeContextValue>({
  theme: "system",
  resolved: "light",
  setTheme: () => {},
});

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
