"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { usePlayer } from "@/components/player/PlayerProvider";
import { useUi } from "@/lib/i18n";
import { LiveTranscriptPanel } from "./LiveTranscriptPanel";
import { DEFAULT_CAPTION_SETTINGS, loadCaptionSettings, saveCaptionSettings, type CaptionSettingsState } from "./CaptionSettings";

const SIZE_KEY = "hoerbar.transcript.size.v1";
const DEFAULT_SIZE = { width: 480, height: 560 };
const MIN_WIDTH = 320;
const MIN_HEIGHT = 280;
// Matches --panel-close-dur in globals.css - the panel stays mounted for
// exactly this long after closing so the close transition can play, then
// unmounts for real, freeing it from the per-frame currentTime re-renders
// that would otherwise keep costing something while merely hidden.
const CLOSE_ANIMATION_MS = 350;

function loadSize(): { width: number; height: number } {
  if (typeof window === "undefined") return DEFAULT_SIZE;
  try {
    const raw = window.localStorage.getItem(SIZE_KEY);
    if (raw) return { ...DEFAULT_SIZE, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_SIZE;
}

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
  const { t } = useUi();
  const [currentTime, setCurrentTime] = useState(0);
  const [settings, setSettings] = useState<CaptionSettingsState>(DEFAULT_CAPTION_SETTINGS);
  const [size, setSize] = useState(DEFAULT_SIZE);
  // Split from `showTranscript` so closing can play its transition before
  // the panel (and the live subscriptions inside it) actually unmounts,
  // while opening still mounts closed-then-open rather than pre-opened -
  // a value that starts already "open" never triggers the CSS transition.
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    setSettings(loadCaptionSettings());
    setSize(loadSize());
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

  useEffect(() => {
    if (showTranscript) {
      setMounted(true);
      const raf = requestAnimationFrame(() => setOpen(true));
      return () => cancelAnimationFrame(raf);
    }
    setOpen(false);
    const timeout = setTimeout(() => setMounted(false), CLOSE_ANIMATION_MS);
    return () => clearTimeout(timeout);
  }, [showTranscript]);

  // Remembers whatever size someone drags the panel's own resize handle to,
  // so it opens the same way next time instead of back at the default.
  //
  // A callback ref rather than useRef+useEffect: the aside can start
  // rendering well after `open`/`transcriptCollapsed` last changed value -
  // e.g. opening the transcript while the embedded copy on the homepage is
  // still on screen mounts it with the state machine already "open", and
  // only scrolling away later actually puts the <aside> in the DOM. A
  // dependency-array effect never reruns at that point, since neither
  // tracked value changed, so it would silently miss attaching the
  // observer. A callback ref instead fires exactly when React attaches or
  // detaches this specific node, independent of what else did or didn't.
  const panelRef = useCallback(
    (node: HTMLDivElement | null) => {
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      if (!node || transcriptCollapsed) return;
      const observer = new ResizeObserver(([entry]) => {
        const { width, height } = entry.contentRect;
        if (width < 10 || height < 10) return; // a display:none measurement, not a real resize
        const next = { width: Math.round(width), height: Math.round(height) };
        setSize(next);
        try {
          window.localStorage.setItem(SIZE_KEY, JSON.stringify(next));
        } catch {}
      });
      observer.observe(node);
      resizeObserverRef.current = observer;
    },
    [transcriptCollapsed],
  );

  if (!track) return null;

  // On homepage when the inline card's transcript is already visible and not collapsed,
  // we don't duplicate it. But when scrolled down or on other pages, show it floating!
  const isHomepage = pathname === "/";
  const shouldFloat = !isHomepage || !inlineVisible || transcriptCollapsed;

  if (isHomepage && !shouldFloat) {
    // Rendered inline on ListenClient instead.
    return null;
  }

  const onSeekWithPlay = (seconds: number) => {
    handle.seekTo(seconds, true);
    if (!handle.isPlaying()) {
      handle.play();
    }
  };

  return (
    <>
      {/* The one way to bring the floating transcript back once it's been
          closed - small and out of the way at bottom-centre rather than
          competing with the mini player's own corner. */}
      {!showTranscript ? (
        <button
          type="button"
          onClick={() => setShowTranscript(true)}
          className="btn fixed inset-x-0 bottom-[calc(96px+env(safe-area-inset-bottom,14px))] z-40 mx-auto hidden w-fit items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-medium shadow-[var(--shadow-pop)] sm:flex"
          title={t("caption.transcript")}
        >
          <span aria-hidden>▤</span>
          {t("caption.transcript")}
        </button>
      ) : null}

      {mounted ? (
        <aside
          ref={panelRef}
          aria-label="Floating Transcript"
          data-open={open ? "true" : "false"}
          className={`t-panel-slide hidden sm:block fixed z-40 sm:left-6 max-sm:inset-x-3 ${
            transcriptCollapsed
              ? "max-w-xl"
              : "resize overflow-hidden max-w-[calc(100vw-3rem)] max-h-[calc(100vh-140px)]"
          }`}
          style={{
            // Enough clearance for the mini player's tallest state (an open card,
            // not the tucked button) plus the safe area, so a phone where both
            // are visible stacks them instead of layering one over the other.
            bottom: "calc(96px + env(safe-area-inset-bottom, 14px))",
            ...(transcriptCollapsed
              ? { width: 480 }
              : { width: size.width, height: size.height, minWidth: MIN_WIDTH, minHeight: MIN_HEIGHT }),
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
            fillHeight={!transcriptCollapsed}
          />
        </aside>
      ) : null}
    </>
  );
}
