"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { FeedEpisode, FeedResult } from "@/lib/server/feed";
import type { DiscoverResult } from "@/lib/server/discover";
import type { Segment, TargetLang } from "@/lib/types";
import { useUi } from "@/lib/i18n";
import { SUGGESTIONS, suggestionsByLevel } from "@/lib/suggestions";
import { isFollowing, listSubscriptions, toggleFollow, type Subscription } from "@/lib/subscriptions";
import { isMixedContent } from "@/lib/media";
import { useMediaElement } from "./player/useMediaElement";
import { useYouTube } from "./player/useYouTube";
import { Transport } from "./player/Transport";
import { StreamControls } from "./StreamControls";
import { EpisodeTranscript } from "./EpisodeTranscript";
import { LiveCaption } from "./LiveCaption";
import { LevelBadge } from "./LevelBadge";

const RECENT_KEY = "hoerbar.discover.v1";
const PAGE_SIZE = 40;

const ORIGIN_LABEL: Record<DiscoverResult["origin"], string> = {
  apple: "Apple Podcasts",
  youtube: "YouTube",
  spotify: "Spotify",
  rss: "RSS",
  web: "Website",
};

function formatDuration(seconds: number | null, unit: string): string {
  if (!seconds) return "";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} ${unit}`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} ${unit}`;
}

function formatDate(value: string | null, locale: string): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
}

/** Artwork with a graceful placeholder, since podcast CDNs 404 often enough. */
function Art({ src, alt, size }: { src: string | null; alt: string; size: number }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <span
        className="art flex shrink-0 items-center justify-center text-[var(--ink-faint)]"
        style={{ width: size, height: size, fontSize: size / 3.2 }}
        aria-hidden
      >
        ♪
      </span>
    );
  }
  return (
    // Artwork comes from hundreds of podcast CDNs; a plain img avoids having to
    // allowlist each host for next/image.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
      className="art shrink-0"
      style={{ width: size, height: size }}
    />
  );
}

