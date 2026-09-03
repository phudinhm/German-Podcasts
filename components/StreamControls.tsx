"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PlayerHandle } from "./player/types";

const RATES = [0.6, 0.75, 0.9, 1, 1.15, 1.3];

function formatTime(seconds: number): string {
  const total = Math.floor(Math.max(0, seconds));
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * Controls for a stream with no transcript behind it yet.
 *
 * Sentence-level looping needs segment boundaries, which only exist after
 * ingest. Until then the same two things still carry a listening session:
 * slow it down without wrecking the vowels, and loop the passage you could not
 * catch. A-B markers do that from raw timestamps.
 */
export function StreamControls({ handle }: { handle: PlayerHandle }) {
  const [rate, setRate] = useState(1);
  const [pointA, setPointA] = useState<number | null>(null);
  const [pointB, setPointB] = useState<number | null>(null);
  const [looping, setLooping] = useState(false);
  const loopRef = useRef({ a: 0, b: 0, on: false });

  loopRef.current = { a: pointA ?? 0, b: pointB ?? 0, on: looping };

  useEffect(() => {
    handle.setRate(rate);
  }, [handle, rate]);

  useEffect(() => {
    let frame = 0;
    function tick() {
      frame = requestAnimationFrame(tick);
      const { a, b, on } = loopRef.current;
      if (!on || b <= a) return;
      const time = handle.getTime();
      if (time >= b || time < a - 0.5) handle.seekTo(a, true);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [handle]);

  const markA = useCallback(() => setPointA(handle.getTime()), [handle]);
  const markB = useCallback(() => setPointB(handle.getTime()), [handle]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === " ") {
        event.preventDefault();
        if (handle.isPlaying()) handle.pause();
        else handle.play();
      }
      if (event.key === "a" || event.key === "A") markA();
      if (event.key === "b" || event.key === "B") markB();
      if (event.key === "l" || event.key === "L") setLooping((value) => !value);
      if (event.key === "[") handle.seekTo(Math.max(0, handle.getTime() - 10), true);
      if (event.key === "]") handle.seekTo(handle.getTime() + 10, true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handle, markA, markB]);

  const ready = pointA !== null && pointB !== null && pointB > pointA;

  return (
    <div className="card p-3.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--ink-faint)]">Tempo</span>
          {RATES.map((option) => (
            <button
              key={option}
              type="button"
              className="btn px-2 py-0.5 text-[11px]"
              data-active={Math.abs(rate - option) < 0.001}
              onClick={() => setRate(option)}
            >
              {option.toFixed(2).replace(/0$/, "").replace(".", ",")}×
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--ink-faint)]">A-B</span>
          <button type="button" className="btn px-2 py-0.5 text-[11px]" onClick={markA}>
            A {pointA !== null ? formatTime(pointA) : "setzen"}
          </button>
          <button type="button" className="btn px-2 py-0.5 text-[11px]" onClick={markB}>
            B {pointB !== null ? formatTime(pointB) : "setzen"}
          </button>
          <button
            type="button"
            className="btn px-2 py-0.5 text-[11px]"
            data-active={looping}
            disabled={!ready}
            onClick={() => setLooping((value) => !value)}
          >
            {looping ? "Schleife läuft" : "Schleife"}
          </button>
          {pointA !== null || pointB !== null ? (
            <button
              type="button"
              className="text-[11px] text-[var(--ink-faint)] underline decoration-dotted underline-offset-4"
              onClick={() => {
                setPointA(null);
                setPointB(null);
                setLooping(false);
              }}
            >
              zurücksetzen
            </button>
          ) : null}
        </div>
      </div>

      <dl className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 border-t border-[var(--rule)] pt-2 text-[11px] text-[var(--ink-faint)]">
        <span className="flex items-center gap-1.5">
          <kbd>Space</kbd> Play/Pause
        </span>
        <span className="flex items-center gap-1.5">
          <kbd>A</kbd> <kbd>B</kbd> Marken setzen
        </span>
        <span className="flex items-center gap-1.5">
          <kbd>L</kbd> Schleife
        </span>
        <span className="flex items-center gap-1.5">
          <kbd>[ ]</kbd> 10 s zurück/vor
        </span>
      </dl>
    </div>
  );
}
