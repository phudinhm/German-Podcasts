"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { FeedEpisode, FeedResult } from "@/lib/server/feed";
import type { DiscoverResult } from "@/lib/server/discover";
import { useUi } from "@/lib/i18n";
import { useSwipe } from "@/lib/useSwipe";
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
  listRecentSources,
  noteSourcePlayed,
  listFavoriteEpisodes,
  isEpisodeFavorited,
  toggleFavoriteEpisode,
  type RecentEpisode,
  type SavedShow,
  type RecentSource,
  type FavoriteEpisode,
} from "@/lib/library";
import { usePlayer, useVideoStage, type Track } from "./player/PlayerProvider";
import { Transport } from "./player/Transport";
import { StreamControls } from "./StreamControls";
import { DiscoverPanel } from "./listen/DiscoverPanel";
import { Art } from "./listen/Art";
import { LibraryPanel } from "./listen/LibraryPanel";
import { EpisodeSort } from "./listen/EpisodeSort";
import { sortEpisodes, type SortKey } from "@/lib/episodeSort";
import { LiveCaptionOverlay } from "./caption/LiveCaptionOverlay";
import { LiveTranscriptPanel } from "./caption/LiveTranscriptPanel";
import {
  CaptionSettings,
  DEFAULT_CAPTION_SETTINGS,
  loadCaptionSettings,
  saveCaptionSettings,
  type CaptionSettingsState,
} from "./caption/CaptionSettings";
import { liveCaptionService, checkCaptionSupport, type CaptureMode } from "@/lib/liveCaption";
import { detectSpokenLang } from "@/lib/language";

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
  const [feedSearch, setFeedSearch] = useState("");

  const [searches, setSearches] = useState<RecentSearch[]>([]);
  const [shows, setShows] = useState<SavedShow[]>([]);
  const [recents, setRecents] = useState<RecentEpisode[]>([]);
  const [recentSources, setRecentSources] = useState<RecentSource[]>([]);
  const [favoriteEpisodes, setFavoriteEpisodes] = useState<FavoriteEpisode[]>([]);
  const [saved, setSaved] = useState(false);
  const [expandedDescription, setExpandedDescription] = useState(false);
  const [sort, setSort] = useState<SortKey>("newest");
  const [showCaption, setShowCaption] = useState(false);
  const [captureMode, setCaptureMode] = useState<CaptureMode>(null);
  // Checked once: whether tab-sharing exists at all on this browser. iOS has
  // neither tab-sharing nor (until recently) speech recognition, so this is
  // what lets the toolbar be honest about what it can offer before anyone taps
  // anything, rather than discovering it only after a failed attempt.
  const [captionSupport] = useState(() => checkCaptionSupport());
  const [captionNotice, setCaptionNotice] = useState<"denied" | "need-mic-confirm" | "unsupported" | "stopped" | null>(null);
  const { showTranscript, setShowTranscript } = player;
  const [captionSettings, setCaptionSettings] = useState<CaptionSettingsState>(DEFAULT_CAPTION_SETTINGS);
  const [currentTime, setCurrentTime] = useState(0);
  const [freezePane, setFreezePane] = useState(false);
  const [scrolledDown, setScrolledDown] = useState(false);
  const [resultsSort, setResultsSort] = useState<"popular" | "az">("popular");

  const sortedResults = useMemo(() => {
    if (!results) return null;
    if (resultsSort === "az") {
      return [...results].sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
    }
    return results; // Default: most listened / relevant
  }, [results, resultsSort]);

  useEffect(() => {
    const onScroll = () => {
      setScrolledDown(window.scrollY > 280);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const playing = player.track;
  const playerRef = useRef<HTMLDivElement | null>(null);
  const openedFeedRef = useRef<string | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setCaptionSettings(loadCaptionSettings());
  }, []);

  useEffect(() => {
    liveCaptionService.setTimeProvider(() => player.handle.getTime());
  }, [player.handle]);

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      if (player.handle.isPlaying()) {
        setCurrentTime(player.handle.getTime());
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [player.handle]);

  // Tracks whichever source is actually feeding the recognizer, so the
  // toolbar can always say "tab audio" or "microphone" rather than a label
  // that was only ever true for one of the two paths.
  useEffect(() => liveCaptionService.onModeChange(setCaptureMode), []);

  // Notices the engine stopping ON ITS OWN: a permanently failed recognizer,
  // or the person using Chrome's own "Stop sharing" bar instead of this app's
  // button. Deliberately a separate signal from onModeChange above - that one
  // also fires to null on a plain, requested stop, and a requested stop and
  // an engine failure look identical from "mode went to null" alone. Without
  // this, the toolbar kept glowing "active" and the overlay kept showing
  // "Listening..." forever after the capture had actually already died - a
  // session that looks alive but is not is worse than one that visibly ended.
  useEffect(
    () =>
      liveCaptionService.onUnexpectedEnd(() => {
        setShowCaption(false);
        setCaptionNotice("stopped");
      }),
    [],
  );

  const stopLiveCaption = useCallback(() => {
    liveCaptionService.stopCapture();
    setShowCaption(false);
    setCaptionNotice(null);
  }, []);

  /** The default action: share this tab's audio. Never touches the microphone. */
  const startTabCaption = useCallback(async () => {
    setCaptionNotice(null);
    // iOS has no tab-sharing API at all - no picker would even open - so this
    // is decided before touching the network or any permission prompt, from a
    // capability check rather than from a failed attempt.
    if (!captionSupport.tabAudio) {
      setCaptionNotice(captionSupport.speechRecognition ? "need-mic-confirm" : "unsupported");
      return;
    }
    const result = await liveCaptionService.startTabAudioCapture();
    if (result.ok) {
      setShowCaption(true);
      return;
    }
    // The share picker was cancelled or refused. Offer the microphone as a
    // separate, explicit next step rather than reaching for it automatically.
    setCaptionNotice(captionSupport.speechRecognition ? "need-mic-confirm" : "unsupported");
  }, [captionSupport]);

  /** The explicit, clearly-labelled fallback. Only this ever asks for the mic. */
  const startMicCaption = useCallback(() => {
    const result = liveCaptionService.startMicCapture();
    setCaptionNotice(null);
    if (result.ok) setShowCaption(true);
  }, []);

  const toggleLiveCaption = useCallback(() => {
    if (showCaption) stopLiveCaption();
    else void startTabCaption();
  }, [showCaption, stopLiveCaption, startTabCaption]);

  // A live capture has no natural end: without this, switching episodes kept
  // captioning whatever the microphone or shared tab happened to be playing
  // and attributing it to the new episode's timeline, and leaving this page
  // entirely left the stream running with no control anywhere to stop it.
  // The transcript itself is cleared and reloaded by PlayerProvider, which
  // owns `track` and is the shared ancestor of every surface that renders
  // one - this page, the full-screen view, and the floating panel.
  useEffect(() => {
    stopLiveCaption();
  }, [playing?.id, stopLiveCaption]);

  useEffect(() => () => liveCaptionService.stopCapture(), []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "c" || event.key === "C") {
        toggleLiveCaption();
      }
      if (event.key === "t" || event.key === "T") {
        setShowTranscript((prev) => !prev);
      }
      if (event.key === "+" || event.key === "=") {
        setCaptionSettings((prev) => {
          const next = { ...prev, fontSize: Math.min(34, prev.fontSize + 2) };
          saveCaptionSettings(next);
          return next;
        });
      }
      if (event.key === "-" || event.key === "_") {
        setCaptionSettings((prev) => {
          const next = { ...prev, fontSize: Math.max(13, prev.fontSize - 2) };
          saveCaptionSettings(next);
          return next;
        });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // toggleLiveCaption closes over showCaption by value (not the setState
    // updater form), so it must be a dependency here or this effect keeps
    // calling the version of it captured on the very first render - which is
    // exactly the bug this replaced: "C" used to flip a display flag directly
    // without starting or stopping the capture engine, leaving a mic or tab
    // stream running invisibly after the overlay was "closed" from the keyboard.
  }, [toggleLiveCaption]);

  const refreshLibrary = useCallback(() => {
    setShows(listShows());
    setRecents(listRecents());
    setRecentSources(listRecentSources());
    setFavoriteEpisodes(listFavoriteEpisodes());
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
    setSort("newest");
    setLoadingFeed(true);
    setError(null);
    try {
      const response = await fetch("/api/feed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: target.feedUrl }),
      });
      const data = (await response.json()) as FeedResult & { error?: string };
      // A validation or upstream failure (bad URL, unreachable host, a
      // blocked or dead feed) responds with just { error } - no title, no
      // episodes. Rendering that as a FeedResult crashed the whole page on
      // `feed.episodes.length`, so this is the one case that must not call
      // setFeed at all. A feed that parsed fine but happens to have zero
      // episodes still comes back 200 with a real (empty) episodes array,
      // and that one still renders normally with its own message.
      if (!response.ok || !Array.isArray(data.episodes)) {
        setError(data.error ?? t("listen.feedFailed"));
        return;
      }
      setFeed(data);
      if (data.error) setError(data.error);
    } catch {
      setError(t("listen.feedFailed"));
    } finally {
      setLoadingFeed(false);
    }
  }, [t]);

  /**
   * Opens a show the way a click should: fetches it AND pushes a history
   * entry, so the browser's own back button retraces search results and
   * shows one step at a time instead of leaving the page. Setting the ref
   * before the URL changes means the effect below - which reacts to that
   * same `feed=` param - recognises this feed as already open and does not
   * fetch it a second time.
   */
  const openShow = useCallback(
    (target: DiscoverResult) => {
      if (target.feedUrl) {
        openedFeedRef.current = target.feedUrl;
        router.push(`/?feed=${encodeURIComponent(target.feedUrl)}`, { scroll: false });
      }
      void openFeed(target);
    },
    [openFeed, router],
  );

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

        if (found.length === 1 && found[0].feedUrl) {
          openShow(found[0]);
        } else if (found.length > 1) {
          const normTerm = term.trim().toLowerCase();
          const exactMatch =
            found.find((r) => r.feedUrl && r.title.trim().toLowerCase() === normTerm) ??
            found.find(
              (r) =>
                r.feedUrl &&
                normTerm.includes(r.title.trim().toLowerCase()) &&
                r.title.trim().length >= 4
            );
          if (exactMatch) {
            openShow(exactMatch);
          }
        }
      } catch {
        setError(t("listen.searchFailed"));
      } finally {
        setSearching(false);
      }
    },
    [t, openShow],
  );

  // ---- playing -----------------------------------------------------------

  const inlineVideoStageRef = useVideoStage(
    Boolean(playing && player.isVideoTrack && !player.fullscreenOpen)
  );

  const playEpisode = useCallback(
    (episode: FeedEpisode, from?: number) => {
      const showPrefix = show?.feedUrl || feed?.title || show?.title || "show";
      const id = `${showPrefix}::${episode.guid || episode.url}::${episode.url}`;
      const isVideoUrl =
        episode.type.startsWith("video/") ||
        /\.(mp4|m3u8|webm|mov|m4v)(\?|$)/i.test(episode.url || "");
      const track: Track = {
        id,
        title: episode.title,
        showTitle: feed?.title ?? show?.title ?? "",
        artwork: episode.image ?? show?.artwork ?? feed?.image ?? null,
        description: episode.description,
        kind: isVideoUrl ? "video" : "audio",
        url: episode.url || undefined,
        pageUrl: episode.pageUrl,
        durationSec: episode.durationSec,
        publishedAt: episode.publishedAt,
        startAt: from ?? resumeAt(id),
        transcripts: episode.transcripts,
        sourceLang: detectSpokenLang(feed?.language, `${episode.title} ${episode.description}`),
      };
      setShowTranscript(true);
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

      if (show?.feedUrl) {
        noteSourcePlayed({
          feedUrl: show.feedUrl,
          title: feed?.title ?? show.title,
          publisher: show.publisher,
          artwork: track.artwork,
          origin: show.origin,
          pageUrl: show.pageUrl ?? undefined,
          lastEpisodeTitle: episode.title,
        });
      }

      setExpandedDescription(false);
      window.setTimeout(() => {
        if (!playerRef.current) return;
        const top = Math.max(0, playerRef.current.getBoundingClientRect().top + window.scrollY - 68);
        window.scrollTo({ top, behavior: "smooth" });
      }, 90);
    },
    [feed, show, player],
  );

  const scrollToPlayer = useCallback(() => {
    if (!playerRef.current) return;
    const top = Math.max(0, playerRef.current.getBoundingClientRect().top + window.scrollY - 68);
    window.scrollTo({ top, behavior: "smooth" });
  }, []);

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
      if (entry.feedUrl) {
        noteSourcePlayed({
          feedUrl: entry.feedUrl,
          title: entry.showTitle,
          publisher: "",
          artwork: entry.artwork,
          lastEpisodeTitle: entry.title,
        });
      }
      window.setTimeout(() => scrollToPlayer(), 90);
    },
    [player, scrollToPlayer],
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

  // Tells the docked player whether the full one is already on screen. An
  // observer rather than a scroll handler: the card's position changes when the
  // description expands or a feed loads above it, not only when you scroll.
  const { setInlineVisible } = player;
  useEffect(() => {
    const node = playerRef.current;
    if (!node) {
      setInlineVisible(false);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setInlineVisible(entry.isIntersecting),
      // A sliver of the card counts as visible, but the last few pixels of its
      // bottom edge do not: the controls are what matters, and they are gone
      // well before the card is.
      { rootMargin: "-120px 0px 0px 0px", threshold: 0 },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      setInlineVisible(false);
    };
  }, [playing, setInlineVisible]);

  /** Clears a shown feed without touching history - used both by the
   * buttons below (which push their own new entry) and by the browser's
   * own back button (which has already changed the URL on its own, so
   * pushing again here would fight it). */
  const closeFeedView = useCallback(() => {
    setFeed(null);
    setShow(null);
    setVisible(PAGE_SIZE);
    openedFeedRef.current = null;
  }, []);

  /** Returns to browsing without disturbing whatever is playing. */
  const browse = useCallback(() => {
    closeFeedView();
    setResults(null);
    setError(null);
    if (params.get("feed")) router.push("/", { scroll: false });
  }, [closeFeedView, params, router]);

  useEffect(() => {
    const onNavHome = () => browse();
    window.addEventListener("hoerbar:navigate-home", onNavHome);
    return () => window.removeEventListener("hoerbar:navigate-home", onNavHome);
  }, [browse]);

  /** Returns to search results if they exist, otherwise returns to full browse. */
  const backToResultsOrBrowse = useCallback(() => {
    if (results && results.length > 0) {
      closeFeedView();
      setError(null);
      if (params.get("feed")) router.push("/", { scroll: false });
    } else {
      browse();
    }
  }, [results, browse, closeFeedView, params, router]);

  // The library links here with the feed to open, so following a saved show
  // lands on its episodes rather than on a search box. The same effect also
  // undoes a show once the browser's own back button clears `feed=` from the
  // URL again - `openShow` above pushes that URL forward, so stepping back
  // through history has to be able to step this state back too.
  const requestedFeed = params.get("feed");
  useEffect(() => {
    if (!requestedFeed) {
      if (openedFeedRef.current) closeFeedView();
      return;
    }
    if (openedFeedRef.current === requestedFeed) return;
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
  }, [requestedFeed, openFeed, closeFeedView]);

  const episodes = useMemo(() => {
    let list = feed?.episodes ?? [];
    if (feedSearch) {
      const lower = feedSearch.toLowerCase();
      list = list.filter((e) => e.title.toLowerCase().includes(lower));
    }
    return sortEpisodes(list, sort, recents);
  }, [feed, sort, recents, feedSearch]);

  // Loads the next page itself once the sentinel below the list scrolls
  // near view, rather than waiting for someone to find and tap a button -
  // the same IntersectionObserver pattern already used above for the mini
  // player's visibility.
  useEffect(() => {
    if (visible >= episodes.length) return;
    const node = loadMoreRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setVisible((value) => Math.min(episodes.length, value + PAGE_SIZE));
      },
      // Starts loading a good scroll before the sentinel is actually on
      // screen, so the next page is already there by the time it would be.
      { rootMargin: "600px 0px 0px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [visible, episodes.length]);

  const mixed = Boolean(playing && playing.url && isMixedContent(playing.url));

  // The lede explains what the app is, which is worth a screen exactly once.
  // Once something is playing or open, it is a banner sitting between a phone
  // user and the thing they came back for.
  const idle = !playing && !feed && !results;

  const pageSwipe = useSwipe({
    threshold: 65,
    onSwipeRight: () => {
      if (feed || (results && results.length > 0)) {
        backToResultsOrBrowse();
      }
    },
    onSwipeLeft: () => {
      if (!feed && !results) {
        router.push("/library");
      }
    },
  });

  return (
    <div {...pageSwipe}>
      {idle ? (
        <header className="mb-4 max-w-2xl">
          <h1 className="text-[24px] font-semibold sm:text-[27px]">{t("listen.title")}</h1>
          <p className="mt-2 text-[14.5px] leading-relaxed text-[var(--ink-soft)]">{t("listen.lede")}</p>
        </header>
      ) : (
        <h1 className="sr-only">{t("listen.title")}</h1>
      )}

      <form
        role="search"
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void search(query);
        }}
      >
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          aria-label={t("listen.title")}
          placeholder={t("listen.placeholder")}
          className="field min-w-0 flex-1"
        />
        {/* Not disabled on an empty box: a greyed-out primary button beside an
            empty field is the first thing on the page and reads as broken.
            search() ignores an empty term anyway. */}
        <button type="submit" className="btn btn-primary shrink-0" disabled={searching}>
          {searching ? t("common.searching") : t("common.search")}
        </button>
      </form>

      {/* Screen readers otherwise get no word about a search that found nothing
          or is still running, because both only change things further down. */}
      <p aria-live="polite" className="sr-only">
        {searching ? t("common.searching") : results ? t("listen.results", { count: results.length }) : ""}
      </p>

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
        <section
          ref={playerRef}
          className={`card mt-6 overflow-hidden transition-all duration-300 ${
            freezePane
              ? "sticky top-[calc(48px+env(safe-area-inset-top,0px))] sm:top-[52px] z-30 bg-[var(--paper-raised)] shadow-2xl border-[var(--accent)]/60 ring-1 ring-[var(--accent)]/30"
              : ""
          }`}
        >
          <div className="p-4">
            {/* YouTube-style Top Center Video Stage when playing a video podcast */}
            {player.isVideoTrack && (
              <div className="mx-auto mb-4 w-full max-w-2xl overflow-hidden rounded-2xl border border-[var(--rule)] bg-black shadow-2xl aspect-video">
                <div ref={inlineVideoStageRef} className="h-full w-full" />
              </div>
            )}

            <div className="flex items-start gap-3">
              {!player.isVideoTrack && (
                <>
                  <span className="hidden sm:block">
                    <Art src={playing.artwork} alt="" size={88} seed={playing.showTitle || playing.title} />
                  </span>
                  <span className="sm:hidden">
                    <Art src={playing.artwork} alt="" size={56} seed={playing.showTitle || playing.title} />
                  </span>
                </>
              )}
              <div className="min-w-0 flex-1">
                <h2 className="line-clamp-3 text-[16px] font-semibold leading-snug">{playing.title}</h2>
                <p className="mt-0.5 truncate text-[12.5px] text-[var(--ink-faint)]">
                  {playing.showTitle}
                  {playing.publishedAt ? ` · ${formatDate(playing.publishedAt, locale)}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0 -mr-1 -mt-1">
                <button
                  type="button"
                  className={`icon-btn text-[14px] transition ${
                    isEpisodeFavorited(playing.id) ? "text-rose-500 font-bold scale-105" : "text-[var(--ink-faint)] hover:text-rose-500"
                  }`}
                  aria-label={isEpisodeFavorited(playing.id) ? t("library.unfavoriteEpisode") : t("library.favoriteEpisode")}
                  title={isEpisodeFavorited(playing.id) ? t("library.unfavoriteEpisode") : t("library.favoriteEpisode")}
                  onClick={() => {
                    toggleFavoriteEpisode({
                      id: playing.id,
                      title: playing.title,
                      showTitle: playing.showTitle,
                      feedUrl: show?.feedUrl ?? null,
                      url: playing.url ?? "",
                      artwork: playing.artwork,
                      durationSec: playing.durationSec ?? null,
                      publishedAt: playing.publishedAt ?? null,
                      description: playing.description ?? "",
                    });
                    refreshLibrary();
                  }}
                >
                  {isEpisodeFavorited(playing.id) ? "❤️" : "🤍"}
                </button>
                <button
                  type="button"
                  className={`icon-btn text-[13px] ${
                    freezePane ? "text-[var(--accent)] font-bold bg-[var(--accent-soft)]" : "text-[var(--ink-faint)]"
                  }`}
                  aria-label={freezePane ? t("player.unfreezePane") : t("player.freezePane")}
                  title={freezePane ? t("player.unfreezePane") : t("player.freezePane")}
                  onClick={() => setFreezePane((v) => !v)}
                >
                  📌
                </button>
                <button
                  type="button"
                  className="icon-btn text-[15px] text-[var(--ink-faint)]"
                  aria-label={t("player.fullscreen")}
                  title={t("player.fullscreen")}
                  onClick={() => player.setFullscreenOpen(true)}
                >
                  ⛶
                </button>
                <button
                  type="button"
                  className="icon-btn text-[18px]"
                  aria-label={t("common.close")}
                  title={t("common.close")}
                  onClick={() => player.stop()}
                >
                  ×
                </button>
              </div>
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

          {/* Live caption and transcript toolbar */}
          <div className="border-t border-[var(--rule)] bg-[var(--surface)] px-4 py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                {/* Live capture needs a microphone or a shared browser tab,
                    neither of which is a good fit on a phone - and it's the
                    thing that kept prompting for mic access on iPhone Chrome.
                    Desktop web only; the running transcript below stays
                    available everywhere. */}
                <button
                  type="button"
                  onClick={toggleLiveCaption}
                  className="btn hidden text-[12px] md:inline-flex"
                  data-active={showCaption}
                  title={`${t("caption.toggle")} (C)`}
                >
                  <span
                    aria-hidden
                    className={`h-1.5 w-1.5 rounded-full ${showCaption ? "bg-[var(--accent)]" : "bg-[var(--ink-faint)]"}`}
                  />
                  {t("caption.toggle")}
                  {/* Which source is actually live, once one is: never claim "no
                      mic" for a session that is reading the microphone. */}
                  {showCaption && captureMode ? (
                    <span className="chip text-[10px]">
                      {captureMode === "tab" ? t("caption.modeTab") : t("caption.modeMic")}
                    </span>
                  ) : null}
                </button>

                <button
                  type="button"
                  onClick={() => setShowTranscript((v) => !v)}
                  className="btn text-[12px]"
                  data-active={showTranscript}
                  title={`${t("caption.transcript")} (T)`}
                >
                  {t("caption.transcript")}
                </button>
              </div>

              {/* Text size */}
              <div className="flex items-center rounded-full border border-[var(--rule)] bg-[var(--paper-raised)] p-0.5 text-[11.5px]">
                <button
                  type="button"
                  onClick={() => {
                    setCaptionSettings((prev) => {
                      const next = { ...prev, fontSize: Math.max(13, prev.fontSize - 2) };
                      saveCaptionSettings(next);
                      return next;
                    });
                  }}
                  className="rounded-full px-2 py-0.5 font-semibold text-[var(--ink-soft)] hover:bg-[var(--surface)]"
                  title={`${t("caption.zoomOut")} (-)`}
                  aria-label={t("caption.zoomOut")}
                >
                  A-
                </button>
                <span className="px-1 font-mono text-[10.5px] text-[var(--ink-faint)]">
                  {captionSettings.fontSize}px
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setCaptionSettings((prev) => {
                      const next = { ...prev, fontSize: Math.min(34, prev.fontSize + 2) };
                      saveCaptionSettings(next);
                      return next;
                    });
                  }}
                  className="rounded-full px-2 py-0.5 font-semibold text-[var(--ink-soft)] hover:bg-[var(--surface)]"
                  title={`${t("caption.zoomIn")} (+)`}
                  aria-label={t("caption.zoomIn")}
                >
                  A+
                </button>
              </div>
            </div>

            {/* Either the default (no-mic) attempt didn't work and this is the
                one place the microphone is ever offered - always a second,
                explicit tap, never a silent fallback - or a session that was
                running died on its own and this says so instead of the
                overlay just vanishing with no explanation. */}
            {captionNotice ? (
              <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-[var(--rule)] bg-[var(--paper-raised)] px-3 py-2 text-[12px] text-[var(--ink-soft)]">
                <span className="flex-1">
                  {captionNotice === "denied"
                    ? t("caption.tabDenied")
                    : captionNotice === "unsupported"
                      ? t("caption.notSupported")
                      : captionNotice === "stopped"
                        ? t("caption.stopped")
                        : t("caption.micExplain")}
                </span>
                {captionNotice === "need-mic-confirm" ? (
                  <button type="button" className="btn px-2.5 py-1 text-[11.5px]" onClick={startMicCaption}>
                    {t("caption.useMic")}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="icon-btn text-[13px]"
                  aria-label={t("common.close")}
                  onClick={() => setCaptionNotice(null)}
                >
                  ×
                </button>
              </div>
            ) : null}
          </div>

          <div className="border-t border-[var(--rule)] px-4 py-3">
            <StreamControls handle={player.handle} />
          </div>
        </section>
      ) : null}

      {/* Inline Transcript Panel right below the player */}
      {playing && showTranscript ? (
        <LiveTranscriptPanel
          currentTime={currentTime}
          onSeek={(sec) => {
            player.handle.seekTo(sec, true);
            if (!player.handle.isPlaying()) player.handle.play();
          }}
          onClose={() => setShowTranscript(false)}
          settings={captionSettings}
          onUpdateSettings={(next) => {
            setCaptionSettings(next);
            saveCaptionSettings(next);
          }}
        />
      ) : null}

      {/* Live caption line, shown only once a source is actually feeding it */}
      {playing && showCaption && !showTranscript && (
        <div
          className="fixed left-0 right-0 z-40 mx-auto w-full max-w-2xl px-3 pointer-events-none transition-all duration-300 sm:!bottom-8"
          style={{
            bottom: "calc(120px + env(safe-area-inset-bottom, 14px))",
          }}
        >
          <div className="pointer-events-auto">
            <LiveCaptionOverlay
              isPlaying={player.handle.isPlaying()}
              mode={captureMode}
              onOpenTranscript={() => setShowTranscript(true)}
              onClose={stopLiveCaption}
              settings={captionSettings}
              onUpdateSettings={setCaptionSettings}
            />
          </div>
        </div>
      )}

      {/* ---------------- results ---------------- */}
      {results && results.length > 0 && !feed ? (
        <section className="mt-6 relative">
          <div className="sticky top-[calc(48px+env(safe-area-inset-top,0px))] sm:top-[50px] z-20 -mx-2 mb-3 flex items-center justify-between gap-3 bg-[var(--paper)]/95 px-3 py-2.5 backdrop-blur-2xl border-b border-[var(--rule)]/60 shadow-xs">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-[var(--ink)] hover:text-[var(--accent)] transition px-2.5 py-1 rounded-full bg-[var(--surface)] shadow-xs border border-[var(--rule)]/60"
              onClick={browse}
            >
              <span aria-hidden>←</span>
              <span>{t("listen.backToBrowse")}</span>
            </button>
            <div className="flex items-center gap-2">
              <h2 className="text-[13px] font-medium text-[var(--ink-soft)]">
                {t("listen.results", { count: results.length })}
              </h2>
              {results.length > 1 && (
                <div className="flex overflow-hidden rounded-full border border-[var(--rule)] bg-[var(--surface)] p-0.5">
                  <button
                    type="button"
                    onClick={() => setResultsSort("popular")}
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition ${
                      resultsSort === "popular"
                        ? "bg-[var(--accent)] text-[var(--paper)] shadow-xs"
                        : "text-[var(--ink-soft)] hover:text-[var(--ink)]"
                    }`}
                    title={t("sort.mostListened")}
                  >
                    🔥 {t("sort.mostListened")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setResultsSort("az")}
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition ${
                      resultsSort === "az"
                        ? "bg-[var(--accent)] text-[var(--paper)] shadow-xs"
                        : "text-[var(--ink-soft)] hover:text-[var(--ink)]"
                    }`}
                    title={t("sort.az")}
                  >
                    🔤 {t("sort.az")}
                  </button>
                </div>
              )}
            </div>
          </div>
          <ul className="grid gap-1 sm:grid-cols-2">
            {(sortedResults ?? results).map((result) => (
              <li key={result.id} className="min-w-0">
                <button
                  type="button"
                  className="row-hover flex w-full items-start gap-3 p-2.5 text-left"
                  onClick={() => openShow(result)}
                  disabled={!result.feedUrl}
                >
                  <Art src={result.artwork} alt="" size={56} seed={result.title} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14.5px] font-medium leading-snug">{result.title}</span>
                    <span className="block truncate text-[12.5px] text-[var(--ink-faint)]">
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
          <div className="mt-4 flex items-center justify-between border-t border-[var(--rule)] pt-3">
            <button
              type="button"
              className="btn text-[12.5px] flex items-center gap-1.5"
              onClick={browse}
            >
              <span aria-hidden>←</span>
              <span>{t("listen.backToBrowse")}</span>
            </button>
            <button
              type="button"
              className="btn text-[12.5px] flex items-center gap-1"
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            >
              <span aria-hidden>↑</span>
              <span>{t("common.scrollToTop")}</span>
            </button>
          </div>
        </section>
      ) : null}

      {loadingFeed ? <p className="mt-6 text-[13px] text-[var(--ink-faint)]">{t("common.loading")}</p> : null}

      {/* ---------------- episodes ---------------- */}
      {feed ? (
        <section className="mt-4 relative animate-panel-in">
          <div className="sticky top-[calc(48px+env(safe-area-inset-top,0px))] sm:top-[52px] z-20 -mx-2 mb-3 flex items-center justify-between gap-2 rounded-2xl glass-panel px-3 py-2 shadow-sm">
            <button
              type="button"
              className="inline-flex shrink-0 items-center gap-1.5 text-[13px] font-semibold text-[var(--ink)] hover:text-[var(--accent)] transition px-3 py-1.5 rounded-full bg-[var(--surface)] shadow-2xs border border-[var(--rule)]/70 active:scale-95"
              onClick={backToResultsOrBrowse}
            >
              <span aria-hidden>←</span>
              <span>{results && results.length > 1 ? t("listen.backToResults") : t("listen.backToBrowse")}</span>
            </button>

            <div className="flex min-w-0 flex-1 items-center justify-center gap-2 px-1">
              <div className="hidden shrink-0 overflow-hidden rounded-lg min-[380px]:block">
                <Art src={show?.artwork ?? feed.image} alt="" size={24} seed={feed.title} />
              </div>
              <span className="truncate text-[13px] font-semibold text-[var(--ink)]">
                {feed.title}
              </span>
            </div>

            {playing ? (
              <button
                type="button"
                onClick={scrollToPlayer}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--accent-soft)] border border-[var(--accent-ring)]/40 px-2.5 py-1 text-[12px] font-semibold text-[var(--accent)] transition active:scale-95"
                title={t("player.nowPlaying")}
              >
                <span aria-hidden>🎧</span>
                <span className="hidden sm:inline">{t("player.nowPlaying")}</span>
              </button>
            ) : null}
          </div>
          <div className="card p-4">
            {/* Two rows on a phone. Squeezed onto one, the show title got about
                nine characters before the two buttons took the rest. */}
            <div className="mb-3">
              <div className="flex items-center gap-3">
                <div className="shrink-0 overflow-hidden rounded-2xl shadow-sm ring-1 ring-black/5 dark:ring-white/10">
                  <Art src={show?.artwork ?? feed.image} alt="" size={60} seed={feed.title} />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-[17px] font-semibold tracking-tight sm:text-[19px] text-[var(--ink)]">{feed.title}</h2>
                  <div className="flex flex-wrap items-center gap-2 mt-0.5">
                    <p className="truncate text-[12.5px] text-[var(--ink-faint)]">
                      {feed.episodes.length} {t("common.episodes")}
                      {show ? ` · ${ORIGIN_LABEL[show.origin]}` : ""}
                    </p>
                    {(() => {
                      const listenedCount = episodes.filter((ep) => {
                        const epId = ep.guid || ep.url;
                        return recents.some((r) => r.id === epId && (r.position > 15 || r.finished));
                      }).length;
                      return listenedCount > 0 ? (
                        <span className="chip text-[11px] bg-[var(--accent-soft)] text-[var(--accent)] font-medium">
                          🎧 {t("feed.listenedCount", { count: listenedCount, total: feed.episodes.length })}
                        </span>
                      ) : null;
                    })()}
                  </div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {show?.feedUrl ? (
                  <button
                    type="button"
                    className="btn text-[12.5px]"
                    data-active={saved}
                    aria-pressed={saved}
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
                <button type="button" className="btn text-[12.5px]" onClick={backToResultsOrBrowse}>
                  {results && results.length > 1 ? t("listen.backToResults") : t("listen.backToBrowse")}
                </button>
                {episodes.length > 1 ? (
                  <span className="sm:ml-auto">
                    <EpisodeSort value={sort} onChange={setSort} />
                  </span>
                ) : null}
              </div>
                {feed.episodes.length > 5 && (
                  <div className="relative mt-2 sm:mt-0 sm:w-64">
                    <input
                      type="text"
                      className="field w-full pl-8 pr-8"
                      placeholder={t("feed.searchInN", { n: feed.episodes.length })}
                      value={feedSearch}
                      onChange={(e) => setFeedSearch(e.target.value)}
                    />
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-lg opacity-50" aria-hidden>
                      🔍
                    </span>
                    {feedSearch && (
                      <button
                        type="button"
                        onClick={() => setFeedSearch("")}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-[16px] text-[var(--ink-faint)] hover:text-[var(--ink)]"
                      >
                        ×
                      </button>
                    )}
                  </div>
                )}
              </div>

          {episodes.length === 0 && feedSearch ? (
            <p className="py-8 text-center text-[13.5px] text-[var(--ink-faint)]">
              {t("feed.noMatch")}
            </p>
          ) : (
            <ul className="space-y-1">
            {episodes.slice(0, visible).map((episode) => {
              const id = episode.guid || episode.url;
              const remembered = recents.find((item) => item.id === id);
              const duration = episode.durationSec || remembered?.durationSec;
              const isFinished = Boolean(
                remembered?.finished || (duration && remembered && remembered.position >= duration - 25),
              );
              const progress =
                remembered && duration
                  ? Math.min(100, Math.round((remembered.position / duration) * 100))
                  : remembered && remembered.position > 15
                    ? 15
                    : 0;
              const remainingSec = duration && remembered ? Math.max(0, duration - remembered.position) : null;
              const remainingMin = remainingSec ? Math.ceil(remainingSec / 60) : null;
              const current = playing?.id === id;
              const isFav = isEpisodeFavorited(id);

              return (
                <li key={id} className="relative min-w-0 group/item">
                  <button
                    type="button"
                    onClick={() => playEpisode(episode)}
                    className={`flex w-full items-start gap-3.5 p-3 pr-11 text-left rounded-2xl transition-all duration-200 ${
                      current
                        ? "bg-[var(--row-active)] border border-[var(--accent)]/50 shadow-sm"
                        : "hover:bg-[var(--surface)]/80 border border-transparent active:scale-[0.995]"
                    }`}
                    data-active={current}
                    aria-current={current ? "true" : undefined}
                  >
                    {/* Apple Podcasts Thumbnail with Embedded Progress Bar / Checkmark */}
                    <div className="relative shrink-0 overflow-hidden rounded-xl shadow-xs ring-1 ring-black/5 dark:ring-white/10">
                      <Art src={episode.image ?? show?.artwork ?? feed.image} alt="" size={58} seed={feed.title} />
                      {isFinished ? (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-[11px] font-bold text-white shadow-xs">
                            ✓
                          </span>
                        </div>
                      ) : progress > 0 ? (
                        <div className="absolute inset-x-0 bottom-0 h-1.5 bg-black/50 backdrop-blur-xs">
                          <div
                            className="h-full bg-[var(--accent)] rounded-r-full shadow-xs"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      ) : null}
                    </div>

                    <span className="min-w-0 flex-1">
                      <span className="flex items-start gap-2">
                        {current ? (
                          <span className="now-playing mt-[5px] shrink-0" aria-hidden>
                            <span />
                            <span />
                            <span />
                          </span>
                        ) : null}
                        <span className="min-w-0 text-[15px] font-semibold tracking-tight leading-snug text-[var(--ink)]">
                          {episode.title}
                        </span>
                      </span>
                      {episode.description ? (
                        <span className="mt-1 line-clamp-2 block text-[12.5px] leading-relaxed text-[var(--ink-soft)]">
                          {episode.description}
                        </span>
                      ) : null}
                      <span className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11.5px] text-[var(--ink-faint)]">
                        {formatDate(episode.publishedAt, locale) ? (
                          <span>{formatDate(episode.publishedAt, locale)}</span>
                        ) : null}
                        {formatDuration(episode.durationSec, t("common.min")) ? (
                          <>
                            <span aria-hidden>·</span>
                            <span>{formatDuration(episode.durationSec, t("common.min"))}</span>
                          </>
                        ) : null}
                        {isFinished ? (
                          <>
                            <span aria-hidden>·</span>
                            <span className="font-medium text-emerald-600 dark:text-emerald-400">✓ {t("library.finished")}</span>
                          </>
                        ) : progress > 0 ? (
                          <>
                            <span aria-hidden>·</span>
                            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--accent)]">
                              {remainingMin ? t("feed.remaining", { min: remainingMin }) : t("library.resumeAt", { percent: progress })}
                            </span>
                          </>
                        ) : null}
                      </span>
                      {!isFinished && progress > 0 ? (
                        <span className="mt-2 block h-1.5 w-full max-w-[240px] overflow-hidden rounded-full bg-[var(--rule)]">
                          <span
                            className="block h-full rounded-full bg-[var(--accent)] transition-all duration-300"
                            style={{ width: `${progress}%` }}
                          />
                        </span>
                      ) : null}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavoriteEpisode({
                        id,
                        title: episode.title,
                        showTitle: show?.title ?? feed.title,
                        feedUrl: show?.feedUrl ?? null,
                        url: episode.url,
                        artwork: episode.image ?? show?.artwork ?? feed.image,
                        durationSec: episode.durationSec,
                        publishedAt: episode.publishedAt,
                        description: episode.description,
                      });
                      refreshLibrary();
                    }}
                    className={`icon-btn absolute right-2 top-3 h-8 w-8 text-[14px] transition ${
                      isFav
                        ? "text-rose-500 opacity-100 scale-105"
                        : "text-[var(--ink-faint)] opacity-40 hover:opacity-100 hover:text-rose-500"
                    }`}
                    aria-label={isFav ? t("library.unfavoriteEpisode") : t("library.favoriteEpisode")}
                    title={isFav ? t("library.unfavoriteEpisode") : t("library.favoriteEpisode")}
                  >
                    {isFav ? "❤️" : "🤍"}
                  </button>
                </li>
              );
            })}
          </ul>
          )}

          {visible < episodes.length ? (
            <div ref={loadMoreRef} className="mt-3 flex justify-center py-4">
              <span className="text-[12px] text-[var(--ink-faint)]">{t("common.loading")}</span>
            </div>
          ) : null}

          {/* Bottom navigation for episode feed */}
          <div className="mt-4 flex items-center justify-between border-t border-[var(--rule)] pt-3">
            <button
              type="button"
              className="btn text-[12.5px] flex items-center gap-1.5"
              onClick={backToResultsOrBrowse}
            >
              <span aria-hidden>←</span>
              <span>{results && results.length > 1 ? t("listen.backToResults") : t("listen.backToBrowse")}</span>
            </button>
            <button
              type="button"
              className="btn text-[12.5px] flex items-center gap-1"
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            >
              <span aria-hidden>↑</span>
              <span>{t("common.scrollToTop")}</span>
            </button>
          </div>
          </div>
        </section>
      ) : null}

      {/* ---------------- library ---------------- */}
      {!feed && !results ? (
        <LibraryPanel
          shows={shows}
          recents={recents}
          recentSources={recentSources}
          favoriteEpisodes={favoriteEpisodes}
          onOpenShow={(saved) =>
            openShow({
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
          onOpenRecentSource={(source) =>
            openShow({
              id: `rss:${source.feedUrl}`,
              title: source.title,
              publisher: source.publisher,
              description: "",
              artwork: source.artwork,
              feedUrl: source.feedUrl,
              origin: (source.origin as DiscoverResult["origin"]) ?? "rss",
              pageUrl: source.pageUrl ?? null,
            })
          }
          onPlayRecent={playRecent}
          onForget={(id) => forgetRecent(id)}
          onToggleFavoriteEpisode={(fav) => {
            toggleFavoriteEpisode(fav);
            refreshLibrary();
          }}
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

      {/* Floating quick navigation (visible when scrolled down or when in feed/results) */}
      {(scrolledDown || feed || (results && results.length > 0)) && (
        <aside
          aria-label="Quick navigation"
          className="animate-dock-in fixed right-3.5 z-40 flex items-center justify-center gap-1 rounded-full glass-panel p-1 shadow-[0_10px_32px_rgba(0,0,0,0.18)] transition-all duration-300 sm:left-6 sm:right-auto sm:gap-1.5 sm:px-2 sm:py-1 sm:!bottom-6"
          style={{
            bottom: playing
              ? "calc(132px + env(safe-area-inset-bottom, 12px))"
              : "calc(68px + env(safe-area-inset-bottom, 12px))",
          }}
        >
          {feed ? (
            <button
              type="button"
              onClick={backToResultsOrBrowse}
              className="flex h-9 items-center gap-1 rounded-full px-3 text-[12px] font-semibold text-[var(--ink)] hover:bg-[var(--surface)] transition active:scale-95"
              title={results && results.length > 1 ? t("listen.backToResults") : t("listen.backToBrowse")}
            >
              <span aria-hidden>←</span>
              <span>{t("common.back")}</span>
            </button>
          ) : results && results.length > 0 ? (
            <button
              type="button"
              onClick={browse}
              className="flex h-9 items-center gap-1 rounded-full px-3 text-[12px] font-semibold text-[var(--ink)] hover:bg-[var(--surface)] transition active:scale-95"
              title={t("listen.backToBrowse")}
            >
              <span aria-hidden>←</span>
              <span>{t("common.back")}</span>
            </button>
          ) : null}

          {playing && !player.inlineVisible ? (
            <button
              type="button"
              onClick={scrollToPlayer}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[13px] font-semibold text-[var(--accent)] hover:opacity-90 transition active:scale-95"
              title={t("player.nowPlaying")}
              aria-label={t("player.nowPlaying")}
            >
              <span aria-hidden>🎧</span>
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="flex h-9 w-9 items-center justify-center rounded-full text-[14px] font-semibold text-[var(--ink)] hover:bg-[var(--surface)] transition active:scale-95 sm:w-auto sm:gap-1 sm:px-2.5 sm:text-[12px]"
            title={t("common.scrollToTop")}
            aria-label={t("common.scrollToTop")}
          >
            <span aria-hidden>↑</span>
            <span className="hidden sm:inline">{t("common.scrollToTop")}</span>
          </button>
        </aside>
      )}
    </div>
  );
}
