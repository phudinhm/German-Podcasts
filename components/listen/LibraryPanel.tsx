"use client";

import { useState } from "react";
import { useUi } from "@/lib/i18n";
import {
  isSaved,
  toggleShow,
  type RecentEpisode,
  type RecentSource,
  type FavoriteEpisode,
  type SavedShow,
} from "@/lib/library";
import { Art } from "./Art";
import { GoogleSync } from "./GoogleSync";

function percent(entry: RecentEpisode): number {
  if (!entry.durationSec) return 0;
  return Math.min(100, Math.round((entry.position / entry.durationSec) * 100));
}

function formatDuration(seconds: number | null, unit: string): string {
  if (!seconds || seconds <= 0) return "";
  const mins = Math.round(seconds / 60);
  return `${mins} ${unit}`;
}

type LibraryTab = "all" | "sources" | "favorites" | "continue" | "finished";

export function LibraryPanel({
  shows,
  recents,
  recentSources = [],
  favoriteEpisodes = [],
  onOpenShow,
  onOpenRecentSource,
  onPlayRecent,
  onForget,
  onUnfollow,
  onToggleFavoriteEpisode,
}: {
  shows: SavedShow[];
  recents: RecentEpisode[];
  recentSources?: RecentSource[];
  favoriteEpisodes?: FavoriteEpisode[];
  onOpenShow: (show: SavedShow) => void;
  onOpenRecentSource?: (source: RecentSource) => void;
  onPlayRecent: (entry: RecentEpisode) => void;
  onForget: (id: string) => void;
  /** Only offered where removing a show makes sense, which is the library. */
  onUnfollow?: (show: SavedShow) => void;
  onToggleFavoriteEpisode?: (episode: FavoriteEpisode) => void;
}) {
  const { t } = useUi();
  const [activeTab, setActiveTab] = useState<LibraryTab>("all");
  const unfinished = recents.filter((entry) => !entry.finished);
  const finished = recents.filter((entry) => entry.finished);

  const empty =
    shows.length === 0 &&
    recents.length === 0 &&
    recentSources.length === 0 &&
    favoriteEpisodes.length === 0;

  if (empty) {
    return (
      <section className="mt-6">
        <GoogleSync />
      </section>
    );
  }

  const handleOpenSource = (source: RecentSource) => {
    if (onOpenRecentSource) {
      onOpenRecentSource(source);
    } else {
      onOpenShow({
        feedUrl: source.feedUrl,
        title: source.title,
        publisher: source.publisher,
        artwork: source.artwork,
        origin: source.origin ?? "rss",
        pageUrl: source.pageUrl,
        savedAt: source.lastPlayedAt,
      });
    }
  };

  return (
    <section className="mt-6 space-y-6">
      <GoogleSync />

      {/* Library Navigation Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[12.5px] scrollbar-none">
        <button
          type="button"
          onClick={() => setActiveTab("all")}
          className={`rounded-full px-3 py-1 font-medium transition shrink-0 ${
            activeTab === "all"
              ? "bg-[var(--ink)] text-[var(--paper)] shadow-xs"
              : "bg-[var(--surface)] text-[var(--ink-soft)] hover:text-[var(--ink)]"
          }`}
        >
          {t("library.all")}
        </button>

        {recentSources.length > 0 && (
          <button
            type="button"
            onClick={() => setActiveTab("sources")}
            className={`rounded-full px-3 py-1 font-medium transition shrink-0 flex items-center gap-1.5 ${
              activeTab === "sources"
                ? "bg-[var(--accent)] text-white shadow-xs"
                : "bg-[var(--surface)] text-[var(--ink-soft)] hover:text-[var(--ink)]"
            }`}
          >
            <span>🎙️</span>
            <span>{t("library.recentSources")}</span>
            <span className="rounded-full bg-black/10 px-1.5 py-0.2 text-[10.5px]">
              {recentSources.length}
            </span>
          </button>
        )}

        {(favoriteEpisodes.length > 0 || shows.length > 0) && (
          <button
            type="button"
            onClick={() => setActiveTab("favorites")}
            className={`rounded-full px-3 py-1 font-medium transition shrink-0 flex items-center gap-1.5 ${
              activeTab === "favorites"
                ? "bg-rose-500 text-white shadow-xs"
                : "bg-[var(--surface)] text-[var(--ink-soft)] hover:text-[var(--ink)]"
            }`}
          >
            <span>❤️</span>
            <span>{t("library.favorites")}</span>
            <span className="rounded-full bg-black/10 px-1.5 py-0.2 text-[10.5px]">
              {favoriteEpisodes.length + shows.length}
            </span>
          </button>
        )}

        {unfinished.length > 0 && (
          <button
            type="button"
            onClick={() => setActiveTab("continue")}
            className={`rounded-full px-3 py-1 font-medium transition shrink-0 ${
              activeTab === "continue"
                ? "bg-[var(--ink)] text-[var(--paper)] shadow-xs"
                : "bg-[var(--surface)] text-[var(--ink-soft)] hover:text-[var(--ink)]"
            }`}
          >
            {t("library.continue")} ({unfinished.length})
          </button>
        )}

        {finished.length > 0 && (
          <button
            type="button"
            onClick={() => setActiveTab("finished")}
            className={`rounded-full px-3 py-1 font-medium transition shrink-0 ${
              activeTab === "finished"
                ? "bg-[var(--ink)] text-[var(--paper)] shadow-xs"
                : "bg-[var(--surface)] text-[var(--ink-soft)] hover:text-[var(--ink)]"
            }`}
          >
            {t("library.finished")} ({finished.length})
          </button>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 1. NGUỒN ĐÃ NGHE GẦN ĐÂY (Recently Played Sources / Podcasts)              */}
      {/* ========================================================================= */}
      {(activeTab === "all" || activeTab === "sources") && recentSources.length > 0 && (
        <div>
          <div className="mb-2.5 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-[15px] font-semibold text-[var(--ink)]">
              <span>🎙️</span>
              <span>{t("library.recentSources")}</span>
            </h2>
            <span className="text-[12px] text-[var(--ink-faint)]">
              {recentSources.length} podcast
            </span>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {recentSources.map((source) => {
              const saved = isSaved(source.feedUrl);
              return (
                <div
                  key={source.feedUrl}
                  // min-w-0: this is a grid item, whose default minimum width
                  // is its content's size. The title below is .truncate, which
                  // sets white-space: nowrap - without min-w-0 breaking that
                  // chain, "nowrap" content has no width to truncate against,
                  // so it renders as one full-length unbroken line instead and
                  // drags the whole page into horizontal scroll.
                  className="group relative flex min-w-0 items-center gap-3 rounded-xl border border-[var(--rule)]/80 bg-[var(--paper-raised)] p-2.5 shadow-xs transition hover:border-[var(--accent)]/50 hover:bg-[var(--surface)]/40"
                >
                  <button
                    type="button"
                    onClick={() => handleOpenSource(source)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <Art src={source.artwork} alt="" size={52} seed={source.title} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-semibold leading-tight text-[var(--ink)]">
                        {source.title}
                      </p>
                      {source.lastEpisodeTitle ? (
                        <p className="mt-0.5 truncate text-[11.5px] text-[var(--ink-soft)]">
                          ▶ {source.lastEpisodeTitle}
                        </p>
                      ) : source.publisher ? (
                        <p className="mt-0.5 truncate text-[11.5px] text-[var(--ink-faint)]">
                          {source.publisher}
                        </p>
                      ) : null}
                    </div>
                  </button>

                  {/* Quick Favorite Star Button */}
                  <button
                    type="button"
                    onClick={() => {
                      toggleShow({
                        feedUrl: source.feedUrl,
                        title: source.title,
                        publisher: source.publisher,
                        artwork: source.artwork,
                        origin: source.origin ?? "rss",
                        pageUrl: source.pageUrl,
                      });
                    }}
                    className={`icon-btn text-[14px] shrink-0 transition ${
                      saved ? "text-amber-500 scale-105" : "text-[var(--ink-faint)] hover:text-amber-500"
                    }`}
                    title={saved ? t("library.saved") : t("library.save")}
                    aria-label={saved ? t("library.saved") : t("library.save")}
                  >
                    {saved ? "★" : "☆"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. TẬP YÊU THÍCH (Favorite Episodes - ❤️)                                 */}
      {/* ========================================================================= */}
      {(activeTab === "all" || activeTab === "favorites") && favoriteEpisodes.length > 0 && (
        <div>
          <div className="mb-2.5 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-[15px] font-semibold text-[var(--ink)]">
              <span>❤️</span>
              <span>{t("library.favoriteEpisodes")}</span>
            </h2>
            <span className="text-[12px] text-[var(--ink-faint)]">
              {favoriteEpisodes.length} {t("common.episodes")}
            </span>
          </div>

          <ul className="grid gap-1.5 sm:grid-cols-2">
            {favoriteEpisodes.map((fav) => (
              <li
                key={fav.id}
                // Same fix as the recently-played card above: a grid item
                // needs min-w-0 of its own before a .truncate descendant can
                // actually truncate rather than force the row to full width.
                className="group relative flex min-w-0 items-start gap-3 rounded-xl border border-[var(--rule)]/80 bg-[var(--paper-raised)] p-2.5 pr-10 shadow-xs transition hover:border-rose-400/50 hover:bg-[var(--surface)]/40"
              >
                <button
                  type="button"
                  onClick={() => {
                    onPlayRecent({
                      id: fav.id,
                      title: fav.title,
                      showTitle: fav.showTitle,
                      feedUrl: fav.feedUrl,
                      url: fav.url,
                      artwork: fav.artwork,
                      durationSec: fav.durationSec,
                      publishedAt: fav.publishedAt,
                      description: fav.description,
                      position: 0,
                      finished: false,
                      playedAt: new Date().toISOString(),
                    });
                  }}
                  className="flex min-w-0 flex-1 items-start gap-3 text-left"
                >
                  <Art src={fav.artwork} alt="" size={52} seed={fav.showTitle || fav.title} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium leading-tight text-[var(--ink)]">
                      {fav.title}
                    </p>
                    <p className="mt-0.5 truncate text-[12px] text-[var(--ink-faint)]">
                      {fav.showTitle}
                    </p>
                    {fav.durationSec ? (
                      <p className="mt-1 text-[11px] text-[var(--ink-faint)]">
                        {formatDuration(fav.durationSec, t("common.min"))}
                      </p>
                    ) : null}
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (onToggleFavoriteEpisode) {
                      onToggleFavoriteEpisode(fav);
                    } else {
                      window.dispatchEvent(
                        new CustomEvent("hoerbar:unfavorite", { detail: { id: fav.id } }),
                      );
                    }
                  }}
                  className="icon-btn absolute right-2 top-3 text-[14px] text-rose-500 hover:scale-110 transition"
                  title={t("library.unfavoriteEpisode")}
                  aria-label={t("library.unfavoriteEpisode")}
                >
                  ❤️
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. ĐANG NGHE DỞ (Continue Listening)                                      */}
      {/* ========================================================================= */}
      {(activeTab === "all" || activeTab === "continue") && unfinished.length > 0 && (
        <div>
          <h2 className="mb-2 text-[15px] font-semibold text-[var(--ink)]">
            {t("library.continue")}
          </h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {unfinished.slice(0, activeTab === "continue" ? undefined : 6).map((entry) => {
              const pct = percent(entry);
              const remSec = entry.durationSec ? Math.max(0, entry.durationSec - entry.position) : null;
              const remMin = remSec ? Math.ceil(remSec / 60) : null;

              return (
                <li key={entry.id} className="relative min-w-0 group/item">
                  <button
                    type="button"
                    className="flex w-full items-start gap-3 rounded-2xl border border-[var(--rule)]/80 bg-[var(--paper-raised)] p-3 pr-10 text-left shadow-xs transition-all duration-200 hover:border-[var(--accent)]/40 hover:shadow-md active:scale-[0.99]"
                    onClick={() => onPlayRecent(entry)}
                  >
                    <div className="relative shrink-0 overflow-hidden rounded-xl shadow-xs ring-1 ring-black/5 dark:ring-white/10">
                      <Art src={entry.artwork} alt="" size={58} seed={entry.showTitle || entry.title} />
                      {pct > 0 && (
                        <div className="absolute inset-x-0 bottom-0 h-1.5 bg-black/50 backdrop-blur-xs">
                          <div
                            className="h-full bg-[var(--accent)] rounded-r-full shadow-xs"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      )}
                    </div>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] font-semibold text-[var(--ink)]">{entry.title}</span>
                      <span className="block truncate text-[12px] text-[var(--ink-faint)] mt-0.5">
                        {entry.showTitle}
                      </span>
                      {pct > 0 ? (
                        <div className="mt-2 space-y-1.5">
                          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--accent)]">
                            {remMin ? t("feed.remaining", { min: remMin }) : t("library.resumeAt", { percent: pct })}
                          </span>
                          <span className="block h-1.5 w-full overflow-hidden rounded-full bg-[var(--rule)]">
                            <span
                              className="block h-full rounded-full bg-[var(--accent)]"
                              style={{ width: `${pct}%` }}
                            />
                          </span>
                        </div>
                      ) : null}
                    </span>
                  </button>
                <button
                  type="button"
                  aria-label={t("library.forget")}
                  title={t("library.forget")}
                  className="icon-btn absolute right-1 top-1 text-[16px]"
                  onClick={() => onForget(entry.id)}
                >
                  ×
                </button>
              </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. NGUỒN YÊU THÍCH (Favorite Shows / Followed Shows)                      */}
      {/* ========================================================================= */}
      {(activeTab === "all" || activeTab === "favorites") && shows.length > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-[var(--ink)]">
              {activeTab === "favorites" ? `⭐ ${t("library.favoriteSources")}` : t("library.shows")}
            </h2>
            <span className="text-[12px] text-[var(--ink-faint)]">
              {shows.length} podcast
            </span>
          </div>

          <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {shows.map((show) => (
              <li key={show.feedUrl} className="relative min-w-0">
                <button
                  type="button"
                  className={`row-hover flex w-full items-center gap-3 p-2.5 text-left ${
                    onUnfollow ? "pr-10" : ""
                  }`}
                  onClick={() => onOpenShow(show)}
                >
                  <Art src={show.artwork} alt="" size={48} seed={show.title} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium">{show.title}</span>
                    <span className="block truncate text-[12px] text-[var(--ink-faint)]">
                      {show.publisher}
                    </span>
                  </span>
                </button>
                {onUnfollow ? (
                  <button
                    type="button"
                    aria-label={t("library.unfollowTitle", { name: show.title })}
                    title={t("library.unfollowTitle", { name: show.title })}
                    className="icon-btn absolute right-1 top-1/2 -translate-y-1/2 text-[16px]"
                    onClick={() => onUnfollow(show)}
                  >
                    ×
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. ĐÃ NGHE XONG (Finished Episodes)                                       */}
      {/* ========================================================================= */}
      {(activeTab === "all" || activeTab === "finished") && finished.length > 0 && (
        <div>
          <h2 className="mb-2 text-[15px] font-semibold text-[var(--ink)]">
            {t("library.recent")}
          </h2>
          <ul className="divide-y divide-[var(--rule)]">
            {finished.slice(0, activeTab === "finished" ? undefined : 8).map((entry) => (
              <li key={entry.id} className="flex min-w-0 items-center gap-3 py-1">
                <button
                  type="button"
                  className="row-hover min-w-0 flex-1 px-1 py-1.5 text-left"
                  onClick={() => onPlayRecent(entry)}
                >
                  <span className="block truncate text-[13.5px]">{entry.title}</span>
                  <span className="block truncate text-[12px] text-[var(--ink-faint)]">
                    {entry.showTitle} · {t("library.finished")}
                  </span>
                </button>
                <button
                  type="button"
                  className="icon-btn shrink-0 text-[16px]"
                  aria-label={t("library.forget")}
                  title={t("library.forget")}
                  onClick={() => onForget(entry.id)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
