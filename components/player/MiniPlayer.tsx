"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useUi } from "@/lib/i18n";
import { usePlayer } from "./PlayerProvider";
import { usePopout } from "./usePopout";
import { Art } from "../listen/Art";
import { AudioVisualizer } from "../caption/AudioVisualizer";
import { liveCaptionService, type CaptionSegment } from "@/lib/liveCaption";
import { isEpisodeFavorited, toggleFavoriteEpisode } from "@/lib/library";

const COLLAPSED_KEY = "hoerbar.dock.collapsed.v1";
const SLOT_KEY = "hoerbar.dock.slot.v1";
const PINNED_KEY = "hoerbar.dock.pinned.v1";

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

export function MiniPlayer() {
  const { t } = useUi();
  const { track, handle, stop, mediaState, inlineVisible, setFullscreenOpen } = usePlayer();
  const pathname = usePathname();

  const [playing, setPlaying] = useState(false);
  const [slot, setSlot] = useState<Slot>("bottom");
  const [isHovered, setIsHovered] = useState(false);
  const [pinned, setPinned] = useState(false);

  // Popout PiP window caption & transcript state
  const [showPopoutCaption, setShowPopoutCaption] = useState(true);
  const [showPopoutTranscript, setShowPopoutTranscript] = useState(false);

  const [currentCaption, setCurrentCaption] = useState<CaptionSegment | null>(null);
  const [transcriptList, setTranscriptList] = useState<CaptionSegment[]>([]);

  const [favorited, setFavorited] = useState(false);

  useEffect(() => {
    if (!track?.id) {
      setFavorited(false);
      return;
    }
    const updateFav = () => setFavorited(isEpisodeFavorited(track.id));
    updateFav();
    window.addEventListener("hoerbar:library-changed", updateFav);
    return () => window.removeEventListener("hoerbar:library-changed", updateFav);
  }, [track?.id]);

  const toggleFav = useCallback(() => {
    if (!track) return;
    toggleFavoriteEpisode({
      id: track.id,
      title: track.title,
      showTitle: track.showTitle,
      feedUrl: null,
      url: track.url ?? "",
      artwork: track.artwork,
      durationSec: track.durationSec ?? null,
      publishedAt: track.publishedAt ?? null,
      description: track.description ?? "",
    });
    setFavorited(isEpisodeFavorited(track.id));
  }, [track]);

  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fillRef = useRef<HTMLDivElement | null>(null);
  const timeRef = useRef<HTMLSpanElement | null>(null);
  const popFillRef = useRef<HTMLDivElement | null>(null);
  const popTimeRef = useRef<HTMLSpanElement | null>(null);
  const mobileFillRef = useRef<HTMLDivElement | null>(null);

  // Increased PiP window height for captions & transcripts
  const popout = usePopout({ width: 440, height: 260 });

  useEffect(() => {
    try {
      const storedSlot = window.localStorage.getItem(SLOT_KEY) as Slot | null;
      if (storedSlot && SLOTS.includes(storedSlot)) setSlot(storedSlot);
      setPinned(window.localStorage.getItem(PINNED_KEY) === "1");
    } catch {}
  }, []);

  const remember = useCallback((key: string, value: string) => {
    try {
      window.localStorage.setItem(key, value);
    } catch {}
  }, []);

  const togglePinned = useCallback(() => {
    setPinned((prev) => {
      const next = !prev;
      remember(PINNED_KEY, next ? "1" : "0");
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

  const [playbackTime, setPlaybackTime] = useState(0);

  // Listen to live caption and transcript updates
  useEffect(() => {
    setTranscriptList(liveCaptionService.getTranscript());
    const unsubCap = liveCaptionService.onCaption((seg) => {
      setCurrentCaption(seg);
    });
    const unsubTrans = liveCaptionService.onTranscript((items) => {
      setTranscriptList(items);
    });
    return () => {
      unsubCap();
      unsubTrans();
    };
  }, []);

  // One loop drives both copies of the progress bar
  useEffect(() => {
    let frame = 0;
    let last = false;
    let lastTimeUpdate = 0;
    function tick() {
      frame = requestAnimationFrame(tick);
      const duration = handle.getDuration();
      const time = handle.getTime();
      if (Math.abs(time - lastTimeUpdate) > 0.25) {
        lastTimeUpdate = time;
        setPlaybackTime(time);
      }
      const percent = duration > 0 ? `${Math.min(100, (time / duration) * 100)}%` : "0%";
      if (fillRef.current) fillRef.current.style.width = percent;
      if (popFillRef.current) popFillRef.current.style.width = percent;
      if (mobileFillRef.current) mobileFillRef.current.style.width = percent;

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

  // Hover expansion handlers with smooth leave delay
  const handleMouseEnter = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    hoverTimeoutRef.current = setTimeout(() => {
      setIsHovered(false);
    }, 400);
  };

  const mobileTabBar = (
    <nav
      aria-label="Mobile navigation"
      className="fixed bottom-0 inset-x-0 z-40 sm:hidden glass-panel border-x-0 border-b-0 pb-[calc(6px+env(safe-area-inset-bottom,10px))] pt-1.5 px-4 flex items-center justify-around shadow-[0_-8px_30px_rgba(0,0,0,0.1)]"
    >
      <Link
        href="/"
        onClick={() => {
          window.dispatchEvent(new CustomEvent("hoerbar:navigate-home"));
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
        className={`flex flex-col items-center justify-center gap-0.5 min-w-[72px] py-1 rounded-2xl transition-all active:scale-95 ${
          pathname === "/"
            ? "text-[var(--accent)] font-semibold bg-[var(--accent-soft)]/70"
            : "text-[var(--ink-faint)]"
        }`}
      >
        <span className="text-[20px] leading-none">🎧</span>
        <span className="text-[10.5px] leading-tight">{t("nav.listenTab")}</span>
      </Link>

      {track ? (
        <button
          type="button"
          onClick={() => setFullscreenOpen(true)}
          className="flex flex-col items-center justify-center gap-0.5 min-w-[76px] py-1 rounded-2xl text-[var(--ink)] transition-all active:scale-95 hover:text-[var(--accent)]"
        >
          <span className="inline-flex h-5 items-center justify-center">
            <AudioVisualizer isPlaying={playing} barCount={4} />
          </span>
          <span className="text-[10.5px] font-semibold leading-tight text-[var(--accent)]">
            {t("player.nowPlaying")}
          </span>
        </button>
      ) : null}

      <Link
        href="/library"
        className={`flex flex-col items-center justify-center gap-0.5 min-w-[72px] py-1 rounded-2xl transition-all active:scale-95 ${
          pathname.startsWith("/library")
            ? "text-[var(--accent)] font-semibold bg-[var(--accent-soft)]/70"
            : "text-[var(--ink-faint)]"
        }`}
      >
        <span className="text-[20px] leading-none">📚</span>
        <span className="text-[10.5px] leading-tight">{t("nav.libraryTab")}</span>
      </Link>
    </nav>
  );

  if (!track) {
    return mobileTabBar;
  }

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

  // Floating PiP window with Picture-in-Picture Caption and Transcript option
  const popoutUi = popout.container
    ? createPortal(
        <div
          className="flex h-full flex-col justify-between gap-2.5 p-3.5 bg-[var(--paper)] text-[var(--ink)] select-none overflow-hidden"
          style={{ fontFamily: "var(--font-body)" }}
        >
          {/* Track Header */}
          <div className="flex items-center gap-3">
            <Art src={track.artwork} alt="" size={44} seed={track.showTitle || track.title} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-semibold leading-tight">{track.title}</p>
              <p className="truncate text-[11.5px] text-[var(--ink-faint)]">{track.showTitle}</p>
            </div>
            <AudioVisualizer isPlaying={playing} barCount={6} />
          </div>

          {/* Progress bar */}
          <div className="flex items-center gap-2">
            <span ref={popTimeRef} className="shrink-0 font-mono text-[10.5px] tabular-nums text-[var(--ink-faint)]">
              0:00
            </span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--rule)]">
              <span ref={popFillRef} className="block h-full bg-[var(--accent-ring)]" style={{ width: 0 }} />
            </span>
          </div>

          {/* Transport & Caption Controls */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">{transport}</div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setShowPopoutCaption((v) => !v)}
                className="btn px-2 py-1 text-[11px]"
                data-active={showPopoutCaption}
                title={t("caption.toggle")}
              >
                {t("caption.toggle")}
              </button>
              <button
                type="button"
                onClick={() => setShowPopoutTranscript((v) => !v)}
                className="btn px-2 py-1 text-[11px]"
                data-active={showPopoutTranscript}
                title={t("caption.transcript")}
              >
                {t("caption.transcript")}
              </button>
            </div>
          </div>

          {/* The current caption line, if a session is capturing one */}
          {showPopoutCaption && (
            <div className="rounded-xl border border-[var(--rule)] bg-[var(--surface)] p-2 text-[12px] leading-snug">
              <p className="line-clamp-2 font-medium text-[var(--ink)]">
                {currentCaption?.text || t("caption.waiting")}
              </p>
              {currentCaption?.translation && (
                <p className="mt-0.5 line-clamp-1 text-[11px] font-normal text-[var(--accent)]">
                  {currentCaption.translation}
                </p>
              )}
            </div>
          )}

          {/* The last few lines of the running transcript */}
          {showPopoutTranscript && (
            <div className="max-h-24 space-y-1 overflow-y-auto rounded-lg border border-[var(--rule)] bg-[var(--surface)] p-2 text-[11px]">
              {transcriptList.slice(-4).map((s) => (
                <div key={s.id} className="flex gap-1.5">
                  <span className="font-mono text-[10px] text-[var(--ink-faint)] shrink-0">▶</span>
                  <span className="text-[var(--ink)] line-clamp-1">{s.text}</span>
                </div>
              ))}
            </div>
          )}
        </div>,
        popout.container,
      )
    : null;

  if (popout.container) {
    return (
      <>
        {popoutUi}
        <div data-dock="popped" className={`fixed right-3 z-50 sm:right-4 ${SLOT_CLASS[slot]}`}>
          <button
            type="button"
            onClick={popout.close}
            className="card flex items-center gap-2 px-3.5 py-2 text-[12px] shadow-[var(--shadow-pop)] font-medium"
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

  // Hide the dock if the inline player is on screen, but keep the mobile tab bar visible
  if (inlineVisible) {
    return mobileTabBar;
  }

  const isExpandedDesktop = isHovered || pinned;

  const activeDockSeg = (() => {
    for (let i = 0; i < transcriptList.length; i++) {
      const s = transcriptList[i];
      const next = transcriptList[i + 1];
      if (playbackTime >= s.start - 0.3) {
        if (playbackTime <= s.end + 0.4 || (next && playbackTime < next.start) || !next) {
          return s;
        }
      }
    }
    return currentCaption;
  })();

  const activeDockTrans =
    activeDockSeg?.translations?.vi ??
    activeDockSeg?.translations?.en ??
    activeDockSeg?.translation ??
    null;

  return (
    <>
      {/* ========================================================================= */}
      {/* 1. DESKTOP DOCK (Hover to Expand / Compact Pill Mode)                     */}
      {/* ========================================================================= */}
      <div
        data-dock="desktop"
        className={`pointer-events-none fixed inset-x-0 z-50 hidden sm:flex justify-end px-4 ${SLOT_CLASS[slot]}`}
      >
        <div
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          className="pointer-events-auto flex flex-col items-end transition-all duration-300 ease-out"
        >
          {/* COLLAPSED PILL STATE */}
          {!isExpandedDesktop ? (
            <div
              className="group flex items-center gap-2.5 rounded-2xl border border-[var(--rule)] bg-[var(--paper-raised)]/95 text-[var(--ink)] px-3.5 py-2 shadow-[0_8px_32px_rgba(0,0,0,0.14)] backdrop-blur-3xl transition-all duration-300 hover:scale-[1.02] cursor-pointer max-w-[420px]"
              title={t("player.hoverExpand")}
            >
              <Art src={track.artwork} alt="" size={32} seed={track.showTitle || track.title} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] font-semibold leading-tight">
                  {activeDockSeg?.text || track.title}
                </div>
                {activeDockTrans ? (
                  <div className="truncate text-[11px] italic text-[var(--accent)] mt-0.5">
                    {activeDockTrans}
                  </div>
                ) : null}
              </div>
              <AudioVisualizer isPlaying={playing} barCount={5} />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handle.isPlaying() ? handle.pause() : handle.play();
                }}
                className="btn btn-primary h-7 w-7 rounded-full p-0 text-[11px] shrink-0"
                aria-label={playing ? t("common.pause") : t("common.play")}
              >
                {playing ? "❚❚" : "▶"}
              </button>
            </div>
          ) : (
            /* FULL EXPANDED CARD STATE */
            <div className="group card relative flex w-full max-w-[420px] flex-col gap-2 p-3 shadow-[var(--shadow-pop)] border border-[var(--rule)]">
              {/* Height adjustment controls */}
              <div className="pointer-events-none absolute -left-1 top-1/2 hidden -translate-x-full -translate-y-1/2 flex-col gap-1 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 sm:flex">
                <button
                  type="button"
                  onClick={() => move(1)}
                  disabled={atTop}
                  className="card h-7 w-7 rounded-full p-0 text-[11px] disabled:opacity-30"
                  aria-label={t("player.moveUp")}
                >
                  ▲
                </button>
                <button
                  type="button"
                  onClick={() => move(-1)}
                  disabled={atBottom}
                  className="card h-7 w-7 rounded-full p-0 text-[11px] disabled:opacity-30"
                  aria-label={t("player.moveDown")}
                >
                  ▼
                </button>
              </div>

              {/* Top Row: Artwork, Info, Close/Pin */}
              <div className="flex items-center gap-3">
                {hasVideoLayer ? <span className="h-[48px] w-[80px] shrink-0" aria-hidden /> : null}
                {!hasVideoLayer && (
                  <Art src={track.artwork} alt="" size={44} seed={track.showTitle || track.title} />
                )}

                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-medium leading-tight">{track.title}</p>
                  <p className="truncate text-[11.5px] text-[var(--ink-faint)]">
                    {mediaState.loading ? t("player.buffering") : track.showTitle}
                  </p>
                </div>

                <div className="flex items-center gap-1">
                  {/* Favorite heart button */}
                  <button
                    type="button"
                    onClick={toggleFav}
                    className={`icon-btn h-7 w-7 text-[13px] transition ${
                      favorited ? "text-rose-500 scale-105" : "text-[var(--ink-faint)] hover:text-rose-500"
                    }`}
                    aria-label={favorited ? t("library.unfavoriteEpisode") : t("library.favoriteEpisode")}
                    title={favorited ? t("library.unfavoriteEpisode") : t("library.favoriteEpisode")}
                  >
                    {favorited ? "❤️" : "🤍"}
                  </button>

                  {/* Pin expanded button */}
                  <button
                    type="button"
                    onClick={togglePinned}
                    className={`icon-btn h-7 w-7 text-[12px] ${pinned ? "text-[var(--accent)]" : "text-[var(--ink-faint)]"}`}
                    aria-label={pinned ? t("player.unpinExpanded") : t("player.pinExpanded")}
                    aria-pressed={pinned}
                    title={pinned ? t("player.unpinExpanded") : t("player.pinExpanded")}
                  >
                    &#128204;
                  </button>

                  {/* Full-screen now-playing button */}
                  <button
                    type="button"
                    onClick={() => setFullscreenOpen(true)}
                    className="icon-btn h-7 w-7 text-[13px]"
                    title={t("player.fullscreen")}
                    aria-label={t("player.fullscreen")}
                  >
                    ⛶
                  </button>

                  {/* Popout PiP button */}
                  {popout.supported && (
                    <button
                      type="button"
                      onClick={() => void popout.open()}
                      className="icon-btn h-7 w-7 text-[12px]"
                      title={t("player.popout")}
                    >
                      ▣
                    </button>
                  )}

                  {/* Close button */}
                  <button
                    type="button"
                    onClick={stop}
                    className="icon-btn h-7 w-7 text-[15px]"
                    aria-label={t("player.miniClose")}
                  >
                    &times;
                  </button>
                </div>
              </div>

              {/* Scrubber and Time */}
              <div className="flex items-center gap-2">
                <span ref={timeRef} className="shrink-0 font-mono text-[10px] tabular-nums text-[var(--ink-faint)]">
                  0:00
                </span>
                <span className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--rule)]">
                  <span ref={fillRef} className="block h-full bg-[var(--accent-ring)]" style={{ width: 0 }} />
                </span>
                <AudioVisualizer isPlaying={playing} barCount={6} />
              </div>

              {activeDockSeg?.text ? (
                <div className="rounded-xl bg-[var(--surface)]/80 border border-[var(--rule)] px-2.5 py-1.5 text-[11.5px]">
                  <p className="font-semibold text-[var(--ink)] line-clamp-2">{activeDockSeg.text}</p>
                  {activeDockTrans ? (
                    <p className="mt-0.5 italic text-[var(--accent)] line-clamp-2">{activeDockTrans}</p>
                  ) : null}
                </div>
              ) : null}

              <div className="flex items-center pt-1 border-t border-[var(--rule)]">
                <div className="flex items-center gap-2">{transport}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. MOBILE IPHONE DOCK (Elevated above Tab Bar)                             */}
      {/* ========================================================================= */}
      {mobileTabBar}
      <div
        data-dock="mobile-iphone"
        className="animate-dock-in fixed inset-x-2.5 z-[45] sm:hidden rounded-2xl glass-panel text-[var(--ink)] p-2.5 shadow-[0_12px_36px_rgba(0,0,0,0.24)] transition-all overflow-hidden"
        style={{ bottom: "calc(58px + env(safe-area-inset-bottom, 10px))" }}
      >
        {/* Module D: Thin progress bar on dock */}
        <div className="absolute top-0 left-0 right-0 h-[3px] bg-[var(--rule)]/60">
          <div
            ref={mobileFillRef}
            className="h-full bg-[var(--accent)] transition-[width] duration-150 ease-linear"
            style={{ width: 0 }}
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          {/* Tapping track info opens the full "now playing" screen */}
          <div
            onClick={() => setFullscreenOpen(true)}
            className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer active:opacity-80"
          >
            <div className="shrink-0 overflow-hidden rounded-xl shadow-xs">
              <Art src={track.artwork} alt="" size={42} seed={track.showTitle || track.title} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold leading-tight text-[var(--ink)]">
                {activeDockSeg?.text || track.title}
              </p>
              {activeDockTrans ? (
                <p className="truncate text-[11.5px] italic text-[var(--accent)] mt-0.5">
                  {activeDockTrans}
                </p>
              ) : (
                <div className="flex items-center gap-1.5 mt-0.5">
                  <p className="truncate text-[11.5px] text-[var(--ink-faint)]">{track.showTitle}</p>
                  <AudioVisualizer isPlaying={playing} barCount={4} />
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => handle.seekTo(Math.max(0, handle.getTime() - 10), true)}
              className="btn h-8 w-8 rounded-full p-0 text-[10.5px] font-semibold"
              aria-label={t("player.back10")}
              title={t("player.back10")}
            >
              -10
            </button>
            <button
              type="button"
              onClick={() => (handle.isPlaying() ? handle.pause() : handle.play())}
              className="btn btn-primary h-10 w-10 rounded-full p-0 text-[14px] shadow-md"
              aria-label={playing ? t("common.pause") : t("common.play")}
            >
              {playing ? "❚❚" : "▶"}
            </button>
            <button
              type="button"
              onClick={() => handle.seekTo(handle.getTime() + 30, true)}
              className="btn h-8 w-8 rounded-full p-0 text-[10.5px] font-semibold"
              aria-label={t("player.forward30")}
              title={t("player.forward30")}
            >
              +30
            </button>
            <button
              type="button"
              onClick={stop}
              className="icon-btn h-7 w-7 text-[15px] text-[var(--ink-faint)]"
              aria-label={t("player.miniClose")}
              title={t("player.miniClose")}
            >
              &times;
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
