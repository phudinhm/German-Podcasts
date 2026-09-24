"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { UI_LANGS, useUi } from "@/lib/i18n";
import { useTheme, type AccentColor, type Theme } from "@/lib/theme";
import { listVocabulary } from "@/lib/vocabulary";
import { useZoom } from "@/lib/zoom";
import { VocabularyModal } from "./caption/VocabularyModal";

const THEME_GLYPH: Record<"light" | "dark", string> = { light: "☀", dark: "☾" };

const THEME_OPTIONS: Array<{
  value: Theme;
  label: string;
  swatch: string;
  glyph: string;
}> = [
  { value: "system", label: "Auto (System)", swatch: "#71717a", glyph: "◐" },
  { value: "light", label: "Light Paper", swatch: "#fbfaf9", glyph: "☀" },
  { value: "dark", label: "Dark Slate", swatch: "#17191d", glyph: "☾" },
  { value: "midnight", label: "Midnight OLED", swatch: "#000000", glyph: "★" },
  { value: "sepia", label: "Warm Sepia", swatch: "#e6d5b8", glyph: "📖" },
  { value: "ocean", label: "Nordic Ocean", swatch: "#0ea5e9", glyph: "🌊" },
  { value: "forest", label: "Emerald Matcha", swatch: "#10b981", glyph: "🌲" },
  { value: "rose", label: "Sunset Rose", swatch: "#f43f5e", glyph: "🌹" },
];

const ACCENT_OPTIONS: Array<{
  value: AccentColor;
  key:
    | "theme.accentAmber"
    | "theme.accentBlue"
    | "theme.accentTeal"
    | "theme.accentGreen"
    | "theme.accentIndigo"
    | "theme.accentPurple"
    | "theme.accentRose"
    | "theme.accentGold";
  swatch: string;
}> = [
  { value: "amber", key: "theme.accentAmber", swatch: "#e0870f" },
  { value: "blue", key: "theme.accentBlue", swatch: "#2f83b8" },
  { value: "teal", key: "theme.accentTeal", swatch: "#1f9188" },
  { value: "green", key: "theme.accentGreen", swatch: "#5f8f3e" },
  { value: "indigo", key: "theme.accentIndigo", swatch: "#5c6bc4" },
  { value: "purple", key: "theme.accentPurple", swatch: "#8659b3" },
  { value: "rose", key: "theme.accentRose", swatch: "#c1466a" },
  { value: "gold", key: "theme.accentGold", swatch: "#b6911f" },
];

export function SettingsMenu() {
  const { t, lang, setLang } = useUi();
  const { theme, resolved, setTheme, accent, setAccent } = useTheme();
  const { zoom, zoomIn, zoomOut, resetZoom } = useZoom();
  const [open, setOpen] = useState(false);
  const [vocabOpen, setVocabOpen] = useState(false);
  const [vocabCount, setVocabCount] = useState(0);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const syncVocab = () => setVocabCount(listVocabulary().length);
    syncVocab();
    window.addEventListener("hoerbar:vocab-changed", syncVocab);
    return () => window.removeEventListener("hoerbar:vocab-changed", syncVocab);
  }, []);

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
    <div className="relative flex items-center gap-1.5" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setVocabOpen(true)}
        className="btn gap-1 px-2.5 py-1 text-[12px]"
        title="Sổ từ vựng đã lưu"
      >
        <span>⭐</span>
        <span className="hidden md:inline">Từ vựng</span>
        {vocabCount > 0 && (
          <span className="rounded-full bg-[var(--accent-soft)] px-1.5 text-[10.5px] font-bold text-[var(--accent)]">
            {vocabCount}
          </span>
        )}
      </button>

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
        <span className="hidden sm:inline">{lang.toUpperCase()}</span>
      </button>

      {open ? (
        <div
          role="menu"
          className="card absolute right-0 top-full z-50 mt-2 w-[260px] overflow-hidden p-2.5 bg-[var(--paper-raised)] border border-[var(--rule)] shadow-2xl"
        >
          <p className="px-1.5 pb-1.5 pt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-faint)]">
            🎨 {t("theme.title")} (8 Themes)
          </p>
          <div className="grid grid-cols-2 gap-1">
            {THEME_OPTIONS.map((option) => {
              const active = theme === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  onClick={() => setTheme(option.value)}
                  className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-[11.5px] transition ${
                    active
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] font-semibold text-[var(--accent)]"
                      : "border-transparent hover:bg-[var(--surface)] text-[var(--ink)]"
                  }`}
                >
                  <span
                    aria-hidden
                    className="h-3.5 w-3.5 shrink-0 rounded-full border border-[var(--rule)]"
                    style={{ background: option.swatch }}
                  />
                  <span className="truncate">{option.label}</span>
                </button>
              );
            })}
          </div>

          <p className="mt-2 border-t border-[var(--rule)] px-1.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-faint)]">
            {t("theme.accent")}
          </p>
          <div className="flex flex-wrap items-center gap-1.5 px-1.5 py-1">
            {ACCENT_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="menuitemradio"
                aria-checked={accent === option.value}
                onClick={() => setAccent(option.value)}
                title={t(option.key)}
                aria-label={t(option.key)}
                className={`grid h-6 w-6 place-items-center rounded-full border transition ${
                  accent === option.value
                    ? "border-[var(--ink)]"
                    : "border-transparent hover:border-[var(--rule)]"
                }`}
              >
                <span
                  aria-hidden
                  className="h-4 w-4 rounded-full"
                  style={{ background: option.swatch }}
                />
              </button>
            ))}
          </div>

          <p className="mt-1.5 border-t border-[var(--rule)] px-1.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-faint)]">
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

          <p className="mt-1 border-t border-[var(--rule)] px-1.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-faint)]">
            {t("theme.zoom")}
          </p>
          <div className="flex items-center justify-between px-1.5 py-1">
            <div className="flex items-center rounded-lg border border-[var(--rule)] bg-[var(--surface)] p-0.5 text-[12px]">
              <button
                type="button"
                onClick={zoomOut}
                className="rounded px-2 py-0.5 font-bold hover:bg-[var(--paper-raised)] text-[var(--ink-soft)] active:scale-95"
                title={t("theme.zoomOut")}
              >
                -
              </button>
              <span className="px-2 font-mono text-[11px] font-semibold text-[var(--ink)]">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                onClick={zoomIn}
                className="rounded px-2 py-0.5 font-bold hover:bg-[var(--paper-raised)] text-[var(--ink-soft)] active:scale-95"
                title={t("theme.zoomIn")}
              >
                +
              </button>
            </div>
            {zoom !== 1.0 ? (
              <button
                type="button"
                onClick={resetZoom}
                className="text-[11px] font-medium text-[var(--accent)] hover:underline"
              >
                {t("theme.zoomReset")}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <VocabularyModal open={vocabOpen} onClose={() => setVocabOpen(false)} />
    </div>
  );
}
