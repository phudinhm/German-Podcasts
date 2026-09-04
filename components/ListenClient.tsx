"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { FeedEpisode, FeedResult } from "@/lib/server/feed";
import type { DiscoverResult } from "@/lib/server/discover";
import type { Segment, TargetLang } from "@/lib/types";
import { useUi } from "@/lib/i18n";
import { isFollowing, listSubscriptions, toggleFollow, type Subscription } from "@/lib/subscriptions";
import { isMixedContent } from "@/lib/media";
import { usePlayer, useVideoStage, type Track } from "./player/PlayerProvider";
import { Transport } from "./player/Transport";
import { StreamControls } from "./StreamControls";
import { EpisodeTranscript } from "./EpisodeTranscript";
import { useCaptions, type CaptionLine, type CaptionMode } from "./captions/useCaptions";
import { CaptionPanel } from "./captions/CaptionPanel";
import { SubtitleButton, SubtitleOverlay, type SubtitleMode } from "./captions/SubtitleOverlay";
import { SubtitleExport } from "./captions/SubtitleExport";
import { TranscribePanel } from "./captions/TranscribePanel";
import { useEpisodeTranscript } from "./captions/useEpisodeTranscript";
import { QuickLookup, type QuickSelection } from "./QuickLookup";
import { DiscoverPanel } from "./listen/DiscoverPanel";
import { Art } from "./listen/Art";

const RECENT_KEY = "hoerbar.discover.v2";
const LEGACY_RECENT_KEY = "hoerbar.discover.v1";

/**
 * A recent search remembers what to run again and what to call it. Storing only
 * the query meant a pasted Apple or Spotify URL showed up as a URL, which tells
 * you nothing about which show it was.
 */
interface RecentEntry {
  q: string;
  label: string;
}
const PAGE_SIZE = 40;

