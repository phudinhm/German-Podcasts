"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { usePlayer } from "@/components/player/PlayerProvider";
import { LiveTranscriptPanel } from "./LiveTranscriptPanel";
import { DEFAULT_CAPTION_SETTINGS, loadCaptionSettings, saveCaptionSettings, type CaptionSettingsState } from "./CaptionSettings";

/**
 * The running transcript, floating above whatever page you are on.
 *
 * Mounted once in the root layout so it survives navigation between pages.
 * Anchored to the left rather than the right: the docked mini player also
 * lives at the bottom-right corner of the screen, and two independent fixed
 * panels claiming the same corner is exactly the kind of overlap that makes an
 * interface feel cluttered rather than merely busy.
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
      className="fixed z-40 max-w-xl transition-all duration-300 pointer-events-auto sm:left-6 sm:w-[480px] max-sm:inset-x-3"
      style={{
        // Enough clearance for the mini player's tallest state (an open card,
        // not the tucked button) plus the safe area, so a phone where both
        // are visible stacks them instead of layering one over the other.
        bottom: "calc(96px + env(safe-area-inset-bottom, 14px))",
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
