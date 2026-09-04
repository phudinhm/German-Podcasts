"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { FeedEpisode, FeedResult } from "@/lib/server/feed";
import type { DiscoverResult } from "@/lib/server/discover";
import { useUi } from "@/lib/i18n";
import { isMixedContent } from "@/lib/media";
import {
  forgetRecent,
  isSaved,
  listRecents,
  listShows,
  noteplayed,
  notePosition,
  resumeAt,
  toggleShow,
  type RecentEpisode,
  type SavedShow,
} from "@/lib/library";
import { usePlayer, type Track } from "./player/PlayerProvider";
import { Transport } from "./player/Transport";
import { StreamControls } from "./StreamControls";
import { DiscoverPanel } from "./listen/DiscoverPanel";
import { Art } from "./listen/Art";
import { LibraryPanel } from "./listen/LibraryPanel";

const RECENT_KEY = "hoerbar.discover.v2";
const PAGE_SIZE = 40;

const ORIGIN_LABEL: Record<DiscoverResult["origin"], string> = {
  apple: "Apple Podcasts",
  spotify: "Spotify",
  rss: "RSS",
  web: "Website",
};

interface RecentSearch {
  q: string;
  label: string;
}

function formatDuration(seconds: number | null, unit: string): string {
  if (!seconds) return "";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} ${unit}`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} ${unit}`;
}

function formatDate(value: string | null | undefined, locale: string): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
}

