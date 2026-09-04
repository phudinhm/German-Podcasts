"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useUi } from "@/lib/i18n";
import {
  clearRecents,
  forgetRecent,
  listRecents,
  listShows,
  toggleShow,
  type RecentEpisode,
  type SavedShow,
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

  const refresh = useCallback(() => {
    setShows(listShows());
    setRecents(listRecents());
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener("hoerbar:library-changed", refresh);
    return () => window.removeEventListener("hoerbar:library-changed", refresh);
  }, [refresh]);

  const empty = shows.length === 0 && recents.length === 0;

  return (
    <div>
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
            /* Opening a show from here hands off to the listening page, which
               is where a feed is actually browsed. */
            onOpenShow={(show) => router.push(`/?feed=${encodeURIComponent(show.feedUrl)}`)}
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
          />

          {recents.length > 0 ? (
            <div className="mt-8 border-t border-[var(--rule)] pt-4">
              <button
                type="button"
                className="btn text-[12.5px]"
                onClick={() => {
                  if (window.confirm(t("library.clearConfirm"))) clearRecents();
                }}
              >
                {t("library.clear")}
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
