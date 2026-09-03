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

/** Compact language switcher for the header. */
export function UiLangSwitch() {
  const [open, setOpen] = useState(false);
  return (
    <UiLangContext.Consumer>
      {({ lang, setLang }) => (
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="btn px-2.5 py-1 text-[12px]"
            aria-haspopup="listbox"
            aria-expanded={open}
          >
            {lang.toUpperCase()}
          </button>
          {open ? (
            <ul
              role="listbox"
              className="card absolute right-0 z-50 mt-1 w-[132px] overflow-hidden p-1"
            >
              {UI_LANGS.map((item) => (
                <li key={item.code}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={lang === item.code}
                    onClick={() => {
                      setLang(item.code);
                      setOpen(false);
                    }}
                    className={`w-full rounded-lg px-2.5 py-1.5 text-left text-[13px] hover:bg-[var(--surface)] ${
                      lang === item.code ? "font-medium text-[var(--accent)]" : ""
                    }`}
                  >
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </UiLangContext.Consumer>
  );
}
