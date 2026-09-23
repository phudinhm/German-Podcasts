"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useUi } from "@/lib/i18n";
import {
  liveCaptionService,
  type CaptionSegment,
} from "@/lib/liveCaption";
import {
  CaptionSettings,
  captionThemeStyle,
  type CaptionSettingsState,
} from "./CaptionSettings";

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
}: LiveTranscriptPanelProps) {
  const { t, lang } = useUi();
  const [segments, setSegments] = useState<CaptionSegment[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [autoScroll, setAutoScroll] = useState(settings.autoScroll);
  const [userScrolledUp, setUserScrolledUp] = useState(false);
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [wordMeaning, setWordMeaning] = useState<string | null>(null);
  const [loadingWord, setLoadingWord] = useState(false);
  const [grammarNotes, setGrammarNotes] = useState<Record<string, string>>({});
  const [loadingGrammarId, setLoadingGrammarId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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

  // Determine active segment based on current playback time
  const activeSegmentId = segments.find(
    (s) => currentTime >= s.start - 0.5 && currentTime <= s.end + 0.5,
  )?.id;

  // Smart Auto-scroll: auto scroll to active item unless user deliberately scrolled away
  useEffect(() => {
    if (!autoScroll || userScrolledUp || !activeItemRef.current) return;
    activeItemRef.current.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, [activeSegmentId, autoScroll, userScrolledUp]);

  // A live session appends lines faster than currentTime can catch up to
  // them, so the "active" segment above can lag behind the newest one by a
  // few lines. This keeps the newest line in view regardless, which is what
  // "follow along live" actually means while captioning is running.
  useEffect(() => {
    if (!autoScroll || userScrolledUp) return;
    const container = containerRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  }, [segments.length, autoScroll, userScrolledUp]);

  // Handle scroll events to detect user manual scrolling
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
    if (activeItemRef.current) {
      activeItemRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  };

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
    return (
      <div
        className={`card glass-panel flex items-center gap-3 px-3.5 py-2 shadow-lg transition-opacity duration-500 ${
          dimmed ? "opacity-35 hover:opacity-100" : "opacity-100"
        }`}
        style={captionThemeStyle(settings.captionTheme)}
        onMouseEnter={resetHideTimer}
        onFocus={resetHideTimer}
      >
        <span className="shrink-0 text-[12px] font-semibold text-[var(--accent)]">{formatTime(currentTime)}</span>
        <p className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-[var(--ink)]">
          {activeSeg?.text || t("caption.waiting")}
        </p>
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

  return (
    <section
      className="card glass-panel mt-4 flex flex-col overflow-hidden"
      style={captionThemeStyle(settings.captionTheme)}
    >
      <div className="border-b border-[var(--rule)] bg-[var(--surface)] p-3.5">
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
            <CaptionSettings
              settings={settings}
              onChange={onUpdateSettings}
              compact
            />
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
        <div className="flex items-center gap-2 border-b border-[var(--rule)] bg-[var(--accent-soft)] px-4 py-2 text-[12.5px] text-[var(--ink)]">
          <span className="font-semibold text-[var(--accent)]">{selectedWord}:</span>
          {loadingWord ? (
            <span className="animate-pulse">{t("caption.translating")}</span>
          ) : (
            <span>{wordMeaning || "N/A"}</span>
          )}
          <button
            type="button"
            onClick={() => setSelectedWord(null)}
            className="icon-btn ml-auto h-6 w-6 text-[13px]"
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
              <div className="space-y-2">
                <p>{t("caption.waiting")}</p>
                <p className="text-[11.5px] max-w-sm mx-auto text-[var(--ink-faint)]">
                  {t("caption.chromeTip")}
                </p>
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
                className={`group rounded-xl p-3 transition-all duration-150 ${
                  isActive
                    ? "bg-[var(--row-active)] border border-[var(--accent)]/40 shadow-xs"
                    : "hover:bg-[var(--surface)] border border-transparent"
                }`}
              >
                <div className="flex items-start gap-2.5">
                  {/* Timestamp button (click to seek & replay from exact first word) */}
                  <div className="shrink-0 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        // 0.25s pre-roll buffer so the very first word or consonant is never cut off
                        const target = Math.max(0, seg.start - 0.25);
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
                  <div className="flex-1 min-w-0">
                    <p
                      className="font-medium text-[var(--ink)] select-text"
                      style={{
                        fontSize: `${settings.fontSize}px`,
                        lineHeight: settings.lineHeight,
                      }}
                    >
                      {seg.text.split(/(\s+)/).map((token, i) => {
                        if (/^\s+$/.test(token)) return <span key={i}>{token}</span>;
                        return (
                          <button
                            key={i}
                            type="button"
                            onClick={() => void lookupWord(token)}
                            className="inline-block rounded-xs hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] px-0.5 transition cursor-pointer"
                            title="Click to translate this word"
                          >
                            {token}
                          </button>
                        );
                      })}
                    </p>

                    {settings.showTranslation && seg.translations ? (
                      <div className="mt-1 space-y-0.5">
                        {Object.entries(seg.translations).map(([lang, text]) => (
                          <p
                            key={lang}
                            className="text-[var(--ink-soft)] select-text"
                            style={{ fontSize: `${Math.max(12, Math.round(settings.fontSize * 0.8))}px` }}
                          >
                            <span className="mr-1.5 font-mono text-[10px] uppercase text-[var(--ink-faint)]">
                              {lang}
                            </span>
                            {text}
                          </p>
                        ))}
                      </div>
                    ) : settings.showTranslation && seg.translation ? (
                      <p
                        className="mt-1 text-[var(--ink-soft)] select-text"
                        style={{
                          fontSize: `${Math.max(12, Math.round(settings.fontSize * 0.8))}px`,
                        }}
                      >
                        {seg.translation}
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
    </section>
  );
}
