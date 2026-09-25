"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUi } from "@/lib/i18n";
import { useSwipe } from "@/lib/useSwipe";
import { DiscoverPanel } from "./listen/DiscoverPanel";

export function LibraryClient() {
  const { t } = useUi();
  const router = useRouter();

  const { handlers: librarySwipeHandlers, drag: libraryDrag } = useSwipe({
    threshold: 62,
    trackDrag: true,
    onSwipeRight: () => router.push("/"),
  });

  const swipeOffsetX =
    libraryDrag.active && libraryDrag.x > 0 && Math.abs(libraryDrag.x) > Math.abs(libraryDrag.y)
      ? Math.min(88, libraryDrag.x * 0.34)
      : 0;

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

      <div className="sticky top-[calc(48px+env(safe-area-inset-top,0px))] sm:top-[50px] z-20 -mx-2 mb-3 bg-[var(--paper)]/95 px-3 py-2.5 backdrop-blur-2xl border-b border-[var(--rule)]/60 shadow-xs">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-[var(--ink)] hover:text-[var(--accent)] transition px-2.5 py-1 rounded-full bg-[var(--surface)] shadow-xs border border-[var(--rule)]/60"
        >
          <span>←</span>
          <span>{t("common.back")} ({t("nav.listen")})</span>
        </Link>
      </div>

      <header className="mb-5 max-w-2xl">
        <h1 className="text-[27px] font-semibold">{t("library.title")}</h1>
        <p className="mt-2 text-[14.5px] leading-relaxed text-[var(--ink-soft)]">{t("library.lede")}</p>
      </header>

      {/* Curated Directory (128 Shows by CEFR Level & Topic) + Live Charts */}
      <DiscoverPanel
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
            <span aria-hidden>←</span>
            <span>{t("common.back")} ({t("nav.listen")})</span>
          </Link>
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="btn text-[12.5px] flex items-center gap-1"
          >
            <span aria-hidden>↑</span>
            <span>{t("common.scrollToTop")}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
