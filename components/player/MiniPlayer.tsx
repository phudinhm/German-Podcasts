"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useUi } from "@/lib/i18n";
import { usePlayer } from "./PlayerProvider";
import { Art } from "../listen/Art";

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
 * The bar that keeps playback reachable after you navigate away.
 *
 * It is deliberately not shown on the Listen page, where the full player is
 * already on screen; two sets of controls for one stream is a way to lose track
 * of which one you pressed.
 */
export function MiniPlayer() {
  const { t } = useUi();
  const { track, handle, stop, mediaState } = usePlayer();
  const pathname = usePathname();
  const [playing, setPlaying] = useState(false);
  const fillRef = useRef<HTMLDivElement | null>(null);
  const timeRef = useRef<HTMLSpanElement | null>(null);

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
  // The listening page shows the full player already, so the bar would be a
  // second set of the same controls.
  if (pathname === "/") return null;

  const hasVideoLayer = track.kind !== "audio";

  return (
    <div className="dock-safe fixed inset-x-0 bottom-0 z-50 border-t border-[var(--rule)] bg-[color-mix(in_oklab,var(--paper)_95%,transparent)] backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-2.5 px-3 py-2 sm:gap-3 sm:px-5">
        {/* Space reserved for the docked video layer, which is fixed-positioned. */}
        {hasVideoLayer ? <span className="h-[58px] w-[104px] shrink-0" aria-hidden /> : null}

        {!hasVideoLayer ? (
          <Art src={track.artwork} alt="" size={44} seed={track.showTitle || track.title} />
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
            {track.showTitle}
            {mediaState.loading ? ` · ${t("player.buffering")}` : ""}
          </p>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[var(--rule)]">
            <div ref={fillRef} className="h-full bg-[var(--accent-ring)]" style={{ width: 0 }} />
          </div>
        </div>

        <span ref={timeRef} className="hidden w-[46px] shrink-0 text-right font-mono text-[11px] tabular-nums text-[var(--ink-faint)] sm:block">
          0:00
        </span>

        {/* On a phone the label is dropped for the glyph: at 390px "Open" and
            "x" together left the episode title about half a word. */}
        <Link
          href="/"
          className="btn h-10 w-10 shrink-0 rounded-full p-0 text-[14px] sm:h-auto sm:w-auto sm:px-2.5 sm:py-1 sm:text-[12px]"
          aria-label={t("player.miniOpen")}
          title={t("player.miniOpen")}
        >
          <span aria-hidden className="sm:hidden">
            ⌃
          </span>
          <span className="hidden sm:inline">{t("player.miniOpen")}</span>
        </Link>
        <button
          type="button"
          onClick={stop}
          className="icon-btn shrink-0 text-[18px]"
          aria-label={t("player.miniClose")}
          title={t("player.miniClose")}
        >
          ×
        </button>
      </div>
    </div>
  );
}
