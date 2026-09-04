"use client";

import { useUi } from "@/lib/i18n";
import type { RecentEpisode, SavedShow } from "@/lib/library";
import { Art } from "./Art";
import { GoogleSync } from "./GoogleSync";

function percent(entry: RecentEpisode): number {
  if (!entry.durationSec) return 0;
  return Math.min(100, Math.round((entry.position / entry.durationSec) * 100));
}

/**
 * The listener's own shelf: shows they keep, and where they got to.
 *
 * This is the first thing a returning listener should see, ahead of anything
 * we suggest, because the most likely reason someone opened the app is to
 * carry on with what they were already listening to.
 */
export function LibraryPanel({
  shows,
  recents,
  onOpenShow,
  onPlayRecent,
  onForget,
  onUnfollow,
}: {
  shows: SavedShow[];
  recents: RecentEpisode[];
  onOpenShow: (show: SavedShow) => void;
  onPlayRecent: (entry: RecentEpisode) => void;
  onForget: (id: string) => void;
  /** Only offered where removing a show makes sense, which is the library. */
  onUnfollow?: (show: SavedShow) => void;
}) {
  const { t } = useUi();
  const unfinished = recents.filter((entry) => !entry.finished);

  if (shows.length === 0 && recents.length === 0) {
    return (
      <section className="mt-6">
        <GoogleSync />
      </section>
    );
  }

  return (
    <section className="mt-6 space-y-7">
      <GoogleSync />

      {unfinished.length > 0 ? (
        <div>
          <h2 className="mb-2 text-[15px] font-semibold">{t("library.continue")}</h2>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {unfinished.slice(0, 6).map((entry) => (
              // min-w-0: a grid item's automatic minimum width is its content,
              // so without this a long episode title stops truncating and runs
              // off the side of the phone instead.
              <li key={entry.id} className="relative min-w-0">
                <button
                  type="button"
                  className="row-hover flex w-full items-start gap-3 p-2.5 pr-10 text-left"
                  onClick={() => onPlayRecent(entry)}
                >
                  <Art src={entry.artwork} alt="" size={56} seed={entry.showTitle || entry.title} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium">{entry.title}</span>
                    <span className="block truncate text-[12px] text-[var(--ink-faint)]">
                      {entry.showTitle}
                    </span>
                    {percent(entry) > 0 ? (
                      <span className="mt-1.5 block h-1 w-full overflow-hidden rounded-full bg-[var(--rule)]">
                        <span
                          className="block h-full rounded-full bg-[var(--accent-ring)]"
                          style={{ width: `${percent(entry)}%` }}
                        />
                      </span>
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
            ))}
          </ul>
        </div>
      ) : null}

      {shows.length > 0 ? (
        <div>
          <h2 className="mb-2 text-[15px] font-semibold">{t("library.shows")}</h2>
          <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {shows.map((show) => (
              <li key={show.feedUrl} className="relative min-w-0">
                <button
                  type="button"
                  className={`row-hover flex w-full items-center gap-3 p-2.5 text-left ${onUnfollow ? "pr-10" : ""}`}
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
      ) : null}

      {recents.length > unfinished.length ? (
        <div>
          <h2 className="mb-2 text-[15px] font-semibold">{t("library.recent")}</h2>
          <ul className="divide-y divide-[var(--rule)]">
            {recents
              .filter((entry) => entry.finished)
              .slice(0, 8)
              .map((entry) => (
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
      ) : null}
    </section>
  );
}
