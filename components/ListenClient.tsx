"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { FeedEpisode, FeedResult } from "@/lib/server/feed";
import type { DiscoverResult } from "@/lib/server/discover";
import { useMediaElement } from "./player/useMediaElement";
import { useYouTube } from "./player/useYouTube";
import { Transport } from "./player/Transport";
import { StreamControls } from "./StreamControls";

const EXAMPLES = [
  "Easy German",
  "Slow German",
  "@easygerman",
  "Handelsblatt Today",
  "Nachrichtenleicht",
];

const ORIGIN_LABEL: Record<DiscoverResult["origin"], string> = {
  apple: "Apple Podcasts",
  youtube: "YouTube",
  spotify: "Spotify",
  rss: "RSS",
  web: "Website",
};

const RECENT_KEY = "hoerbar.discover.v1";

function formatDuration(seconds: number | null): string {
  if (!seconds) return "";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

function formatDate(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString("de-DE", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * One box, any source.
 *
 * Type a show's name, or paste an Apple Podcasts, Spotify or YouTube link, or a
 * podcast's own homepage. The server works out what is actually playable and
 * hands back a feed; the browser then streams from the publisher's CDN or plays
 * the video through YouTube's own player.
 */
export function ListenClient() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DiscoverResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [show, setShow] = useState<DiscoverResult | null>(null);
  const [feed, setFeed] = useState<FeedResult | null>(null);
  const [loadingFeed, setLoadingFeed] = useState(false);

  const [playing, setPlaying] = useState<FeedEpisode | null>(null);
  const [recent, setRecent] = useState<string[]>([]);

  const isYouTubeEpisode = Boolean(playing?.youtubeId);
  const media = useMediaElement(isYouTubeEpisode ? null : (playing?.url ?? null));
  const youtube = useYouTube(playing?.youtubeId ?? null);
  const handle = isYouTubeEpisode ? youtube.handle : media.handle;
  const playerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(RECENT_KEY);
      if (raw) setRecent(JSON.parse(raw) as string[]);
    } catch {
      // A corrupt entry is only a convenience list; not worth surfacing.
    }
  }, []);

  const isVideo = useMemo(() => Boolean(playing?.type?.startsWith("video/")) && !isYouTubeEpisode, [playing, isYouTubeEpisode]);

  const search = useCallback(async (term: string) => {
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
      setResults(data.results ?? []);
      if (data.error) setError(data.error);
      if ((data.results ?? []).length === 0 && !data.error) {
        setError("Dazu wurde nichts gefunden. Versuche den genauen Namen der Sendung oder füge einen Link ein.");
      }
      setRecent((previous) => {
        const next = [term.trim(), ...previous.filter((item) => item !== term.trim())].slice(0, 6);
        window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
        return next;
      });
      // A single unambiguous hit goes straight to its episodes.
      const only = data.results?.length === 1 ? data.results[0] : null;
      if (only?.feedUrl) void openShow(only);
      if (only?.youtubeId) {
        playEpisode({
          guid: only.id,
          title: only.title,
          description: only.description,
          url: "",
          type: "video/youtube",
          durationSec: null,
          publishedAt: null,
          image: only.artwork,
          youtubeId: only.youtubeId,
        });
      }
    } catch {
      setError("Die Suche ist fehlgeschlagen.");
    } finally {
      setSearching(false);
    }
  }, []);

  const openShow = useCallback(async (result: DiscoverResult) => {
    if (!result.feedUrl) return;
    setShow(result);
    setLoadingFeed(true);
    setFeed(null);
    setError(null);
    try {
      const response = await fetch("/api/feed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: result.feedUrl }),
      });
      const data = (await response.json()) as FeedResult & { error?: string };
      if (!response.ok) {
        setError(data.error ?? `Der Feed antwortete mit ${response.status}.`);
        return;
      }
      setFeed(data);
      if (data.error) setError(data.error);
    } catch {
      setError("Der Feed ließ sich nicht laden.");
    } finally {
      setLoadingFeed(false);
    }
  }, []);

  function playEpisode(episode: FeedEpisode) {
    setPlaying(episode);
    window.setTimeout(() => {
      if (!episode.youtubeId) handle.play();
      playerRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, 80);
  }

  return (
    <div>
      <header className="mb-5 max-w-2xl">
        <h1 className="text-[26px] font-semibold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
          Direkt hören
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-[var(--ink-soft)]">
          Namen einer Sendung eintippen oder einen Link einfügen: Apple Podcasts, Spotify, ein
          YouTube-Kanal oder die Website eines Podcasts. Hörbar sucht den passenden Feed und spielt
          sofort ab. Der Ton kommt dabei direkt vom Anbieter, nicht über unseren Server.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void search(query);
          }}
          placeholder="z. B. Easy German, @easygerman, podcasts.apple.com/… oder open.spotify.com/show/…"
          className="btn min-w-[260px] flex-1 justify-start font-normal"
        />
        <button
          type="button"
          className="btn btn-primary"
          disabled={!query.trim() || searching}
          onClick={() => void search(query)}
        >
          {searching ? "Sucht …" : "Suchen"}
        </button>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-[var(--ink-faint)]">
        <span className="uppercase tracking-[0.12em]">Beispiele</span>
        {EXAMPLES.map((item) => (
          <button
            key={item}
            type="button"
            className="chip hover:border-[var(--accent-ring)]"
            onClick={() => {
              setQuery(item);
              void search(item);
            }}
          >
            {item}
          </button>
        ))}
      </div>

      {recent.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--ink-faint)]">
          <span className="uppercase tracking-[0.12em]">Zuletzt</span>
          {recent.map((item) => (
            <button
              key={item}
              type="button"
              className="max-w-[240px] truncate underline decoration-dotted underline-offset-4 hover:text-[var(--accent)]"
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
        <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12.5px] text-amber-800 dark:text-amber-300">
          <p>{error}</p>
          <p className="mt-1 opacity-80">
            Manche Anbieter lassen nur Podcast-Apps an ihren Feed. Kopiere in dem Fall die direkte
            Adresse einer Folge und verbinde sie auf einer Folgenseite unter &bdquo;Stream verbinden&ldquo;.
          </p>
        </div>
      ) : null}

      {playing ? (
        <section ref={playerRef} className="card mt-5 p-4">
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 className="text-[15px] font-semibold" style={{ fontFamily: "var(--font-display)" }}>
              {playing.title}
            </h2>
            <span className="text-[11px] text-[var(--ink-faint)]">{feed?.title ?? show?.title}</span>
            <button
              type="button"
              className="ml-auto text-[11px] text-[var(--ink-faint)] underline decoration-dotted underline-offset-4"
              onClick={() => {
                handle.pause();
                setPlaying(null);
              }}
            >
              schließen
            </button>
          </div>

          {isYouTubeEpisode ? (
            <div className="relative mt-3">
              <div
                ref={youtube.containerRef}
                className="aspect-video w-full overflow-hidden rounded-lg border border-[var(--rule)] bg-black [&_iframe]:h-full [&_iframe]:w-full"
              />
              {youtube.unavailable ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-lg bg-[var(--paper-raised)] p-4 text-center">
                  <p className="text-[13px] text-[var(--ink-soft)]">
                    Der YouTube-Player lädt hier nicht. Das liegt meist an einem Netzwerkfilter oder
                    einem Blocker.
                  </p>
                  <a
                    href={playing.pageUrl ?? `https://www.youtube.com/watch?v=${playing.youtubeId}`}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="btn"
                  >
                    Auf YouTube öffnen
                  </a>
                </div>
              ) : null}
            </div>
          ) : isVideo ? (
            <video
              ref={media.mediaRef as React.RefObject<HTMLVideoElement>}
              src={playing.url}
              playsInline
              preload="metadata"
              className="mt-3 aspect-video w-full rounded-lg border border-[var(--rule)] bg-black"
            />
          ) : (
            <audio
              ref={media.mediaRef as React.RefObject<HTMLAudioElement>}
              src={playing.url}
              preload="metadata"
              className="hidden"
            />
          )}

          {!isYouTubeEpisode ? (
            <div className="mt-3">
              <Transport handle={handle} state={media.state} onRetry={media.retry} compact />
            </div>
          ) : null}
          <div className="mt-3">
            <StreamControls handle={handle} />
          </div>

          <p className="mt-3 text-[12px] leading-relaxed text-[var(--ink-faint)]">
            Für Satz-für-Satz-Training mit Wörterbuch und Echo-Pausen braucht diese Folge ein
            Transkript:{" "}
            <code className="font-mono text-[11px]">
              python worker/ingest.py --url &quot;
              {(playing.youtubeId ? playing.pageUrl ?? "" : playing.url).slice(0, 46)}…&quot;
            </code>{" "}
            und danach <code className="font-mono text-[11px]">npm run build-catalog</code>.{" "}
            <Link href="/about" className="underline decoration-dotted underline-offset-4">
              Mehr dazu
            </Link>
            .
          </p>
        </section>
      ) : null}

      {results && results.length > 0 && !feed ? (
        <section className="mt-6">
          <h2 className="mb-3 border-b border-[var(--rule)] pb-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-faint)]">
            {results.length} Treffer
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {results.map((result) => (
              <li key={result.id}>
                <button
                  type="button"
                  onClick={() => (result.feedUrl ? void openShow(result) : undefined)}
                  disabled={!result.feedUrl && !result.youtubeId}
                  className="card flex w-full gap-3 p-3 text-left transition-transform enabled:hover:-translate-y-0.5 disabled:opacity-60"
                >
                  {result.artwork ? (
                    // Remote artwork from many hosts; a plain img avoids having
                    // to allowlist every podcast CDN in next.config.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={result.artwork}
                      alt=""
                      width={56}
                      height={56}
                      loading="lazy"
                      className="h-14 w-14 shrink-0 rounded-md border border-[var(--rule)] object-cover"
                    />
                  ) : (
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border border-[var(--rule)] text-[10px] text-[var(--ink-faint)]">
                      {ORIGIN_LABEL[result.origin].slice(0, 2)}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[14px] font-medium">{result.title}</span>
                      <span className="chip shrink-0">{ORIGIN_LABEL[result.origin]}</span>
                    </span>
                    {result.publisher ? (
                      <span className="mt-0.5 block truncate text-[12px] text-[var(--ink-soft)]">
                        {result.publisher}
                      </span>
                    ) : null}
                    {result.description ? (
                      <span className="mt-0.5 block truncate text-[11.5px] text-[var(--ink-faint)]">
                        {result.description}
                      </span>
                    ) : null}
                    {result.note ? (
                      <span className="mt-1 block text-[11px] leading-snug text-[var(--accent)]">
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
        <p className="mt-6 text-[13px] text-[var(--ink-faint)]">Folgen werden geladen …</p>
      ) : null}

      {feed && feed.episodes.length > 0 ? (
        <section className="mt-6">
          {show?.note ? (
            <p className="mb-3 rounded-lg border border-[var(--rule)] bg-[var(--accent-soft)] px-3 py-2 text-[12.5px] leading-relaxed text-[var(--ink)]">
              {show.note}
            </p>
          ) : null}
          <div className="mb-3 flex flex-wrap items-baseline gap-2 border-b border-[var(--rule)] pb-2">
            <h2 className="text-[17px] font-semibold" style={{ fontFamily: "var(--font-display)" }}>
              {feed.title}
            </h2>
            {show ? <span className="chip">{ORIGIN_LABEL[show.origin]}</span> : null}
            <span className="text-[12px] text-[var(--ink-faint)]">
              {feed.episodes.length} {feed.format === "youtube" ? "Videos" : "Folgen"}
            </span>
            {results && results.length > 1 ? (
              <button
                type="button"
                className="ml-auto text-[11px] text-[var(--ink-faint)] underline decoration-dotted underline-offset-4"
                onClick={() => {
                  setFeed(null);
                  setShow(null);
                }}
              >
                zurück zu den Treffern
              </button>
            ) : null}
          </div>
          <ul className="divide-y divide-[var(--rule)]">
            {feed.episodes.map((episode) => (
              <li key={episode.guid} className="flex items-start gap-3 py-2.5">
                <button
                  type="button"
                  onClick={() => playEpisode(episode)}
                  className="btn mt-0.5 h-8 w-8 shrink-0 rounded-full p-0 text-[11px]"
                  data-active={playing?.guid === episode.guid}
                  aria-label={`${episode.title} abspielen`}
                >
                  ▶
                </button>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium leading-snug">{episode.title}</p>
                  {episode.description ? (
                    <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-relaxed text-[var(--ink-faint)]">
                      {episode.description}
                    </p>
                  ) : null}
                  <p className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-[var(--ink-faint)]">
                    {formatDate(episode.publishedAt) ? <span>{formatDate(episode.publishedAt)}</span> : null}
                    {formatDuration(episode.durationSec) ? <span>{formatDuration(episode.durationSec)}</span> : null}
                    <span>{episode.youtubeId ? "YouTube" : episode.type}</span>
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
