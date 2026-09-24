"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useUi } from "@/lib/i18n";
import { resolveTranslationLang } from "@/lib/language";
import { listVocabulary } from "@/lib/vocabulary";
import { usePlayer } from "./PlayerProvider";
import { Art } from "../listen/Art";
import { TranscriptReader } from "./TranscriptReader";
import { VocabularyModal } from "../caption/VocabularyModal";
import {
  CaptionSettings,
  DEFAULT_CAPTION_SETTINGS,
  loadCaptionSettings,
  saveCaptionSettings,
  type CaptionSettingsState,
} from "../caption/CaptionSettings";

const AUTO_HIDE_DELAY_MS = 4500;
const PLAYER_THEME_KEY = "hoerbar.playerTheme.v1";

export type PlayerThemeId =
  | "amber"
  | "oled"
  | "ocean"
  | "forest"
  | "rose"
  | "amethyst"
  | "sepia";

export const PLAYER_THEMES: Record<
  PlayerThemeId,
  {
    name: string;
    swatch: string;
    overlayClass: string;
    vars: CSSProperties;
  }
> = {
  amber: {
    name: "Amber Classic",
    swatch: "#f59e0b",
    overlayClass: "bg-black/75",
    vars: {
      ["--paper" as string]: "#0b0c0e",
      ["--paper-raised" as string]: "#1e2024",
      ["--ink" as string]: "#f5f5f4",
      ["--ink-soft" as string]: "#c7c7c5",
      ["--ink-faint" as string]: "#9a9a97",
      ["--rule" as string]: "#3a3c40",
      ["--surface" as string]: "#25272b",
      ["--accent" as string]: "#fbbf24",
      ["--accent-ring" as string]: "#fbbf24",
      ["--accent-soft" as string]: "#2c2e32",
    },
  },
  oled: {
    name: "Midnight OLED",
    swatch: "#18181b",
    overlayClass: "bg-black/92",
    vars: {
      ["--paper" as string]: "#000000",
      ["--paper-raised" as string]: "#111113",
      ["--ink" as string]: "#ffffff",
      ["--ink-soft" as string]: "#a1a1aa",
      ["--ink-faint" as string]: "#71717a",
      ["--rule" as string]: "#27272a",
      ["--surface" as string]: "#141417",
      ["--accent" as string]: "#ffffff",
      ["--accent-ring" as string]: "#ffffff",
      ["--accent-soft" as string]: "#1f1f23",
    },
  },
  ocean: {
    name: "Nordic Ocean",
    swatch: "#0ea5e9",
    overlayClass: "bg-slate-950/80",
    vars: {
      ["--paper" as string]: "#06111f",
      ["--paper-raised" as string]: "#0d2138",
      ["--ink" as string]: "#f0f9ff",
      ["--ink-soft" as string]: "#bae6fd",
      ["--ink-faint" as string]: "#7dd3fc",
      ["--rule" as string]: "#1e3a5f",
      ["--surface" as string]: "#102844",
      ["--accent" as string]: "#38bdf8",
      ["--accent-ring" as string]: "#38bdf8",
      ["--accent-soft" as string]: "#163558",
    },
  },
  forest: {
    name: "Emerald Matcha",
    swatch: "#10b981",
    overlayClass: "bg-emerald-950/80",
    vars: {
      ["--paper" as string]: "#061811",
      ["--paper-raised" as string]: "#0d291e",
      ["--ink" as string]: "#ecfdf5",
      ["--ink-soft" as string]: "#a7f3d0",
      ["--ink-faint" as string]: "#6ee7b7",
      ["--rule" as string]: "#164e3a",
      ["--surface" as string]: "#103326",
      ["--accent" as string]: "#34d399",
      ["--accent-ring" as string]: "#34d399",
      ["--accent-soft" as string]: "#144030",
    },
  },
  rose: {
    name: "Sunset Rose",
    swatch: "#f43f5e",
    overlayClass: "bg-rose-950/80",
    vars: {
      ["--paper" as string]: "#1a0810",
      ["--paper-raised" as string]: "#2d111e",
      ["--ink" as string]: "#fff1f2",
      ["--ink-soft" as string]: "#fecdd3",
      ["--ink-faint" as string]: "#fda4af",
      ["--rule" as string]: "#4c1d32",
      ["--surface" as string]: "#371525",
      ["--accent" as string]: "#fb7185",
      ["--accent-ring" as string]: "#fb7185",
      ["--accent-soft" as string]: "#461b2f",
    },
  },
  amethyst: {
    name: "Royal Amethyst",
    swatch: "#a855f7",
    overlayClass: "bg-purple-950/80",
    vars: {
      ["--paper" as string]: "#110820",
      ["--paper-raised" as string]: "#21123a",
      ["--ink" as string]: "#faf5ff",
      ["--ink-soft" as string]: "#e9d5ff",
      ["--ink-faint" as string]: "#c084fc",
      ["--rule" as string]: "#3b2163",
      ["--surface" as string]: "#2a1748",
      ["--accent" as string]: "#c084fc",
      ["--accent-ring" as string]: "#c084fc",
      ["--accent-soft" as string]: "#351e5a",
    },
  },
  sepia: {
    name: "Warm Sepia",
    swatch: "#d97706",
    overlayClass: "bg-stone-950/80",
    vars: {
      ["--paper" as string]: "#1c1610",
      ["--paper-raised" as string]: "#2c231a",
      ["--ink" as string]: "#fef3c7",
      ["--ink-soft" as string]: "#fde68a",
      ["--ink-faint" as string]: "#d6b98c",
      ["--rule" as string]: "#443627",
      ["--surface" as string]: "#352a1f",
      ["--accent" as string]: "#f59e0b",
      ["--accent-ring" as string]: "#f59e0b",
      ["--accent-soft" as string]: "#423426",
    },
  },
};

