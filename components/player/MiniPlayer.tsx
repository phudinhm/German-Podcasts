"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useUi } from "@/lib/i18n";
import { usePlayer } from "./PlayerProvider";
import { Art } from "../listen/Art";

const COLLAPSED_KEY = "hoerbar.dock.collapsed.v1";

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

/**
 * The player that stays with you once the full one has scrolled away.
 *
 * It used to be hidden on the listening page, on the theory that two sets of
 * controls for one stream is a way to lose track of which one you pressed. In
 * practice the full card scrolls off after a screen of episodes and playback
 * became unreachable: to pause, you scrolled back up. So the rule is no longer
 * "which page is this" but "can you already see the controls". The provider
 * reports that, and this appears the moment the answer is no, on every page.
 *
 * It docks to the right rather than spanning the width, so it covers a corner
 * of the list instead of a whole line of it, and it tucks away to a single
 * button for anyone who wants the corner back. That choice is remembered,
 * because a listener who tucked it away once meant it.
 */
export function MiniPlayer() {
  const { t } = useUi();
  const { track, handle, stop, mediaState, inlineVisible } = usePlayer();
  const pathname = usePathname();
  const [playing, setPlaying] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const fillRef = useRef<HTMLDivElement | null>(null);
  const timeRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSED_KEY) === "1");
    } catch {
      // Storage can be unavailable; showing the player is the safe default.
    }
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((value) => {
      const next = !value;
      try {
        window.localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        // Not remembering the preference is not worth an error.
      }
      return next;
    });
  }, []);

  useEffect(() => {
    let frame = 0;
    let last = false;
    function tick() {
      frame = requestAnimationFrame(tick);
      const duration = handle.getDuration();
      const time = handle.getTime();
      if (fillRef.current && duration > 0) {
        fillRef.current.style.width = `${Math.min(100, (time / duration) * 100)}%`;
      }
      if (timeRef.current) timeRef.current.textContent = formatTime(time);
      const isPlaying = handle.isPlaying();
      if (isPlaying !== last) {
        last = isPlaying;
        setPlaying(isPlaying);
      }
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [handle]);

  if (!track) return null;
  // The full player is on screen and does the same job better.
  if (inlineVisible) return null;

  const hasVideoLayer = track.kind !== "audio";
  const onListen = pathname === "/";

  if (collapsed) {
    return (
      <div data-dock="tucked" className="fixed right-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom,0px))] z-50 sm:right-4 sm:bottom-[calc(1rem+env(safe-area-inset-bottom,0px))]">
        <button
          type="button"
          onClick={toggleCollapsed}
          className="card flex h-12 w-12 items-center justify-center rounded-full p-0 text-[15px] shadow-[var(--shadow-pop)]"
          aria-label={t("player.expand")}
          title={`${t("player.expand")} - ${track.title}`}
        >
          <span aria-hidden className="text-[var(--accent)]">
            {playing ? "❚❚" : "▶"}
          </span>
        </button>
      </div>
    );
  }

  return (
    // The wrapper spans the width but ignores pointer events, so the card can
    // sit at the right on a wide screen and still stretch to the full width of
    // a phone, where a 420px card would not fit anyway.
    <div data-dock="open" className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-end px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] sm:px-4 sm:pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
      <div className="card pointer-events-auto flex w-full max-w-[420px] items-center gap-2.5 p-2 shadow-[var(--shadow-pop)] sm:gap-3">
        {/* Space reserved for the docked video layer, which is fixed-positioned. */}
        {hasVideoLayer ? <span className="h-[52px] w-[92px] shrink-0" aria-hidden /> : null}

        {!hasVideoLayer ? (
          <Art src={track.artwork} alt="" size={40} seed={track.showTitle || track.title} />
        ) : null}

        <button
          type="button"
          onClick={() => (handle.isPlaying() ? handle.pause() : handle.play())}
          className="btn btn-primary h-10 w-10 shrink-0 rounded-full p-0 text-[13px]"
          aria-label={playing ? t("common.pause") : t("common.play")}
        >
          {playing ? "❚❚" : "▶"}
        </button>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium leading-tight">{track.title}</p>
          <p className="truncate text-[11.5px] text-[var(--ink-faint)]">
            {mediaState.loading ? t("player.buffering") : track.showTitle}
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <span
              ref={timeRef}
              className="shrink-0 font-mono text-[10px] tabular-nums text-[var(--ink-faint)]"
            >
              0:00
            </span>
            <span className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--rule)]">
              <span ref={fillRef} className="block h-full bg-[var(--accent-ring)]" style={{ width: 0 }} />
            </span>
          </div>
        </div>

        {/* On the listening page the full player is a scroll away rather than a
            navigation, so this link would only reload the page you are on. */}
        {!onListen ? (
          <Link
            href="/"
            className="icon-btn shrink-0 text-[14px]"
            aria-label={t("player.miniOpen")}
            title={t("player.miniOpen")}
          >
            <span aria-hidden>&#8963;</span>
          </Link>
        ) : null}

        <div className="flex shrink-0 flex-col">
          <button
            type="button"
            onClick={toggleCollapsed}
            className="icon-btn h-7 w-7 text-[14px]"
            aria-label={t("player.collapse")}
            title={t("player.collapse")}
          >
            <span aria-hidden>&rsaquo;</span>
          </button>
          <button
            type="button"
            onClick={stop}
            className="icon-btn h-7 w-7 text-[15px]"
            aria-label={t("player.miniClose")}
            title={t("player.miniClose")}
          >
            &times;
          </button>
        </div>
      </div>
    </div>
  );
}
