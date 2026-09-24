"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ACCENT_COLORS,
  ACCENT_KEY,
  THEME_KEY,
  THEMES,
  ThemeContext,
  type AccentColor,
  type Theme,
} from "@/lib/theme";

function systemPrefersDark(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * Holds the appearance choice and keeps <html data-theme> in step with it.
 *
 * The first render is deliberately "system": the server has no way to know what
 * the browser stored, so anything else would be a hydration mismatch. The
 * inline script in <head> has already painted the right colours by then, so
 * this catching up is invisible.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");
  const [accent, setAccentState] = useState<AccentColor>("amber");
  const [systemDark, setSystemDark] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(THEME_KEY) as Theme | null;
      if (stored && THEMES.includes(stored)) setThemeState(stored);
    } catch {
      // Storage can be unavailable. Following the system is a fine default.
    }
    try {
      const storedAccent = window.localStorage.getItem(ACCENT_KEY) as AccentColor | null;
      if (storedAccent && ACCENT_COLORS.includes(storedAccent)) setAccentState(storedAccent);
    } catch {
      // Same fallback as above: the default amber accent is a fine default.
    }
    setSystemDark(systemPrefersDark());
  }, []);

  // Someone on "system" who changes their OS setting, or crosses the sunset
  // their phone schedules, should see the page follow without a reload.
  useEffect(() => {
    if (!window.matchMedia) return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      // Not remembering the choice is not worth an error.
    }
    const root = document.documentElement;
    if (next === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", next);
  }, []);

  const setAccent = useCallback((next: AccentColor) => {
    setAccentState(next);
    try {
      window.localStorage.setItem(ACCENT_KEY, next);
    } catch {
      // Not remembering the choice is not worth an error.
    }
    const root = document.documentElement;
    if (next === "amber") root.removeAttribute("data-accent");
    else root.setAttribute("data-accent", next);
  }, []);

  const resolved: "light" | "dark" =
    theme === "system"
      ? systemDark
        ? "dark"
        : "light"
      : theme === "light" || theme === "sepia"
        ? "light"
        : "dark";

  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      const colorMap: Record<Theme, string> = {
        system: resolved === "dark" ? "#0d0e11" : "#ffffff",
        light: "#ffffff",
        sepia: "#f5eee2",
        dark: "#0d0e11",
        ocean: "#071321",
        forest: "#071912",
        midnight: "#000000",
        rose: "#1a0911",
      };
      meta.setAttribute("content", colorMap[theme] ?? "#0d0e11");
    }
  }, [theme, resolved]);

  const value = useMemo(
    () => ({ theme, resolved, setTheme, accent, setAccent }),
    [theme, resolved, setTheme, accent, setAccent],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
