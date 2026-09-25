"use client";

import { useEffect, useRef, useState } from "react";
import { useUi } from "@/lib/i18n";
import { liveCaptionService, type CaptionSegment } from "@/lib/liveCaption";
import { translateUntranslatedSegments } from "@/lib/transcriptPipeline";
import {
  listVocabulary,
  normalizeVocabWord,
  saveVocabularyWord,
  removeVocabularyWord,
  type SavedWord,
} from "@/lib/vocabulary";
import { usePlayer } from "./PlayerProvider";

import { FONT_FAMILIES, type FontFamily, type CaptionTheme, captionThemeStyle } from "../caption/CaptionSettings";

interface TranscriptReaderProps {
  currentTime: number;
  onSeek: (seconds: number) => void;
  showTranslation: boolean;
  translationLang: "de" | "en" | "vi";
  autoScroll: boolean;
  fontSize: number;
  fontFamily: FontFamily;
  theme: CaptionTheme;
  translationVisibility: "all" | "active";
  isLightTheme?: boolean;
}

function translationFor(seg: CaptionSegment, lang: "de" | "en" | "vi"): string | null {
  return seg.translations?.[lang] ?? null;
}

function formatSegTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function TranscriptReader({
  currentTime,
  onSeek,
  showTranslation,
  translationLang,
  autoScroll,
  fontSize,
  fontFamily,
  theme,
  isLightTheme = false,
}: TranscriptReaderProps) {
  const { t } = useUi();
  const {
    track,
    duration,
    onGenerateTranscript,
    onTranscribeCurrentRegion,
    transcribingRegion,
    generatingTranscript,
    transcriptOffsetSec,
  } = usePlayer();
  const [segments, setSegments] = useState<CaptionSegment[]>([]);
  const [savedWords, setSavedWords] = useState<Record<string, SavedWord>>({});
  const [selectedWord, setSelectedWord] = useState<{
    word: string;
    cleanWord: string;
    meaning: string;
    loading: boolean;
    segId: string;
    sentence: string;
    sentenceTranslation?: string;
    timestamp: number;
  } | null>(null);

  const activeRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [userScrolledAway, setUserScrolledAway] = useState(false);
  const userScrollTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const noteUserManualScroll = () => {
    setUserScrolledAway(true);
    window.clearTimeout(userScrollTimerRef.current);
    userScrollTimerRef.current = setTimeout(() => {
      setUserScrolledAway(false);
    }, 8000);
  };

  useEffect(() => {
    setSegments(liveCaptionService.getTranscript());
    return liveCaptionService.onTranscript(setSegments);
  }, []);

  useEffect(() => {
    const syncVocab = () => {
      const list = listVocabulary();
      const map: Record<string, SavedWord> = {};
      for (const item of list) {
        map[item.normalizedWord] = item;
      }
      setSavedWords(map);
    };
    syncVocab();
    window.addEventListener("hoerbar:vocab-changed", syncVocab);
    return () => window.removeEventListener("hoerbar:vocab-changed", syncVocab);
  }, []);

  useEffect(() => {
    if (!showTranslation || segments.length === 0) return;
    const hasMissing = segments.some((s) => s.text.trim() && !s.translations?.[translationLang]);
    if (!hasMissing) return;
    const timer = window.setTimeout(() => {
      void translateUntranslatedSegments(segments, translationLang);
    }, 120);
    return () => window.clearTimeout(timer);
  }, [segments, showTranslation, translationLang]);

  const handleReaderScroll = () => {
    const container = scrollContainerRef.current;
    if (!container || !showTranslation || segments.length === 0) return;
    const maxScroll = Math.max(1, container.scrollHeight - container.clientHeight);
    const ratio = Math.max(0, Math.min(1, container.scrollTop / maxScroll));
    const approxIdx = Math.max(0, Math.floor(ratio * segments.length) - 4);
    const viewportFirst = [
      ...segments.slice(approxIdx, approxIdx + 30),
      ...segments,
    ];
    void translateUntranslatedSegments(viewportFirst, translationLang);
  };

  const contentTime = currentTime - transcriptOffsetSec;

  const activeSegment =
    segments.find((s) => contentTime >= s.start - 0.15 && contentTime <= s.end + 0.25) ??
    segments.find((s) => contentTime >= s.start - 0.6 && contentTime <= s.end + 0.6);
  const activeSegmentId = activeSegment?.id;

  useEffect(() => {
    if (!autoScroll || userScrolledAway) return;
    const container = scrollContainerRef.current;
    const item = activeRef.current;
    if (!container || !item) return;
    const targetTop = Math.max(
      0,
      item.offsetTop - container.clientHeight / 2 + item.clientHeight / 2
    );
    container.scrollTo({ top: targetTop, behavior: "smooth" });
  }, [activeSegmentId, autoScroll, userScrolledAway]);

  const handleWordClick = async (
    rawToken: string,
    seg: CaptionSegment,
    sentenceTranslation?: string | null
  ) => {
    const clean = rawToken
      .trim()
      .replace(/^[.,!?;:"'„“”‚‘’()\[\]{}«»—–-]+|[.,!?;:"'„“”‚‘’()\[\]{}«»—–-]+$/g, "");
    if (!clean) return;

    const norm = normalizeVocabWord(clean);
    const existing = savedWords[norm];

    if (selectedWord && selectedWord.cleanWord.toLowerCase() === clean.toLowerCase() && selectedWord.segId === seg.id) {
      setSelectedWord(null);
      return;
    }

    setSelectedWord({
      word: rawToken,
      cleanWord: clean,
      meaning: existing?.meaning || "...",
      loading: !existing?.meaning,
      segId: seg.id,
      sentence: seg.text,
      sentenceTranslation: sentenceTranslation || undefined,
      timestamp: Math.max(0, seg.start + transcriptOffsetSec),
    });

    if (existing?.meaning) return;

    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: clean,
          sourceLang: "de",
          targetLang: translationLang === "de" ? "vi" : translationLang,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const translated = (data.translation || clean).trim();
        setSelectedWord((prev) =>
          prev && prev.cleanWord === clean
            ? { ...prev, meaning: translated, loading: false }
            : prev
        );
      } else {
        setSelectedWord((prev) =>
          prev && prev.cleanWord === clean ? { ...prev, loading: false } : prev
        );
      }
    } catch {
      setSelectedWord((prev) =>
        prev && prev.cleanWord === clean ? { ...prev, loading: false } : prev
      );
    }
  };

  const speakGermanWord = (text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = "de-DE";
      utter.rate = 0.9;
      window.speechSynthesis.speak(utter);
    } catch {
      // ignore
    }
  };

  const isModern = theme === "modern" && !isLightTheme;
  const inactiveColor = isLightTheme
    ? "text-[var(--ink-soft)]"
    : isModern
      ? "text-white/45"
      : "text-[var(--ink-faint)]";
  const activeColor = isLightTheme
    ? "text-[var(--ink)]"
    : isModern
      ? "text-white"
      : "text-[var(--ink)]";
  const generatingText = isLightTheme
    ? "text-[var(--ink)]"
    : isModern
      ? "text-white"
      : "text-[var(--ink)]";
  const generatingHint = isLightTheme
    ? "text-[var(--ink-soft)]"
    : isModern
      ? "text-white/50"
      : "text-[var(--ink-soft)]";
  const btnClasses = isLightTheme
    ? "bg-[var(--accent)] text-white"
    : isModern
      ? "bg-white text-black"
      : "bg-[var(--ink)] text-[var(--surface)]";

  if (segments.length === 0) {
    return (
      <div
        className={`flex h-full flex-col items-center justify-center gap-3 px-8 text-center rounded-xl ${
          isLightTheme ? "bg-[var(--surface)]/85 border border-[var(--rule)]" : ""
        }`}
        style={isLightTheme ? undefined : captionThemeStyle(theme)}
      >
        <div className="flex items-center gap-2">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
          <p className={`text-[15px] font-medium ${generatingText}`}>
            {generatingTranscript || transcribingRegion
              ? t("caption.generating")
              : "Đang quét & tạo transcript AI từ âm thanh thật..."}
          </p>
        </div>
        <p className={`max-w-xs text-[12.5px] ${generatingHint}`}>
          {t("caption.generatingHint")}
        </p>
        {track?.url ? (
          <button
            type="button"
            onClick={onGenerateTranscript}
            className={`rounded-full px-4 py-1.5 text-[12.5px] font-medium transition active:scale-95 ${btnClasses}`}
          >
            ⚡ {t("caption.generateTranscript")}
          </button>
        ) : null}
      </div>
    );
  }

  const episodeDuration = duration > 0 ? duration : (track?.durationSec ?? 0);
  const episodePct =
    episodeDuration > 0
      ? Math.max(0, Math.min(100, (currentTime / episodeDuration) * 100))
      : 0;

  return (
    <div
      className={`relative flex h-full flex-col overflow-hidden rounded-2xl border ${
        isLightTheme ? "border-[var(--rule)] bg-[var(--surface)]/80" : "border-white/10"
      }`}
    >
      {/* Top colored line representing overall podcast listening progress */}
      <div
        className={`pointer-events-none relative z-30 h-[3px] w-full shrink-0 overflow-hidden ${
          isLightTheme ? "bg-black/10" : "bg-white/10"
        }`}
      >
        <div
          className="h-full bg-gradient-to-r from-amber-500 via-orange-400 to-rose-400 transition-all duration-300"
          style={{ width: `${episodePct}%` }}
        />
      </div>

      <div
        ref={scrollContainerRef}
        onScroll={handleReaderScroll}
        onWheel={noteUserManualScroll}
        onTouchMove={noteUserManualScroll}
        className={`relative flex-1 overflow-y-auto px-3 sm:px-8 transition-colors duration-500 ${
          isLightTheme ? "bg-[var(--surface)]/65" : !isModern ? "bg-[var(--surface)]" : ""
        }`}
        style={{ ...(isLightTheme ? {} : captionThemeStyle(theme)), scrollbarWidth: "none" }}
      >
        {/* Subtle sticky top header with overall podcast time, percentage & 1-tap Regional Ad/DAI Transcribe */}
        <div className="sticky top-0 z-20 mx-auto max-w-xl pt-1.5 pb-1.5">
          <div
            className={`flex items-center justify-between gap-2 rounded-full px-3 py-1 backdrop-blur-md border text-[10.5px] ${
              isLightTheme
                ? "bg-[var(--paper-raised)]/90 border-[var(--rule)] text-[var(--ink-soft)] shadow-xs"
                : "bg-black/45 border-white/10 text-white/75"
            }`}
          >
            <span className="inline-flex items-center gap-1.5 min-w-0 truncate">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)] animate-pulse" />
              <span className="truncate">
                {transcribingRegion
                  ? "Đang tự động quét & transcribe vùng âm thanh hiện tại..."
                  : "Bấm từ bất kỳ để dịch · Tự động quét quảng cáo/vùng"}
              </span>
            </span>
            <div className="flex items-center gap-2 shrink-0">
              {track?.url ? (
                <button
                  type="button"
                  onClick={onTranscribeCurrentRegion}
                  disabled={transcribingRegion}
                  className={`pointer-events-auto inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold active:scale-95 disabled:opacity-60 transition ${
                    isLightTheme
                      ? "bg-[var(--accent-soft)] border-[var(--accent)]/35 text-[var(--accent)] hover:opacity-90"
                      : "bg-amber-500/20 border-amber-400/40 text-amber-300 hover:bg-amber-500/35"
                  }`}
                  title="Quét & Transcribe trực tiếp vùng âm thanh đang phát (khớp quảng cáo chèn động DAI)"
                >
                  <span>{transcribingRegion ? "⏳" : "🎯"}</span>
                  <span>{transcribingRegion ? "Đang quét..." : "Quét vùng này"}</span>
                </button>
              ) : null}
              <span className={`font-mono tabular-nums font-semibold ${isLightTheme ? "text-[var(--accent)]" : "text-amber-300/95"}`}>
                {formatSegTime(currentTime)}
                {episodeDuration > 0
                  ? ` / ${formatSegTime(episodeDuration)} (${Math.round(episodePct)}%)`
                  : ""}
              </span>
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-xl py-[16vh] space-y-2.5">
          {segments.map((seg, idx) => {
            const isActive = seg.id === activeSegmentId;
            const showForSeg = showTranslation;
            const translation = showForSeg ? translationFor(seg, translationLang) : null;

            const isWordPopoverOpenHere = selectedWord?.segId === seg.id;

            return (
              <div
                key={seg.id}
                ref={isActive ? activeRef : null}
                onClick={() => onSeek(Math.max(0, seg.start - 0.2 + transcriptOffsetSec))}
                className={`group relative overflow-visible cursor-pointer rounded-2xl px-4 py-3.5 transition-all duration-300 text-center ${
                  isActive
                    ? isLightTheme
                      ? "bg-[var(--paper-raised)] shadow-lg ring-2 ring-[var(--accent)]/40 scale-[1.015]"
                      : isModern
                        ? "bg-white/[0.13] shadow-xl ring-1 ring-amber-300/35 backdrop-blur-md scale-[1.015]"
                        : "bg-[var(--paper-raised)] shadow-md ring-1 ring-[var(--accent)]/40 scale-[1.015]"
                    : isLightTheme
                      ? "opacity-65 hover:opacity-100 hover:bg-[var(--paper-raised)]/60"
                      : "opacity-50 hover:opacity-90 hover:bg-white/[0.06]"
                }`}
              >
                {/* Timestamp & index badge inside the active card (or on hover) */}
                <div
                  className={`mb-1.5 flex items-center justify-between text-[10.5px] font-mono transition-opacity ${
                    isActive ? "opacity-95" : "opacity-0 group-hover:opacity-75"
                  }`}
                >
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ${
                      isLightTheme
                        ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                        : "bg-white/10 text-amber-200"
                    }`}
                  >
                    <span>{isActive ? "●" : "▶"}</span>
                    <span>
                      {formatSegTime(Math.max(0, seg.start + transcriptOffsetSec))} –{" "}
                      {formatSegTime(Math.max(0, seg.end + transcriptOffsetSec))}
                    </span>
                  </span>
                  <span className={isLightTheme ? "text-[var(--ink-faint)]" : "text-white/55"}>
                    {isActive ? `#${idx + 1}/${segments.length}` : `#${idx + 1}`}
                  </span>
                </div>

                {/* Tokenized German words so each word can be clicked to translate & save */}
                <p
                  className={`relative z-10 font-semibold leading-relaxed transition-colors duration-300 select-text ${
                    isActive ? activeColor : inactiveColor
                  }`}
                  style={{ fontSize: `${fontSize}px`, fontFamily: FONT_FAMILIES[fontFamily] }}
                >
                  {seg.text.split(/(\s+)/).map((token, tokenIdx) => {
                    if (/^\s+$/.test(token)) {
                      return <span key={tokenIdx}>{token}</span>;
                    }
                    const norm = normalizeVocabWord(token);
                    const savedEntry = norm ? savedWords[norm] : undefined;
                    const isSelected =
                      isWordPopoverOpenHere &&
                      norm &&
                      normalizeVocabWord(selectedWord?.cleanWord || "") === norm;

                    return (
                      <span
                        key={tokenIdx}
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleWordClick(token, seg, translation);
                        }}
                        title={
                          savedEntry
                            ? `⭐ ${savedEntry.word}: ${savedEntry.meaning}`
                            : "Bấm để dịch & lưu từ này"
                        }
                        className={`inline-block rounded-md px-0.5 transition-all ${
                          isSelected
                            ? "bg-[var(--accent)] text-white font-bold shadow-sm scale-105"
                            : savedEntry
                              ? isLightTheme
                                ? "bg-[var(--accent-soft)] text-[var(--accent)] underline decoration-[var(--accent)] decoration-2 underline-offset-4"
                                : "bg-amber-500/20 text-amber-200 underline decoration-amber-400 decoration-2 underline-offset-4"
                              : isLightTheme
                                ? "hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]"
                                : "hover:bg-white/15 hover:text-amber-200"
                        }`}
                      >
                        {token}
                      </span>
                    );
                  })}
                </p>

                {/* Inline Word Lookup & Save Popover */}
                {isWordPopoverOpenHere && selectedWord && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="relative z-20 mx-auto mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-400/40 bg-zinc-950/95 px-3.5 py-2 text-left text-xs text-white shadow-xl backdrop-blur-md"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => speakGermanWord(selectedWord.cleanWord)}
                        className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-2 py-1 font-bold text-amber-300 hover:bg-white/20"
                        title="Nghe phát âm"
                      >
                        🔊 {selectedWord.cleanWord}
                      </button>
                      <span className="text-white/40">→</span>
                      <span className="font-semibold text-emerald-300">
                        {selectedWord.loading ? "Đang dịch..." : selectedWord.meaning}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {(() => {
                        const norm = normalizeVocabWord(selectedWord.cleanWord);
                        const isSaved = Boolean(norm && savedWords[norm]);
                        return (
                          <button
                            type="button"
                            onClick={() => {
                              if (isSaved) {
                                removeVocabularyWord(selectedWord.cleanWord);
                              } else {
                                saveVocabularyWord({
                                  word: selectedWord.cleanWord,
                                  meaning: selectedWord.meaning,
                                  contextSentence: selectedWord.sentence,
                                  contextTranslation: selectedWord.sentenceTranslation,
                                  showTitle: track?.showTitle,
                                  episodeTitle: track?.title,
                                  timestamp: selectedWord.timestamp,
                                });
                              }
                            }}
                            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                              isSaved
                                ? "bg-emerald-500/25 text-emerald-200 border border-emerald-400/40"
                                : "bg-amber-400 text-zinc-950 hover:bg-amber-300"
                            }`}
                          >
                            {isSaved ? "✓ Đã lưu (Bỏ lưu)" : "⭐ Lưu từ vựng"}
                          </button>
                        );
                      })()}
                      <button
                        type="button"
                        onClick={() => setSelectedWord(null)}
                        className="rounded-lg p-1 text-white/50 hover:bg-white/10 hover:text-white"
                        aria-label="Đóng"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                )}

                {translation ? (
                  <p
                    className={`relative z-10 mt-2 whitespace-pre-wrap break-words font-normal leading-relaxed italic select-text transition-all ${
                      isLightTheme
                        ? "text-[var(--accent)] font-medium"
                        : isModern
                          ? "text-amber-200/90 font-medium"
                          : "text-[var(--accent)] font-medium"
                    }`}
                    style={{
                      fontSize: `${Math.max(13, Math.round(fontSize * 0.82))}px`,
                    }}
                  >
                    {translation}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom colored line representing overall podcast listening progress */}
      <div
        className={`pointer-events-none relative z-30 h-[3px] w-full shrink-0 overflow-hidden ${
          isLightTheme ? "bg-black/10" : "bg-white/10"
        }`}
      >
        <div
          className="h-full bg-gradient-to-r from-amber-500 via-orange-400 to-rose-400 transition-all duration-300"
          style={{ width: `${episodePct}%` }}
        />
      </div>
    </div>
  );
}
