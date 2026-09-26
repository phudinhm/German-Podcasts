"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { UI_LANGS, useUi } from "@/lib/i18n";
import { useTheme, type AccentColor, type Theme } from "@/lib/theme";
import { useTransitionStage } from "@/lib/useTransitionStage";
import { listVocabulary } from "@/lib/vocabulary";
import { useZoom } from "@/lib/zoom";
import { VocabularyModal } from "./caption/VocabularyModal";

const THEME_GLYPH: Record<"light" | "dark", string> = { light: "☀", dark: "☾" };

const THEME_OPTIONS: Array<{
  value: Theme;
  label: string;
  swatch: string;
  accentDot: string;
  group: "auto" | "light" | "dark";
}> = [
  { value: "system", label: "Auto (System)", swatch: "#71717a", accentDot: "#fbbf24", group: "auto" },
  // 8 Light Themes
  { value: "light", label: "Light Paper", swatch: "#fbfaf9", accentDot: "#b45309", group: "light" },
  { value: "daylight", label: "Pure Daylight", swatch: "#f8fafc", accentDot: "#0284c7", group: "light" },
  { value: "sepia", label: "Warm Sepia", swatch: "#f5eee2", accentDot: "#d97706", group: "light" },
  { value: "sakura", label: "Sakura Pink", swatch: "#fff5f7", accentDot: "#e11d48", group: "light" },
  { value: "matcha", label: "Matcha Mint", swatch: "#f2fbf7", accentDot: "#059669", group: "light" },
  { value: "lavender", label: "Lavender Mist", swatch: "#f7f5ff", accentDot: "#7c3aed", group: "light" },
  { value: "sky", label: "Nordic Ice", swatch: "#f0f8ff", accentDot: "#0284c7", group: "light" },
  { value: "peach", label: "Sunset Peach", swatch: "#fff7ed", accentDot: "#ea580c", group: "light" },
  // 8 Dark Themes
  { value: "dark", label: "Amber Dark", swatch: "#17191d", accentDot: "#fbbf24", group: "dark" },
  { value: "midnight", label: "Midnight OLED", swatch: "#000000", accentDot: "#f59e0b", group: "dark" },
  { value: "ocean", label: "Nordic Ocean", swatch: "#071321", accentDot: "#38bdf8", group: "dark" },
  { value: "forest", label: "Emerald Forest", swatch: "#071912", accentDot: "#34d399", group: "dark" },
  { value: "rose", label: "Sunset Rose", swatch: "#1a0911", accentDot: "#fb7185", group: "dark" },
  { value: "amethyst", label: "Royal Amethyst", swatch: "#110820", accentDot: "#c084fc", group: "dark" },
  { value: "espresso", label: "Mocha Espresso", swatch: "#16100c", accentDot: "#f59e0b", group: "dark" },
  { value: "cyber", label: "Cyber Neon", swatch: "#090b1a", accentDot: "#22d3ee", group: "dark" },
];

const ACCENT_OPTIONS: Array<{
  value: AccentColor;
  label: string;
  swatch: string;
}> = [
  { value: "amber", label: "Amber", swatch: "#e0870f" },
  { value: "orange", label: "Orange", swatch: "#ea580c" },
  { value: "gold", label: "Gold", swatch: "#b6911f" },
  { value: "green", label: "Green", swatch: "#5f8f3e" },
  { value: "teal", label: "Teal", swatch: "#1f9188" },
  { value: "cyan", label: "Cyan", swatch: "#0891b2" },
  { value: "blue", label: "Blue", swatch: "#2f83b8" },
  { value: "indigo", label: "Indigo", swatch: "#5c6bc4" },
  { value: "purple", label: "Purple", swatch: "#8659b3" },
  { value: "rose", label: "Rose", swatch: "#c1466a" },
];

export function SettingsMenu() {
  const { t, lang, setLang } = useUi();
  const { theme, resolved, setTheme, accent, setAccent } = useTheme();
  const { zoom, zoomIn, zoomOut, resetZoom } = useZoom();
  const [open, setOpen] = useState(false);
  const { mounted, entered } = useTransitionStage(open, "--dropdown-close-dur", 150);
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

      {mounted ? (
        <div
          role="menu"
          data-origin="top-right"
          aria-hidden={!open}
          className={`t-dropdown card absolute right-0 top-full z-50 mt-2 w-[300px] max-h-[82vh] overflow-y-auto p-3 bg-[var(--paper-raised)] border border-[var(--rule)] shadow-2xl ${
            entered ? "is-open" : open ? "" : "is-closing"
          }`}
        >
          <p className="px-1.5 pb-1.5 pt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-faint)]">
            🎨 {t("theme.title")} (16+ Chủ đề màu)
          </p>

          <p className="px-1.5 pb-1 pt-0.5 text-[10px] font-semibold text-[var(--ink-soft)]">
            ☀️ Giao diện Sáng (Light)
          </p>
          <div className="grid grid-cols-2 gap-1 mb-2">
            {THEME_OPTIONS.filter((o) => o.group === "light" || o.group === "auto").map((option) => {
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
                    className="relative flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-black/20 shadow-2xs"
                    style={{ background: option.swatch }}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: option.accentDot }}
                    />
                  </span>
                  <span className="truncate">{option.label}</span>
                </button>
              );
            })}
          </div>

          <p className="px-1.5 pb-1 pt-1 text-[10px] font-semibold text-[var(--ink-soft)]">
            🌙 Giao diện Tối (Dark)
          </p>
          <div className="grid grid-cols-2 gap-1">
            {THEME_OPTIONS.filter((o) => o.group === "dark").map((option) => {
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
                    className="relative flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-white/25 shadow-2xs"
                    style={{ background: option.swatch }}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: option.accentDot }}
                    />
                  </span>
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
                title={option.label}
                aria-label={option.label}
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
