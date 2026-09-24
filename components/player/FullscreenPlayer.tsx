"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useUi } from "@/lib/i18n";
import { resolveTranslationLang } from "@/lib/language";
import { usePlayer } from "./PlayerProvider";
import { Transport } from "./Transport";
import { Art } from "../listen/Art";
import { TranscriptReader } from "./TranscriptReader";
import {
  CaptionSettings,
  DEFAULT_CAPTION_SETTINGS,
  loadCaptionSettings,
  saveCaptionSettings,
  type CaptionSettingsState,
} from "../caption/CaptionSettings";

/** How long the artwork and transport stay expanded with nothing touched
 * before docking into the small bottom bar - the same "fade after a few
 * quiet seconds" idea `autoHide` already has for the floating caption bar,
 * just applied here so reading the transcript gets the screen instead of
 * competing with a full-size player above it. */
const AUTO_HIDE_DELAY_MS = 4500;

/**
 * Overrides the same custom properties the site's own theme sets, fixed to
 * a dark palette regardless of which theme is active.
 *
 * Every "now playing" screen - Apple Podcasts, Apple Music, Spotify - reads
 * dark text over artwork the same way whether the phone is in light or dark
 * mode, because the artwork's own brightness varies too much for a
 * theme-driven palette to stay legible on all of it. Everything under this
 * still uses var(--ink) etc., so buttons, the transport and the transcript
 * inherit it for free rather than needing their own dark variants.
 */
const NOW_PLAYING_VARS: CSSProperties = {
  ["--paper" as string]: "#0b0c0e",
  ["--paper-raised" as string]: "#1e2024",
  ["--ink" as string]: "#f5f5f4",
  ["--ink-soft" as string]: "#c7c7c5",
  ["--ink-faint" as string]: "#9a9a97",
  ["--rule" as string]: "#3a3c40",
  ["--surface" as string]: "#25272b",
  ["--accent" as string]: "#ffffff",
  ["--accent-ring" as string]: "#ffffff",
  ["--accent-soft" as string]: "#2c2e32",
};

/**
 * The "now playing" screen every music and podcast app has: everything else
 * steps aside, the artwork fills the background, and the transcript reads
 * along beneath the transport. Mounted once at the root - like the mini
 * player it replaces - so it opens over whatever page is underneath and
 * survives navigation while it's up.
 */
export function FullscreenPlayer() {
  const {
    track,
    handle,
    mediaState,
    retry,
    fullscreenOpen,
    setFullscreenOpen,
    transcriptOffsetSec,
    setTranscriptOffsetSec,
  } = usePlayer();
  const { t } = useUi();
  const [currentTime, setCurrentTime] = useState(0);
  const [settings, setSettings] = useState<CaptionSettingsState>(DEFAULT_CAPTION_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const [docked, setDocked] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    setSettings(loadCaptionSettings());
  }, []);

  const handleUpdateSettings = (next: CaptionSettingsState) => {
    setSettings(next);
    saveCaptionSettings(next);
  };

  // Un-docks the artwork/transport (if docked) and restarts the quiet timer.
  // Called on open and from every interaction that should keep them visible
  // a little longer, so the screen never docks itself away mid-scrub.
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

  // Esc closes it, matching every other full-screen surface in the app.
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

  // Push history state to support native iPhone swipe-back gesture
  useEffect(() => {
    if (!fullscreenOpen) return;
    
    // Add hash to history so swipe back just pops it
    window.history.pushState(null, "", "#now-playing");
    
    const onPopState = () => {
      if (fullscreenOpen) setFullscreenOpen(false);
    };
    
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
      // Clean up the hash if we closed it without swiping back
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

  return (
    <div className="fixed inset-0 z-[80] overflow-hidden" style={NOW_PLAYING_VARS}>
      {/* A solid base first: the artwork layer below is transparent whenever
          there's no artwork URL (or it fails to load), and 60% black alone
          isn't opaque enough to hide the page underneath - so this screen
          must never depend on the artwork having loaded to read as solid. */}
      <div aria-hidden className="pointer-events-none fixed inset-0 bg-[var(--paper)]" />
      {/* The episode's own artwork, blurred hard and darkened, so the screen
          reads as "about this episode" without needing a second image asset. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 bg-cover bg-center opacity-90 blur-3xl saturate-150"
        style={track.artwork ? { backgroundImage: `url(${track.artwork})` } : undefined}
      />
      <div aria-hidden className="pointer-events-none fixed inset-0 bg-black/75" />

      <div className="relative mx-auto flex h-full w-full max-w-2xl flex-col px-4 pb-4 pt-3 sm:px-6">
        <div className="flex shrink-0 items-center justify-between py-1">
          <button
            type="button"
            onClick={() => setFullscreenOpen(false)}
            className="icon-btn text-[18px]"
            aria-label={t("player.exitFullscreen")}
            title={t("player.exitFullscreen")}
          >
            ⌄
          </button>
          <p className="max-w-[55%] truncate text-[12px] font-medium uppercase tracking-wide text-[var(--ink-faint)]">
            {track.showTitle}
          </p>
          <button
            type="button"
            onClick={() => {
              setShowSettings((v) => !v);
              resetAutoHide();
            }}
            className="icon-btn text-[13px] font-semibold"
            aria-expanded={showSettings}
            title={t("caption.textSize")}
          >
            Aa
          </button>
        </div>

        {showSettings ? (
          <div className="mt-2 shrink-0 rounded-xl bg-[var(--surface)] p-2">
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

        {!docked ? (
          <>
            <div className="mt-3 flex shrink-0 flex-col items-center text-center">
              <Art src={track.artwork} alt="" size={148} seed={track.showTitle || track.title} />
              <h1 className="mt-4 line-clamp-2 text-[18px] font-semibold leading-snug text-[var(--ink)]">
                {track.title}
              </h1>
              <p className="mt-1 text-[12.5px] text-[var(--ink-soft)]">{track.showTitle}</p>
            </div>

            <div className="mt-4 shrink-0" onPointerDown={resetAutoHide}>
              <Transport handle={handle} state={mediaState} onRetry={retry} />
            </div>
          </>
        ) : null}

        <div className="mt-2 min-h-0 flex-1">
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

        {/* Docked once "Auto-hide" has been quiet a while: artwork, title and
            transport shrink into one small bar pinned to the bottom, so the
            transcript above gets almost the whole screen to read. Tapping
            anywhere on it but the play button expands it back; the play
            button stops its own tap from doing that, so pausing does not
            also yank the full player back open. */}
        {docked ? (
          <div
            role="button"
            tabIndex={0}
            onClick={resetAutoHide}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") resetAutoHide();
            }}
            aria-label={t("player.expandNowPlaying")}
            className="mt-2 flex shrink-0 cursor-pointer items-center gap-3 rounded-2xl bg-[var(--surface)]/80 px-3 py-2 opacity-70 backdrop-blur transition hover:opacity-100 active:scale-[0.99]"
          >
            <Art src={track.artwork} alt="" size={36} seed={track.showTitle || track.title} />
            <div className="min-w-0 flex-1 text-left">
              <p className="truncate text-[12.5px] font-medium text-[var(--ink)]">{track.title}</p>
              <p className="truncate text-[10.5px] text-[var(--ink-faint)]">{track.showTitle}</p>
            </div>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                if (handle.isPlaying()) handle.pause();
                else handle.play();
              }}
              aria-label={handle.isPlaying() ? t("common.pause") : t("common.play")}
              className="btn btn-primary grid h-9 w-9 shrink-0 place-items-center rounded-full p-0 text-[12px]"
            >
              {handle.isPlaying() ? "❚❚" : "▶"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