export function ListenClient() {
  const { t, lang } = useUi();
  const locale = lang === "de" ? "de-DE" : lang === "vi" ? "vi-VN" : "en-GB";
  const player = usePlayer();
  const params = useSearchParams();
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DiscoverResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [show, setShow] = useState<DiscoverResult | null>(null);
  const [feed, setFeed] = useState<FeedResult | null>(null);
  const [loadingFeed, setLoadingFeed] = useState(false);
  const [visible, setVisible] = useState(PAGE_SIZE);

  const [searches, setSearches] = useState<RecentSearch[]>([]);
  const [shows, setShows] = useState<SavedShow[]>([]);
  const [recents, setRecents] = useState<RecentEpisode[]>([]);
  const [saved, setSaved] = useState(false);
  const [expandedDescription, setExpandedDescription] = useState(false);

  const playing = player.track;
  const playerRef = useRef<HTMLDivElement | null>(null);
  const openedFeedRef = useRef<string | null>(null);

  const refreshLibrary = useCallback(() => {
    setShows(listShows());
    setRecents(listRecents());
  }, []);

  useEffect(() => {
    refreshLibrary();
    window.addEventListener("hoerbar:library-changed", refreshLibrary);
    return () => window.removeEventListener("hoerbar:library-changed", refreshLibrary);
  }, [refreshLibrary]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(RECENT_KEY);
      if (raw) setSearches(JSON.parse(raw) as RecentSearch[]);
    } catch {
      // A corrupt convenience list is not worth surfacing.
    }
  }, []);

  useEffect(() => {
    setSaved(show?.feedUrl ? isSaved(show.feedUrl) : false);
  }, [show, shows]);

  // ---- search and feed ---------------------------------------------------

  const openFeed = useCallback(async (target: DiscoverResult) => {
    if (!target.feedUrl) return;
    setShow(target);
    setFeed(null);
    setVisible(PAGE_SIZE);
    setLoadingFeed(true);
    setError(null);
    try {
      const response = await fetch("/api/feed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: target.feedUrl }),
      });
      const data = (await response.json()) as FeedResult & { error?: string };
      setFeed(data);
      if (data.error) setError(data.error);
    } catch {
      setError(t("listen.feedFailed"));
    } finally {
      setLoadingFeed(false);
    }
  }, [t]);

  const search = useCallback(
    async (term: string) => {
      if (!term.trim()) return;
      setSearching(true);
      setError(null);
      setResults(null);
      setFeed(null);
      setShow(null);
      try {
        const response = await fetch("/api/discover", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ q: term.trim() }),
        });
        const data = (await response.json()) as { results?: DiscoverResult[]; error?: string };
        const found = data.results ?? [];
        setResults(found);
        if (data.error) setError(data.error);
        else if (found.length === 0) setError(t("listen.noResults"));

        const label = found[0]?.title ?? term.trim();
        setSearches((previous) => {
          const next = [{ q: term.trim(), label }, ...previous.filter((item) => item.q !== term.trim())].slice(0, 6);
          try {
            window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
          } catch {
            // Not worth surfacing.
          }
          return next;
        });

        if (found.length === 1 && found[0].feedUrl) void openFeed(found[0]);
      } catch {
        setError(t("listen.searchFailed"));
      } finally {
        setSearching(false);
      }
    },
    [t, openFeed],
  );

  // ---- playing -----------------------------------------------------------

  const playEpisode = useCallback(
    (episode: FeedEpisode, from?: number) => {
      const id = episode.guid || episode.url;
      const track: Track = {
        id,
        title: episode.title,
        showTitle: feed?.title ?? show?.title ?? "",
        artwork: episode.image ?? show?.artwork ?? feed?.image ?? null,
        description: episode.description,
        kind: episode.type.startsWith("video/") ? "video" : "audio",
        url: episode.url || undefined,
        pageUrl: episode.pageUrl,
        durationSec: episode.durationSec,
        publishedAt: episode.publishedAt,
        startAt: from ?? resumeAt(id),
      };
      player.play(track);
      noteplayed({
        id,
        title: episode.title,
        showTitle: track.showTitle,
        feedUrl: show?.feedUrl ?? null,
        url: episode.url,
        artwork: track.artwork,
        durationSec: episode.durationSec,
        publishedAt: episode.publishedAt,
        description: episode.description,
      });

      setExpandedDescription(false);
      window.setTimeout(() => playerRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 80);
    },
    [feed, show, player],
  );

  /** Plays something remembered, without needing its feed open. */
  const playRecent = useCallback(
    (entry: RecentEpisode) => {
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
        startAt: resumeAt(entry.id),
      });
      noteplayed(entry);
      window.setTimeout(() => playerRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 80);
    },
    [player],
  );

  // Remember the position while playing. Writing is throttled inside the
  // library, so this can run as often as it likes.
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      notePosition(playing.id, player.handle.getTime(), playing.durationSec ?? player.handle.getDuration());
    }, 5000);
    return () => window.clearInterval(timer);
  }, [playing, player.handle]);

  /** Returns to browsing without disturbing whatever is playing. */
  const browse = useCallback(() => {
    setFeed(null);
    setShow(null);
    setResults(null);
    setError(null);
    setVisible(PAGE_SIZE);
    // Drop ?feed= as well, otherwise the URL still claims a show is open and
    // picking that same show from the library again would be a dead click.
    openedFeedRef.current = null;
    if (params.get("feed")) router.replace("/", { scroll: false });
  }, [params, router]);

  // The library links here with the feed to open, so following a saved show
  // lands on its episodes rather than on a search box.
  const requestedFeed = params.get("feed");
  useEffect(() => {
    if (!requestedFeed || openedFeedRef.current === requestedFeed) return;
    openedFeedRef.current = requestedFeed;
    const saved = listShows().find((item) => item.feedUrl === requestedFeed);
    void openFeed({
      id: `rss:${requestedFeed}`,
      title: saved?.title ?? requestedFeed,
      publisher: saved?.publisher ?? "",
      description: "",
      artwork: saved?.artwork ?? null,
      feedUrl: requestedFeed,
      origin: (saved?.origin as DiscoverResult["origin"]) ?? "rss",
      pageUrl: saved?.pageUrl ?? null,
    });
  }, [requestedFeed, openFeed]);

  const episodes = feed?.episodes ?? [];
  const mixed = Boolean(playing && playing.url && isMixedContent(playing.url));

  return (
    <div>
      <header className="mb-5 max-w-2xl">
        <h1 className="text-[27px] font-semibold">{t("listen.title")}</h1>
        <p className="mt-2 text-[14.5px] leading-relaxed text-[var(--ink-soft)]">{t("listen.lede")}</p>
      </header>

      <div className="flex flex-wrap gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void search(query);
          }}
          placeholder={t("listen.placeholder")}
          className="btn min-w-[240px] flex-1 justify-start font-normal"
        />
        <button
          type="button"
          className="btn btn-primary"
          disabled={!query.trim() || searching}
          onClick={() => void search(query)}
        >
          {searching ? t("common.searching") : t("common.search")}
        </button>
      </div>

      {searches.length > 0 ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[var(--ink-faint)]">
          <span>{t("listen.recent")}</span>
          {searches.map((item) => (
            <button
              key={item.q}
              type="button"
              className="max-w-[220px] truncate hover:text-[var(--accent)]"
              title={item.q}
              onClick={() => {
                setQuery(item.q);
                void search(item.q);
              }}
            >
              {item.label.replace(/^https?:\/\//, "")}
            </button>
          ))}
        </div>
      ) : null}

      {error ? <p className="mt-3 text-[13px] text-rose-600">{error}</p> : null}

      {/* ---------------- player ---------------- */}
      {playing ? (
        <section ref={playerRef} className="card mt-6 overflow-hidden">
          <div className="p-4">
            <div className="flex items-start gap-3">
              <Art src={playing.artwork} alt="" size={72} />
              <div className="min-w-0 flex-1">
                <h2 className="text-[16px] font-semibold leading-snug">{playing.title}</h2>
                <p className="mt-0.5 text-[12.5px] text-[var(--ink-faint)]">
                  {playing.showTitle}
                  {playing.publishedAt ? ` · ${formatDate(playing.publishedAt, locale)}` : ""}
                </p>
              </div>
              <button
                type="button"
                className="text-[12px] text-[var(--ink-faint)] hover:text-[var(--ink)]"
                onClick={() => player.stop()}
              >
                {t("common.close")}
              </button>
            </div>

            {mixed ? (
              <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12.5px] text-amber-800 dark:text-amber-300">
                <p>{t("listen.mixedContent")}</p>
                <a href={playing.url} target="_blank" rel="noreferrer noopener" className="btn mt-2 text-[12px]">
                  {t("listen.openDirect")}
                </a>
              </div>
            ) : null}

            <div className="mt-3">
              <Transport handle={player.handle} state={player.mediaState} onRetry={player.retry} compact />
            </div>

            {playing.description ? (
              <div className="mt-3 text-[12.5px] leading-relaxed text-[var(--ink-soft)]">
                <p className={expandedDescription ? "" : "line-clamp-3"}>{playing.description}</p>
                {playing.description.length > 200 ? (
                  <button
                    type="button"
                    className="mt-1 text-[12px] text-[var(--ink-faint)] hover:text-[var(--accent)]"
                    onClick={() => setExpandedDescription((value) => !value)}
                  >
                    {expandedDescription ? t("listen.showLessText") : t("listen.showMoreText")}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="border-t border-[var(--rule)] px-4 py-3">
            <StreamControls handle={player.handle} />
          </div>
        </section>
      ) : null}

      {/* ---------------- results ---------------- */}
      {results && results.length > 0 && !feed ? (
        <section className="mt-6">
          <div className="mb-3 flex items-center gap-3">
            <h2 className="text-[13px] font-medium text-[var(--ink-soft)]">
              {t("listen.results", { count: results.length })}
            </h2>
            <button
              type="button"
              className="ml-auto btn px-2.5 py-1 text-[12px]"
              onClick={browse}
            >
              {t("listen.backToBrowse")}
            </button>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {results.map((result) => (
              <li key={result.id}>
                <button
                  type="button"
                  className="row-hover flex w-full items-start gap-3 p-2.5 text-left"
                  onClick={() => void openFeed(result)}
                  disabled={!result.feedUrl}
                >
                  <Art src={result.artwork} alt="" size={56} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14.5px] font-medium leading-snug">{result.title}</span>
                    <span className="block text-[12.5px] text-[var(--ink-faint)]">
                      {result.publisher} · {ORIGIN_LABEL[result.origin]}
                    </span>
                    {result.note ? (
                      <span className="mt-1 block text-[12px] leading-snug text-[var(--ink-faint)]">
                        {result.note}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {loadingFeed ? <p className="mt-6 text-[13px] text-[var(--ink-faint)]">{t("common.loading")}</p> : null}

      {/* ---------------- episodes ---------------- */}
      {feed ? (
        <section className="card mt-6 p-4">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <Art src={show?.artwork ?? feed.image} alt="" size={56} />
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-[18px] font-semibold">{feed.title}</h2>
              <p className="text-[12.5px] text-[var(--ink-faint)]">
                {feed.episodes.length} {t("common.episodes")}
                {show ? ` · ${ORIGIN_LABEL[show.origin]}` : ""}
              </p>
            </div>
            {show?.feedUrl ? (
              <button
                type="button"
                className="btn text-[12.5px]"
                data-active={saved}
                onClick={() => {
                  setSaved(
                    toggleShow({
                      feedUrl: show.feedUrl!,
                      title: show.title,
                      publisher: show.publisher,
                      artwork: show.artwork,
                      origin: show.origin,
                      pageUrl: show.pageUrl ?? undefined,
                    }),
                  );
                }}
              >
                {saved ? `★ ${t("library.saved")}` : `☆ ${t("library.save")}`}
              </button>
            ) : null}
            <button
              type="button"
              className="btn text-[12.5px]"
              onClick={browse}
            >
              {results && results.length > 1 ? t("listen.backToResults") : t("listen.backToBrowse")}
            </button>
          </div>

          <ul>
            {episodes.slice(0, visible).map((episode) => {
              const id = episode.guid || episode.url;
              const remembered = recents.find((item) => item.id === id);
              const progress =
                remembered && episode.durationSec
                  ? Math.min(100, Math.round((remembered.position / episode.durationSec) * 100))
                  : 0;
              return (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => playEpisode(episode)}
                    className="row-hover flex w-full items-start gap-3 p-2.5 text-left"
                    data-active={playing?.id === id}
                  >
                    <Art src={episode.image ?? show?.artwork ?? feed.image} alt="" size={56} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14.5px] font-medium leading-snug">{episode.title}</span>
                      {episode.description ? (
                        <span className="mt-0.5 line-clamp-2 block text-[12.5px] leading-relaxed text-[var(--ink-faint)]">
                          {episode.description}
                        </span>
                      ) : null}
                      <span className="mt-1 flex flex-wrap items-center gap-x-3 text-[11.5px] text-[var(--ink-faint)]">
                        {formatDate(episode.publishedAt, locale) ? (
                          <span>{formatDate(episode.publishedAt, locale)}</span>
                        ) : null}
                        {formatDuration(episode.durationSec, t("common.min")) ? (
                          <span>{formatDuration(episode.durationSec, t("common.min"))}</span>
                        ) : null}
                        {remembered?.finished ? (
                          <span className="text-[var(--accent)]">✓ {t("library.finished")}</span>
                        ) : progress > 0 ? (
                          <span className="text-[var(--accent)]">{t("library.resumeAt", { percent: progress })}</span>
                        ) : null}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {visible < episodes.length ? (
            <div className="mt-3 flex justify-center">
              <button type="button" className="btn" onClick={() => setVisible((value) => value + PAGE_SIZE)}>
                {t("common.more")} ({episodes.length - visible})
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* ---------------- library ---------------- */}
      {!feed && !results ? (
        <LibraryPanel
          shows={shows}
          recents={recents}
          onOpenShow={(saved) =>
            void openFeed({
              id: `rss:${saved.feedUrl}`,
              title: saved.title,
              publisher: saved.publisher,
              description: "",
              artwork: saved.artwork,
              feedUrl: saved.feedUrl,
              origin: saved.origin as DiscoverResult["origin"],
              pageUrl: saved.pageUrl ?? null,
            })
          }
          onPlayRecent={playRecent}
          onForget={(id) => forgetRecent(id)}
        />
      ) : null}

      {/* ---------------- discovery ---------------- */}
      {!feed && !results ? (
        <DiscoverPanel
          onPick={(term) => {
            setQuery(term);
            void search(term);
          }}
        />
      ) : null}
    </div>
  );
}
