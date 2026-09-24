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
  // Split from the raw visibility condition so closing can play the
  // panel-reveal transition before the panel (and its live subscriptions)
  // actually unmounts, instead of popping out the instant any of track /
  // showTranscript / shouldFloat flips - which is every one of the ways
  // this panel is meant to disappear, not just the close button.
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
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
  const shouldShow = Boolean(track) && showTranscript && shouldFloat;

  useEffect(() => {
    if (shouldShow) {
      setMounted(true);
      const raf = requestAnimationFrame(() => setOpen(true));
      return () => cancelAnimationFrame(raf);
    }
    setOpen(false);
    const closeDur =
      parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--panel-close-dur")) || 350;
    const timeout = setTimeout(() => setMounted(false), closeDur);
    return () => clearTimeout(timeout);
  }, [shouldShow]);

  if (!mounted) return null;

  const onSeekWithPlay = (seconds: number) => {
    handle.seekTo(seconds, true);
    if (!handle.isPlaying()) {
      handle.play();
    }
  };

  return (
    <aside
      aria-label="Floating Transcript"
      data-open={open ? "true" : "false"}
      className="t-panel-slide hidden sm:block fixed z-40 max-w-xl sm:left-6 sm:w-[480px] max-sm:inset-x-3 drop-shadow-[0_12px_40px_rgba(0,0,0,0.15)]"
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
