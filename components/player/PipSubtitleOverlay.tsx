"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useUi } from "@/lib/i18n";
import { liveCaptionService, type CaptionSegment } from "@/lib/liveCaption";
import { normalizeVocabWord, saveVocabularyWord, isWordSaved } from "@/lib/vocabulary";

interface PipSubtitleOverlayProps {
  /** True when the video is in Picture-in-Picture mode (video track, not docked in stage, not minimized). */
  active: boolean;
  /** Ref to the active <video> element. */
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** Optional DAI offset applied to transcripts. */
  transcriptOffsetSec?: number;
  /** Notifies whether the center subtitle overlay is active/visible. */
  onVisibleChange?: (active: boolean) => void;
  /** Whether the floating PiP video window is positioned at the top or bottom corner. */
  pipPosition?: "top" | "bottom";
}

export function PipSubtitleOverlay({
  active,
  videoRef,
  transcriptOffsetSec = 0,
  onVisibleChange,
  pipPosition = "top",
}: PipSubtitleOverlayProps) {
  const { t, lang } = useUi();
  const targetTranslateLang = lang === "vi" ? "vi" : lang === "de" ? "de" : "en";

  const [isPlaying, setIsPlaying] = useState(false);
  const [activeSegment, setActiveSegment] = useState<CaptionSegment | null>(null);
  const [transcriptList, setTranscriptList] = useState<CaptionSegment[]>([]);
  const [manuallyDismissed, setManuallyDismissed] = useState(false);

  // Word lookup popup state
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [wordMeaning, setWordMeaning] = useState<string | null>(null);
  const [loadingWord, setLoadingWord] = useState(false);
  const [saved, setSaved] = useState(false);

  // Reset manual dismissal when video changes
  useEffect(() => {
    setManuallyDismissed(false);
    setSelectedWord(null);
  }, [active]);

  const isPipSubActive = Boolean(active && !manuallyDismissed);

  useEffect(() => {
    onVisibleChange?.(isPipSubActive);
    return () => {
      onVisibleChange?.(false);
    };
  }, [isPipSubActive, onVisibleChange]);

  // Subscribe to liveCaptionService
  useEffect(() => {
    setTranscriptList(liveCaptionService.getTranscript());
    const unsubCap = liveCaptionService.onCaption((seg) => {
      setActiveSegment(seg);
    });
    const unsubTrans = liveCaptionService.onTranscript((items) => {
      setTranscriptList(items);
    });
    return () => {
      unsubCap();
      unsubTrans();
    };
  }, []);

  // Sync isPlaying and timeupdate directly from the video element
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const updatePlayState = () => {
      const playing = !video.paused && !video.ended && video.readyState >= 2;
      setIsPlaying(playing);
    };

    const updateSubtitleTime = () => {
      if (video.paused || video.ended) {
        setIsPlaying(false);
        return;
      }
      setIsPlaying(true);

      const nowSec = (video.currentTime || 0) - transcriptOffsetSec;
      const list = transcriptList.length > 0 ? transcriptList : liveCaptionService.getTranscript();
      if (list.length === 0) return;

      // Find matching segment
      let found: CaptionSegment | null = null;
      for (let i = 0; i < list.length; i++) {
        const s = list[i];
        const next = list[i + 1];
        if (nowSec >= s.start - 0.25) {
          if (nowSec <= s.end + 0.6) {
            found = s;
            break;
          }
          // Hold the current subtitle slightly if next segment hasn't started yet
          if (next && nowSec < next.start && nowSec <= s.end + 1.8) {
            found = s;
            break;
          }
        }
      }

      if (found) {
        setActiveSegment(found);
      }
    };

    updatePlayState();

    video.addEventListener("play", updatePlayState);
    video.addEventListener("playing", updatePlayState);
    video.addEventListener("pause", updatePlayState);
    video.addEventListener("ended", updatePlayState);
    video.addEventListener("timeupdate", updateSubtitleTime);

    return () => {
      video.removeEventListener("play", updatePlayState);
      video.removeEventListener("playing", updatePlayState);
      video.removeEventListener("pause", updatePlayState);
      video.removeEventListener("ended", updatePlayState);
      video.removeEventListener("timeupdate", updateSubtitleTime);
    };
  }, [videoRef, transcriptOffsetSec, transcriptList]);

  // Dictionary lookup for clicked German words
  const handleWordClick = useCallback(
    async (rawWord: string) => {
      const clean = rawWord.replace(/[^a-zA-ZäöüÄÖÜß]/g, "");
      if (!clean || clean.length < 2) return;

      setSelectedWord(clean);
      const isAlreadySaved = Boolean(isWordSaved(clean));
      setSaved(isAlreadySaved);
      setLoadingWord(true);
      setWordMeaning(null);

      try {
        const res = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: clean, lang: targetTranslateLang }),
        });
        if (res.ok) {
          const data = (await res.json()) as { text?: string };
          setWordMeaning(data.text ?? clean);
        } else {
          setWordMeaning(clean);
        }
      } catch {
        setWordMeaning(clean);
      } finally {
        setLoadingWord(false);
      }
    },
    [targetTranslateLang],
  );

  const toggleSaveWord = useCallback(() => {
    if (!selectedWord) return;
    const meaning = wordMeaning || selectedWord;
    saveVocabularyWord({
      word: selectedWord,
      meaning,
      contextSentence: activeSegment?.text,
      contextTranslation:
        activeSegment?.translations?.[targetTranslateLang] ??
        activeSegment?.translation ??
        activeSegment?.translations?.vi ??
        activeSegment?.translations?.en,
    });
    setSaved(true);
  }, [selectedWord, wordMeaning, activeSegment, targetTranslateLang]);

  // "ngừng play thì tắt đi": only show when active, video is actively playing, and not manually dismissed
  if (!active || !isPlaying || manuallyDismissed) {
    return null;
  }

  // Segment text and translation
  const germanText = activeSegment?.text?.trim();
  const translationText =
    activeSegment?.translations?.[targetTranslateLang] ??
    activeSegment?.translation ??
    activeSegment?.translations?.vi ??
    activeSegment?.translations?.en;

  if (!germanText) {
    return null;
  }

  const isPipBottom = pipPosition === "bottom";

  return (
    <div
      aria-live="polite"
      className={`fixed left-1/2 -translate-x-1/2 z-[70] w-[92vw] max-w-lg sm:max-w-2xl pointer-events-none transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] animate-fade-in ${
        isPipBottom
          ? "bottom-[calc(236px+env(safe-area-inset-bottom,10px))] sm:bottom-24"
          : "bottom-[calc(126px+env(safe-area-inset-bottom,10px))] sm:bottom-20"
      }`}
    >
      <div className="pointer-events-auto relative mx-auto flex flex-col items-center justify-center rounded-2xl border border-white/20 bg-black/85 px-3.5 sm:px-6 py-2 sm:py-3 shadow-[0_16px_48px_rgba(0,0,0,0.65)] ring-1 ring-white/10 backdrop-blur-xl">
        {/* Dismiss button */}
        <button
          type="button"
          onClick={() => setManuallyDismissed(true)}
          className="absolute right-2 top-2 h-6 w-6 rounded-full text-white/50 hover:text-white hover:bg-white/10 active:scale-90 transition flex items-center justify-center text-xs"
          title="Tạm ẩn phụ đề PiP"
          aria-label="Tạm ẩn phụ đề PiP"
        >
          ✕
        </button>

        {/* Header Tag / Indicator */}
        <div className="mb-1 flex items-center gap-1.5 text-[9.5px] sm:text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
          <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>Subtitle · PiP</span>
        </div>

        {/* Word Lookup Floating Tooltip */}
        {selectedWord && (
          <div className="mb-2 flex items-center gap-2 rounded-xl border border-amber-400/40 bg-zinc-900/95 px-3 py-1.5 text-xs text-white shadow-xl backdrop-blur-md animate-fade-in">
            <span className="font-bold text-amber-300">{selectedWord}:</span>
            <span className="text-zinc-200">
              {loadingWord ? "Đang tra từ..." : wordMeaning || "—"}
            </span>
            <button
              type="button"
              onClick={toggleSaveWord}
              className={`rounded px-1.5 py-0.5 text-[11px] font-medium transition ${
                saved
                  ? "bg-amber-500/20 text-amber-300"
                  : "bg-white/15 text-white hover:bg-amber-500 hover:text-black"
              }`}
              title={saved ? "Đã lưu từ vựng" : "Lưu vào sổ từ"}
            >
              {saved ? "★ Đã lưu" : "☆ Lưu từ"}
            </button>
            <button
              type="button"
              onClick={() => setSelectedWord(null)}
              className="text-zinc-400 hover:text-white ml-1 text-xs"
            >
              ✕
            </button>
          </div>
        )}

        {/* German Spoken Sentence with Interactive Words */}
        <p className="flex flex-wrap items-center justify-center gap-x-1 gap-y-0.5 text-center text-[14px] sm:text-[17px] font-semibold text-white tracking-wide leading-snug drop-shadow-sm select-text">
          {germanText.split(/(\s+)/).map((token, i) => {
            if (/^\s+$/.test(token)) return <span key={i}>{token}</span>;
            const cleanToken = token.replace(/[^a-zA-ZäöüÄÖÜß]/g, "");
            return (
              <span
                key={i}
                role="button"
                tabIndex={0}
                onClick={() => void handleWordClick(cleanToken)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    void handleWordClick(cleanToken);
                  }
                }}
                className="cursor-pointer rounded px-0.5 transition-colors hover:bg-white/20 hover:text-amber-200 active:scale-95"
                title={`Tra từ "${cleanToken}"`}
              >
                {token}
              </span>
            );
          })}
        </p>

        {/* Translation (Vietnamese / English) */}
        {translationText && (
          <p className="mt-1 text-center text-[12px] sm:text-[13.5px] font-medium text-amber-300 leading-normal drop-shadow-xs">
            {translationText}
          </p>
        )}
      </div>
    </div>
  );
}
