"use client";

import { useEffect, useState } from "react";
import { useUi } from "@/lib/i18n";
import { usePlayer } from "./PlayerProvider";
import { Transport } from "./Transport";
import { Art } from "../listen/Art";
import { LiveTranscriptPanel } from "../caption/LiveTranscriptPanel";
import {
  DEFAULT_CAPTION_SETTINGS,
  loadCaptionSettings,
  saveCaptionSettings,
  type CaptionSettingsState,
} from "../caption/CaptionSettings";

/**
 * The "now playing" screen every music and podcast app has: everything else
 * steps aside, the artwork fills the background, and the transcript scrolls
 * alongside the transport. Mounted once at the root - like the mini player it
 * replaces - so it opens over whatever page is underneath and survives
 * navigation while it's up.
 */
export function FullscreenPlayer() {
  const { track, handle, mediaState, retry, fullscreenOpen, setFullscreenOpen } = usePlayer();
  const { t } = useUi();
  const [currentTime, setCurrentTime] = useState(0);
  const [settings, setSettings] = useState<CaptionSettingsState>(DEFAULT_CAPTION_SETTINGS);
  // Collapsing the transcript here tucks it into the compact bar and keeps
  // the rest of the now-playing screen up - closing this whole screen is a
  // separate, explicit action (the chevron at the top, or Esc).
  const [transcriptCollapsed, setTranscriptCollapsed] = useState(false);

  useEffect(() => {
    setSettings(loadCaptionSettings());
  }, []);

  const handleUpdateSettings = (next: CaptionSettingsState) => {
    setSettings(next);
    saveCaptionSettings(next);
  };

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
      if (event.key === "Escape") setFullscreenOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreenOpen, setFullscreenOpen]);

  if (!track || !fullscreenOpen) return null;

  const onSeekWithPlay = (seconds: number) => {
    handle.seekTo(seconds, true);
    if (!handle.isPlaying()) handle.play();
  };

  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-[var(--paper)]">
      {/* The episode's own artwork, blurred hard and darkened, so the screen
          reads as "about this episode" without needing a second image asset. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 bg-cover bg-center opacity-40 blur-3xl saturate-150"
        style={track.artwork ? { backgroundImage: `url(${track.artwork})` } : undefined}
      />
      <div aria-hidden className="pointer-events-none fixed inset-0 bg-[var(--paper)]/55" />

      <div className="relative mx-auto flex min-h-full w-full max-w-2xl flex-col px-4 pb-10 pt-4 sm:px-6">
        <div className="flex items-center justify-between py-2">
          <button
            type="button"
            onClick={() => setFullscreenOpen(false)}
            className="icon-btn text-[18px]"
            aria-label={t("player.exitFullscreen")}
            title={t("player.exitFullscreen")}
          >
            ⌄
          </button>
          <p className="max-w-[70%] truncate text-[12px] font-medium uppercase tracking-wide text-[var(--ink-faint)]">
            {track.showTitle}
          </p>
          <span className="w-[18px]" aria-hidden />
        </div>

        <div className="mt-4 flex flex-col items-center text-center">
          <Art src={track.artwork} alt="" size={260} seed={track.showTitle || track.title} />
          <h1 className="mt-5 line-clamp-2 text-[22px] font-semibold leading-snug text-[var(--ink)]">
            {track.title}
          </h1>
          <p className="mt-1 text-[13px] text-[var(--ink-soft)]">{track.showTitle}</p>
        </div>

        <div className="mt-6">
          <Transport handle={handle} state={mediaState} onRetry={retry} />
        </div>

        <div className="mt-2 flex-1">
          <LiveTranscriptPanel
            currentTime={currentTime}
            onSeek={onSeekWithPlay}
            onClose={() => setTranscriptCollapsed(true)}
            settings={settings}
            onUpdateSettings={handleUpdateSettings}
            isCollapsed={transcriptCollapsed}
            onToggleCollapse={() => setTranscriptCollapsed((v) => !v)}
          />
        </div>
      </div>
    </div>
  );
}
