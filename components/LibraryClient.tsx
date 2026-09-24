"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUi } from "@/lib/i18n";
import {
  clearRecents,
  forgetRecent,
  listRecents,
  listShows,
  toggleShow,
  listRecentSources,
  listFavoriteEpisodes,
  toggleFavoriteEpisode,
  type RecentEpisode,
  type SavedShow,
  type RecentSource,
  type FavoriteEpisode,
} from "@/lib/library";
import { usePlayer } from "./player/PlayerProvider";
import { LibraryPanel } from "./listen/LibraryPanel";

/**
 * The library on a page of its own.
 *
 * It also appears on the front page, but only when nothing else is open, and
 * that turned out to be the wrong place to leave it: once you had opened a
 * show there was no way back to your own shelf without clearing the search.
 * A page you can reach from anywhere fixes that.
 */
export function LibraryClient() {
  const { t } = useUi();
  const router = useRouter();
  const player = usePlayer();
  const [shows, setShows] = useState<SavedShow[]>([]);
  const [recents, setRecents] = useState<RecentEpisode[]>([]);
  const [recentSources, setRecentSources] = useState<RecentSource[]>([]);
  const [favoriteEpisodes, setFavoriteEpisodes] = useState<FavoriteEpisode[]>([]);

  const refresh = useCallback(() => {
    setShows(listShows());
    setRecents(listRecents());
    setRecentSources(listRecentSources());
    setFavoriteEpisodes(listFavoriteEpisodes());
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener("hoerbar:library-changed", refresh);
    return () => window.removeEventListener("hoerbar:library-changed", refresh);
  }, [refresh]);

  const empty =
    shows.length === 0 &&
    recents.length === 0 &&
    recentSources.length === 0 &&
    favoriteEpisodes.length === 0;

  return (
    <div>
      <div className="sticky top-[env(safe-area-inset-top,0)] z-20 -mx-2 mb-3 bg-[var(--paper)]/75 px-3 py-3 backdrop-blur-2xl border-b border-[var(--rule)]/40 shadow-sm">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-[var(--ink)] hover:text-[var(--accent)] transition px-2 py-1 rounded bg-[var(--surface)]/80 backdrop-blur-md shadow-sm border border-[var(--rule)]/50"
        >
          <span>←</span>
          <span>{t("common.back")} ({t("nav.listen")})</span>
        </Link>
      </div>

      <header className="mb-5 max-w-2xl">
        <h1 className="text-[27px] font-semibold">{t("library.title")}</h1>
        <p className="mt-2 text-[14.5px] leading-relaxed text-[var(--ink-soft)]">{t("library.lede")}</p>
      </header>

      {empty ? (
        <div className="card p-6 text-center">
          <p className="text-[14px] text-[var(--ink-soft)]">{t("library.empty")}</p>
          <button type="button" className="btn btn-primary mt-4" onClick={() => router.push("/")}>
            {t("library.browse")}
          </button>
        </div>
      ) : (
        <>
          <LibraryPanel
            shows={shows}
            recents={recents}
            recentSources={recentSources}
            favoriteEpisodes={favoriteEpisodes}
            /* Opening a show from here hands off to the listening page, which
               is where a feed is actually browsed. */
            onOpenShow={(show) => router.push(`/?feed=${encodeURIComponent(show.feedUrl)}`)}
            onOpenRecentSource={(source) => router.push(`/?feed=${encodeURIComponent(source.feedUrl)}`)}
            onPlayRecent={(entry) => {
              player.play({
                id: entry.id,
                title: entry.title,
                showTitle: entry.showTitle,
                artwork: entry.artwork,
                description: entry.description,
                kind: "audio",
                url: entry.url,
                durationSec: entry.durationSec,
                publishedAt: entry.publishedAt,
                startAt: entry.finished ? 0 : entry.position,
              });
            }}
            onForget={(id) => forgetRecent(id)}
            onUnfollow={(show) => toggleShow(show)}
            onToggleFavoriteEpisode={(fav) => {
              toggleFavoriteEpisode(fav);
              refresh();
            }}
          />

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--rule)] pt-4">
            {recents.length > 0 ? (
              <button
                type="button"
                className="btn text-[12.5px]"
                onClick={() => {
                  if (window.confirm(t("library.clearConfirm"))) clearRecents();
                }}
              >
                {t("library.clear")}
              </button>
            ) : (
              <span />
            )}
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
        </>
      )}
    </div>
  );
}
