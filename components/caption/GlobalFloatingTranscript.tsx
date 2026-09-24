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

  const shouldFloat = pathname !== "/" || !inlineVisible;
  if (!track || !showTranscript || !shouldFloat) return null;

  const onSeekWithPlay = (seconds: number) => {
    handle.seekTo(seconds, true);
    if (!handle.isPlaying()) {
      handle.play();
    }
  };

  return (
    <aside
      aria-label="Floating Transcript"
      className="hidden sm:block fixed z-40 max-w-xl transition-all duration-300 pointer-events-auto sm:left-6 sm:w-[480px] max-sm:inset-x-3 drop-shadow-[0_12px_40px_rgba(0,0,0,0.15)]"
      style={{
        // Stacks neatly above the quick navigation pill on the left
        bottom: "calc(70px + env(safe-area-inset-bottom, 0px))",
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
        isFloating={true}
      />
    </aside>
  );
}
