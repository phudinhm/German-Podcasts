"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useUi } from "@/lib/i18n";
import { usePlayer } from "./PlayerProvider";
import { usePopout } from "./usePopout";
import { Art } from "../listen/Art";

const COLLAPSED_KEY = "hoerbar.dock.collapsed.v1";
const SLOT_KEY = "hoerbar.dock.slot.v1";

/**
 * Where the dock sits vertically, on a screen big enough for it to matter.
 *
 * Three slots rather than a free drag: a dragged panel has to be dragged back,
 * remembers a position that may be off screen on the next monitor, and needs a
 * pointer contract that touch does not have. Two buttons that step through
 * three positions cover the actual complaint, which is "it is covering the
 * thing I am reading".
 */
const SLOTS = ["bottom", "middle", "top"] as const;
type Slot = (typeof SLOTS)[number];

const SLOT_CLASS: Record<Slot, string> = {
  bottom: "bottom-[calc(0.75rem+env(safe-area-inset-bottom,0px))] sm:bottom-[calc(1rem+env(safe-area-inset-bottom,0px))]",
  middle: "bottom-1/2 translate-y-1/2",
  top: "bottom-auto top-[calc(4.5rem+env(safe-area-inset-top,0px))]",
};

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
 * controls for one stream is a way to lose track of which one you pressed. The
 * theory was right and the rule was wrong: what matters is not which page you
 * are on but whether you can already see the controls. The provider reports
 * that, and this appears the moment the answer is no.
 *
 * It docks to the right rather than spanning the width, tucks away to a single
 * button, moves between three heights, and on Chromium can leave the browser
 * entirely for a floating always-on-top window. All four of those are stored,
 * because a listener who arranged their screen once meant it.
 */
