"use client";

import type { CSSProperties } from "react";
import { useUi } from "@/lib/i18n";
import {
  resolveTranslationLang,
  translationTargetsFor,
  type SpokenLang,
  type TranslationLangPreference,
} from "@/lib/language";

/**
 * A reading surface, independent of the site's own light/dark appearance.
 *
 * "modern" is the default and applies no override - it is whatever the site's
 * own theme already paints. The other three exist for reading comfort during
 * a long episode, the way an e-reader offers its own page colour separate
 * from the device's system theme.
 */
export type CaptionTheme = "modern" | "white" | "sepia" | "blackInk";

export const CAPTION_THEMES: CaptionTheme[] = ["modern", "white", "sepia", "blackInk"];

// Overrides the same custom properties the app's own theme sets, so every
// descendant styled with var(--paper-raised) / var(--ink) / etc. picks this
// up for free - no per-element restyling needed.
export const CAPTION_THEME_VARS: Record<CaptionTheme, Record<string, string>> = {
  modern: {},
  white: {
    "--paper-raised": "#ffffff",
    "--surface": "#f4f4f4",
    "--ink": "#141414",
    "--ink-soft": "#55544f",
    "--ink-faint": "#82817b",
    "--rule": "#e4e2dd",
  },
  sepia: {
    "--paper-raised": "#f4ecd8",
    "--surface": "#ece0c4",
    "--ink": "#3a2f1f",
    "--ink-soft": "#6b5c40",
    "--ink-faint": "#8a7a5c",
    "--rule": "#e0d3ae",
  },
  blackInk: {
    "--paper-raised": "#000000",
    "--surface": "#121212",
    "--ink": "#f2f2f2",
    "--ink-soft": "#b3b2ad",
    "--ink-faint": "#82817b",
    "--rule": "#2a2a2a",
  },
};

export function captionThemeStyle(theme: CaptionTheme): CSSProperties {
  return CAPTION_THEME_VARS[theme] as CSSProperties;
}

const CAPTION_THEME_LABEL: Record<
  CaptionTheme,
  "caption.themeModern" | "caption.themeWhite" | "caption.themeSepia" | "caption.themeBlackInk"
> = {
  modern: "caption.themeModern",
  white: "caption.themeWhite",
  sepia: "caption.themeSepia",
  blackInk: "caption.themeBlackInk",
};

// A small swatch preview for the picker button itself - independent of
// CAPTION_THEME_VARS, which restyles the whole caption surface once applied.
const CAPTION_THEME_SWATCH: Record<CaptionTheme, CSSProperties> = {
  modern: { background: "linear-gradient(135deg, var(--paper-raised) 50%, var(--accent) 50%)" },
  white: { background: "#ffffff", boxShadow: "inset 0 0 0 1px #e4e2dd" },
  sepia: { background: "#f4ecd8" },
  blackInk: { background: "#000000" },
};

export type FontFamily = "sans" | "serif" | "mono" | "rounded";

export const FONT_FAMILIES: Record<FontFamily, string> = {
  sans: "var(--font-body)",
  serif: "ui-serif, Georgia, Cambria, 'Times New Roman', Times, serif",
  mono: "var(--font-mono)",
  rounded: "ui-rounded, 'Hiragino Maru Gothic ProN', Quicksand, Comfortaa, Manjari, 'Arial Rounded MT', 'Arial Rounded MT Bold', Calibri, source-sans-pro, sans-serif",
};

export const FONT_LABELS: Record<FontFamily, string> = {
  sans: "Modern",
  serif: "Classic",
  mono: "Typewriter",
  rounded: "Rounded",
};

export interface CaptionSettingsState {
  fontSize: number; // in pixels, e.g. 14, 16, 18, 22, 26, 32
  lineHeight: number; // e.g. 1.4, 1.7, 2.0
  fontFamily: FontFamily;
  showTranslation: boolean;
  autoScroll: boolean;
  captionTheme: CaptionTheme;
  /** Fades the floating caption bar after a few quiet seconds. */
  autoHide: boolean;
  /** Which of the episode's two translated languages to show when
   * `showTranslation` is on. "auto" takes whichever `translationTargetsFor`
   * lists first for the episode's own spoken language. */
  translationLang: TranslationLangPreference;
  translationVisibility: "all" | "active";
  translationEngine: "auto" | "parallel" | "gemini" | "groq" | "deepseek" | "anthropic" | "openai" | "openrouter";
}

const STORAGE_KEY = "hoerbar.caption.settings.v1";

export const DEFAULT_CAPTION_SETTINGS: CaptionSettingsState = {
  fontSize: 18,
  lineHeight: 1.6,
  fontFamily: "sans",
  showTranslation: true,
  autoScroll: true,
  captionTheme: "modern",
  autoHide: true,
  translationLang: "auto",
  translationVisibility: "all",
  translationEngine: "auto",
};

export function loadCaptionSettings(): CaptionSettingsState {
  if (typeof window === "undefined") return DEFAULT_CAPTION_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_CAPTION_SETTINGS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_CAPTION_SETTINGS;
}

