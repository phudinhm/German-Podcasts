"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { THEME_KEY, THEMES, ThemeContext, type Theme } from "@/lib/theme";

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
  const [systemDark, setSystemDark] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(THEME_KEY) as Theme | null;
      if (stored && THEMES.includes(stored)) setThemeState(stored);
    } catch {
      // Storage can be unavailable. Following the system is a fine default.
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

  const resolved = theme === "system" ? (systemDark ? "dark" : "light") : theme;

  // The browser paints its own chrome from this: the address bar on Android,
  // the notch surround on iOS. Left alone it stays the light colour under a
  // dark page, which is the one seam a user always notices.
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", resolved === "dark" ? "#0d0e11" : "#ffffff");
  }, [resolved]);

  const value = useMemo(() => ({ theme, resolved, setTheme }), [theme, resolved, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
