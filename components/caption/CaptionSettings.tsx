"use client";

import { useUi } from "@/lib/i18n";

export interface CaptionSettingsState {
  fontSize: number; // in pixels, e.g. 14, 16, 18, 22, 26, 32
  lineHeight: number; // e.g. 1.4, 1.7, 2.0
  showTranslation: boolean;
  autoScroll: boolean;
}

const STORAGE_KEY = "hoerbar.caption.settings.v1";

export const DEFAULT_CAPTION_SETTINGS: CaptionSettingsState = {
  fontSize: 18,
  lineHeight: 1.6,
  showTranslation: true,
  autoScroll: true,
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
}

export function CaptionSettings({ settings, onChange, compact = false }: CaptionSettingsProps) {
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
    </div>
  );
}