export function saveCaptionSettings(settings: CaptionSettingsState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {}
}

interface CaptionSettingsProps {
  settings: CaptionSettingsState;
  onChange: (updated: CaptionSettingsState) => void;
  compact?: boolean;
  /** The episode's spoken language. Only when this is known can the two
   * valid translation targets be worked out, so the language picker chips
   * render only where a caller passes it (the full-screen reader, so far). */
  sourceLang?: SpokenLang;
  /**
   * Manual correction, in seconds, for a transcript timed against the
   * ad-free master while the actual stream has a dynamically inserted,
   * country-varying ad break spliced in ahead of it. Rendered only where a
   * caller tracks one for the current episode (the full-screen reader).
   */
  syncOffsetSec?: number;
  onSyncOffsetChange?: (offsetSec: number) => void;
}

const LANG_LABEL: Record<"de" | "en" | "vi", "caption.langDe" | "caption.langEn" | "caption.langVi"> = {
  de: "caption.langDe",
  en: "caption.langEn",
  vi: "caption.langVi",
};

export function CaptionSettings({
  settings,
  onChange,
  compact = false,
  sourceLang,
  syncOffsetSec,
  onSyncOffsetChange,
}: CaptionSettingsProps) {
  const { t } = useUi();

  const update = (partial: Partial<CaptionSettingsState>) => {
    const next = { ...settings, ...partial };
    onChange(next);
    saveCaptionSettings(next);
  };

  const decreaseFontSize = () => {
    const nextSize = Math.max(13, settings.fontSize - 2);
    update({ fontSize: nextSize });
  };

  const increaseFontSize = () => {
    const nextSize = Math.min(34, settings.fontSize + 2);
    update({ fontSize: nextSize });
  };

  return (
    <div className={`flex flex-wrap items-center gap-2 ${compact ? "text-[12px]" : "text-[13px]"}`}>
      {/* Zoom / Text size controls */}
      <div className="flex items-center rounded-lg border border-[var(--rule)] bg-[var(--surface)] p-0.5">
        <button
          type="button"
          onClick={decreaseFontSize}
          className="rounded px-2 py-1 font-bold transition hover:bg-[var(--paper-raised)]"
          title={t("caption.zoomOut")}
          aria-label={t("caption.zoomOut")}
        >
          A-
        </button>
        <span className="px-1.5 text-[11px] font-mono font-medium text-[var(--ink-soft)]">
          {settings.fontSize}px
        </span>
        <button
          type="button"
          onClick={increaseFontSize}
          className="rounded px-2 py-1 font-bold transition hover:bg-[var(--paper-raised)]"
          title={t("caption.zoomIn")}
          aria-label={t("caption.zoomIn")}
        >
          A+
        </button>
      </div>

      <div className="flex items-center gap-1 rounded-lg border border-[var(--rule)] bg-[var(--surface)] p-0.5">
        {(Object.keys(FONT_FAMILIES) as FontFamily[]).map((family) => {
          const active = settings.fontFamily === family;
          return (
            <button
              key={family}
              type="button"
              onClick={() => update({ fontFamily: family })}
              aria-pressed={active}
              className={`rounded px-2.5 py-1 text-[11.5px] transition ${
                active
                  ? "bg-[var(--ink)] text-[var(--paper-raised)] font-medium"
                  : "text-[var(--ink-soft)] hover:bg-[var(--paper-raised)]"
              }`}
              style={{ fontFamily: FONT_FAMILIES[family] }}
              title={FONT_LABELS[family]}
            >
              {FONT_LABELS[family]}
            </button>
          );
        })}
      </div>

      {/* Bilingual translation toggle */}
      <button
        type="button"
        onClick={() => update({ showTranslation: !settings.showTranslation })}
        className={`btn px-2.5 py-1 text-[11.5px] ${
          settings.showTranslation
            ? "border-[var(--accent)] text-[var(--accent)] font-medium"
            : "text-[var(--ink-faint)]"
        }`}
        title={t("caption.bilingual")}
      >
        <span>{t("caption.bilingual")}</span>
      </button>

      {/* Which of the two translated languages to show alongside the
          original - only meaningful once a source language narrows it to
          exactly two candidates. */}
      {sourceLang && settings.showTranslation ? (
        <div className="flex items-center gap-1 rounded-lg border border-[var(--rule)] bg-[var(--surface)] p-0.5">
          {translationTargetsFor(sourceLang).map((lang) => {
            const active = resolveTranslationLang(sourceLang, settings.translationLang) === lang;
            return (
              <button
                key={lang}
                type="button"
                onClick={() => update({ translationLang: lang })}
                aria-pressed={active}
                title={t("caption.translateTo", { lang: t(LANG_LABEL[lang]) })}
                className={`rounded px-2 py-1 text-[10.5px] font-semibold uppercase tracking-wide transition ${
                  active
                    ? "bg-[var(--accent)] text-[var(--paper)]"
                    : "text-[var(--ink-faint)] hover:bg-[var(--paper-raised)]"
                }`}
              >
                {lang}
              </button>
            );
          })}
        </div>
      ) : null}

      {/* Translation visibility & Engine */}
      {settings.showTranslation && (
        <div className="flex items-center gap-2">
          <select
            value={settings.translationVisibility}
            onChange={(e) => update({ translationVisibility: e.target.value as "all" | "active" })}
            className="rounded border border-[var(--rule)] bg-[var(--surface)] px-1.5 py-1 text-[11px] text-[var(--ink)] outline-none cursor-pointer"
            title="Translation visibility"
          >
            <option value="all">Dịch tất cả (All)</option>
            <option value="active">Chỉ dịch dòng hiện tại (Active)</option>
          </select>
          <select
            value={settings.translationEngine}
            onChange={(e) => update({ translationEngine: e.target.value as any })}
            className="rounded border border-[var(--rule)] bg-[var(--surface)] px-1.5 py-1 text-[11px] text-[var(--ink)] outline-none cursor-pointer"
            title="AI Translation Engine"
          >
            <option value="auto">Auto Engine</option>
            <option value="parallel">⚡ Song song (Parallel AI)</option>
            <option value="gemini">Google Gemini</option>
            <option value="groq">Groq (Llama 3.3)</option>
            <option value="deepseek">DeepSeek</option>
            <option value="anthropic">Claude</option>
            <option value="openai">GPT-4o</option>
          </select>
        </div>
      )}

      {/* Auto-scroll toggle - off lets someone read back through past lines
          (or ahead) without the view snapping back to the current one on
          every segment change. */}
      <button
        type="button"
        onClick={() => update({ autoScroll: !settings.autoScroll })}
        className={`btn px-2.5 py-1 text-[11.5px] ${
          settings.autoScroll ? "border-[var(--accent)] text-[var(--accent)] font-medium" : "text-[var(--ink-faint)]"
        }`}
        title={t("caption.autoScroll")}
      >
        <span>{t("caption.autoScroll")}</span>
      </button>

      {/* Auto-hide toggle for the floating caption bar */}
      <button
        type="button"
        onClick={() => update({ autoHide: !settings.autoHide })}
        className={`btn px-2.5 py-1 text-[11.5px] ${
          settings.autoHide ? "border-[var(--accent)] text-[var(--accent)] font-medium" : "text-[var(--ink-faint)]"
        }`}
        title={t("caption.autoHide")}
      >
        <span>{t("caption.autoHide")}</span>
      </button>

      {/* Reading surface swatches */}
      <div className="flex items-center gap-1 rounded-lg border border-[var(--rule)] bg-[var(--surface)] p-0.5">
        {CAPTION_THEMES.map((themeOption) => (
          <button
            key={themeOption}
            type="button"
            onClick={() => update({ captionTheme: themeOption })}
            title={t(CAPTION_THEME_LABEL[themeOption])}
            aria-label={t(CAPTION_THEME_LABEL[themeOption])}
            aria-pressed={settings.captionTheme === themeOption}
            className={`grid h-6 w-6 place-items-center rounded border transition ${
              settings.captionTheme === themeOption ? "border-[var(--accent)]" : "border-transparent"
            }`}
            style={CAPTION_THEME_SWATCH[themeOption]}
          >
            <span className="sr-only">{t(CAPTION_THEME_LABEL[themeOption])}</span>
          </button>
        ))}
      </div>

      {/* Manual correction for a country-inserted ad break that has pushed
          the real audio out of step with the transcript's own timestamps -
          there is no way to detect the ad itself, so this nudges by hand. */}
      {onSyncOffsetChange ? (
        <div className="flex items-center rounded-lg border border-[var(--rule)] bg-[var(--surface)] p-0.5">
          <span className="pl-1.5 pr-0.5 text-[10px] uppercase tracking-wide text-[var(--ink-faint)]">
            {t("caption.sync")}
          </span>
          <button
            type="button"
            onClick={() => onSyncOffsetChange((syncOffsetSec ?? 0) - 1)}
            className="rounded px-2 py-1 font-bold transition hover:bg-[var(--paper-raised)]"
            title={t("caption.syncEarlier")}
            aria-label={t("caption.syncEarlier")}
          >
            −
          </button>
          <button
            type="button"
            onClick={() => onSyncOffsetChange(0)}
            className="min-w-[34px] px-1 text-center font-mono text-[11px] font-medium text-[var(--ink-soft)]"
            title={t("caption.syncReset")}
          >
            {(syncOffsetSec ?? 0) > 0 ? "+" : ""}
            {syncOffsetSec ?? 0}s
          </button>
          <button
            type="button"
            onClick={() => onSyncOffsetChange((syncOffsetSec ?? 0) + 1)}
            className="rounded px-2 py-1 font-bold transition hover:bg-[var(--paper-raised)]"
            title={t("caption.syncLater")}
            aria-label={t("caption.syncLater")}
          >
            +
          </button>
        </div>
      ) : null}
    </div>
  );
}
