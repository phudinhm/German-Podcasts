"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { UI_LANGS, UI_LANG_KEY, UiLangContext, type UiLang } from "@/lib/i18n";

/**
 * Holds the interface language. English is the default because the app teaches
 * German rather than assuming it; the chrome should never be the first hurdle.
 */
export function UiLangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<UiLang>("en");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(UI_LANG_KEY) as UiLang | null;
      if (stored && UI_LANGS.some((item) => item.code === stored)) setLangState(stored);
    } catch {
      // Storage can be unavailable; English is a fine default.
    }
  }, []);

  const setLang = useCallback((next: UiLang) => {
    setLangState(next);
    try {
      window.localStorage.setItem(UI_LANG_KEY, next);
    } catch {
      // Not being able to remember the choice is not worth an error.
    }
    document.documentElement.lang = next;
  }, []);

  const value = useMemo(() => ({ lang, setLang }), [lang, setLang]);
  return <UiLangContext.Provider value={value}>{children}</UiLangContext.Provider>;
}
