"use client";

import { createContext, useContext } from "react";

export type Theme =
  | "system"
  | "light"
  | "daylight"
  | "sepia"
  | "sakura"
  | "matcha"
  | "lavender"
  | "sky"
  | "peach"
  | "dark"
  | "midnight"
  | "ocean"
  | "forest"
  | "rose"
  | "amethyst"
  | "espresso"
  | "cyber";

export const LIGHT_THEMES: Theme[] = [
  "light",
  "daylight",
  "sepia",
  "sakura",
  "matcha",
  "lavender",
  "sky",
  "peach",
];

export const THEMES: Theme[] = [
  "system",
  "light",
  "daylight",
  "sepia",
  "sakura",
  "matcha",
  "lavender",
  "sky",
  "peach",
  "dark",
  "midnight",
  "ocean",
  "forest",
  "rose",
  "amethyst",
  "espresso",
  "cyber",
];

export const THEME_KEY = "hoerbar.theme.v1";

export type AccentColor =
  | "amber"
  | "orange"
  | "gold"
  | "green"
  | "teal"
  | "cyan"
  | "blue"
  | "indigo"
  | "purple"
  | "rose";

export const ACCENT_COLORS: AccentColor[] = [
  "amber",
  "orange",
  "gold",
  "green",
  "teal",
  "cyan",
  "blue",
  "indigo",
  "purple",
  "rose",
];

export const ACCENT_KEY = "hoerbar.accent.v1";

const NON_DEFAULT_ACCENTS = ACCENT_COLORS.filter((color) => color !== "amber");
const EXPLICIT_THEMES = THEMES.filter((t) => t !== "system");

export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_KEY,
)});if(t&&${JSON.stringify(EXPLICIT_THEMES)}.indexOf(t)>-1){document.documentElement.setAttribute("data-theme",t);}}catch(e){}try{var a=localStorage.getItem(${JSON.stringify(
  ACCENT_KEY,
)});if(a&&${JSON.stringify(NON_DEFAULT_ACCENTS)}.indexOf(a)>-1){document.documentElement.setAttribute("data-accent",a);}}catch(e){}})();`;

export interface ThemeContextValue {
  theme: Theme;
  /** What is actually on screen right now ("light" or "dark" base polarity). */
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
