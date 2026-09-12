"use client";

import { useEffect, useRef, useState } from "react";
import { useUi } from "@/lib/i18n";
import {
  liveCaptionService,
  type CaptionSegment,
} from "@/lib/liveCaption";
import {
  CaptionSettings,
  type CaptionSettingsState,
} from "./CaptionSettings";

interface LiveTranscriptPanelProps {
  currentTime: number;
  onSeek: (seconds: number) => void;
  onClose: () => void;
  settings: CaptionSettingsState;
  onUpdateSettings: (settings: CaptionSettingsState) => void;
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

  const containerRef = useRef<HTMLDivElement | null>(null);
  const activeItemRef = useRef<HTMLDivElement | null>(null);

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

  return (
    <section className="card mt-4 flex flex-col overflow-hidden border border-[var(--rule)] bg-[var(--paper-raised)] shadow-lg transition-all duration-200">
      {/* Top Header & Toolbar */}
      <div className="border-b border-[var(--rule)] p-3.5 bg-[var(--surface)]/50">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[18px]">📜</span>
            <h3 className="text-[15px] font-semibold text-[var(--ink)]">
              {t("caption.transcript")}
            </h3>
            <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--accent)]">
              {segments.length} {t("common.episodes") !== "episodes" ? "câu" : "lines"}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <CaptionSettings
              settings={settings}
              onChange={onUpdateSettings}
              compact
            />
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
                ✕
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
              {copied ? `✓ ${t("caption.copied")}` : `📋 ${t("caption.copyAll")}`}
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
        <div className="border-b border-amber-500/20 bg-amber-500/10 px-4 py-2 text-[12.5px] text-amber-900 dark:text-amber-200 flex items-center gap-2">
          <span className="font-bold">📖 {selectedWord}:</span>
          {loadingWord ? (
            <span className="animate-pulse">{t("caption.translating")}</span>
          ) : (
            <span>{wordMeaning || "N/A"}</span>
          )}
          <button
            type="button"
            onClick={() => setSelectedWord(null)}
            className="ml-auto text-amber-700 dark:text-amber-300 hover:opacity-80"
          >
            ✕
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
              <p>Không tìm thấy câu nào phù hợp với từ khóa.</p>
            ) : (
              <div className="space-y-2">
                <p className="animate-pulse">🎙️ {t("caption.waiting")}</p>
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
                  {/* Timestamp button (click to seek) */}
                  <button
                    type="button"
                    onClick={() => onSeek(seg.start)}
                    className="shrink-0 font-mono text-[11px] font-semibold text-[var(--ink-faint)] group-hover:text-[var(--accent)] rounded bg-[var(--surface)] px-1.5 py-0.5 transition"
                    title={`Seek to ${formatTime(seg.start)}`}
                  >
                    ▶ {formatTime(seg.start)}
                  </button>

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

                    {settings.showTranslation && seg.translation && (
                      <p
                        className="mt-1 text-[var(--ink-soft)] select-text"
                        style={{
                          fontSize: `${Math.max(12, Math.round(settings.fontSize * 0.8))}px`,
                        }}
                      >
                        {seg.translation}
                      </p>
                    )}

                    {/* AI Grammar explanation if loaded */}
                    {grammarNotes[seg.id] && (
                      <div className="mt-2 rounded-lg bg-[var(--accent-soft)] p-2 text-[12px] text-[var(--accent)] border border-[var(--accent)]/20">
                        <span className="font-semibold">💡 {t("caption.explain")}:</span>{" "}
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
                      {loadingGrammarId === seg.id ? "…" : "✨ AI"}
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
            className="btn btn-primary py-1 px-3 text-[11.5px] shadow-sm animate-bounce"
          >
            ↓ {t("caption.jumpCurrent")}
          </button>
        </div>
      )}
    </section>
  );
}
