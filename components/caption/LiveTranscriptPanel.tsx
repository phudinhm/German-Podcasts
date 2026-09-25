"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useUi } from "@/lib/i18n";
import { usePlayer } from "@/components/player/PlayerProvider";
import {
  liveCaptionService,
  type CaptionSegment,
} from "@/lib/liveCaption";
import { translateUntranslatedSegments } from "@/lib/transcriptPipeline";
import {
  CaptionSettings,
  captionThemeStyle,
  FONT_FAMILIES,
  type CaptionSettingsState,
} from "./CaptionSettings";
import {
  listVocabulary,
  normalizeVocabWord,
  saveVocabularyWord,
  removeVocabularyWord,
  type SavedWord,
} from "@/lib/vocabulary";
import { VocabularyModal } from "./VocabularyModal";

// How long the collapsed floating bar stays fully visible after the last
// caption update or interaction before fading, when auto-hide is on.
const AUTO_HIDE_DELAY_MS = 4000;

interface LiveTranscriptPanelProps {
  currentTime: number;
  onSeek: (seconds: number) => void;
  onClose: () => void;
  settings: CaptionSettingsState;
  onUpdateSettings: (settings: CaptionSettingsState) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  isFloating?: boolean;
}

function formatTime(seconds: number): string {
  const total = Math.floor(Math.max(0, seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export function LiveTranscriptPanel({
  currentTime,
  onSeek,
  onClose,
  settings,
  onUpdateSettings,
  isCollapsed = false,
  onToggleCollapse,
  isFloating = false,
}: LiveTranscriptPanelProps) {
  const { t, lang } = useUi();
  const {
    track,
    duration,
    onGenerateTranscript,
    onTranscribeCurrentRegion,
    transcribingRegion,
    generatingTranscript,
    generateTranscriptError,
    transcriptOffsetSec,
    setTranscriptOffsetSec,
  } = usePlayer();
  const [segments, setSegments] = useState<CaptionSegment[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [autoScroll, setAutoScroll] = useState(settings.autoScroll);
  const [userScrolledUp, setUserScrolledUp] = useState(false);
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [selectedContext, setSelectedContext] = useState<{
    sentence: string;
    translation?: string;
    timestamp: number;
  } | null>(null);
  const [wordMeaning, setWordMeaning] = useState<string | null>(null);
  const [loadingWord, setLoadingWord] = useState(false);
  const [savedWords, setSavedWords] = useState<Record<string, SavedWord>>({});
  const [vocabModalOpen, setVocabModalOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [grammarNotes, setGrammarNotes] = useState<Record<string, string>>({});
  const [loadingGrammarId, setLoadingGrammarId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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

  const readAloud = (text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "de-DE";
    utterance.rate = 0.92;
    window.speechSynthesis.speak(utterance);
  };

  const containerRef = useRef<HTMLDivElement | null>(null);
  const activeItemRef = useRef<HTMLDivElement | null>(null);

  const [dimmed, setDimmed] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const resetHideTimer = useCallback(() => {
    window.clearTimeout(hideTimerRef.current);
    if (!settings.autoHide) {
      setDimmed(false);
      return;
    }
    setDimmed(false);
    hideTimerRef.current = setTimeout(() => setDimmed(true), AUTO_HIDE_DELAY_MS);
  }, [settings.autoHide]);

  useEffect(() => {
    setSegments(liveCaptionService.getTranscript());
    const unsub = liveCaptionService.onTranscript((items) => {
      setSegments(items);
    });
    return unsub;
  }, []);

  const prevTimeRef = useRef(currentTime);
  useEffect(() => {
    if (Math.abs(currentTime - prevTimeRef.current) > 3.0) {
      // User sought/jumped to a new position -> re-engage auto-scroll immediately!
      setUserScrolledUp(false);
    }
    prevTimeRef.current = currentTime;
  }, [currentTime]);

  // Determine active segment based on current playback time, corrected for
  // any ad breaks pushing real audio out of step.
  // Only keep the previous sentence highlighted during a natural inter-sentence pause (<= 6.5s),
  // NEVER across a large untranscribed gap when the user jumps far ahead!
  const contentTime = currentTime - transcriptOffsetSec;
  let activeSegmentId: string | undefined = undefined;

  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    const next = segments[i + 1];
    if (contentTime >= s.start - 0.35) {
      if (contentTime <= s.end + 0.5) {
        activeSegmentId = s.id;
        break;
      }
      // Natural pause before next sentence (up to 6.5s max)
      if (next && contentTime < next.start && contentTime <= s.end + 6.5) {
        activeSegmentId = s.id;
        break;
      }
      if (!next && contentTime <= s.end + 6.5) {
        activeSegmentId = s.id;
        break;
      }
    }
  }

  // Smart Auto-scroll: scroll ONLY the internal transcript container (never window!),
  // so mobile users can freely scroll up to the page header/logo without being yanked back down.
  useEffect(() => {
    if (!autoScroll || userScrolledUp) return;
    const container = containerRef.current;
    const item = activeItemRef.current;
    if (!container || !item) return;
    const targetTop = Math.max(
      0,
      item.offsetTop - container.clientHeight / 2 + item.clientHeight / 2
    );
    container.scrollTo({
      top: targetTop,
      behavior: "smooth",
    });
  }, [activeSegmentId, autoScroll, userScrolledUp, segments.length]);

  // When new segments arrive while NOT playing audio (or if user just started), scroll to end
  useEffect(() => {
    if (!autoScroll || userScrolledUp) return;
    if (currentTime > 0) return; // Do NOT yank scroll if audio is actively playing!
    const container = containerRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  }, [segments.length, autoScroll, userScrolledUp, currentTime]);

  const targetTranslateLang: "de" | "en" | "vi" =
    settings.translationLang === "auto"
      ? lang === "vi"
        ? "vi"
        : "en"
      : settings.translationLang;

  // Ensure all segments (top to bottom) get translated continuously
  useEffect(() => {
    if (!settings.showTranslation || segments.length === 0) return;
    const hasMissing = segments.some((s) => s.text.trim() && !s.translations?.[targetTranslateLang]);
    if (!hasMissing) return;
    const timer = window.setTimeout(() => {
      void translateUntranslatedSegments(segments, targetTranslateLang);
    }, 120);
    return () => window.clearTimeout(timer);
  }, [segments, settings.showTranslation, targetTranslateLang]);

  // Handle scroll events to detect user manual scrolling & immediately translate scrolled-to lines
  const handleScroll = () => {
    const container = containerRef.current;
    if (!container) return;
    const isNearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < 80;
    if (!isNearBottom && autoScroll) {
      setUserScrolledUp(true);
    } else if (isNearBottom) {
      setUserScrolledUp(false);
    }

    if (settings.showTranslation && segments.length > 0) {
      const maxScroll = Math.max(1, container.scrollHeight - container.clientHeight);
      const ratio = Math.max(0, Math.min(1, container.scrollTop / maxScroll));
      const approxIdx = Math.max(0, Math.floor(ratio * segments.length) - 4);
      const viewportFirst = [
        ...segments.slice(approxIdx, approxIdx + 30),
        ...segments,
      ];
      void translateUntranslatedSegments(viewportFirst, targetTranslateLang);
    }
  };

  // Only the collapsed floating bar auto-hides - the expanded panel is
  // something someone opened on purpose and reading it shouldn't fight back.
  useEffect(() => {
    if (!isCollapsed) return;
    resetHideTimer();
    return () => window.clearTimeout(hideTimerRef.current);
  }, [isCollapsed, activeSegmentId, resetHideTimer]);

  const resumeAutoScroll = () => {
    setUserScrolledUp(false);
    setAutoScroll(true);
    const container = containerRef.current;
    const item = activeItemRef.current;
    if (container && item) {
      const targetTop = Math.max(
        0,
        item.offsetTop - container.clientHeight / 2 + item.clientHeight / 2
      );
      container.scrollTo({
        top: targetTop,
        behavior: "smooth",
      });
    }
  };

  const lookupWord = async (rawWord: string, seg?: CaptionSegment) => {
    const clean = rawWord.replace(/[^a-zA-ZäöüÄÖÜß]/g, "");
    if (!clean || clean.length < 2) return;
    setSelectedWord(clean);
    if (seg) {
      const trans =
        seg.translations?.[targetTranslateLang] ??
        seg.translation ??
        (seg.translations ? Object.values(seg.translations)[0] : undefined);
      setSelectedContext({
        sentence: seg.text,
        translation: trans,
        timestamp: Math.max(0, seg.start + transcriptOffsetSec),
      });
    } else {
      setSelectedContext(null);
    }
    const norm = normalizeVocabWord(clean);
    if (savedWords[norm]) {
      setWordMeaning(savedWords[norm].meaning);
      setLoadingWord(false);
      return;
    }
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

  const explainGrammar = async (seg: CaptionSegment) => {
    if (grammarNotes[seg.id]) return;
    setLoadingGrammarId(seg.id);
    try {
      const res = await fetch("/api/caption/polish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: seg.text,
          lang: lang === "vi" ? "vi" : "en",
          explainGrammar: true,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { grammarNotes?: string };
        if (data.grammarNotes) {
          setGrammarNotes((prev) => ({ ...prev, [seg.id]: data.grammarNotes! }));
        }
      }
    } catch {
    } finally {
      setLoadingGrammarId(null);
    }
  };

  const copyAllText = async () => {
    const fullText = segments
      .map((s) => `[${formatTime(s.start)}] ${s.text}\n${s.translation ? s.translation + "\n" : ""}`)
      .join("\n");
    await navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const exportTxt = () => {
    const fullText = segments
      .map((s) => `[${formatTime(s.start)}] ${s.text}\n${s.translation ?? ""}\n`)
      .join("\n");
    const blob = new Blob([fullText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transcript-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportSrt = () => {
    let srt = "";
    segments.forEach((s, idx) => {
      const startFmt = `${String(Math.floor(s.start / 3600)).padStart(2, "0")}:${String(
        Math.floor((s.start % 3600) / 60),
      ).padStart(2, "0")}:${String(Math.floor(s.start % 60)).padStart(2, "0")},000`;
      const endFmt = `${String(Math.floor(s.end / 3600)).padStart(2, "0")}:${String(
        Math.floor((s.end % 3600) / 60),
      ).padStart(2, "0")}:${String(Math.floor(s.end % 60)).padStart(2, "0")},000`;

      srt += `${idx + 1}\n${startFmt} --> ${endFmt}\n${s.text}\n${
        s.translation ? s.translation + "\n" : ""
      }\n`;
    });

    const blob = new Blob([srt], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transcript-${Date.now()}.srt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredSegments = searchQuery.trim()
    ? segments.filter(
        (s) =>
          s.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.translation?.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : segments;

  if (isCollapsed) {
    const activeSeg = segments.find((s) => s.id === activeSegmentId) ?? segments[segments.length - 1];
    const activeTranslation =
      activeSeg?.translations?.[targetTranslateLang] ??
      (activeSeg?.translations ? Object.values(activeSeg.translations)[0] : undefined) ??
      activeSeg?.translation;

    return (
      <div
        className={`card flex items-center gap-3 px-4 py-2.5 transition-opacity duration-500 bg-[var(--paper-raised)] border border-[var(--rule)] shadow-xl rounded-2xl ${
          dimmed ? "opacity-45 hover:opacity-100" : "opacity-100"
        }`}
        style={captionThemeStyle(settings.captionTheme)}
        onMouseEnter={resetHideTimer}
        onFocus={resetHideTimer}
      >
        <span className="shrink-0 text-[12px] font-semibold text-[var(--accent)]">{formatTime(currentTime)}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-[var(--ink)]">
            {activeSeg?.text || t("caption.waiting")}
          </p>
          {settings.showTranslation && activeTranslation ? (
            <p className="truncate text-[11.5px] italic text-[var(--ink-soft)] mt-0.5">
              {activeTranslation}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              className="btn px-2 py-0.5 text-[11px] font-medium text-[var(--accent)] hover:bg-[var(--surface)]"
              title={t("caption.expand")}
            >
              {t("caption.expand")}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="icon-btn text-[14px]"
            aria-label={t("common.close")}
          >
            ×
          </button>
        </div>
      </div>
    );
  }

  const episodeDuration = duration > 0 ? duration : (track?.durationSec ?? 0);
  const episodePct =
    episodeDuration > 0
      ? Math.max(0, Math.min(100, (currentTime / episodeDuration) * 100))
      : 0;

  return (
    <section 
      className={`card mt-4 flex flex-col overflow-hidden bg-[var(--paper-raised)] border border-[var(--rule)] shadow-2xl rounded-2xl`} 
      style={captionThemeStyle(settings.captionTheme)}
    >
      {/* Top colored line representing overall podcast listening progress */}
      <div className="pointer-events-none relative z-20 h-[3px] w-full shrink-0 bg-[var(--rule)]/50 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-amber-400 via-orange-400 to-rose-400 transition-all duration-300"
          style={{ width: `${episodePct}%` }}
        />
      </div>

      <div className="border-b border-[var(--rule)] p-3.5 bg-[var(--surface)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h3 className="text-[15px] font-semibold text-[var(--ink)]">
              {t("caption.transcript")}
            </h3>
            <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--accent)]">
              {segments.length} {t("caption.lines")}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {track?.url ? (
              <button
                type="button"
                onClick={onTranscribeCurrentRegion}
                disabled={transcribingRegion}
                className="btn px-2.5 py-1 text-[11px] font-semibold text-[var(--accent)] border-[var(--accent)]/40 bg-[var(--accent-soft)]/50 hover:bg-[var(--accent-soft)] disabled:opacity-60"
                title="Quét & Transcribe vùng âm thanh đang phát (tự động nhận diện quảng cáo chèn động & đồng bộ lại)"
              >
                <span>{transcribingRegion ? "⏳" : "🎯"}</span>
                <span>{transcribingRegion ? "Đang quét vùng..." : "Quét vùng này"}</span>
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setShowSettings((v) => !v)}
              className={`icon-btn text-[14px] ${showSettings ? "text-[var(--accent)]" : ""}`}
              title={t("common.settings")}
              aria-label={t("common.settings")}
            >
              ⚙
            </button>
            {onToggleCollapse && (
              <button
                type="button"
                onClick={onToggleCollapse}
                className="icon-btn text-[14px]"
                title={t("caption.collapse")}
                aria-label={t("caption.collapse")}
              >
                —
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="icon-btn text-[16px]"
              aria-label={t("common.close")}
            >
              ×
            </button>
          </div>
        </div>

        {showSettings && (
          <div className="mt-3 rounded-lg bg-[var(--paper)] p-3 border border-[var(--rule)]">
            <CaptionSettings
              settings={settings}
              onChange={onUpdateSettings}
              compact
              sourceLang={track?.sourceLang}
              syncOffsetSec={transcriptOffsetSec}
              onSyncOffsetChange={setTranscriptOffsetSec}
            />
          </div>
        )}

        {/* Secondary Toolbar: Search, Copy, Export */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[12px]">
          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <input
              type="text"
              placeholder={t("caption.searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-[var(--rule)] bg-[var(--paper)] px-3 py-1.5 text-[12px] text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)] focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--ink-faint)] hover:text-[var(--ink)]"
              >
                ×
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setVocabModalOpen(true)}
              className="btn px-2.5 py-1 text-[11.5px] font-semibold text-[var(--accent)]"
              title="Mở sổ từ vựng đã lưu"
            >
              ⭐ Từ vựng ({Object.keys(savedWords).length})
            </button>
            <button
              type="button"
              onClick={() => void copyAllText()}
              className="btn px-2.5 py-1 text-[11.5px]"
              title={t("caption.copyAll")}
            >
              {copied ? t("caption.copied") : t("caption.copyAll")}
            </button>
            <button
              type="button"
              onClick={exportTxt}
              className="btn px-2 py-1 text-[11px]"
              title={t("caption.downloadTxt")}
            >
              {t("caption.downloadTxt")}
            </button>
            <button
              type="button"
              onClick={exportSrt}
              className="btn px-2 py-1 text-[11px]"
              title={t("caption.downloadSrt")}
            >
              {t("caption.downloadSrt")}
            </button>
          </div>
        </div>
      </div>

      {/* Selected word definition card */}
      {selectedWord && (
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--rule)] bg-[var(--accent-soft)] px-4 py-2 text-[12.5px] text-[var(--ink)]">
          <button
            type="button"
            onClick={() => readAloud(selectedWord)}
            className="font-bold text-[var(--accent)] hover:underline"
            title="Nghe phát âm"
          >
            🔊 {selectedWord}:
          </button>
          {loadingWord ? (
            <span className="animate-pulse">{t("caption.translating")}</span>
          ) : (
            <span className="font-semibold">{wordMeaning || "N/A"}</span>
          )}
          {!loadingWord && (
            <button
              type="button"
              onClick={() => {
                const norm = normalizeVocabWord(selectedWord);
                if (savedWords[norm]) {
                  removeVocabularyWord(selectedWord);
                } else {
                  saveVocabularyWord({
                    word: selectedWord,
                    meaning: wordMeaning || selectedWord,
                    contextSentence: selectedContext?.sentence,
                    contextTranslation: selectedContext?.translation,
                    showTitle: track?.showTitle,
                    episodeTitle: track?.title,
                    timestamp: selectedContext?.timestamp,
                  });
                }
              }}
              className={`ml-auto rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                savedWords[normalizeVocabWord(selectedWord)]
                  ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
                  : "bg-[var(--accent)] text-white hover:opacity-90"
              }`}
            >
              {savedWords[normalizeVocabWord(selectedWord)]
                ? "✓ Đã lưu (Bỏ lưu)"
                : "⭐ Lưu từ vựng"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setSelectedWord(null)}
            className="icon-btn h-6 w-6 text-[13px]"
          >
            ×
          </button>
        </div>
      )}

      {/* Transcript items list */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="relative max-h-[420px] min-h-[160px] overflow-y-auto p-4 space-y-3 scroll-smooth"
      >
        {filteredSegments.length === 0 ? (
          <div className="py-12 text-center text-[13px] text-[var(--ink-faint)]">
            {searchQuery ? (
              <p>{t("caption.noMatch")}</p>
            ) : (
              <div className="space-y-2.5">
                <div className="inline-flex items-center justify-center gap-2 font-medium text-[var(--ink)]">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
                  <span>{generatingTranscript ? t("caption.generating") : "Đang tạo transcript bằng AI..."}</span>
                </div>
                <p className="text-[11.5px] max-w-sm mx-auto text-[var(--ink-faint)]">
                  {t("caption.generatingHint")}
                </p>
                {track?.url ? (
                  <button type="button" onClick={onGenerateTranscript} className="btn btn-primary px-3.5 py-1.5 text-[12.5px]">
                    ⚡ {t("caption.generateTranscript")}
                  </button>
                ) : null}
              </div>
            )}
          </div>
        ) : (
          filteredSegments.map((seg) => {
            const isActive = seg.id === activeSegmentId;
            return (
              <div
                key={seg.id}
                ref={isActive ? activeItemRef : null}
                className={`group rounded-xl p-3 transition-all duration-300 ${
                  isActive
                    ? "bg-[var(--row-active)] border border-[var(--accent)]/50 shadow-md scale-[1.01] opacity-100 ring-1 ring-[var(--accent)]/20"
                    : "hover:bg-[var(--surface)] border border-transparent opacity-65 hover:opacity-100"
                }`}
              >
                <div className="flex items-start gap-2.5">
                  {/* Timestamp button (click to seek & replay from exact first word) */}
                  <div className="shrink-0 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        // 0.25s pre-roll buffer so the very first word or consonant is never cut off,
                        // plus the sync offset to convert back from transcript time to real audio time.
                        const target = Math.max(0, seg.start - 0.25 + transcriptOffsetSec);
                        onSeek(target);
                      }}
                      className="font-mono text-[11px] font-semibold text-[var(--ink-faint)] group-hover:text-[var(--accent)] rounded bg-[var(--surface)] px-1.5 py-0.5 transition active:scale-95 flex items-center gap-1"
                      title={`${t("caption.replaySegment")} (${formatTime(seg.start)})`}
                    >
                      <span className="text-[9px]">▶</span>
                      <span>{formatTime(seg.start)}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => readAloud(seg.text)}
                      className="text-[12px] opacity-40 hover:opacity-100 hover:text-[var(--accent)] transition px-0.5 py-0.5 rounded"
                      title={t("caption.readAloud")}
                      aria-label={t("caption.readAloud")}
                    >
                      &#9835;
                    </button>
                  </div>

                  {/* German text & Vietnamese translation */}
                  <div className="flex-1 min-w-0" style={{ fontFamily: FONT_FAMILIES[settings.fontFamily] }}>
                    <p
                      className="font-medium text-[var(--ink)] select-text"
                      style={{
                        fontSize: `${settings.fontSize}px`,
                        lineHeight: settings.lineHeight,
                      }}
                    >
                      {seg.text.split(/(\s+)/).map((token, i) => {
                        if (/^\s+$/.test(token)) return <span key={i}>{token}</span>;
                        const norm = normalizeVocabWord(token);
                        const saved = norm ? savedWords[norm] : undefined;
                        return (
                          <button
                            key={i}
                            type="button"
                            onClick={() => void lookupWord(token, seg)}
                            className={`inline-block rounded-xs px-0.5 transition cursor-pointer ${
                              saved
                                ? "bg-amber-500/15 text-[var(--accent)] underline decoration-amber-400 decoration-2 underline-offset-4 font-semibold"
                                : "hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]"
                            }`}
                            title={saved ? `⭐ ${saved.word}: ${saved.meaning}` : "Click to translate & save this word"}
                          >
                            {token}
                          </button>
                        );
                      })}
                    </p>

                    {settings.showTranslation && seg.translations?.[targetTranslateLang] ? (
                      <div className="mt-2 space-y-1 border-l-2 border-[var(--accent)]/30 pl-2.5">
                        <p
                          className="text-[var(--ink-soft)] italic select-text"
                          style={{ fontSize: `${Math.max(12, Math.round(settings.fontSize * 0.85))}px` }}
                        >
                          <span className="mr-1.5 font-sans font-medium text-[9px] uppercase tracking-wider text-[var(--accent)]/70 not-italic">
                            {targetTranslateLang}
                          </span>
                          {seg.translations[targetTranslateLang]}
                        </p>
                      </div>
                    ) : settings.showTranslation && seg.translation ? (
                      <p
                        className="mt-2 border-l-2 border-[var(--accent)]/30 pl-2.5 text-[var(--ink-soft)] italic select-text"
                        style={{
                          fontSize: `${Math.max(12, Math.round(settings.fontSize * 0.85))}px`,
                        }}
                      >
                        {seg.translation}
                      </p>
                    ) : settings.showTranslation ? (
                      <p className="mt-1.5 border-l-2 border-[var(--rule)] pl-2.5 text-[11.5px] italic text-[var(--ink-faint)] animate-pulse">
                        {t("caption.translating")}
                      </p>
                    ) : null}

                    {/* AI Grammar explanation if loaded */}
                    {grammarNotes[seg.id] && (
                      <div className="mt-2 rounded-lg bg-[var(--accent-soft)] p-2 text-[12px] text-[var(--accent)] border border-[var(--accent)]/20">
                        <span className="font-semibold">{t("caption.explain")}:</span>{" "}
                        {grammarNotes[seg.id]}
                      </div>
                    )}
                  </div>

                  {/* Action buttons: AI Grammar explain */}
                  <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() => void explainGrammar(seg)}
                      className="rounded p-1 text-[11.5px] text-[var(--ink-faint)] hover:text-[var(--accent)]"
                      title={t("caption.explain")}
                    >
                      {loadingGrammarId === seg.id ? "…" : "AI"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Floating Jump to Current Button if user scrolled up */}
      {userScrolledUp && (
        <div className="border-t border-[var(--rule)] bg-[var(--surface)] p-2 text-center">
          <button
            type="button"
            onClick={resumeAutoScroll}
            className="btn btn-primary py-1 px-3 text-[11.5px]"
          >
            {t("caption.jumpCurrent")}
          </button>
        </div>
      )}

      {/* Bottom colored line representing overall podcast listening progress */}
      <div className="pointer-events-none relative z-20 h-[3px] w-full shrink-0 bg-[var(--rule)]/50 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-amber-400 via-orange-400 to-rose-400 transition-all duration-300"
          style={{ width: `${episodePct}%` }}
        />
      </div>

      <VocabularyModal
        open={vocabModalOpen}
        onClose={() => setVocabModalOpen(false)}
        onSeek={onSeek}
      />
    </section>
  );
}
