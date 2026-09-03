"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PlayerHandle } from "./types";
import type { MediaElementState } from "./useMediaElement";

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
 * Transport bar for a streamed audio or video element.
 *
 * The browser's own controls are hidden because they fight the shadowing
 * engine: their play button does not know about loop mode, and their speed menu
 * does not know about the tempo ramp. This one shows what a stream actually
 * needs - how much is buffered ahead, whether it is stalled, and where you are.
 *
 * The playhead is written straight to the DOM from a rAF loop rather than held
 * in state, so a moving progress bar costs no React renders.
 */
export function Transport({
  handle,
  state,
  onRetry,
  compact = false,
}: {
  handle: PlayerHandle;
  state: MediaElementState;
  onRetry?: () => void;
  compact?: boolean;
}) {
  const fillRef = useRef<HTMLDivElement | null>(null);
  const bufferRef = useRef<HTMLDivElement | null>(null);
  const timeRef = useRef<HTMLSpanElement | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);
  const [playing, setPlaying] = useState(false);

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

  return (
    <div className={compact ? "" : "card p-3"}>
      {state.error ? (
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-2.5 py-1.5 text-[12px] text-rose-700 dark:text-rose-300">
          <span className="min-w-0 flex-1">{state.error}</span>
          {onRetry ? (
            <button type="button" className="btn px-2 py-0.5 text-[11px]" onClick={onRetry}>
              Erneut versuchen
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="flex items-center gap-2.5">
        <button
          type="button"
          className="btn btn-primary h-9 w-9 shrink-0 rounded-full p-0 text-[13px]"
          onClick={() => (handle.isPlaying() ? handle.pause() : handle.play())}
          aria-label={playing ? "Pause" : "Abspielen"}
        >
          {playing ? "❚❚" : "▶"}
        </button>
        <button
          type="button"
          className="btn shrink-0 px-2 py-1 text-[11px]"
          onClick={() => handle.seekTo(Math.max(0, handle.getTime() - 10), true)}
          title="10 Sekunden zurück"
        >
          −10s
        </button>

        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span ref={timeRef} className="w-[46px] shrink-0 text-right font-mono text-[11px] tabular-nums text-[var(--ink-soft)]">
            0:00
          </span>
          <div
            ref={barRef}
            role="slider"
            tabIndex={0}
            aria-label="Position im Stream"
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
            className="relative h-2 flex-1 cursor-pointer overflow-hidden rounded-full bg-[var(--rule)]"
          >
            <div ref={bufferRef} className="absolute inset-y-0 left-0 bg-[var(--ink-faint)] opacity-30" style={{ width: 0 }} />
            <div ref={fillRef} className="absolute inset-y-0 left-0 bg-[var(--accent-ring)]" style={{ width: 0 }} />
          </div>
          <span className="w-[46px] shrink-0 font-mono text-[11px] tabular-nums text-[var(--ink-faint)]">
            {duration > 0 ? formatTime(duration) : "--:--"}
          </span>
        </div>

        <button
          type="button"
          className="btn shrink-0 px-2 py-1 text-[11px]"
          onClick={() => handle.seekTo(handle.getTime() + 30, true)}
          title="30 Sekunden vor"
        >
          +30s
        </button>

        {state.loading && !state.error ? (
          <span className="shrink-0 text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">puffert</span>
        ) : null}
      </div>
    </div>
  );
}