const SPEED_LEVELS = [
  0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1.0, 1.1, 1.15, 1.25, 1.4, 1.5, 1.75, 2.0,
];

function formatClock(sec: number): string {
  if (!isFinite(sec) || sec < 0) return "0:00";
  const total = Math.floor(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function FullscreenPlayer() {
  const {
    track,
    handle,
    duration,
    fullscreenOpen,
    setFullscreenOpen,
    transcriptOffsetSec,
    setTranscriptOffsetSec,
  } = usePlayer();
  const { t } = useUi();
  const [currentTime, setCurrentTime] = useState(0);
  const [settings, setSettings] = useState<CaptionSettingsState>(DEFAULT_CAPTION_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const [showSpeedPicker, setShowSpeedPicker] = useState(false);
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [showVocabModal, setShowVocabModal] = useState(false);
  const [vocabCount, setVocabCount] = useState(0);
  const [playerTheme, setPlayerTheme] = useState<PlayerThemeId>("amber");
  const [docked, setDocked] = useState(false);
  const [speed, setSpeed] = useState(1);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const applySpeed = (nextSpeed: number) => {
    const clamped = Math.round(Math.max(0.4, Math.min(2.5, nextSpeed)) * 100) / 100;
    setSpeed(clamped);
    handle.setRate(clamped);
  };

  useEffect(() => {
    setSettings(loadCaptionSettings());
    try {
      const savedTheme = localStorage.getItem(PLAYER_THEME_KEY) as PlayerThemeId | null;
      if (savedTheme && PLAYER_THEMES[savedTheme]) {
        setPlayerTheme(savedTheme);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const updateVocabCount = () => setVocabCount(listVocabulary().length);
    updateVocabCount();
    window.addEventListener("hoerbar:vocab-changed", updateVocabCount);
    return () => window.removeEventListener("hoerbar:vocab-changed", updateVocabCount);
  }, []);

  const handleSelectPlayerTheme = (id: PlayerThemeId) => {
    setPlayerTheme(id);
    try {
      localStorage.setItem(PLAYER_THEME_KEY, id);
    } catch {
      // ignore
    }
  };

  const handleUpdateSettings = (next: CaptionSettingsState) => {
    setSettings(next);
    saveCaptionSettings(next);
  };

  const toggleLanguage = () => {
    const nextLang = translationLang === "vi" ? "en" : "vi";
    handleUpdateSettings({ ...settings, translationLang: nextLang });
  };

  const resetAutoHide = useCallback(() => {
    window.clearTimeout(hideTimerRef.current);
    setDocked(false);
    if (!settings.autoHide) return;
    hideTimerRef.current = setTimeout(() => setDocked(true), AUTO_HIDE_DELAY_MS);
  }, [settings.autoHide]);

  useEffect(() => {
    if (!fullscreenOpen) return;
    resetAutoHide();
    return () => window.clearTimeout(hideTimerRef.current);
  }, [fullscreenOpen, resetAutoHide]);

  useEffect(() => {
    if (!fullscreenOpen) return;
    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      setCurrentTime(handle.getTime());
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [fullscreenOpen, handle]);

  useEffect(() => {
    if (!fullscreenOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (window.location.hash === "#now-playing") window.history.back();
        else setFullscreenOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreenOpen, setFullscreenOpen]);

  useEffect(() => {
    if (!fullscreenOpen) return;
    window.history.pushState(null, "", "#now-playing");
    const onPopState = () => {
      if (fullscreenOpen) setFullscreenOpen(false);
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
      if (window.location.hash === "#now-playing") {
        window.history.back();
      }
    };
  }, [fullscreenOpen, setFullscreenOpen]);

  if (!track || !fullscreenOpen) return null;

  const onSeekWithPlay = (seconds: number) => {
    handle.seekTo(seconds, true);
    if (!handle.isPlaying()) handle.play();
  };

  const translationLang = resolveTranslationLang(track.sourceLang ?? "de", settings.translationLang);
  const activeThemeConfig = PLAYER_THEMES[playerTheme] ?? PLAYER_THEMES.amber;

  const effectiveDuration = duration > 0 ? duration : Math.max(currentTime + 1, 1);
  const progressPct =
    duration > 0 ? Math.max(0, Math.min(100, (currentTime / duration) * 100)) : 0;
  const remainingSec = duration > 0 ? Math.max(0, duration - currentTime) : 0;

  return (
    <div className="fixed inset-0 z-[80] overflow-hidden" style={activeThemeConfig.vars}>
      <div aria-hidden className="pointer-events-none fixed inset-0 bg-[var(--paper)] transition-colors duration-500" />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 bg-cover bg-center opacity-75 blur-3xl saturate-150 transition-all duration-700"
        style={track.artwork ? { backgroundImage: `url(${track.artwork})` } : undefined}
      />
      <div
        aria-hidden
        className={`pointer-events-none fixed inset-0 transition-colors duration-500 ${activeThemeConfig.overlayClass}`}
      />

      <div className="relative mx-auto flex h-full w-full max-w-2xl flex-col px-3 pt-[max(env(safe-area-inset-top,0px),12px)] pb-[max(env(safe-area-inset-bottom,0px),14px)] sm:px-6">
        {/* Top bar */}
        <div className="flex shrink-0 items-center justify-between gap-2 py-1">
          <button
            type="button"
            onClick={() => setFullscreenOpen(false)}
            className="icon-btn text-[20px] active:scale-95"
            aria-label={t("player.exitFullscreen")}
            title={t("player.exitFullscreen")}
          >
            ⌄
          </button>

          <p className="max-w-[35%] sm:max-w-[45%] truncate text-[11.5px] font-semibold uppercase tracking-wider text-[var(--ink-faint)]">
            {track.showTitle}
          </p>

          <div className="flex items-center gap-1.5">
            {/* Saved Vocabulary button */}
            <button
              type="button"
              onClick={() => setShowVocabModal(true)}
              className="inline-flex items-center gap-1 rounded-full border border-amber-400/35 bg-amber-400/15 px-2.5 py-0.5 text-[11px] font-semibold text-amber-200 transition hover:bg-amber-400/25 active:scale-95"
              title="Sổ từ vựng đã lưu"
            >
              <span>⭐</span>
              <span className="hidden sm:inline">Từ vựng</span>
              <span className="rounded-full bg-amber-400/25 px-1.5 text-[10px] text-amber-100">
                {vocabCount}
              </span>
            </button>

            {/* Theme Picker button */}
            <button
              type="button"
              onClick={() => {
                setShowThemePicker((v) => !v);
                setShowSpeedPicker(false);
                setShowSettings(false);
              }}
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold transition active:scale-95 ${
                showThemePicker
                  ? "border-white/40 bg-white/20 text-white"
                  : "border-white/20 bg-white/10 text-white hover:bg-white/20"
              }`}
              title="Đổi giao diện màu (Theme)"
            >
              <span
                className="h-2.5 w-2.5 rounded-full border border-white/40"
                style={{ backgroundColor: activeThemeConfig.swatch }}
              />
              <span className="hidden sm:inline">Theme</span>
            </button>

            {/* Translation Language toggle */}
            <button
              type="button"
              onClick={toggleLanguage}
              className="px-2 py-0.5 text-[11px] font-semibold rounded-full border border-white/20 bg-white/10 hover:bg-white/20 text-amber-200 transition active:scale-95"
              title="Đổi ngôn ngữ dịch (VI / EN)"
            >
              {translationLang.toUpperCase()}
            </button>

            {/* Reader Typography & Sync Settings */}
            <button
              type="button"
              onClick={() => {
                setShowSettings((v) => !v);
                setShowThemePicker(false);
                setShowSpeedPicker(false);
                resetAutoHide();
              }}
              className={`icon-btn text-[13px] font-semibold transition ${
                showSettings ? "bg-white/20 text-white" : ""
              }`}
              aria-expanded={showSettings}
              title={t("caption.textSize")}
            >
              Aa
            </button>
          </div>
        </div>

        {/* Theme Picker Popover */}
        {showThemePicker && (
          <div className="absolute left-3 right-3 sm:left-auto sm:right-6 sm:w-80 top-14 z-30 rounded-2xl bg-[var(--surface)] p-3.5 shadow-2xl border border-[var(--rule)] backdrop-blur-xl animate-in fade-in slide-in-from-top-2 duration-150">
            <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-[var(--rule)]">
              <span className="text-xs font-bold text-[var(--ink)]">
                🎨 Chọn chủ đề giao diện (Theme)
              </span>
              <button
                type="button"
                onClick={() => setShowThemePicker(false)}
                className="icon-btn text-sm"
              >
                ✕
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(PLAYER_THEMES) as PlayerThemeId[]).map((id) => {
                const item = PLAYER_THEMES[id];
                const active = playerTheme === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => handleSelectPlayerTheme(id)}
                    className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 text-left text-xs font-medium transition ${
                      active
                        ? "border-amber-400 bg-amber-400/15 text-white shadow-sm"
                        : "border-white/10 bg-white/5 text-white/75 hover:bg-white/10"
                    }`}
                  >
                    <span
                      className="h-4 w-4 shrink-0 rounded-full border border-white/30 shadow-inner"
                      style={{ backgroundColor: item.swatch }}
                    />
                    <span className="truncate">{item.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Caption & Reader Settings Popover */}
        {showSettings ? (
          <div className="absolute left-4 right-4 top-14 z-30 rounded-2xl bg-[var(--surface)] p-3.5 shadow-2xl border border-[var(--rule)] backdrop-blur-xl animate-in fade-in slide-in-from-top-2 duration-150">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-[var(--rule)]">
              <span className="text-[13px] font-semibold text-[var(--ink)]">
                {t("common.settings")}
              </span>
              <button
                type="button"
                onClick={() => setShowSettings(false)}
                className="icon-btn text-[16px]"
                aria-label={t("common.close")}
              >
                ×
              </button>
            </div>
            <CaptionSettings
              settings={settings}
              onChange={handleUpdateSettings}
              compact
              sourceLang={track.sourceLang}
              syncOffsetSec={transcriptOffsetSec}
              onSyncOffsetChange={setTranscriptOffsetSec}
            />
          </div>
        ) : null}

        {/* Optional expanded header artwork when not docked */}
        {!docked ? (
          <div className="mt-1 mb-1 flex shrink-0 items-center gap-3.5 rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 backdrop-blur-md">
            <Art src={track.artwork} alt="" size={52} seed={track.showTitle || track.title} />
            <div className="min-w-0 flex-1">
              <h1 className="line-clamp-1 text-sm sm:text-base font-bold leading-snug text-[var(--ink)]">
                {track.title}
              </h1>
              <p className="mt-0.5 truncate text-xs text-[var(--ink-soft)]">
                {track.showTitle}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDocked(true)}
              className="rounded-xl border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/60 hover:bg-white/10 hover:text-white"
              title="Thu gọn tiêu đề để mở rộng khung đọc transcript"
            >
              Thu gọn
            </button>
          </div>
        ) : null}

        {/* Main Transcript Reader */}
        <div className="mt-1 min-h-0 flex-1">
          <TranscriptReader
            currentTime={currentTime}
            onSeek={onSeekWithPlay}
            showTranslation={settings.showTranslation}
            translationLang={translationLang}
            autoScroll={settings.autoScroll}
            fontSize={settings.fontSize + 2}
            fontFamily={settings.fontFamily}
            theme={settings.captionTheme}
            translationVisibility={settings.translationVisibility}
          />
        </div>

        {/* Multi-level Speed Picker Popover (anchored above the bottom media bar) */}
        {showSpeedPicker && (
          <div className="mt-2 rounded-2xl border border-white/15 bg-zinc-900/95 p-3 shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-bottom-2 duration-150">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-bold text-white">
                ⚡ Tốc độ phát đa mức (Playback Speed)
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => applySpeed(speed - 0.05)}
                  className="rounded-lg border border-white/15 bg-white/10 px-2 py-0.5 font-mono text-xs font-bold text-white hover:bg-white/20"
                >
                  −0.05×
                </button>
                <span className="min-w-[48px] text-center font-mono text-xs font-bold text-amber-300">
                  {speed.toFixed(2).replace(/\.00$/, ".0")}×
                </span>
                <button
                  type="button"
                  onClick={() => applySpeed(speed + 0.05)}
                  className="rounded-lg border border-white/15 bg-white/10 px-2 py-0.5 font-mono text-xs font-bold text-white hover:bg-white/20"
                >
                  +0.05×
                </button>
                <button
                  type="button"
                  onClick={() => setShowSpeedPicker(false)}
                  className="ml-1 rounded-lg p-1 text-xs text-white/60 hover:text-white"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
              {SPEED_LEVELS.map((lvl) => {
                const isSelected = Math.abs(speed - lvl) < 0.01;
                return (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => applySpeed(lvl)}
                    className={`rounded-xl py-1.5 font-mono text-[11.5px] font-semibold transition ${
                      isSelected
                        ? "bg-amber-400 text-zinc-950 font-bold shadow-sm"
                        : "bg-white/5 text-white/80 hover:bg-white/15"
                    }`}
                  >
                    {lvl}×
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Upgraded Bottom Media Bar ("thanh media cuối cùng"):
            Always displays subtle listening progress bar + timestamps + multi-level speed + transport controls */}
        <div
          onPointerDown={resetAutoHide}
          className="mt-2 shrink-0 rounded-2xl border border-white/15 bg-[var(--surface)]/90 px-3.5 py-2.5 shadow-2xl backdrop-blur-xl transition"
        >
          {/* Row 1: Subtle interactive progress bar with elapsed, percentage & remaining time */}
          <div className="mb-2 flex items-center gap-2.5">
            <span className="w-10 text-right font-mono text-[11px] tabular-nums text-[var(--ink-soft)]">
              {formatClock(currentTime)}
            </span>

            <div className="relative flex-1 flex items-center">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/15">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-400 via-orange-300 to-amber-200 transition-all duration-150"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <input
                type="range"
                min={0}
                max={effectiveDuration}
                step={0.5}
                value={Math.min(currentTime, effectiveDuration)}
                onChange={(e) => handle.seekTo(Number(e.target.value), true)}
                aria-label="Thanh tiến trình phát"
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </div>

            <span className="hidden sm:inline-block rounded-full bg-amber-400/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-amber-300 tabular-nums">
              {Math.round(progressPct)}%
            </span>

            <span className="w-12 font-mono text-[11px] tabular-nums text-[var(--ink-faint)]">
              {duration > 0 ? `-${formatClock(remainingSec)}` : "--:--"}
            </span>
          </div>

          {/* Row 2: Artwork + Title + Multi-level Speed + Transport buttons */}
          <div className="flex items-center justify-between gap-2 sm:gap-3">
            {/* Episode mini info */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => setDocked((d) => !d)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") setDocked((d) => !d);
              }}
              className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-left"
              title="Bấm để ẩn/hiện thông tin tập ở phía trên"
            >
              <Art src={track.artwork} alt="" size={38} seed={track.showTitle || track.title} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] font-semibold text-[var(--ink)]">
                  {track.title}
                </p>
                <p className="truncate text-[10.5px] text-[var(--ink-faint)]">
                  {track.showTitle}
                </p>
              </div>
            </div>

            {/* Multi-level Speed stepper & menu button */}
            <div className="flex items-center rounded-full border border-white/15 bg-black/30 p-0.5">
              <button
                type="button"
                onClick={() => applySpeed(speed - 0.1)}
                className="flex h-7 w-6 items-center justify-center rounded-full text-xs font-bold text-white/75 hover:bg-white/15 hover:text-white"
                title="Giảm tốc độ 0.1×"
              >
                −
              </button>
              <button
                type="button"
                onClick={() => setShowSpeedPicker((v) => !v)}
                className="px-1.5 font-mono text-[11.5px] font-bold text-amber-300 hover:text-amber-200"
                title="Chọn tốc độ phát nhiều mức (0.5× - 2.0×)"
              >
                {speed}×
              </button>
              <button
                type="button"
                onClick={() => applySpeed(speed + 0.1)}
                className="flex h-7 w-6 items-center justify-center rounded-full text-xs font-bold text-white/75 hover:bg-white/15 hover:text-white"
                title="Tăng tốc độ 0.1×"
              >
                +
              </button>
            </div>

            {/* Transport controls: -10s, Play/Pause, +15s */}
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => handle.seekTo(Math.max(0, handle.getTime() - 10), true)}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/10 font-mono text-[11px] font-semibold text-white transition hover:bg-white/20 active:scale-95"
                title="Tua lùi 10 giây"
              >
                -10s
              </button>

              <button
                type="button"
                onClick={() => {
                  if (handle.isPlaying()) handle.pause();
                  else handle.play();
                }}
                aria-label={handle.isPlaying() ? t("common.pause") : t("common.play")}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-400 text-zinc-950 font-bold shadow-lg transition hover:bg-amber-300 active:scale-95"
              >
                {handle.isPlaying() ? "❚❚" : "▶"}
              </button>

              <button
                type="button"
                onClick={() => handle.seekTo(handle.getTime() + 15, true)}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/10 font-mono text-[11px] font-semibold text-white transition hover:bg-white/20 active:scale-95"
                title="Tua tới 15 giây"
              >
                +15s
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Saved Vocabulary Modal */}
      <VocabularyModal
        open={showVocabModal}
        onClose={() => setShowVocabModal(false)}
        onSeek={onSeekWithPlay}
      />
    </div>
  );
}
