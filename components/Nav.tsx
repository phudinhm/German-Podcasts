"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUi, type UiKey } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { usePlayer } from "./player/PlayerProvider";
import { AudioVisualizer } from "./caption/AudioVisualizer";
import { SettingsMenu } from "./SettingsMenu";
import { Logo } from "./Logo";

const ITEMS: Array<{ href: string; key: UiKey; short?: UiKey; wideOnly?: boolean }> = [
  { href: "/", key: "nav.listen", short: "nav.listenShort" },
  { href: "/library", key: "nav.library" },
  { href: "/about", key: "nav.about", wideOnly: true },
];

export function Nav() {
  const { t } = useUi();
  const pathname = usePathname();
  const { resolved, setTheme } = useTheme();
  const { track, handle, setFullscreenOpen } = usePlayer();

  const handleHomeClick = () => {
    window.dispatchEvent(new CustomEvent("hoerbar:navigate-home"));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col px-2.5 py-1.5 sm:px-5 sm:py-2.5">
      <div className="flex w-full items-center justify-between gap-x-1.5 sm:gap-x-4">
        <div className="flex items-center gap-2.5 sm:gap-3.5">
          {/* macOS Traffic Lights on Desktop */}
          <div
            className="hidden md:flex items-center gap-2 py-1 pr-1 group/traffic select-none"
            aria-label="macOS Window Controls"
          >
            <button
              type="button"
              onClick={() => {
                if (track && handle.isPlaying()) handle.pause();
              }}
              title={track && handle.isPlaying() ? "Tạm dừng phát (Pause)" : "Hörbar"}
              className="macos-traffic-close h-3 w-3 rounded-full flex items-center justify-center text-[7.5px] text-[#4a0002] opacity-90 transition-all duration-150 hover:scale-110 active:scale-95 cursor-pointer shadow-xs"
            >
              <span className="opacity-0 group-hover/traffic:opacity-100 font-bold transition-opacity leading-none">✕</span>
            </button>
            <button
              type="button"
              onClick={() => {
                window.dispatchEvent(new CustomEvent("hoerbar:minimize-player"));
              }}
              title="Thu nhỏ Player (Minimize)"
              className="macos-traffic-min h-3 w-3 rounded-full flex items-center justify-center text-[9px] text-[#543b00] opacity-90 transition-all duration-150 hover:scale-110 active:scale-95 cursor-pointer shadow-xs"
            >
              <span className="opacity-0 group-hover/traffic:opacity-100 font-bold transition-opacity leading-none">−</span>
            </button>
            <button
              type="button"
              onClick={() => setFullscreenOpen(true)}
              title="Mở toàn màn hình (Full player)"
              className="macos-traffic-zoom h-3 w-3 rounded-full flex items-center justify-center text-[6.5px] text-[#004f11] opacity-90 transition-all duration-150 hover:scale-110 active:scale-95 cursor-pointer shadow-xs"
            >
              <span className="opacity-0 group-hover/traffic:opacity-100 font-bold transition-opacity leading-none">⤢</span>
            </button>
          </div>

          <Link
            href="/"
            onClick={handleHomeClick}
            className="group flex shrink-0 items-center gap-1.5 sm:gap-2 rounded-full pr-1 transition-transform active:scale-95"
          >
            <span className="transition-transform duration-300 group-hover:scale-105">
              <Logo size={25} />
            </span>
            <span className="text-[16px] font-bold tracking-[-0.03em] text-[var(--ink)] sm:text-[19px]">
              Hörbar
            </span>
            <span className="hidden truncate text-[11.5px] text-[var(--ink-faint)] xl:inline font-normal">
              {t("nav.tagline")}
            </span>
          </Link>
        </div>

        {/* Desktop macOS Menu-Bar Live Now-Playing Pill */}
        {track ? (
          <button
            type="button"
            onClick={() => setFullscreenOpen(true)}
            className="hidden lg:flex items-center gap-2 max-w-[260px] rounded-full border border-[var(--rule)]/70 bg-[var(--surface)]/90 px-3 py-1 text-[var(--ink)] shadow-2xs backdrop-blur-md transition-all hover:scale-[1.02] hover:border-[var(--accent)]/50 active:scale-95 group/nowplaying"
            title={`${t("player.openFullPlayer")}: ${track.title}`}
          >
            <AudioVisualizer isPlaying={handle.isPlaying()} barCount={4} />
            <span className="truncate text-[11.5px] font-semibold text-[var(--accent)] group-hover/nowplaying:underline">
              {track.title}
            </span>
            <span className="text-[10px] text-[var(--ink-faint)] font-mono ml-auto shrink-0">⤢</span>
          </button>
        ) : null}

        {/* macOS Segmented Navigation Bar */}
        <nav
          aria-label="Primary navigation"
          className="macos-segmented flex shrink-0 items-center text-[12px] sm:text-[13.5px]"
        >
          {ITEMS.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={item.href === "/" ? handleHomeClick : undefined}
                aria-current={active ? "page" : undefined}
                data-active={active}
                className={`macos-segmented-item shrink-0 px-2.5 py-1 sm:px-3.5 sm:py-1.2 select-none ${
                  item.wideOnly ? "hidden md:inline-flex " : ""
                }${
                  active
                    ? ""
                    : "text-[var(--ink-soft)] hover:text-[var(--ink)] hover:bg-black/5 dark:hover:bg-white/5"
                }`}
              >
                {item.short ? (
                  <>
                    <span className="sm:hidden">{t(item.short)}</span>
                    <span className="hidden sm:inline">{t(item.key)}</span>
                  </>
                ) : (
                  t(item.key)
                )}
              </Link>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
          {/* Quick search shortcut trigger on desktop */}
          <button
            type="button"
            onClick={() => {
              window.dispatchEvent(new CustomEvent("hoerbar:focus-search"));
            }}
            className="hidden md:inline-flex items-center gap-1 h-8 px-2.5 rounded-lg border border-[var(--rule)]/60 bg-[var(--surface)]/70 hover:bg-[var(--surface)] text-[var(--ink-soft)] hover:text-[var(--ink)] text-[12px] transition active:scale-95 shadow-2xs"
            title="Tìm kiếm (⌘K hoặc /)"
          >
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 stroke-current fill-none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <span className="macos-kbd">⌘K</span>
          </button>

          <button
            type="button"
            onClick={() => setTheme(resolved === "dark" ? "light" : "dark")}
            className="btn h-8 w-8 sm:h-9 sm:w-9 rounded-full p-0 text-[14px] sm:text-[15px] shadow-2xs"
            title={resolved === "dark" ? "Light mode" : "Dark mode"}
            aria-label={resolved === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            <span aria-hidden>{resolved === "dark" ? "☀️" : "🌙"}</span>
          </button>
          <SettingsMenu />
        </div>
      </div>

      {/* Mobile iOS Dynamic Island Live Now-Playing Pill (own sleek row so top taskbar buttons are never pushed off-screen) */}
      {track ? (
        <div className="mt-1 flex sm:hidden items-center justify-center">
          <button
            type="button"
            onClick={() => setFullscreenOpen(true)}
            className="flex w-full max-w-full items-center justify-between gap-2 rounded-full bg-zinc-950/90 dark:bg-white/10 border border-[var(--accent)]/40 px-3 py-1 text-white shadow-sm backdrop-blur-xl transition-all active:scale-98"
            title={`${t("player.openFullPlayer")}: ${track.title}`}
          >
            <div className="flex min-w-0 items-center gap-2">
              <AudioVisualizer isPlaying={handle.isPlaying()} barCount={4} />
              <span className="truncate text-[11.5px] font-semibold text-amber-200">
                {track.title}
              </span>
            </div>
            <span className="shrink-0 text-[10.5px] font-bold text-amber-300/90">
              Mở ▴
            </span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
