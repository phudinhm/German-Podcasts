"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUi } from "@/lib/i18n";
import { useSwipe } from "@/lib/useSwipe";
import { DiscoverPanel } from "./listen/DiscoverPanel";

export function LibraryClient() {
  const { t } = useUi();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  const { handlers: librarySwipeHandlers, drag: libraryDrag } = useSwipe({
    threshold: 62,
    trackDrag: true,
    onSwipeRight: () => router.push("/"),
  });

  const swipeOffsetX =
    libraryDrag.active && libraryDrag.x > 0 && Math.abs(libraryDrag.x) > Math.abs(libraryDrag.y)
      ? Math.min(88, libraryDrag.x * 0.34)
      : 0;

  // Keyboard shortcut: '⌘K' or '/' focuses the search bar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      } else if (
        e.key === "/" &&
        !["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName)
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    const onCustomFocus = () => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("hoerbar:focus-search", onCustomFocus);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("hoerbar:focus-search", onCustomFocus);
    };
  }, []);

  return (
    <div
      {...librarySwipeHandlers}
      className={`animate-panel-in ${
        libraryDrag.active
          ? "transition-none"
          : "transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
      }`}
      style={swipeOffsetX > 0 ? { transform: `translate3d(${swipeOffsetX}px, 0, 0)` } : undefined}
    >
      {/* iOS Interactive Swipe-Back Edge Pill */}
      {libraryDrag.active && libraryDrag.x > 14 ? (
        <div
          aria-hidden
          className="pointer-events-none fixed left-2.5 top-1/2 z-50 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full glass-panel text-[22px] font-bold text-[var(--accent)] shadow-xl"
          style={{
            opacity: Math.min(1, libraryDrag.x / 58),
            transform: `translate3d(${Math.min(18, libraryDrag.x * 0.22)}px, -50%, 0) scale(${
              libraryDrag.x >= 58 ? 1.08 : 0.92
            })`,
          }}
        >
          ‹
        </div>
      ) : null}

      <div className="sticky top-[calc(50px+env(safe-area-inset-top,0px))] sm:top-[62px] z-20 -mx-2 mb-3 bg-[var(--paper-raised)] px-3 py-2 backdrop-blur-2xl border-b border-[var(--rule)] shadow-xs flex items-center justify-between gap-2.5 rounded-xl">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-[13px] sm:text-[13.5px] font-semibold text-[var(--ink)] hover:text-[var(--accent)] transition px-2.5 sm:px-3 py-1.5 rounded-full bg-[var(--surface)] shadow-xs border border-[var(--rule)]/60 shrink-0"
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4 stroke-current fill-none shrink-0" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          <span>{t("common.back")}</span>
          <span className="hidden sm:inline text-[11.5px] text-[var(--ink-faint)]">({t("nav.listen")})</span>
        </Link>

        {/* Small source search bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (searchQuery.trim()) {
              router.push(`/?q=${encodeURIComponent(searchQuery.trim())}`);
            }
          }}
          className="relative flex-1 max-w-[240px] xs:max-w-[270px] sm:max-w-xs md:max-w-sm"
          role="search"
          aria-label={t("library.searchSources")}
        >
          <div className="relative flex items-center">
            <svg
              viewBox="0 0 24 24"
              className="absolute left-2.5 w-3.5 h-3.5 stroke-current fill-none text-[var(--ink-faint)] pointer-events-none"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              ref={searchInputRef}
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("library.searchSources")}
              className="w-full h-8 pl-8 pr-7 text-[12.5px] sm:text-[13px] rounded-full bg-[var(--surface)] hover:bg-[var(--surface-high)] focus:bg-[var(--paper)] text-[var(--ink)] placeholder:text-[var(--ink-faint)] border border-[var(--rule)]/70 focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] transition-all shadow-2xs"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  searchInputRef.current?.focus();
                }}
                className="absolute right-2 p-0.5 text-[var(--ink-faint)] hover:text-[var(--ink)] rounded-full transition"
                aria-label={t("library.clearSearch") || "Clear"}
              >
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 stroke-current fill-none" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            ) : (
              <span className="macos-kbd hidden md:inline-flex absolute right-2.5 pointer-events-none select-none">
                /
              </span>
            )}
          </div>
        </form>
      </div>

      <header className="mb-5 max-w-2xl">
        <h1 className="text-[27px] font-semibold">{t("library.title")}</h1>
        <p className="mt-2 text-[14.5px] leading-relaxed text-[var(--ink-soft)]">{t("library.lede")}</p>
      </header>

      {/* Curated Directory (128 Shows by CEFR Level & Topic) + Live Charts */}
      <DiscoverPanel
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onPick={(term) => {
          router.push(`/?q=${encodeURIComponent(term)}`);
        }}
      />

      <div className="mt-8 flex flex-wrap items-center justify-end gap-3 border-t border-[var(--rule)] pt-4">
        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="btn text-[12.5px] flex items-center gap-1.5"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 stroke-current fill-none shrink-0" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            <span>{t("common.back")} ({t("nav.listen")})</span>
          </Link>
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="btn text-[12.5px] flex items-center gap-1.5"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 stroke-current fill-none shrink-0" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
            <span>{t("common.scrollToTop")}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
