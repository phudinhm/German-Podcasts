"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PlayerHandle } from "./types";
import type { MediaElementState } from "./useMediaElement";
import { useUi } from "@/lib/i18n";

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

/** Accepts "ss", "mm:ss" or "hh:mm:ss" (each part 1+ digits); anything else,
 * including a negative or empty part, is not a time someone meant to type. */
function parseTimeInput(raw: string): number | null {
  const parts = raw.trim().split(":");
  if (parts.length < 1 || parts.length > 3 || parts.some((part) => !/^\d+$/.test(part))) return null;
  const nums = parts.map(Number);
  return nums.reduce((total, part) => total * 60 + part, 0);
}

/**
 * Transport bar for a streamed audio or video element.
 *
 * The browser's own controls are hidden because they do not know about the A-B
 * loop or the speed ramp sitting beside them. This one shows what a stream
 * actually needs: how much is buffered ahead, whether it is stalled, and where
 * you are.
 *
 * The layout stacks rather than shrinks. Squeezed onto one row at 390px the
 * scrubber came out about thirty pixels wide, between two skip buttons, which
 * is not a control so much as a dare. So the bar gets its own full-width row
 * and the buttons sit under it, centred, at a size a thumb can hit. On a wide
 * screen both rows fit side by side and it collapses back to one line.
 *
 * The playhead is written straight to the DOM from a rAF loop rather than held
 * in state, so a moving progress bar costs no React renders.
 */
