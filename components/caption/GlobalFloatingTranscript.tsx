"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { usePlayer } from "@/components/player/PlayerProvider";
import { LiveTranscriptPanel } from "./LiveTranscriptPanel";
import { DEFAULT_CAPTION_SETTINGS, loadCaptionSettings, saveCaptionSettings, type CaptionSettingsState } from "./CaptionSettings";

/**
 * Global Floating Live Transcript.
 * Mounted in root layout so it persists and continues updating across all pages (/ , /library, /about).
 * Appears with subtle glassmorphism blur when enabled and can be collapsed to a slim capsule.
 */
export function GlobalFloatingTranscript() {
  const { track, handle, showTranscript, setShowTranscript, transcriptCollapsed, setTranscriptCollapsed, inlineVisible } = usePlayer();
  const [currentTime, setCurrentTime] = useState(0);
  const [settings, setSettings] = useState<CaptionSettingsState>(DEFAULT_CAPTION_SETTINGS);
  const pathname = usePathname();

  useEffect(() => {
    setSettings(loadCaptionSettings());
  }, []);

  const handleUpdateSettings = (next: CaptionSettingsState) => {
    setSettings(next);
    saveCaptionSettings(next);
  };

  // Clock sync
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      if (handle.isPlaying()) {
        setCurrentTime(handle.getTime());
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [handle]);

  if (!track || !showTranscript) return null;

  // On homepage when the inline card's transcript is already visible and not collapsed,
  // we don't duplicate it. But when scrolled down or on other pages, show it floating!
  const isHomepage = pathname === "/";
  const shouldFloat = !isHomepage || !inlineVisible || transcriptCollapsed;

  const onSeekWithPlay = (seconds: number) => {
    handle.seekTo(seconds, true);
    if (!handle.isPlaying()) {
      handle.play();
    }
  };

  if (!shouldFloat && isHomepage) {
    // Rendered inline on ListenClient if preferred, or handled globally
    return null;
  }

  return (
    <aside
      aria-label="Floating Transcript"
      className="fixed z-40 max-w-xl transition-all duration-300 pointer-events-auto sm:right-6 sm:w-[480px] max-sm:inset-x-3"
      style={{
        bottom: "calc(80px + env(safe-area-inset-bottom, 14px))",
      }}
    >
      <LiveTranscriptPanel
        currentTime={currentTime}
        onSeek={onSeekWithPlay}
        onClose={() => setShowTranscript(false)}
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
        isCollapsed={transcriptCollapsed}
        onToggleCollapse={() => setTranscriptCollapsed((v) => !v)}
      />
    </aside>
  );
}
