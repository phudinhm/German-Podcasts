"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { FeedEpisode, FeedResult } from "@/app/api/feed/route";
import { useMediaElement } from "./player/useMediaElement";
import { Transport } from "./player/Transport";
import { StreamControls } from "./StreamControls";

/** Feeds worth starting from, all of them German shows with public RSS. */
const SUGGESTIONS: Array<{ label: string; level: string; url: string }> = [
  { label: "Deutschlandfunk Nachrichten", level: "B2", url: "https://www.deutschlandfunk.de/nachrichten-100.rss" },
  { label: "tagesschau in 100 Sekunden", level: "B2", url: "https://www.tagesschau.de/multimedia/sendung/tagesschau_in_100_sekunden/podcast-ts100-audio-100~podcast.xml" },
  { label: "Slow German", level: "A2", url: "https://slowgerman.com/feed/podcast/" },
];

const STORAGE_KEY = "hoerbar.feeds.v1";

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
 * Straight-to-listening: paste a podcast feed, pick an episode, and the browser
 * streams it from the publisher's own CDN. No ingest run, no transcript, no
 * waiting - this is the path for content you want in your ears today.
 */
export function ListenClient() {
  const [url, setUrl] = useState("");
  const [feed, setFeed] = useState<FeedResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState<FeedEpisode | null>(null);
  const [recent, setRecent] = useState<string[]>([]);

  const media = useMediaElement(playing?.url ?? null);
  const playerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setRecent(JSON.parse(raw) as string[]);
    } catch {
      // A corrupt entry is not worth surfacing; the list is a convenience.
    }
  }, []);

  const isVideo = useMemo(
    () => Boolean(playing?.type?.startsWith("video/")),
    [playing],
  );

  const load = useCallback(async (feedUrl: string) => {
    setLoading(true);
    setError(null);
    setFeed(null);
    try {
      const response = await fetch("/api/feed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: feedUrl }),
      });
      const data = (await response.json()) as FeedResult & { error?: string };
      if (!response.ok) {
        setError(data.error ?? `Der Feed antwortete mit ${response.status}.`);
        return;
      }
      setFeed(data);
      if (data.error) setError(data.error);
      setRecent((previous) => {
        const next = [feedUrl, ...previous.filter((item) => item !== feedUrl)].slice(0, 6);
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        return next;
      });
    } catch {
      setError("Der Feed ließ sich nicht laden.");
    } finally {
      setLoading(false);
    }
  }, []);

  function play(episode: FeedEpisode) {
    setPlaying(episode);
    // Give the element a tick to pick up the new src before asking it to play.
    window.setTimeout(() => {
      media.handle.play();
      playerRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, 60);
  }

  return (
    <div>
      <header className="mb-5 max-w-2xl">
        <h1 className="text-[26px] font-semibold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
          Direkt hören
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-[var(--ink-soft)]">
          Adresse eines öffentlichen Podcast-Feeds einfügen und sofort streamen. Der Ton kommt direkt
          vom Server des Anbieters in deinen Browser; Hörbar liest nur die Feed-Liste und steuert die
          Wiedergabe. Tempo und A-B-Schleife funktionieren auch ohne Transkript.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && url.trim()) void load(url.trim());
          }}
          placeholder="https://…/feed.xml"
          className="btn min-w-[260px] flex-1 justify-start font-normal"
        />
        <button
          type="button"
          className="btn btn-primary"
          disabled={!url.trim() || loading}
          onClick={() => void load(url.trim())}
        >
          {loading ? "Lädt …" : "Feed laden"}
        </button>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-[var(--ink-faint)]">
        <span className="uppercase tracking-[0.12em]">Vorschläge</span>
        {SUGGESTIONS.map((item) => (
          <button
            key={item.url}
            type="button"
            className="chip hover:border-[var(--accent-ring)]"
            onClick={() => {
              setUrl(item.url);
              void load(item.url);
            }}
          >
            {item.label} · {item.level}
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
                setUrl(item);
                void load(item);
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
            Manche Anbieter lassen nur Podcast-Apps an ihren Feed. In dem Fall kopiere die direkte
            Adresse einer Folge und verbinde sie auf der Folgenseite unter &bdquo;Stream verbinden&ldquo;.
          </p>
        </div>
      ) : null}

      {playing ? (
        <section ref={playerRef} className="card mt-5 p-4">
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 className="text-[15px] font-semibold" style={{ fontFamily: "var(--font-display)" }}>
              {playing.title}
            </h2>
            <span className="text-[11px] text-[var(--ink-faint)]">{feed?.title}</span>
            <button
              type="button"
              className="ml-auto text-[11px] text-[var(--ink-faint)] underline decoration-dotted underline-offset-4"
              onClick={() => {
                media.handle.pause();
                setPlaying(null);
              }}
            >
              schließen
            </button>
          </div>

          {isVideo ? (
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

          <div className="mt-3">
            <Transport handle={media.handle} state={media.state} onRetry={media.retry} compact />
          </div>
          <div className="mt-3">
            <StreamControls handle={media.handle} />
          </div>

          <p className="mt-3 text-[12px] leading-relaxed text-[var(--ink-faint)]">
            Für Satz-für-Satz-Training mit Wörterbuch und Echo-Pausen braucht diese Folge ein
            Transkript:{" "}
            <code className="font-mono text-[11px]">
              python worker/ingest.py --url &quot;{playing.url.slice(0, 48)}…&quot;
            </code>{" "}
            und danach <code className="font-mono text-[11px]">npm run build-catalog</code>.{" "}
            <Link href="/about" className="underline decoration-dotted underline-offset-4">
              Mehr dazu
            </Link>
            .
          </p>
        </section>
      ) : null}

      {feed && feed.episodes.length > 0 ? (
        <section className="mt-6">
          <div className="mb-3 flex flex-wrap items-baseline gap-2 border-b border-[var(--rule)] pb-2">
            <h2 className="text-[17px] font-semibold" style={{ fontFamily: "var(--font-display)" }}>
              {feed.title}
            </h2>
            <span className="text-[12px] text-[var(--ink-faint)]">{feed.episodes.length} Folgen</span>
          </div>
          <ul className="divide-y divide-[var(--rule)]">
            {feed.episodes.map((episode) => (
              <li key={episode.guid} className="flex items-start gap-3 py-2.5">
                <button
                  type="button"
                  onClick={() => play(episode)}
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
                    <span>{episode.type}</span>
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
