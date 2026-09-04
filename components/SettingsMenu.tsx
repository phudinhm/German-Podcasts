"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { UI_LANGS, useUi } from "@/lib/i18n";
import { useTheme, type Theme } from "@/lib/theme";

const THEME_GLYPH: Record<"light" | "dark", string> = { light: "☀", dark: "☾" };

const THEME_OPTIONS: Array<{ value: Theme; key: "theme.system" | "theme.light" | "theme.dark"; glyph: string }> = [
  { value: "system", key: "theme.system", glyph: "◐" },
  { value: "light", key: "theme.light", glyph: "☀" },
  { value: "dark", key: "theme.dark", glyph: "☾" },
];

/**
 * Appearance and language, behind one button in the header.
 *
 * They share a menu because the header has no room for two. At 390px the nav
 * already ends about thirty pixels from the wordmark, and a second pill put the
 * two on top of each other. Keeping the language code on the face of the button
 * means nothing is hidden that was visible before: the glyph beside it says
 * which way the page is currently painted.
 */
export function SettingsMenu() {
  const { t, lang, setLang } = useUi();
  const { theme, resolved, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // A menu that only closes by pressing its own button is a menu people leave
  // open by accident and then tap through.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="btn gap-1.5 px-2.5 py-1 text-[12px]"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("theme.settings")}
      >
        <span aria-hidden className="text-[13px] leading-none text-[var(--ink-soft)]">
          {THEME_GLYPH[resolved]}
        </span>
        {/* The code is dropped on a phone. With the mark now in the header too,
            it was the least valuable thing competing for the width, and the
            language is still named in full one tap away inside the menu. */}
        <span className="hidden sm:inline">{lang.toUpperCase()}</span>
      </button>

      {open ? (
        <div role="menu" className="card absolute right-0 z-50 mt-1.5 w-[186px] overflow-hidden p-1.5">
          <p className="px-2 pb-1 pt-1 text-[10px] uppercase tracking-[0.14em] text-[var(--ink-faint)]">
            {t("theme.title")}
          </p>
          {THEME_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="menuitemradio"
              aria-checked={theme === option.value}
              onClick={() => setTheme(option.value)}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-[var(--surface)] ${
                theme === option.value ? "font-medium text-[var(--accent)]" : ""
              }`}
            >
              <span aria-hidden className="w-3.5 text-center text-[var(--ink-faint)]">
                {option.glyph}
              </span>
              {t(option.key)}
            </button>
          ))}

          <p className="mt-1 border-t border-[var(--rule)] px-2 pb-1 pt-2 text-[10px] uppercase tracking-[0.14em] text-[var(--ink-faint)]">
            {t("common.uiLanguage")}
          </p>
          {UI_LANGS.map((item) => (
            <button
              key={item.code}
              type="button"
              role="menuitemradio"
              aria-checked={lang === item.code}
              onClick={() => {
                setLang(item.code);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-[var(--surface)] ${
                lang === item.code ? "font-medium text-[var(--accent)]" : ""
              }`}
            >
              <span aria-hidden className="w-3.5 text-center text-[10px] text-[var(--ink-faint)]">
                {item.code.toUpperCase()}
              </span>
              {item.label}
            </button>
          ))}
          {/* Only on a phone, where the header has no room for it. */}
          <div className="mt-1 border-t border-[var(--rule)] pt-1 sm:hidden">
            <Link
              href="/about"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] hover:bg-[var(--surface)]"
            >
              <span aria-hidden className="w-3.5 text-center text-[var(--ink-faint)]">
                ?
              </span>
              {t("nav.about")}
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
