"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PlayerHandle } from "./player/types";
import { useUi } from "@/lib/i18n";

export const RATES = [
  0.5, 0.6, 0.7, 0.75, 0.85, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2,
];

function formatTime(seconds: number): string {
  const total = Math.floor(Math.max(0, seconds));
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, "0")}`;
}

export function StreamControls({ handle }: { handle: PlayerHandle }) {
  const { t, lang } = useUi();
  const locale = lang === "de" ? "de-DE" : lang === "vi" ? "vi-VN" : "en-GB";
  const [rate, setRate] = useState(1);
  const [pointA, setPointA] = useState<number | null>(null);
  const [pointB, setPointB] = useState<number | null>(null);
  const [looping, setLooping] = useState(false);
  const [open, setOpen] = useState(false);
  const loopRef = useRef({ a: 0, b: 0, on: false });

  loopRef.current = { a: pointA ?? 0, b: pointB ?? 0, on: looping };

  const applyRate = (next: number) => {
    const clamped = Math.round(Math.max(0.4, Math.min(2.5, next)) * 100) / 100;
    setRate(clamped);
  };

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
  const touched = pointA !== null || pointB !== null || rate !== 1;

  return (
    <div>
      <button
        type="button"
        className="btn w-full justify-between text-[12.5px] sm:hidden"
        aria-expanded={open || touched}
        onClick={() => setOpen((value) => !value)}
      >
        <span>
          {t("player.options")}
          {touched ? (
            <span className="ml-1.5 text-[var(--accent)]">
              {rate !== 1
                ? `${rate.toLocaleString(locale, {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 2,
                  })}×`
                : "A-B"}
            </span>
          ) : null}
        </span>
        <span aria-hidden className="text-[var(--ink-faint)]">
          {open ? "▴" : "▾"}
        </span>
      </button>

      <div className={`${open ? "mt-2 block" : "hidden"} sm:mt-0 sm:block`}>
        <div className="scroll-row items-center gap-x-4 gap-y-2 pb-1 sm:flex sm:flex-wrap sm:overflow-visible">
          <div className="flex shrink-0 flex-wrap items-center gap-1">
            <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--ink-faint)] mr-1">
              {t("player.speed")}
            </span>
            <button
              type="button"
              className="btn px-2 py-0.5 font-mono text-[11px] font-bold"
              onClick={() => applyRate(rate - 0.05)}
              title="Giảm 0.05×"
            >
              −
            </button>
            {RATES.map((option) => (
              <button
                key={option}
                type="button"
                className="btn px-2 py-0.5 text-[11px]"
                data-active={Math.abs(rate - option) < 0.01}
                onClick={() => applyRate(option)}
              >
                {option.toLocaleString(locale, {
                  minimumFractionDigits: 1,
                  maximumFractionDigits: 2,
                })}
                ×
              </button>
            ))}
            <button
              type="button"
              className="btn px-2 py-0.5 font-mono text-[11px] font-bold"
              onClick={() => applyRate(rate + 0.05)}
              title="Tăng 0.05×"
            >
              +
            </button>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--ink-faint)]">
              A-B
            </span>
            <button type="button" className="btn px-2 py-0.5 text-[11px]" onClick={markA}>
              A {pointA !== null ? formatTime(pointA) : t("player.setPoint")}
            </button>
            <button type="button" className="btn px-2 py-0.5 text-[11px]" onClick={markB}>
              B {pointB !== null ? formatTime(pointB) : t("player.setPoint")}
            </button>
            <button
              type="button"
              className="btn px-2 py-0.5 text-[11px]"
              data-active={looping}
              disabled={!ready}
              onClick={() => setLooping((value) => !value)}
            >
              {looping ? t("player.looping") : t("player.loop")}
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
                {t("player.reset")}
              </button>
            ) : null}
          </div>
        </div>

        <dl className="mt-2.5 hidden flex-wrap gap-x-4 gap-y-1 border-t border-[var(--rule)] pt-2 text-[11px] text-[var(--ink-faint)] sm:flex">
          <span className="flex items-center gap-1.5">
            <kbd>Space</kbd> {t("player.hotkeyPlay")}
          </span>
          <span className="flex items-center gap-1.5">
            <kbd>A</kbd> <kbd>B</kbd> {t("player.hotkeyMarks")}
          </span>
          <span className="flex items-center gap-1.5">
            <kbd>L</kbd> {t("player.hotkeyLoop")}
          </span>
          <span className="flex items-center gap-1.5">
            <kbd>[ ]</kbd> {t("player.hotkeySkip")}
          </span>
        </dl>
      </div>
    </div>
  );
}