const ORIGIN_LABEL: Record<DiscoverResult["origin"], string> = {
  apple: "Apple Podcasts",
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

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DiscoverResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [show, setShow] = useState<DiscoverResult | null>(null);
  const [feed, setFeed] = useState<FeedResult | null>(null);
  const [loadingFeed, setLoadingFeed] = useState(false);
  const [visible, setVisible] = useState(PAGE_SIZE);

  const [recent, setRecent] = useState<RecentEntry[]>([]);
  const [follows, setFollows] = useState<Subscription[]>([]);
  const [following, setFollowing] = useState(false);

  const [transcript, setTranscript] = useState<Segment[] | null>(null);
  const [showText, setShowText] = useState(false);
  const [dual, setDual] = useState(true);
  const [columns, setColumns] = useState(false);
  const [sidePanel, setSidePanel] = useState(false);
  const [targetLang, setTargetLang] = useState<TargetLang>("en");
  const [expandedDescription, setExpandedDescription] = useState(false);

  /** Title translations, keyed by the German title. */
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [translateTitles, setTranslateTitles] = useState(false);

  /** Narrows a mixed feed to the episodes that have a picture to watch. */
  const [videoOnly, setVideoOnly] = useState(false);

  /**
   * The microphone is the default because it is the one that just works: it
   * starts in a second and downloads nothing. Reading the stream is better
   * once it is running - headphones, a noisy room, no microphone permission -
   * but it costs a model download of around a hundred megabytes, and making
   * every new listener pay that before hearing a single caption was the wrong
   * trade. It is one click away for anyone who wants it.
   */
  const [captionMode, setCaptionMode] = useState<CaptionMode>("mic");
  const [subtitleMode, setSubtitleMode] = useState<SubtitleMode>("off");

  const [selection, setSelection] = useState<QuickSelection | null>(null);
  /** Everything but the player recedes right after you press play. */
  const [focusMode, setFocusMode] = useState(false);

  const playing = player.track;
  const isVideo = playing?.kind === "video";
  const stageRef = useVideoStage(Boolean(playing) && isVideo);
  const playerRef = useRef<HTMLDivElement | null>(null);

  const captions = useCaptions({
    handle: player.handle,
    mediaUrl: playing?.url ?? null,
    targetLang,
    translate: dual,
  });

  const generated = useEpisodeTranscript({ targetLang, translate: dual });

  /**
   * Subtitles read from the finished transcript when there is one, and from the
   * live recogniser when there is not. Same shape either way, so the overlay
   * does not care which produced them.
   */
  const subtitleLines: CaptionLine[] = useMemo(() => {
    if (transcript && transcript.length > 0) {
      return transcript.map((segment) => ({
        id: segment.id,
        at: segment.start,
        until: segment.end,
        de: segment.de,
        translation: targetLang === "vi" ? segment.vi : segment.en,
      }));
    }
    if (generated.state.lines.length > 0) return generated.state.lines;
    return captions.state.lines;
  }, [transcript, targetLang, captions.state.lines, generated.state.lines]);

  // Subtitles over a video with no transcript need the recogniser running.
  const startCaptions = captions.start;
  useEffect(() => {
    if (subtitleMode === "off") return;
    if (transcript === null || transcript.length > 0) return;
    if (captions.state.running) return;
    startCaptions(captionMode);
  }, [subtitleMode, transcript, captions.state.running, startCaptions, captionMode]);

  // Safari and Firefox have no speech recognition, so the default would be a
  // mode they cannot run. Those users get the stream reader instead.
  const micSupported = captions.state.micSupported;
  useEffect(() => {
    if (micSupported === false) setCaptionMode("internal");
  }, [micSupported]);

  // A new episode is new ground: drop the old lines and release the tap.
  const stopCaptions = captions.stop;
  const clearCaptions = captions.clear;
  const trackId = playing?.id ?? null;
  useEffect(() => {
    stopCaptions();
    clearCaptions();
  }, [trackId, stopCaptions, clearCaptions]);

  const refreshFollows = useCallback(() => setFollows(listSubscriptions()), []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(RECENT_KEY);
      if (raw) {
        setRecent(JSON.parse(raw) as RecentEntry[]);
      } else {
        // Carry over the old plain-string list, labelled with itself.
        const legacy = window.localStorage.getItem(LEGACY_RECENT_KEY);
        if (legacy) {
          const migrated = (JSON.parse(legacy) as string[]).map((q) => ({ q, label: q }));
          setRecent(migrated);
          window.localStorage.setItem(RECENT_KEY, JSON.stringify(migrated));
        }
      }
    } catch {
      // A corrupt convenience list is not worth surfacing.
    }
    refreshFollows();
    window.addEventListener("hoerbar:follows-changed", refreshFollows);
    return () => {
      window.removeEventListener("hoerbar:follows-changed", refreshFollows);
    };
  }, [refreshFollows]);

  useEffect(() => {
    setFollowing(show?.feedUrl ? isFollowing(show.feedUrl) : false);
  }, [show, follows]);

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
      // The feed knows the show's real name; use it for the recent list.
      if (data.title) {
        setRecent((previous) => {
          const next = previous.map((item, index) =>
            index === 0 ? { ...item, label: data.title } : item,
          );
          window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
          return next;
        });
      }
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

        // Label it with the show as soon as one is known, rather than the URL
        // the user happened to paste.
        const label = found[0]?.title ?? term.trim();
        setRecent((previous) => {
          const next = [
            { q: term.trim(), label },
            ...previous.filter((item) => item.q !== term.trim()),
          ].slice(0, 8);
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

  /** Looks for an ingested transcript belonging to this episode. */
  const loadTranscript = useCallback(async (episode: FeedEpisode) => {
    setTranscript(null);
    try {
      const response = await fetch("/api/transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: episode.url, title: episode.title }),
      });
      const data = (await response.json()) as { found?: boolean; segments?: Segment[] };
      setTranscript(data.found ? (data.segments ?? []) : []);
    } catch {
      setTranscript([]);
    }
  }, []);

  /**
   * A feed can carry both, and a learner who wants to watch does not want to
   * scroll past forty audio episodes to find the three with pictures. The
   * toggle only appears when the feed actually has some of each.
   */
  const isVideoEpisode = (episode: FeedEpisode) => episode.type.startsWith("video/");
  const hasVideo = Boolean(feed?.episodes.some(isVideoEpisode));
  const episodes = useMemo(() => {
    const all = feed?.episodes ?? [];
    return videoOnly ? all.filter(isVideoEpisode) : all;
  }, [feed, videoOnly]);

  /**
   * Translates the visible episode titles in one batch. German feed titles are
   * often the only clue to what an episode is about, and forty of them is a
   * wall of text to a learner who cannot yet skim German.
   */
  useEffect(() => {
    if (!translateTitles || !feed) return;
    const pending = episodes.slice(0, visible).map((e) => e.title).filter((title) => !titles[title]);
    if (pending.length === 0) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ texts: pending, lang: targetLang }),
        });
        const data = (await response.json()) as { texts?: Array<string | null> };
        if (cancelled || !data.texts) return;
        setTitles((previous) => {
          const next = { ...previous };
          pending.forEach((title, index) => {
            const translated = data.texts?.[index];
            if (translated) next[title] = translated;
          });
          return next;
        });
      } catch {
        // Titles simply stay untranslated.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [translateTitles, feed, episodes, visible, targetLang, titles]);

  // Changing gloss language invalidates the cached title translations.
  useEffect(() => setTitles({}), [targetLang]);

  /**
   * Scrolling is the signal that the player has been dealt with and the page is
   * wanted back. A pointer press counts too, so a dimmed control is never a
   * dead control.
   */
  useEffect(() => {
    if (!focusMode) return;
    const lift = () => setFocusMode(false);
    window.addEventListener("wheel", lift, { passive: true });
    window.addEventListener("touchmove", lift, { passive: true });
    window.addEventListener("scroll", lift, { passive: true });
    window.addEventListener("keydown", lift);
    window.addEventListener("pointerdown", lift);
    return () => {
      window.removeEventListener("wheel", lift);
      window.removeEventListener("touchmove", lift);
      window.removeEventListener("scroll", lift);
      window.removeEventListener("keydown", lift);
      window.removeEventListener("pointerdown", lift);
    };
  }, [focusMode]);

  const playEpisode = useCallback(
    (episode: FeedEpisode) => {
      const track: Track = {
        id: episode.guid,
        title: episode.title,
        showTitle: feed?.title ?? show?.title ?? "",
        artwork: episode.image ?? show?.artwork ?? feed?.image ?? null,
        description: episode.description,
        kind: episode.type.startsWith("video/") ? "video" : "audio",
        url: episode.url || undefined,
        pageUrl: episode.pageUrl,
        durationSec: episode.durationSec,
        publishedAt: episode.publishedAt,
      };
      player.play(track);
      setShowText(false);
      setExpandedDescription(false);
      setFocusMode(true);
      void loadTranscript(episode);
      window.setTimeout(() => playerRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 80);
    },
    [feed, show, player, loadTranscript],
  );

  const onWord = useCallback(
    (word: string, sentence: string, anchor: HTMLElement) => {
      const rect = anchor.getBoundingClientRect();
      setSelection({
        word,
        sentence,
        at: player.handle.getTime(),
        anchor: { top: rect.top + window.scrollY, left: rect.left + window.scrollX, width: rect.width },
      });
    },
    [player.handle],
  );

  const mixed = Boolean(playing && playing.kind === "audio" && playing.url && isMixedContent(playing.url));
  const artwork = playing?.artwork ?? show?.artwork ?? feed?.image ?? null;

  const textPanel = useMemo(() => {
    if (!playing) return null;
    if (transcript === null) {
      return <p className="text-[12.5px] text-[var(--ink-faint)]">{t("common.loading")}</p>;
    }
    if (transcript.length > 0) {
      return (
        <div>
          <EpisodeTranscript
            segments={transcript}
            handle={player.handle}
            targetLang={targetLang}
            showTranslation={dual}
            layout={columns ? "columns" : "stacked"}
            maxHeight={sidePanel ? "calc(100vh - 210px)" : 420}
            onWord={onWord}
          />
          <SubtitleExport lines={subtitleLines} title={playing.title} />
        </div>
      );
    }
    // A transcript generated here is a real transcript: it has timings, it is
    // clickable, and it exports. So it takes the place of the live captions
    // once it exists rather than sitting beside them.
    if (generated.state.lines.length > 0) {
      return (
        <div>
          <TranscribePanel
            state={generated.state}
            onRun={() => void generated.run(playing.url ?? "")}
            onCancel={generated.cancel}
            disabled={!playing.url}
          />
          <div className="mt-3">
            <CaptionPanel
              state={{ ...captions.state, lines: generated.state.lines }}
              mode={captionMode}
              onMode={setCaptionMode}
              onStart={() => captions.start(captionMode)}
              onStop={captions.stop}
              onClear={captions.clear}
              onSeek={(seconds) => {
                player.handle.seekTo(seconds, true);
                player.handle.play();
              }}
              showTranslation={dual}
              onWord={onWord}
              hideControls
            />
          </div>
          <SubtitleExport lines={generated.state.lines} title={playing.title} />
        </div>
      );
    }

    return (
      <div>
        <p className="mb-3 text-[12.5px] text-[var(--ink-faint)]">{t("listen.noTranscriptYet")}</p>
        <TranscribePanel
          state={generated.state}
          onRun={() => void generated.run(playing.url ?? "")}
          onCancel={generated.cancel}
          disabled={!playing.url}
        />
        <div className="mt-3" />
        <CaptionPanel
          state={captions.state}
          mode={captionMode}
          onMode={setCaptionMode}
          onStart={() => captions.start(captionMode)}
          onStop={captions.stop}
          onClear={captions.clear}
          onSeek={(seconds) => player.handle.seekTo(seconds, true)}
          showTranslation={dual}
          onWord={onWord}
        />
        <SubtitleExport lines={captions.state.lines} title={playing.title} />
      </div>
    );
  }, [
    playing,
    transcript,
    player.handle,
    targetLang,
    dual,
    columns,
    sidePanel,
    onWord,
    t,
    captions,
    captionMode,
    subtitleLines,
    generated,
  ]);

  const textControls = (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        className="btn text-[12.5px]"
        data-active={showText}
        onClick={() => setShowText((value) => !value)}
      >
        {showText ? t("listen.hideTranscript") : t("listen.showTranscript")}
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
      {dual ? (
        <button
          type="button"
          className="btn px-2.5 py-1 text-[11.5px]"
          data-active={columns}
          onClick={() => setColumns((value) => !value)}
        >
          {columns ? t("listen.sideBySide") : t("listen.stacked")}
        </button>
      ) : null}
      <button
        type="button"
        className="btn px-2.5 py-1 text-[11.5px]"
        data-active={sidePanel}
        onClick={() => setSidePanel((value) => !value)}
        title={t("listen.layout")}
      >
        {sidePanel ? t("listen.sidePanel") : t("listen.inline")}
      </button>
    </div>
  );

  return (
    <div className={sidePanel && playing && showText ? "lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-6" : ""}>
      <div className="min-w-0">
        <header className="mb-5 max-w-2xl" data-dim={playing ? focusMode : false}>
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

        {recent.length > 0 ? (
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[var(--ink-faint)]">
            <span>{t("listen.recent")}</span>
            {recent.map((item) => (
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
              {playing.kind === "audio" ? <Art src={artwork} alt="" size={132} /> : null}

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-[16px] font-medium leading-snug">{playing.title}</h2>
                    {translateTitles && titles[playing.title] ? (
                      <p className="mt-0.5 text-[13px] leading-snug text-[var(--ink-faint)]">
                        {titles[playing.title]}
                      </p>
                    ) : null}
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

                {playing.kind !== "audio" ? (
                  <div className="relative mt-3">
                    {/* The video itself lives in the persistent layer and is
                        positioned over this box, so it survives navigation. */}
                    <div ref={stageRef} className="aspect-video w-full rounded-xl bg-black" />
                    {player.videoLayer
                      ? createPortal(
                          <SubtitleOverlay
                            handle={player.handle}
                            lines={subtitleLines}
                            mode={subtitleMode}
                          />,
                          player.videoLayer,
                        )
                      : null}
                  </div>
                ) : null}

                {playing.kind !== "audio" ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <SubtitleButton mode={subtitleMode} onChange={setSubtitleMode} />
                    {subtitleMode !== "off" && captions.state.whisper.state === "loading" ? (
                      <span className="text-[11.5px] text-[var(--ink-faint)]">
                        {t("caption.loadingModel")}{" "}
                        {Math.round((captions.state.whisper.progress ?? 0) * 100)}%
                      </span>
                    ) : null}
                  </div>
                ) : null}

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
            </div>

            <div className="border-t border-[var(--rule)] px-4 py-3">
              <StreamControls handle={player.handle} />
            </div>

            {focusMode ? (
              <p className="border-t border-[var(--rule)] px-4 py-1.5 text-[11px] text-[var(--ink-faint)]">
                {t("listen.focusHint")}
              </p>
            ) : null}

            <div className="border-t border-[var(--rule)] px-4 py-3">
              {textControls}
              {showText && !sidePanel ? <div className="mt-3">{textPanel}</div> : null}
            </div>
          </section>
        ) : null}

        <div data-dim={playing ? focusMode : false}>
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
                  {t("common.episodes")}
                  {show ? ` · ${ORIGIN_LABEL[show.origin]}` : ""}
                </p>
              </div>
              <label className="flex cursor-pointer items-center gap-1.5 text-[12px] text-[var(--ink-soft)]">
                <input
                  type="checkbox"
                  checked={translateTitles}
                  onChange={(event) => setTranslateTitles(event.target.checked)}
                  className="accent-[var(--accent-ring)]"
                />
                {t("listen.translateTitles")}
              </label>
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
              {hasVideo ? (
                <button
                  type="button"
                  className="btn text-[12.5px]"
                  data-active={videoOnly}
                  onClick={() => setVideoOnly((value) => !value)}
                >
                  {t("listen.videoEpisodes")}
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
              {episodes.slice(0, visible).map((episode) => (
                <li key={episode.guid}>
                  <button
                    type="button"
                    onClick={() => playEpisode(episode)}
                    className="row-hover flex w-full items-start gap-3 p-2.5 text-left"
                    data-active={playing?.id === episode.guid}
                  >
                    <Art src={episode.image ?? show?.artwork ?? feed.image} alt="" size={56} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14.5px] font-medium leading-snug">{episode.title}</span>
                      {translateTitles && titles[episode.title] ? (
                        <span className="mt-0.5 block text-[12.5px] leading-snug text-[var(--ink-faint)]">
                          {titles[episode.title]}
                        </span>
                      ) : null}
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
                        <span>{episode.type}</span>
                      </span>
                    </span>
                  </button>
                </li>
              ))}
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

        {/* ---------------- following ---------------- */}
        {!feed && follows.length > 0 ? (
          <section className="mt-8">
            <h2 className="mb-3 text-[13px] font-medium text-[var(--ink-soft)]">{t("listen.following")}</h2>
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
      </div>

      {/* ---------------- side panel, Spotify-lyrics style ---------------- */}
      {sidePanel && playing && showText ? (
        <aside className="mt-6 lg:sticky lg:top-[64px] lg:mt-0 lg:h-[calc(100vh-96px)] lg:self-start">
          <div className="card flex h-full flex-col overflow-hidden">
            <div className="flex items-center gap-2 border-b border-[var(--rule)] px-3 py-2">
              <h3 className="truncate text-[13px] font-medium">{t("listen.transcript")}</h3>
              <button
                type="button"
                className="ml-auto text-[12px] text-[var(--ink-faint)] hover:text-[var(--ink)]"
                onClick={() => setSidePanel(false)}
              >
                {t("listen.inline")}
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden px-2 py-2">{textPanel}</div>
          </div>
        </aside>
      ) : null}

      {selection && playing ? (
        <QuickLookup
          selection={selection}
          lang={targetLang}
          context={{ episodeSlug: `stream:${playing.id}`, episodeTitle: playing.title }}
          onClose={() => setSelection(null)}
        />
      ) : null}
    </div>
  );
}
