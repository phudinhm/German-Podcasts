"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useUi } from "@/lib/i18n";
import { useSwipe } from "@/lib/useSwipe";
import { resolveTranslationLang } from "@/lib/language";
import { listVocabulary } from "@/lib/vocabulary";
import { usePlayer, useVideoStage } from "./PlayerProvider";
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
  | "light"
  | "daylight"
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
    isLight?: boolean;
    overlayClass: string;
    vars: CSSProperties;
  }
> = {
  light: {
    name: "Light Paper (Sáng ấm)",
    swatch: "#faf7f2",
    isLight: true,
    overlayClass: "bg-[#faf7f2]/88",
    vars: {
      ["--paper" as string]: "#faf7f2",
      ["--paper-raised" as string]: "#ffffff",
      ["--ink" as string]: "#161514",
      ["--ink-soft" as string]: "#3f3c38",
      ["--ink-faint" as string]: "#706b63",
      ["--rule" as string]: "#e2dcd1",
      ["--surface" as string]: "#f3efe7",
      ["--accent" as string]: "#b45309",
      ["--accent-ring" as string]: "#d97706",
      ["--accent-soft" as string]: "#fef3c7",
    },
  },
  daylight: {
    name: "Pure Daylight (Trắng sáng)",
    swatch: "#ffffff",
    isLight: true,
    overlayClass: "bg-slate-50/90",
    vars: {
      ["--paper" as string]: "#f8fafc",
      ["--paper-raised" as string]: "#ffffff",
      ["--ink" as string]: "#0f172a",
      ["--ink-soft" as string]: "#334155",
      ["--ink-faint" as string]: "#64748b",
      ["--rule" as string]: "#e2e8f0",
      ["--surface" as string]: "#f1f5f9",
      ["--accent" as string]: "#0284c7",
      ["--accent-ring" as string]: "#0ea5e9",
      ["--accent-soft" as string]: "#e0f2fe",
    },
  },
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
    isVideoTrack,
    waitingForTranscript,
    mediaElement,
    playbackRate: speed,
    setPlaybackRate,
  } = usePlayer();
  const videoStageRef = useVideoStage(Boolean(fullscreenOpen && isVideoTrack));
  const { t } = useUi();
  const [currentTime, setCurrentTime] = useState(0);
  const [settings, setSettings] = useState<CaptionSettingsState>(DEFAULT_CAPTION_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const [showSpeedPicker, setShowSpeedPicker] = useState(false);
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [showVocabModal, setShowVocabModal] = useState(false);
  const [vocabCount, setVocabCount] = useState(0);
  const [playerTheme, setPlayerTheme] = useState<PlayerThemeId>("light");
  const [docked, setDocked] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const applySpeed = (nextSpeed: number) => {
    const clamped = Math.round(Math.max(0.4, Math.min(2.5, nextSpeed)) * 100) / 100;
    setPlaybackRate(clamped);
  };

  useEffect(() => {
    setSettings(loadCaptionSettings());
    const syncWithSiteTheme = () => {
      try {
        const savedTheme = localStorage.getItem(PLAYER_THEME_KEY) as PlayerThemeId | null;
        if (savedTheme && PLAYER_THEMES[savedTheme]) {
          setPlayerTheme(savedTheme);
          return;
        }
      } catch {}
      const isSiteDark =
        typeof document !== "undefined" && document.documentElement.classList.contains("dark");
      setPlayerTheme(isSiteDark ? "amber" : "light");
    };
    syncWithSiteTheme();

    if (typeof MutationObserver !== "undefined" && typeof document !== "undefined") {
      const obs = new MutationObserver(() => {
        const isSiteDark = document.documentElement.classList.contains("dark");
        setPlayerTheme((prev) => {
          if (isSiteDark && (prev === "light" || prev === "daylight")) return "amber";
          if (!isSiteDark && prev !== "light" && prev !== "daylight") return "light";
          return prev;
        });
      });
      obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
      return () => obs.disconnect();
    }
    return undefined;
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

  const [dragY, setDragY] = useState(0);
  const [swipeHud, setSwipeHud] = useState<string | null>(null);
  const hudTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flashHud = useCallback((text: string) => {
    setSwipeHud(text);
    if (hudTimerRef.current) clearTimeout(hudTimerRef.current);
    hudTimerRef.current = setTimeout(() => setSwipeHud(null), 900);
  }, []);

  const topSwipe = useSwipe({
    threshold: 55,
    onDragMove: (dx, dy) => {
      if (dy > 0 && Math.abs(dy) > Math.abs(dx)) {
        setDragY(Math.min(260, dy * 0.78));
      }
    },
    onDragEnd: () => {
      setDragY(0);
    },
    onSwipeDown: () => {
      setDragY(0);
      setFullscreenOpen(false);
    },
    onSwipeLeft: () => {
      handle.seekTo(handle.getTime() + 30, true);
      flashHud("+30s ↻");
    },
    onSwipeRight: () => {
      handle.seekTo(Math.max(0, handle.getTime() - 10), true);
      flashHud("↺ -10s");
    },
  });

  if (!track || !fullscreenOpen) return null;

  const onSeekWithPlay = (seconds: number) => {
    handle.seekTo(seconds, true);
    if (!handle.isPlaying()) handle.play();
  };

  const translationLang = resolveTranslationLang(track.sourceLang ?? "de", settings.translationLang);
  const activeThemeConfig = PLAYER_THEMES[playerTheme] ?? PLAYER_THEMES.light;
  const isLight = Boolean(activeThemeConfig.isLight);

  const effectiveDuration = duration > 0 ? duration : Math.max(currentTime + 1, 1);
  const progressPct =
    duration > 0 ? Math.max(0, Math.min(100, (currentTime / duration) * 100)) : 0;
  const remainingSec = duration > 0 ? Math.max(0, duration - currentTime) : 0;

  const sheetOpacity = Math.max(0.18, 1 - dragY / 420);
  const sheetScale = Math.max(0.92, 1 - dragY / 2800);

  return (
    <div className="fixed inset-0 z-[80] overflow-hidden animate-ios-sheet text-[var(--ink)]" style={activeThemeConfig.vars}>
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 bg-[var(--paper)] transition-colors duration-500"
        style={{ opacity: sheetOpacity }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 bg-cover bg-center blur-3xl saturate-150 transition-all duration-700"
        style={{
          ...(track.artwork ? { backgroundImage: `url(${track.artwork})` } : {}),
          opacity: sheetOpacity * (isLight ? 0.22 : 0.75),
        }}
      />
      <div
        aria-hidden
        className={`pointer-events-none fixed inset-0 transition-colors duration-500 ${activeThemeConfig.overlayClass}`}
        style={{ opacity: sheetOpacity }}
      />

      {swipeHud ? (
        <div className="pointer-events-none fixed left-1/2 top-16 z-50 -translate-x-1/2 rounded-full bg-black/80 px-4 py-1.5 font-mono text-xs font-bold text-amber-300 shadow-xl backdrop-blur-md animate-panel-in">
          {swipeHud}
        </div>
      ) : null}

      <div
        className={`relative mx-auto flex h-full w-full max-w-2xl flex-col px-3 pt-[max(env(safe-area-inset-top,0px),8px)] pb-[max(env(safe-area-inset-bottom,0px),14px)] sm:px-6 ${
          dragY > 0 ? "transition-none" : "transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
        }`}
        style={
          dragY > 0
            ? {
                transform: `translate3d(0, ${dragY}px, 0) scale(${sheetScale})`,
                borderTopLeftRadius: 32,
                borderTopRightRadius: 32,
                boxShadow: "0 -16px 48px rgba(0,0,0,0.45)",
              }
            : undefined
        }
      >
        {/* iOS grabber pill */}
        <div
          {...topSwipe}
          className="flex flex-col items-center pt-1 pb-0.5 cursor-grab active:cursor-grabbing select-none"
        >
          <span
            className={`h-1.5 w-11 rounded-full transition-colors ${
              isLight ? "bg-black/20 hover:bg-black/35" : "bg-white/30 hover:bg-white/45"
            }`}
          />
        </div>

        {/* Top bar */}
        <div
          {...topSwipe}
          className="flex shrink-0 items-center justify-between gap-2 py-1 select-none"
        >
          <button
            type="button"
            onClick={() => {
              if (isVideoTrack) {
                const el = mediaElement() as HTMLVideoElement | null;
                if (
                  el &&
                  !el.paused &&
                  "requestPictureInPicture" in el &&
                  typeof document !== "undefined" &&
                  !document.pictureInPictureElement
                ) {
                  void el.requestPictureInPicture().catch(() => {});
                }
              }
              setFullscreenOpen(false);
            }}
            className="icon-btn text-[20px] text-[var(--ink)] active:scale-95"
            aria-label={t("player.exitFullscreen")}
            title={t("player.exitFullscreen")}
          >
            ⌄
          </button>

          <p className="max-w-[30%] sm:max-w-[40%] truncate text-[11.5px] font-semibold uppercase tracking-wider text-[var(--ink-faint)]">
            {track.showTitle}
          </p>

          <div className="flex items-center gap-1.5">
            {/* Saved Vocabulary button */}
            <button
              type="button"
              onClick={() => setShowVocabModal(true)}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition active:scale-95 ${
                isLight
                  ? "border-amber-600/30 bg-amber-500/15 text-amber-900 hover:bg-amber-500/25"
                  : "border-amber-400/35 bg-amber-400/15 text-amber-200 hover:bg-amber-400/25"
              }`}
              title="Sổ từ vựng đã lưu"
            >
              <span>⭐</span>
              <span className="hidden sm:inline">Từ vựng</span>
              <span
                className={`rounded-full px-1.5 text-[10px] ${
                  isLight ? "bg-amber-600/20 text-amber-950" : "bg-amber-400/25 text-amber-100"
                }`}
              >
                {vocabCount}
              </span>
            </button>

            {/* 1-Tap Light / Dark Quick Switch */}
            <button
              type="button"
              onClick={() => handleSelectPlayerTheme(isLight ? "amber" : "light")}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition active:scale-95 ${
                isLight
                  ? "border-[var(--rule)] bg-[var(--paper-raised)] text-[var(--ink)] shadow-2xs hover:bg-[var(--surface)]"
                  : "border-white/20 bg-white/10 text-white hover:bg-white/20"
              }`}
              title={isLight ? "Chuyển sang giao diện Tối (Dark Theme)" : "Chuyển sang giao diện Sáng (Light Theme)"}
            >
              <span>{isLight ? "☀️" : "🌙"}</span>
              <span className="hidden sm:inline">{isLight ? "Light" : "Dark"}</span>
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
                isLight
                  ? showThemePicker
                    ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--ink)]"
                    : "border-[var(--rule)] bg-[var(--paper-raised)] text-[var(--ink)] hover:bg-[var(--surface)]"
                  : showThemePicker
                    ? "border-white/40 bg-white/20 text-white"
                    : "border-white/20 bg-white/10 text-white hover:bg-white/20"
              }`}
              title="Đổi giao diện màu (Theme)"
            >
              <span
                className="h-2.5 w-2.5 rounded-full border border-black/25 dark:border-white/40"
                style={{ backgroundColor: activeThemeConfig.swatch }}
              />
              <span className="hidden sm:inline">Theme</span>
            </button>

            {/* Translation Language toggle */}
            <button
              type="button"
              onClick={toggleLanguage}
              className={`px-2 py-0.5 text-[11px] font-semibold rounded-full border transition active:scale-95 ${
                isLight
                  ? "border-[var(--rule)] bg-[var(--paper-raised)] text-[var(--accent)] hover:bg-[var(--surface)]"
                  : "border-white/20 bg-white/10 hover:bg-white/20 text-amber-200"
              }`}
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
              className={`icon-btn text-[13px] font-semibold text-[var(--ink)] transition ${
                showSettings ? "bg-[var(--accent-soft)] text-[var(--accent)]" : ""
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
          <div className="absolute left-3 right-3 sm:left-auto sm:right-6 sm:w-80 top-14 z-30 rounded-2xl bg-[var(--paper-raised)] p-3.5 shadow-2xl border border-[var(--rule)] backdrop-blur-xl animate-in fade-in slide-in-from-top-2 duration-150">
            <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-[var(--rule)]">
              <span className="text-xs font-bold text-[var(--ink)]">
                🎨 Chọn chủ đề giao diện (Light / Dark)
              </span>
              <button
                type="button"
                onClick={() => setShowThemePicker(false)}
                className="icon-btn text-sm text-[var(--ink)]"
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
                        ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--ink)] font-semibold shadow-sm"
                        : "border-[var(--rule)] bg-[var(--surface)]/60 text-[var(--ink-soft)] hover:bg-[var(--surface)]"
                    }`}
                  >
                    <span
                      className="h-4 w-4 shrink-0 rounded-full border border-black/20 shadow-inner"
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
          <div className="absolute left-4 right-4 top-14 z-30 rounded-2xl bg-[var(--paper-raised)] p-3.5 shadow-2xl border border-[var(--rule)] backdrop-blur-xl animate-in fade-in slide-in-from-top-2 duration-150">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-[var(--rule)]">
              <span className="text-[13px] font-semibold text-[var(--ink)]">
                {t("common.settings")}
              </span>
              <button
                type="button"
                onClick={() => setShowSettings(false)}
                className="icon-btn text-[16px] text-[var(--ink)]"
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

        {/* YouTube-style Top Center Video Player when playing a video podcast */}
        {isVideoTrack ? (
          <div {...topSwipe} className="mt-1 mb-2 flex flex-col items-center shrink-0 select-none">
            <div
              ref={videoStageRef}
              className="mx-auto w-full max-w-xl aspect-video max-h-[28vh] sm:max-h-[34vh] rounded-2xl overflow-hidden bg-black border border-[var(--rule)] shadow-2xl"
            />
            <p className="mt-1.5 max-w-xl truncate text-center text-xs font-semibold text-[var(--ink-soft)]">
              {track.title}
            </p>
          </div>
        ) : !docked ? (
          <div
            {...topSwipe}
            className={`mt-1 mb-1 flex shrink-0 items-center gap-3.5 rounded-2xl border px-3.5 py-2.5 backdrop-blur-md select-none ${
              isLight
                ? "border-[var(--rule)] bg-[var(--paper-raised)]/90 shadow-xs"
                : "border-white/10 bg-white/[0.04]"
            }`}
          >
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
              className={`rounded-xl border px-2.5 py-1 text-[11px] transition ${
                isLight
                  ? "border-[var(--rule)] bg-[var(--surface)] text-[var(--ink-soft)] hover:text-[var(--ink)]"
                  : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
              }`}
              title="Thu gọn tiêu đề để mở rộng khung đọc transcript"
            >
              Thu gọn
            </button>
          </div>
        ) : null}

        {/* Main Transcript Reader (Directly below Top-Center Video, just like YouTube) */}
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
            isLightTheme={isLight}
          />
        </div>

        {/* Multi-level Speed Picker Popover (anchored above the bottom media bar) */}
        {showSpeedPicker && (
          <div className="mt-2 rounded-2xl border border-[var(--rule)] bg-[var(--paper-raised)] p-3 shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-bottom-2 duration-150">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-bold text-[var(--ink)]">
                ⚡ Tốc độ phát đa mức (Playback Speed)
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => applySpeed(speed - 0.05)}
                  className="rounded-lg border border-[var(--rule)] bg-[var(--surface)] px-2 py-0.5 font-mono text-xs font-bold text-[var(--ink)] hover:opacity-85"
                >
                  −0.05×
                </button>
                <span className="min-w-[48px] text-center font-mono text-xs font-bold text-[var(--accent)]">
                  {speed.toFixed(2).replace(/\.00$/, ".0")}×
                </span>
                <button
                  type="button"
                  onClick={() => applySpeed(speed + 0.05)}
                  className="rounded-lg border border-[var(--rule)] bg-[var(--surface)] px-2 py-0.5 font-mono text-xs font-bold text-[var(--ink)] hover:opacity-85"
                >
                  +0.05×
                </button>
                <button
                  type="button"
                  onClick={() => setShowSpeedPicker(false)}
                  className="ml-1 rounded-lg p-1 text-xs text-[var(--ink-faint)] hover:text-[var(--ink)]"
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
                        ? "bg-[var(--accent)] text-white font-bold shadow-sm"
                        : "bg-[var(--surface)] text-[var(--ink-soft)] hover:text-[var(--ink)]"
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
          className={`mt-2 shrink-0 rounded-2xl border px-3.5 py-2.5 shadow-2xl backdrop-blur-xl transition ${
            isLight
              ? "border-[var(--rule)] bg-[var(--paper-raised)]/95"
              : "border-white/15 bg-[var(--surface)]/90"
          }`}
        >
          {/* Row 1: Subtle interactive progress bar with elapsed, percentage & remaining time */}
          <div className="mb-2 flex items-center gap-2.5">
            <span className="w-10 text-right font-mono text-[11px] tabular-nums text-[var(--ink-soft)]">
              {formatClock(currentTime)}
            </span>

            <div className="relative flex-1 flex items-center">
              <div className={`h-1.5 w-full overflow-hidden rounded-full ${isLight ? "bg-black/10" : "bg-white/15"}`}>
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-500 via-orange-400 to-amber-400 transition-all duration-150"
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

            <span
              className={`hidden sm:inline-block rounded-full px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums ${
                isLight ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "bg-amber-400/15 text-amber-300"
              }`}
            >
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
            <div
              className={`flex items-center rounded-full border p-0.5 ${
                isLight ? "border-[var(--rule)] bg-[var(--surface)]" : "border-white/15 bg-black/30"
              }`}
            >
              <button
                type="button"
                onClick={() => applySpeed(speed - 0.1)}
                className="flex h-7 w-6 items-center justify-center rounded-full text-xs font-bold text-[var(--ink-soft)] hover:bg-black/10 dark:hover:bg-white/15 hover:text-[var(--ink)]"
                title="Giảm tốc độ 0.1×"
              >
                −
              </button>
              <button
                type="button"
                onClick={() => setShowSpeedPicker((v) => !v)}
                className="px-1.5 font-mono text-[11.5px] font-bold text-[var(--accent)]"
                title="Chọn tốc độ phát nhiều mức (0.5× - 2.0×)"
              >
                {speed}×
              </button>
              <button
                type="button"
                onClick={() => applySpeed(speed + 0.1)}
                className="flex h-7 w-6 items-center justify-center rounded-full text-xs font-bold text-[var(--ink-soft)] hover:bg-black/10 dark:hover:bg-white/15 hover:text-[var(--ink)]"
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
                className={`flex h-9 w-9 items-center justify-center rounded-full border font-mono text-[11px] font-semibold transition active:scale-95 ${
                  isLight
                    ? "border-[var(--rule)] bg-[var(--surface)] text-[var(--ink)] hover:bg-black/10"
                    : "border-white/15 bg-white/10 text-white hover:bg-white/20"
                }`}
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
                className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent)] text-white font-bold shadow-lg transition hover:opacity-95 active:scale-95"
              >
                {handle.isPlaying() ? "❚❚" : "▶"}
              </button>

              <button
                type="button"
                onClick={() => handle.seekTo(handle.getTime() + 15, true)}
                className={`flex h-9 w-9 items-center justify-center rounded-full border font-mono text-[11px] font-semibold transition active:scale-95 ${
                  isLight
                    ? "border-[var(--rule)] bg-[var(--surface)] text-[var(--ink)] hover:bg-black/10"
                    : "border-white/15 bg-white/10 text-white hover:bg-white/20"
                }`}
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
