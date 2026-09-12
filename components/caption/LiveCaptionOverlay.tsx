"use client";

import { useEffect, useState } from "react";
import { useUi } from "@/lib/i18n";
import {
  liveCaptionService,
  type CaptionSegment,
} from "@/lib/liveCaption";
import { AudioVisualizer } from "./AudioVisualizer";
import {
  CaptionSettings,
  type CaptionSettingsState,
} from "./CaptionSettings";

interface LiveCaptionOverlayProps {
  isPlaying: boolean;
  onOpenTranscript: () => void;
  onClose: () => void;
  settings: CaptionSettingsState;
  onUpdateSettings: (settings: CaptionSettingsState) => void;
}

export function LiveCaptionOverlay({
  isPlaying,
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
    const unsub = liveCaptionService.onCaption((segment) => {
      setCurrentCaption(segment);
    });
    return unsub;
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

  // Split German sentence into clickable words
  const renderInteractiveWords = (sentence: string) => {
    const tokens = sentence.split(/(\s+)/);
    return tokens.map((token, i) => {
      if (/^\s+$/.test(token)) {
        return <span key={i}>{token}</span>;
      }
      return (
        <button
          key={i}
          type="button"
          onClick={() => void lookupWord(token)}
          className="inline-block rounded-xs hover:bg-[var(--accent)] hover:text-white px-0.5 transition cursor-pointer"
          title="Click to translate this German word"
        >
          {token}
        </button>
      );
    });
  };

  const displayText = currentCaption?.text || t("caption.waiting");
  const translationText = currentCaption?.translation;

  return (
    <div
      className={`relative z-40 my-3 w-full rounded-2xl border border-white/20 bg-black/80 p-4 text-white shadow-2xl backdrop-blur-xl transition-all duration-200 dark:border-white/10 dark:bg-black/90 ${
        settings.viewMode === "theater" ? "fixed inset-x-4 bottom-24 max-w-4xl mx-auto" : ""
      }`}
    >
      {/* Header bar */}
      <div className="mb-2 flex items-center justify-between border-b border-white/10 pb-2 text-[11.5px] text-zinc-300">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="font-semibold uppercase tracking-wider text-emerald-400">
            {t("caption.toggle")}
          </span>
          <span className="hidden sm:inline-block rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-zinc-400">
            {t("caption.noMic")}
          </span>
          {currentCaption?.isFinal && (
            <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
              ✨ {t("caption.aiPolish")}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <AudioVisualizer isPlaying={isPlaying} />

          <button
            type="button"
            onClick={() => setShowSettings((v) => !v)}
            className="rounded px-2 py-1 text-zinc-300 hover:bg-white/10 hover:text-white transition"
            title={t("caption.textSize")}
          >
            ⚙️ {settings.fontSize}px
          </button>

          <button
            type="button"
            onClick={onOpenTranscript}
            className="rounded bg-white/15 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-white/25 transition flex items-center gap-1"
            title={t("caption.transcript")}
          >
            <span>📜 {t("caption.transcript")}</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-zinc-400 hover:bg-white/10 hover:text-white transition"
            aria-label={t("common.close")}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Settings drawer if toggled */}
      {showSettings && (
        <div className="mb-3 rounded-xl bg-white/10 p-2.5 backdrop-blur-md">
          <CaptionSettings settings={settings} onChange={onUpdateSettings} compact />
        </div>
      )}

      {/* Live caption text body */}
      <div className="min-h-[48px] transition-all">
        <p
          className="font-medium leading-relaxed tracking-wide text-zinc-50 select-text"
          style={{
            fontSize: `${settings.fontSize}px`,
            lineHeight: settings.lineHeight,
          }}
        >
          {renderInteractiveWords(displayText)}
        </p>

        {settings.showTranslation && translationText && (
          <p
            className="mt-1.5 font-normal text-amber-200/90 transition-opacity select-text"
            style={{
              fontSize: `${Math.max(12, Math.round(settings.fontSize * 0.78))}px`,
            }}
          >
            {translationText}
          </p>
        )}
      </div>

      {/* Selected word popup */}
      {selectedWord && (
        <div className="mt-2.5 flex items-center gap-2 rounded-lg bg-white/15 px-3 py-1.5 text-[12px] text-white">
          <span className="font-semibold text-amber-300">{selectedWord}:</span>
          {loadingWord ? (
            <span className="text-zinc-300 animate-pulse">{t("caption.translating")}</span>
          ) : (
            <span className="font-medium text-zinc-100">{wordMeaning || "N/A"}</span>
          )}
          <button
            type="button"
            onClick={() => setSelectedWord(null)}
            className="ml-auto text-zinc-400 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