export function ListenClient() {
  const { t, lang } = useUi();
  const locale = lang === "de" ? "de-DE" : lang === "vi" ? "vi-VN" : "en-GB";

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DiscoverResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [show, setShow] = useState<DiscoverResult | null>(null);
  const [feed, setFeed] = useState<FeedResult | null>(null);
  const [loadingFeed, setLoadingFeed] = useState(false);
  const [visible, setVisible] = useState(PAGE_SIZE);

  const [playing, setPlaying] = useState<FeedEpisode | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const [follows, setFollows] = useState<Subscription[]>([]);
  const [following, setFollowing] = useState(false);

  const [transcript, setTranscript] = useState<Segment[] | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const [dual, setDual] = useState(true);
  const [targetLang, setTargetLang] = useState<TargetLang>("en");

  const isYouTubeEpisode = Boolean(playing?.youtubeId);
  const media = useMediaElement(isYouTubeEpisode ? null : (playing?.url ?? null));
  const youtube = useYouTube(playing?.youtubeId ?? null);
  const handle = isYouTubeEpisode ? youtube.handle : media.handle;
  const playerRef = useRef<HTMLDivElement | null>(null);

  const refreshFollows = useCallback(() => setFollows(listSubscriptions()), []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(RECENT_KEY);
      if (raw) setRecent(JSON.parse(raw) as string[]);
    } catch {
      // A corrupt convenience list is not worth surfacing.
    }
    refreshFollows();
    window.addEventListener("hoerbar:follows-changed", refreshFollows);
    return () => window.removeEventListener("hoerbar:follows-changed", refreshFollows);
  }, [refreshFollows]);

  useEffect(() => {
    setFollowing(show?.feedUrl ? isFollowing(show.feedUrl) : false);
  }, [show, follows]);

  const isVideo = useMemo(
    () => Boolean(playing?.type?.startsWith("video/")) && !isYouTubeEpisode,
    [playing, isYouTubeEpisode],
  );

  const openShow = useCallback(async (result: DiscoverResult) => {
    if (!result.feedUrl) return;
    setShow(result);
    setLoadingFeed(true);
    setFeed(null);
    setVisible(PAGE_SIZE);
    setError(null);
    try {
      const response = await fetch("/api/feed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: result.feedUrl }),
      });
      const data = (await response.json()) as FeedResult & { error?: string };
      if (!response.ok) {
        setError(data.error ?? `The feed responded ${response.status}.`);
        return;
      }
      setFeed(data);
      if (data.error) setError(data.error);
    } catch {
      setError("That feed could not be loaded.");
    } finally {
      setLoadingFeed(false);
    }
  }, []);

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

        setRecent((previous) => {
          const next = [term.trim(), ...previous.filter((item) => item !== term.trim())].slice(0, 8);
          window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
          return next;
        });

        const only = found.length === 1 ? found[0] : null;
        if (only?.feedUrl) void openShow(only);
      } catch {
        setError("The search failed.");
      } finally {
        setSearching(false);
      }
    },
    [openShow, t],
  );

  /** Looks for an ingested transcript that belongs to this episode. */
  const loadTranscript = useCallback(async (episode: FeedEpisode) => {
    setTranscript(null);
    try {
      const response = await fetch("/api/transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: episode.url, youtubeId: episode.youtubeId, title: episode.title }),
      });
      const data = (await response.json()) as { found?: boolean; segments?: Segment[] };
      setTranscript(data.found ? (data.segments ?? []) : []);
    } catch {
      setTranscript([]);
    }
  }, []);

  function playEpisode(episode: FeedEpisode) {
    setPlaying(episode);
    setShowTranscript(false);
    void loadTranscript(episode);
    window.setTimeout(() => {
      if (!episode.youtubeId) handle.play();
      playerRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, 80);
  }

  const mixed = Boolean(playing && !isYouTubeEpisode && isMixedContent(playing.url));
  const artwork = playing?.image ?? show?.artwork ?? feed?.image ?? null;

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
          className="btn min-w-[260px] flex-1 justify-start font-normal"
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

      {recent.length > 0 ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[var(--ink-faint)]">
          <span>{t("listen.recent")}</span>
          {recent.map((item) => (
            <button
              key={item}
              type="button"
              className="max-w-[220px] truncate hover:text-[var(--accent)]"
              onClick={() => {
                setQuery(item);
                void search(item);
              }}
            >
              {item.replace(/^https?:\/\//, "")}
            </button>
          ))}
        </div>
      ) : null}

      {error ? (
        <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-[12.5px] text-amber-800 dark:text-amber-300">
          <p>{error}</p>
          <p className="mt-1 opacity-80">{t("listen.feedHint")}</p>
        </div>
      ) : null}

      {/* ---------------- player ---------------- */}
      {playing ? (
        <section ref={playerRef} className="card mt-5 overflow-hidden">
          <div className="flex flex-col gap-4 p-4 sm:flex-row">
            {!isVideo && !isYouTubeEpisode ? (
              <Art src={artwork} alt="" size={132} />
            ) : null}

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-0 flex-1">
                  <h2 className="text-[16px] font-medium leading-snug">{playing.title}</h2>
                  <p className="mt-0.5 text-[12.5px] text-[var(--ink-faint)]">
                    {feed?.title ?? show?.title}
                    {playing.publishedAt ? ` · ${formatDate(playing.publishedAt, locale)}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  className="text-[12px] text-[var(--ink-faint)] hover:text-[var(--ink)]"
                  onClick={() => {
                    handle.pause();
                    setPlaying(null);
                  }}
                >
                  {t("common.close")}
                </button>
              </div>

              {isYouTubeEpisode ? (
                <div className="relative mt-3">
                  <div
                    ref={youtube.containerRef}
                    className="aspect-video w-full overflow-hidden rounded-xl bg-black [&_iframe]:h-full [&_iframe]:w-full"
                  />
                  {youtube.unavailable ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-xl bg-[var(--paper-raised)] p-4 text-center">
                      <p className="text-[13px] text-[var(--ink-soft)]">{t("listen.playerBlocked")}</p>
                      <a
                        href={playing.pageUrl ?? `https://www.youtube.com/watch?v=${playing.youtubeId}`}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="btn"
                      >
                        {t("listen.openOnYouTube")}
                      </a>
                    </div>
                  ) : null}
                </div>
              ) : isVideo ? (
                <video
                  ref={media.mediaRef as React.RefObject<HTMLVideoElement>}
                  src={media.src ?? undefined}
                  poster={artwork ?? undefined}
                  playsInline
                  preload="metadata"
                  className="mt-3 aspect-video w-full rounded-xl bg-black"
                />
              ) : (
                <audio
                  ref={media.mediaRef as React.RefObject<HTMLAudioElement>}
                  src={media.src ?? undefined}
                  preload="metadata"
                  className="hidden"
                />
              )}

              {mixed ? (
                <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12.5px] text-amber-800 dark:text-amber-300">
                  <p>{t("listen.mixedContent")}</p>
                  <a
                    href={playing.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="btn mt-2 text-[12px]"
                  >
                    {t("listen.openDirect")}
                  </a>
                </div>
              ) : null}

              {!isYouTubeEpisode ? (
                <div className="mt-3">
                  <Transport handle={handle} state={media.state} onRetry={media.retry} compact />
                </div>
              ) : null}
            </div>
          </div>

          <div className="border-t border-[var(--rule)] px-4 py-3">
            <StreamControls handle={handle} />
          </div>

          {/* transcript / captions */}
          <div className="border-t border-[var(--rule)] px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="btn text-[12.5px]"
                data-active={showTranscript}
                onClick={() => setShowTranscript((value) => !value)}
              >
                {showTranscript ? t("listen.hideTranscript") : t("listen.showTranscript")}
              </button>
              <label className="flex cursor-pointer items-center gap-1.5 text-[12.5px] text-[var(--ink-soft)]">
                <input
                  type="checkbox"
                  checked={dual}
                  onChange={(event) => setDual(event.target.checked)}
                  className="accent-[var(--accent-ring)]"
                />
                {t("listen.dual")}
              </label>
              <div className="flex overflow-hidden rounded-full border border-[var(--rule)]">
                {(["en", "vi"] as const).map((code) => (
                  <button
                    key={code}
                    type="button"
                    data-active={targetLang === code}
                    onClick={() => setTargetLang(code)}
                    className="btn rounded-none border-0 border-r border-[var(--rule)] px-2.5 py-0.5 text-[11.5px] last:border-r-0"
                  >
                    {code === "en" ? "English" : "Tiếng Việt"}
                  </button>
                ))}
              </div>
            </div>

            {showTranscript ? (
              <div className="mt-3">
                {transcript === null ? (
                  <p className="text-[12.5px] text-[var(--ink-faint)]">{t("common.loading")}</p>
                ) : transcript.length > 0 ? (
                  <EpisodeTranscript
                    segments={transcript}
                    handle={handle}
                    targetLang={targetLang}
                    showTranslation={dual}
                  />
                ) : (
                  <div>
                    <p className="mb-3 text-[12.5px] text-[var(--ink-faint)]">
                      {t("listen.noTranscriptYet")}
                    </p>
                    <LiveCaption
                      handle={handle}
                      targetLang={targetLang}
                      showTranslation={dual}
                      onSeek={(seconds) => handle.seekTo(seconds, true)}
                    />
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* ---------------- results ---------------- */}
      {results && results.length > 0 && !feed ? (
        <section className="mt-6">
          <h2 className="mb-3 text-[13px] font-medium text-[var(--ink-soft)]">
            {t("listen.results", { count: results.length })}
          </h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {results.map((result) => (
              <li key={result.id}>
                <button
                  type="button"
                  onClick={() => (result.feedUrl ? void openShow(result) : undefined)}
                  disabled={!result.feedUrl}
                  className="row-hover flex w-full gap-3 p-2.5 text-left disabled:opacity-60"
                >
                  <Art src={result.artwork} alt="" size={64} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[14.5px] font-medium">{result.title}</span>
                      <span className="chip shrink-0 text-[11px]">{ORIGIN_LABEL[result.origin]}</span>
                    </span>
                    {result.publisher ? (
                      <span className="mt-0.5 block truncate text-[12.5px] text-[var(--ink-soft)]">
                        {result.publisher}
                      </span>
                    ) : null}
                    {result.description ? (
                      <span className="mt-0.5 block truncate text-[12px] text-[var(--ink-faint)]">
                        {result.description}
                      </span>
                    ) : null}
                    {result.note ? (
                      <span className="mt-1 block text-[11.5px] leading-snug text-[var(--accent)]">
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

      {loadingFeed ? (
        <p className="mt-6 text-[13px] text-[var(--ink-faint)]">{t("listen.loadingEpisodes")}</p>
      ) : null}

      {/* ---------------- episode list ---------------- */}
      {feed && feed.episodes.length > 0 ? (
        <section className="mt-6">
          {show?.note ? (
            <p className="mb-3 rounded-xl bg-[var(--accent-soft)] px-3 py-2 text-[12.5px] leading-relaxed">
              {show.note}
            </p>
          ) : null}

          <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[var(--rule)] pb-3">
            <Art src={show?.artwork ?? feed.image} alt="" size={56} />
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-[18px] font-semibold">{feed.title}</h2>
              <p className="text-[12.5px] text-[var(--ink-faint)]">
                {feed.episodes.length}{" "}
                {feed.format === "youtube" ? t("common.videos") : t("common.episodes")}
                {show ? ` · ${ORIGIN_LABEL[show.origin]}` : ""}
              </p>
            </div>
            {show?.feedUrl ? (
              <button
                type="button"
                className="btn text-[12.5px]"
                data-active={following}
                onClick={() => {
                  const next = toggleFollow({
                    id: show.id,
                    title: show.title,
                    publisher: show.publisher,
                    artwork: show.artwork,
                    feedUrl: show.feedUrl!,
                    origin: show.origin,
                    pageUrl: show.pageUrl,
                  });
                  setFollowing(next);
                  refreshFollows();
                }}
              >
                {following ? `✓ ${t("listen.following")}` : t("listen.follow")}
              </button>
            ) : null}
            {results && results.length > 1 ? (
              <button
                type="button"
                className="text-[12px] text-[var(--ink-faint)] hover:text-[var(--ink)]"
                onClick={() => {
                  setFeed(null);
                  setShow(null);
                }}
              >
                {t("listen.backToResults")}
              </button>
            ) : null}
          </div>

          <ul>
            {feed.episodes.slice(0, visible).map((episode) => (
              <li key={episode.guid}>
                <button
                  type="button"
                  onClick={() => playEpisode(episode)}
                  className="row-hover flex w-full items-start gap-3 p-2.5 text-left"
                  data-active={playing?.guid === episode.guid}
                >
                  <Art src={episode.image ?? show?.artwork ?? feed.image} alt="" size={56} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14.5px] font-medium leading-snug">{episode.title}</span>
                    {episode.description ? (
                      <span className="mt-0.5 line-clamp-2 block text-[12.5px] leading-relaxed text-[var(--ink-faint)]">
                        {episode.description}
                      </span>
                    ) : null}
                    <span className="mt-1 flex flex-wrap gap-x-3 text-[11.5px] text-[var(--ink-faint)]">
                      {formatDate(episode.publishedAt, locale) ? (
                        <span>{formatDate(episode.publishedAt, locale)}</span>
                      ) : null}
                      {formatDuration(episode.durationSec, t("common.min")) ? (
                        <span>{formatDuration(episode.durationSec, t("common.min"))}</span>
                      ) : null}
                      <span>{episode.youtubeId ? "YouTube" : episode.type}</span>
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {visible < feed.episodes.length ? (
            <div className="mt-3 flex justify-center">
              <button
                type="button"
                className="btn"
                onClick={() => setVisible((value) => value + PAGE_SIZE)}
              >
                {t("common.more")} ({feed.episodes.length - visible})
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* ---------------- following ---------------- */}
      {!feed && follows.length > 0 ? (
        <section className="mt-8">
          <h2 className="mb-3 text-[13px] font-medium text-[var(--ink-soft)]">
            {t("listen.following")}
          </h2>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {follows.map((item) => (
              <li key={item.feedUrl}>
                <button
                  type="button"
                  className="row-hover flex w-full items-center gap-3 p-2.5 text-left"
                  onClick={() =>
                    void openShow({
                      id: item.id,
                      title: item.title,
                      publisher: item.publisher,
                      description: "",
                      artwork: item.artwork,
                      feedUrl: item.feedUrl,
                      origin: item.origin as DiscoverResult["origin"],
                      pageUrl: item.pageUrl,
                    })
                  }
                >
                  <Art src={item.artwork} alt="" size={48} />
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-medium">{item.title}</span>
                    <span className="block truncate text-[12px] text-[var(--ink-faint)]">
                      {item.publisher}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ---------------- suggestions ---------------- */}
      {!feed && !results ? (
        <section className="mt-8">
          <h2 className="mb-3 text-[13px] font-medium text-[var(--ink-soft)]">
            {t("listen.suggested")}
          </h2>
          <div className="space-y-5">
            {suggestionsByLevel().map((group) => (
              <div key={group.cefr}>
                <div className="mb-2 flex items-center gap-2">
                  <LevelBadge level={group.cefr} />
                  <span className="text-[12px] text-[var(--ink-faint)]">
                    {group.items.length} {group.items.length === 1 ? "show" : "shows"}
                  </span>
                </div>
                <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {group.items.map((item) => (
                    <li key={item.query}>
                      <button
                        type="button"
                        className="row-hover w-full p-2.5 text-left"
                        onClick={() => {
                          setQuery(item.query);
                          void search(item.query);
                        }}
                      >
                        <span className="block text-[14px] font-medium">{item.label}</span>
                        <span className="block text-[12px] text-[var(--ink-soft)]">{item.publisher}</span>
                        <span className="mt-1 block text-[12px] leading-snug text-[var(--ink-faint)]">
                          {item.why}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[12px] text-[var(--ink-faint)]">
            {SUGGESTIONS.length} suggestions, all resolved through the same search as anything you
            type.{" "}
            <Link href="/about" className="underline decoration-dotted underline-offset-4">
              How sources are found
            </Link>
          </p>
        </section>
      ) : null}
    </div>
  );
}