export function Transport({
  handle,
  state,
  onRetry,
  onPlayProxy,
  compact = false,
}: {
  handle: PlayerHandle;
  state: MediaElementState;
  onRetry?: () => void;
  onPlayProxy?: () => void;
  compact?: boolean;
}) {
  const fillRef = useRef<HTMLDivElement | null>(null);
  const bufferRef = useRef<HTMLDivElement | null>(null);
  const timeRef = useRef<HTMLSpanElement | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);
  const timeInputRef = useRef<HTMLInputElement | null>(null);
  const { t } = useUi();
  const [playing, setPlaying] = useState(false);
  // Tapping the elapsed-time label turns it into a "jump to time" field -
  // the one way to reach an arbitrary point directly by typing, rather than
  // dragging or repeated skip-button taps, which matters most on an episode
  // long enough that dragging a stretched-thin scrubber is imprecise.
  const [editingTime, setEditingTime] = useState(false);
  const [timeInput, setTimeInput] = useState("");

  useEffect(() => {
    let frame = 0;
    let lastPlaying = false;
    function tick() {
      frame = requestAnimationFrame(tick);
      const duration = handle.getDuration();
      const time = handle.getTime();
      if (fillRef.current && duration > 0) {
        fillRef.current.style.width = `${Math.min(100, (time / duration) * 100)}%`;
      }
      if (bufferRef.current && duration > 0) {
        bufferRef.current.style.width = `${Math.min(100, (state.buffered / duration) * 100)}%`;
      }
      if (timeRef.current) timeRef.current.textContent = formatTime(time);
      const isPlaying = handle.isPlaying();
      if (isPlaying !== lastPlaying) {
        lastPlaying = isPlaying;
        setPlaying(isPlaying);
      }
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [handle, state.buffered]);

  const seekFromEvent = useCallback(
    (clientX: number) => {
      const bar = barRef.current;
      const duration = handle.getDuration();
      if (!bar || duration <= 0) return;
      const rect = bar.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      handle.seekTo(ratio * duration, true);
    },
    [handle],
  );

  const scrub = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      seekFromEvent(event.clientX);
    },
    [seekFromEvent],
  );

  const duration = state.duration || handle.getDuration();

  useEffect(() => {
    if (editingTime) timeInputRef.current?.select();
  }, [editingTime]);

  const startEditingTime = () => {
    setTimeInput(formatTime(handle.getTime()));
    setEditingTime(true);
  };

  const commitTimeInput = () => {
    const seconds = parseTimeInput(timeInput);
    if (seconds !== null) {
      handle.seekTo(Math.max(0, duration > 0 ? Math.min(duration, seconds) : seconds), true);
    }
    setEditingTime(false);
  };

  const scrubber = (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      {editingTime ? (
        <input
          ref={timeInputRef}
          type="text"
          inputMode="numeric"
          value={timeInput}
          onChange={(event) => setTimeInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") commitTimeInput();
            if (event.key === "Escape") setEditingTime(false);
          }}
          onBlur={commitTimeInput}
          aria-label={t("player.jumpToTime")}
          className="w-[44px] shrink-0 rounded border border-[var(--accent)] bg-[var(--paper-raised)] text-right font-mono text-[11px] tabular-nums text-[var(--ink)] outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={startEditingTime}
          title={t("player.jumpToTime")}
          className="w-[44px] shrink-0 text-right font-mono text-[11px] tabular-nums text-[var(--ink-soft)] transition hover:text-[var(--accent)]"
        >
          <span ref={timeRef}>0:00</span>
        </button>
      )}
      <div
        ref={barRef}
        role="slider"
        tabIndex={0}
        aria-label={t("player.position")}
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(handle.getTime())}
        onPointerDown={scrub}
        onPointerMove={(event) => {
          if (event.buttons === 1) seekFromEvent(event.clientX);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") handle.seekTo(Math.max(0, handle.getTime() - 5), true);
          if (event.key === "ArrowRight") handle.seekTo(handle.getTime() + 5, true);
        }}
        /* The padding is invisible but doubles the height a finger has to land
           in, which is the difference between scrubbing and scrolling the page. */
        className="group relative -my-2 flex min-w-0 flex-1 cursor-pointer touch-none items-center py-2"
      >
        <span className="relative h-2 w-full overflow-hidden rounded-full bg-[var(--rule)]/60 transition-all group-hover:h-2.5">
          <span
            ref={bufferRef}
            className="absolute inset-y-0 left-0 bg-[var(--ink-faint)]/20 rounded-full transition-all duration-300"
            style={{ width: 0 }}
          />
          <span
            ref={fillRef}
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[var(--accent)] via-amber-500 to-[var(--accent-ring,var(--accent))]"
            style={{ width: 0 }}
          />
        </span>
      </div>
      <span className="w-[44px] shrink-0 font-mono text-[11px] tabular-nums text-[var(--ink-faint)]">
        {duration > 0 ? formatTime(duration) : "--:--"}
      </span>
    </div>
  );

  const buttons = (
    <div className="flex shrink-0 items-center justify-center gap-2 sm:gap-2.5">
      <button
        type="button"
        className="btn h-9 w-9 shrink-0 rounded-full p-0 text-[11px] transition-all hover:scale-105 active:scale-90 shadow-xs border border-[var(--rule)] hover:border-[var(--accent)]/40 hover:text-[var(--accent)]"
        onClick={() => handle.seekTo(Math.max(0, handle.getTime() - 10), true)}
        aria-label={t("player.back10")}
        title={t("player.back10")}
      >
        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
          <path d="M3 3v5h5" />
          <text x="12" y="15.5" fontSize="7.5" fontWeight="bold" textAnchor="middle" fill="currentColor" stroke="none">10</text>
        </svg>
      </button>
      <button
        type="button"
        className="btn btn-primary h-11 w-11 shrink-0 rounded-full p-0 transition-all hover:scale-105 active:scale-90 shadow-md shadow-[var(--accent)]/25 hover:shadow-lg hover:shadow-[var(--accent)]/35"
        onClick={() => (handle.isPlaying() ? handle.pause() : handle.play())}
        aria-label={playing ? t("common.pause") : t("common.play")}
      >
        {playing ? (
          <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden="true">
            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="w-4 h-4 ml-0.5 fill-current" aria-hidden="true">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>
      <button
        type="button"
        className="btn h-9 w-9 shrink-0 rounded-full p-0 text-[11px] transition-all hover:scale-105 active:scale-90 shadow-xs border border-[var(--rule)] hover:border-[var(--accent)]/40 hover:text-[var(--accent)]"
        onClick={() => handle.seekTo(handle.getTime() + 30, true)}
        aria-label={t("player.forward30")}
        title={t("player.forward30")}
      >
        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
          <path d="M21 3v5h-5" />
          <text x="12" y="15.5" fontSize="7.5" fontWeight="bold" textAnchor="middle" fill="currentColor" stroke="none">30</text>
        </svg>
      </button>
    </div>
  );

  return (
    <div className={compact ? "" : "card p-3"}>
      {state.error ? (
        <div className="mb-2.5 flex flex-col gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-[12px] text-rose-800 dark:text-rose-200">
          <div className="flex items-start gap-2">
            <span className="text-sm shrink-0 leading-none mt-0.5">⚠️</span>
            <span className="min-w-0 flex-1 leading-snug">{state.error}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            {onRetry ? (
              <button
                type="button"
                className="btn px-2.5 py-1 text-[11px] font-semibold bg-rose-600 text-white hover:bg-rose-700 border-none transition active:scale-95"
                onClick={onRetry}
              >
                {t("common.retry")}
              </button>
            ) : null}
            {!state.isProxy && onPlayProxy ? (
              <button
                type="button"
                className="btn px-2.5 py-1 text-[11px] font-semibold border border-amber-500/50 bg-amber-500/15 text-amber-800 dark:text-amber-200 hover:bg-amber-500/25 transition active:scale-95"
                onClick={onPlayProxy}
              >
                {t("player.tryProxy") || "Phát qua Proxy"}
              </button>
            ) : null}
            {state.rawUrl ? (
              <a
                href={state.rawUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn px-2.5 py-1 text-[11px] font-medium border border-[var(--rule)] hover:bg-[var(--surface)] text-[var(--ink-soft)] transition"
                title="Mở file media trong tab mới"
              >
                <span>{t("player.openDirect") || "Mở file gốc"}</span>
                <span className="ml-1 text-[10px]" aria-hidden>↗</span>
              </a>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row-reverse sm:items-center sm:gap-3">
        {scrubber}
        {buttons}
      </div>

      {state.loading && !state.error ? (
        <p className="mt-1.5 flex items-center justify-center gap-1.5 text-center text-[10px] uppercase tracking-wider text-[var(--ink-faint)] sm:justify-start">
          <span className="inline-block h-2.5 w-2.5 animate-spin rounded-full border border-current border-t-transparent" />
          <span>
            {state.isProxy
              ? t("player.fallbackProxy") || "Đang phát qua máy chủ dự phòng..."
              : t("player.buffering")}
          </span>
        </p>
      ) : null}
    </div>
  );
}
