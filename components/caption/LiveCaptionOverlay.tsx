"use client";

import { useEffect, useState } from "react";
import { useUi } from "@/lib/i18n";
import { liveCaptionService, type CaptionSegment, type CaptureMode } from "@/lib/liveCaption";
import { AudioVisualizer } from "./AudioVisualizer";
import { CaptionSettings, captionThemeStyle, type CaptionSettingsState } from "./CaptionSettings";

interface LiveCaptionOverlayProps {
  isPlaying: boolean;
  /** Which source is actually live, so the badge never claims one it isn't. */
  mode: CaptureMode;
  onOpenTranscript: () => void;
  onClose: () => void;
  settings: CaptionSettingsState;
  onUpdateSettings: (settings: CaptionSettingsState) => void;
}

/**
 * The current caption line, sitting under the player.
 *
 * Styled with the app's own tokens rather than a fixed dark glass panel, so it
 * looks like part of Hörbar in both themes instead of a different product
 * pasted underneath the player card.
 */
export function LiveCaptionOverlay({
  isPlaying,
  mode,
  onOpenTranscript,
  onClose,
  settings,
  onUpdateSettings,
}: LiveCaptionOverlayProps) {
  const { t, lang } = useUi();
  const [currentCaption, setCurrentCaption] = useState<CaptionSegment | null>(null);
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [wordMeaning, setWordMeaning] = useState<string | null>(null);
  const [loadingWord, setLoadingWord] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    liveCaptionService.setTargetLang(lang === "vi" ? "vi" : "en");
    return liveCaptionService.onCaption(setCurrentCaption);
  }, [lang]);

  const lookupWord = async (rawWord: string) => {
    const clean = rawWord.replace(/[^a-zA-ZäöüÄÖÜß]/g, "");
    if (!clean || clean.length < 2) return;
    setSelectedWord(clean);
    setLoadingWord(true);
    setWordMeaning(null);
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: clean, lang: lang === "vi" ? "vi" : "en" }),
      });
      if (res.ok) {
        const data = (await res.json()) as { text?: string };
        setWordMeaning(data.text ?? clean);
      }
    } catch {
      setWordMeaning(null);
    } finally {
      setLoadingWord(false);
    }
  };

  const renderInteractiveWords = (sentence: string) =>
    sentence.split(/(\s+)/).map((token, i) => {
      if (/^\s+$/.test(token)) return <span key={i}>{token}</span>;
      return (
        <button
          key={i}
          type="button"
          onClick={() => void lookupWord(token)}
          className="rounded px-0.5 transition hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]"
          title={t("caption.explain")}
        >
          {token}
        </button>
      );
    });

  const displayText = currentCaption?.text || t("caption.waiting");
  const translationText = currentCaption?.translation;

  return (
    <div className="card bg-[var(--paper-raised)] border border-[var(--rule)] shadow-[0_12px_40px_rgba(0,0,0,0.18)] p-3.5 rounded-2xl" style={captionThemeStyle(settings.captionTheme)}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-[var(--rule)] pb-2 text-[11.5px] text-[var(--ink-faint)]">
        <div className="flex flex-wrap items-center gap-2">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
          <span className="font-medium text-[var(--ink)]">{t("caption.toggle")}</span>
          {/* The mode is whatever is actually true right now, never a fixed
              claim: earlier this always said "no mic needed" even while the
              microphone was the thing being listened to. */}
          {mode ? (
            <span className="chip text-[10px]">{mode === "tab" ? t("caption.modeTab") : t("caption.modeMic")}</span>
          ) : null}
          {currentCaption?.isFinal ? (
            <span className="chip chip-level text-[10px]">{t("caption.aiPolish")}</span>
          ) : null}
        </div>

        <div className="flex items-center gap-1">
          <AudioVisualizer isPlaying={isPlaying} />
          <button
            type="button"
            onClick={() => setShowSettings((v) => !v)}
            className="btn px-2 py-1 text-[11px]"
            aria-expanded={showSettings}
            title={t("caption.textSize")}
          >
            {settings.fontSize}px
          </button>
          <button type="button" onClick={onOpenTranscript} className="btn px-2.5 py-1 text-[11px]">
            {t("caption.transcript")}
          </button>
          <button type="button" onClick={onClose} className="icon-btn text-[15px]" aria-label={t("common.close")}>
            ×
          </button>
        </div>
      </div>

      {showSettings ? (
        <div className="mb-3 rounded-lg bg-[var(--surface)] p-2">
          <CaptionSettings settings={settings} onChange={onUpdateSettings} compact />
        </div>
      ) : null}

      <div className="min-h-[48px]">
        <p
          className="font-medium leading-relaxed text-[var(--ink)]"
          style={{ fontSize: `${settings.fontSize}px`, lineHeight: settings.lineHeight }}
        >
          {renderInteractiveWords(displayText)}
        </p>

        {settings.showTranslation && translationText ? (
          <p
            className="mt-1.5 text-[var(--ink-soft)]"
            style={{ fontSize: `${Math.max(12, Math.round(settings.fontSize * 0.78))}px` }}
          >
            {translationText}
          </p>
        ) : null}
      </div>

      {selectedWord ? (
        <div className="mt-2.5 flex items-center gap-2 rounded-lg bg-[var(--accent-soft)] px-3 py-1.5 text-[12px] text-[var(--ink)]">
          <span className="font-semibold text-[var(--accent)]">{selectedWord}:</span>
          {loadingWord ? (
            <span className="text-[var(--ink-faint)]">{t("caption.translating")}</span>
          ) : (
            <span>{wordMeaning || "-"}</span>
          )}
          <button
            type="button"
            onClick={() => setSelectedWord(null)}
            className="icon-btn ml-auto h-6 w-6 text-[13px]"
            aria-label={t("common.close")}
          >
            ×
          </button>
        </div>
      ) : null}
    </div>
  );
}