export function MiniPlayer() {
  const { t } = useUi();
  const { track, handle, stop, mediaState, inlineVisible } = usePlayer();
  const pathname = usePathname();
  const [playing, setPlaying] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [slot, setSlot] = useState<Slot>("bottom");
  const fillRef = useRef<HTMLDivElement | null>(null);
  const timeRef = useRef<HTMLSpanElement | null>(null);
  const popFillRef = useRef<HTMLDivElement | null>(null);
  const popTimeRef = useRef<HTMLSpanElement | null>(null);
  const popout = usePopout({ width: 400, height: 176 });

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSED_KEY) === "1");
      const stored = window.localStorage.getItem(SLOT_KEY) as Slot | null;
      if (stored && SLOTS.includes(stored)) setSlot(stored);
    } catch {
      // Storage can be unavailable; the defaults are fine.
    }
  }, []);

  const remember = useCallback((key: string, value: string) => {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Not remembering a preference is not worth an error.
    }
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((value) => {
      const next = !value;
      remember(COLLAPSED_KEY, next ? "1" : "0");
      return next;
    });
  }, [remember]);

  const move = useCallback(
    (direction: 1 | -1) => {
      setSlot((current) => {
        const next = SLOTS[Math.min(SLOTS.length - 1, Math.max(0, SLOTS.indexOf(current) + direction))];
        remember(SLOT_KEY, next);
        return next;
      });
    },
    [remember],
  );

  // One loop drives both copies of the progress bar. The refs for the pop-out
  // are simply null while it is closed.
  useEffect(() => {
    let frame = 0;
    let last = false;
    function tick() {
      frame = requestAnimationFrame(tick);
      const duration = handle.getDuration();
      const time = handle.getTime();
      const percent = duration > 0 ? `${Math.min(100, (time / duration) * 100)}%` : "0%";
      if (fillRef.current) fillRef.current.style.width = percent;
      if (popFillRef.current) popFillRef.current.style.width = percent;
      const label = formatTime(time);
      if (timeRef.current) timeRef.current.textContent = label;
      if (popTimeRef.current) popTimeRef.current.textContent = label;
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

  const hasVideoLayer = track.kind !== "audio";
  const onListen = pathname === "/";
  const atTop = slot === SLOTS[SLOTS.length - 1];
  const atBottom = slot === SLOTS[0];

  const transport = (
    <>
      <button
        type="button"
        onClick={() => handle.seekTo(Math.max(0, handle.getTime() - 10), true)}
        className="btn h-9 w-9 shrink-0 rounded-full p-0 text-[11px]"
        aria-label={t("player.back10")}
        title={t("player.back10")}
      >
        <span aria-hidden>&minus;10</span>
      </button>
      <button
        type="button"
        onClick={() => (handle.isPlaying() ? handle.pause() : handle.play())}
        className="btn btn-primary h-11 w-11 shrink-0 rounded-full p-0 text-[14px]"
        aria-label={playing ? t("common.pause") : t("common.play")}
      >
        {playing ? "❚❚" : "▶"}
      </button>
      <button
        type="button"
        onClick={() => handle.seekTo(handle.getTime() + 30, true)}
        className="btn h-9 w-9 shrink-0 rounded-full p-0 text-[11px]"
        aria-label={t("player.forward30")}
        title={t("player.forward30")}
      >
        <span aria-hidden>+30</span>
      </button>
    </>
  );

  // The floating window. Rendered into the pop-out document, so it keeps the
  // page's styling but none of its layout.
  const popoutUi = popout.container
    ? createPortal(
        <div className="flex h-full flex-col gap-3 p-3" style={{ fontFamily: "var(--font-body)" }}>
          <div className="flex items-center gap-3">
            <Art src={track.artwork} alt="" size={48} seed={track.showTitle || track.title} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-semibold leading-tight">{track.title}</p>
              <p className="truncate text-[12px] text-[var(--ink-faint)]">{track.showTitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span ref={popTimeRef} className="shrink-0 font-mono text-[11px] tabular-nums text-[var(--ink-faint)]">
              0:00
            </span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--rule)]">
              <span ref={popFillRef} className="block h-full bg-[var(--accent-ring)]" style={{ width: 0 }} />
            </span>
          </div>
          <div className="flex items-center justify-center gap-2">{transport}</div>
        </div>,
        popout.container,
      )
    : null;

  // While the pop-out is open the page keeps only a way back, so there are not
  // two live sets of controls a metre apart.
  if (popout.container) {
    return (
      <>
        {popoutUi}
        <div
          data-dock="popped"
          className={`fixed right-3 z-50 sm:right-4 ${SLOT_CLASS[slot]}`}
        >
          <button
            type="button"
            onClick={popout.close}
            className="card flex items-center gap-2 px-3 py-2 text-[12px] shadow-[var(--shadow-pop)]"
          >
            <span aria-hidden className="text-[var(--accent)]">
              ▣
            </span>
            {t("player.popoutClose")}
          </button>
        </div>
      </>
    );
  }

  // The full player is on screen and does the same job better.
  if (inlineVisible) return null;

  if (collapsed) {
    return (
      <div data-dock="tucked" className={`fixed right-3 z-50 sm:right-4 ${SLOT_CLASS[slot]}`}>
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
    <div
      data-dock="open"
      className={`pointer-events-none fixed inset-x-0 z-50 flex justify-end px-3 sm:px-4 ${SLOT_CLASS[slot]}`}
    >
      <div className="group card pointer-events-auto relative flex w-full max-w-[420px] items-center gap-2.5 p-2 shadow-[var(--shadow-pop)] sm:gap-3">
        {/*
          Moving the dock is a pointer affordance, so it is hidden from touch
          entirely: (hover: hover) keeps it off phones, where there is no hover
          state to reveal it and the buttons would just be permanent clutter.
        */}
        <div className="pointer-events-none absolute -left-1 top-1/2 hidden -translate-x-full -translate-y-1/2 flex-col gap-1 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 [@media(hover:hover)]:sm:flex">
          <button
            type="button"
            onClick={() => move(1)}
            disabled={atTop}
            className="card h-7 w-7 rounded-full p-0 text-[11px] disabled:opacity-30"
            aria-label={t("player.moveUp")}
            title={t("player.moveUp")}
          >
            <span aria-hidden>▲</span>
          </button>
          <button
            type="button"
            onClick={() => move(-1)}
            disabled={atBottom}
            className="card h-7 w-7 rounded-full p-0 text-[11px] disabled:opacity-30"
            aria-label={t("player.moveDown")}
            title={t("player.moveDown")}
          >
            <span aria-hidden>▼</span>
          </button>
        </div>

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

        {/* Chromium only, and pointless on a phone where there is no desktop to
            float over, so it appears only where it can actually work. */}
        {popout.supported ? (
          <button
            type="button"
            onClick={() => void popout.open()}
            className="icon-btn hidden shrink-0 text-[13px] sm:inline-flex"
            aria-label={t("player.popout")}
            title={t("player.popout")}
          >
            <span aria-hidden>▣</span>
          </button>
        ) : null}

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
