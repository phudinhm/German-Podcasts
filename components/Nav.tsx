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
    <div className="mx-auto flex max-w-6xl items-center gap-x-2.5 px-3.5 py-2 sm:gap-x-4 sm:px-5 sm:py-2.5">
      <Link
        href="/"
        onClick={handleHomeClick}
        className="group mr-auto flex shrink-0 items-center gap-2 rounded-full pr-1.5 transition-transform active:scale-95"
      >
        <span className="transition-transform duration-300 group-hover:scale-105">
          <Logo size={27} />
        </span>
        <span className="text-[17.5px] font-bold tracking-[-0.03em] text-[var(--ink)] sm:text-[20px]">
          Hörbar
        </span>
        <span className="hidden truncate text-[12px] text-[var(--ink-faint)] lg:inline">
          {t("nav.tagline")}
        </span>
      </Link>

      {/* iOS Dynamic Island Live Now-Playing Pill in Header */}
      {track ? (
        <button
          type="button"
          onClick={() => setFullscreenOpen(true)}
          className="flex items-center gap-1.5 max-w-[165px] sm:max-w-[240px] rounded-full bg-zinc-950/90 dark:bg-white/10 border border-[var(--accent)]/40 px-2.5 py-1 text-white shadow-md backdrop-blur-xl transition-all hover:scale-[1.02] active:scale-95"
          title={`${t("player.openFullPlayer")}: ${track.title}`}
        >
          <AudioVisualizer isPlaying={handle.isPlaying()} barCount={4} />
          <span className="truncate text-[11.5px] font-semibold text-amber-200">
            {track.title}
          </span>
        </button>
      ) : null}

      <nav className="hidden sm:flex min-w-0 items-center gap-1 overflow-x-auto rounded-full border border-[var(--rule)]/70 bg-[var(--surface)]/60 p-1 text-[13.5px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:text-[14px]">
        {ITEMS.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={item.href === "/" ? handleHomeClick : undefined}
              aria-current={active ? "page" : undefined}
              className={`shrink-0 rounded-full px-3.5 py-1.5 transition-all duration-200 ${
                item.wideOnly ? "hidden sm:inline-flex " : ""
              }${
                active
                  ? "bg-[var(--paper-raised)] font-semibold text-[var(--ink)] shadow-xs"
                  : "text-[var(--ink-soft)] hover:text-[var(--ink)]"
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

      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={() => setTheme(resolved === "dark" ? "light" : "dark")}
          className="btn h-9 w-9 rounded-full p-0 text-[15px] shadow-2xs"
          title={resolved === "dark" ? "Light mode" : "Dark mode"}
          aria-label={resolved === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          <span aria-hidden>{resolved === "dark" ? "☀️" : "🌙"}</span>
        </button>
        <SettingsMenu />
      </div>
    </div>
  );
}
