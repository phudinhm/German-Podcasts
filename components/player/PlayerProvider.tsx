"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useMediaElement, type MediaElementState } from "./useMediaElement";
import { NOOP_PLAYER, type PlayerHandle } from "./types";
import type { FeedTranscript } from "@/lib/server/feed";
import type { SpokenLang } from "@/lib/language";
import { pickBestTranscript } from "@/lib/server/transcript";
import { liveCaptionService } from "@/lib/liveCaption";
import { generateTranscript, loadPublishedTranscript, type GenerateTranscriptError } from "@/lib/transcriptPipeline";
import { transcribeAndSpliceRegion } from "@/lib/regionalTranscribe";
import { getTranscriptOffset, setTranscriptOffset } from "@/lib/transcriptSync";
import { markEpisodeFinished, notePosition } from "@/lib/library";
import { PipSubtitleOverlay } from "./PipSubtitleOverlay";

export interface Track {
  /** Stable id, used to tell "same episode" from "new episode". */
  id: string;
  title: string;
  showTitle: string;
  artwork: string | null;
  description?: string;
  kind: "audio" | "video" | "youtube";
  url?: string;
  youtubeId?: string;
  pageUrl?: string;
  durationSec?: number | null;
  publishedAt?: string | null;
  /**
   * Where to start, in seconds. Applied once the element knows how long the
   * episode is: seeking before then is silently ignored, which is why resuming
   * used to drop you back at the beginning.
   */
  startAt?: number;
  /** Transcripts the publisher already shipped for this episode, if any. */
  transcripts?: FeedTranscript[];
  /** What language the episode is actually spoken in, for auto-translating
   * a published transcript in the right direction. */
  sourceLang?: SpokenLang;
  /** Suggested next track in queue or playlist, if available. */
  nextTrack?: Track | null;
}

interface PlayerContextValue {
  track: Track | null;
  nextTrack: Track | null;
  setNextTrack: (track: Track | null) => void;
  playNext: () => void;
  play: (track: Track) => void;
  stop: () => void;
  handle: PlayerHandle;
  mediaState: MediaElementState;
  duration: number;
  retry: () => void;
  playViaProxy: () => void;
  isProxy: boolean;
  rawSrc: string | null;
  /** URL actually handed to the element, after the https upgrade or proxy fallback. */
  src: string | null;
  /**
   * Registers the element the video should appear over on the current page.
   * Pass null when the page unmounts and the video docks into the mini bar.
   */
  setStage: React.Dispatch<React.SetStateAction<HTMLElement | null>>;
  /** The live media element, for anything that needs the real clock. */
  mediaElement: () => HTMLMediaElement | null;
  /**
   * True while a page is showing the full player inline and on screen.
   *
   * The docked player watches this rather than the route: the question is not
   * "which page is this" but "can the listener already see the controls". On
   * the listening page the full card scrolls away, and the moment it does the
   * docked one should take over.
   */
  inlineVisible: boolean;
  /** Called by the inline player as it enters and leaves the viewport. */
  setInlineVisible: (visible: boolean) => void;
  /**
   * The persistent video layer, once mounted. Pages portal subtitles into it
   * so they travel with the picture instead of with the page.
   */
  videoLayer: HTMLDivElement | null;
  showTranscript: boolean;
  setShowTranscript: React.Dispatch<React.SetStateAction<boolean>>;
  transcriptCollapsed: boolean;
  setTranscriptCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  /** The full-screen "now playing" view, the way a phone's own music app
   * expands to cover everything while something plays. Lives here rather
   * than on a page so it can be opened from the mini player too, and
   * survives whatever route is underneath it. */
  fullscreenOpen: boolean;
  setFullscreenOpen: React.Dispatch<React.SetStateAction<boolean>>;
  /**
   * Generates a transcript from the current episode's own audio, for one
   * with no published transcript. Explicitly triggered - see
   * lib/transcriptPipeline.ts for why this never runs on its own.
   */
  onGenerateTranscript: () => void;
  onTranscribeCurrentRegion: () => void;
  transcribingRegion: boolean;
  generatingTranscript: boolean;
  generateTranscriptError: GenerateTranscriptError | null;
  waitingForTranscript: boolean;
  isVideoTrack: boolean;
  videoPipMode: boolean;
  setVideoPipMode: React.Dispatch<React.SetStateAction<boolean>>;
  transcriptOffsetSec: number;
  setTranscriptOffsetSec: (offsetSec: number) => void;
  playbackRate: number;
  setPlaybackRate: (rate: number) => void;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function usePlayer(): PlayerContextValue {
  const value = useContext(PlayerContext);
  if (!value) throw new Error("usePlayer must be used inside PlayerProvider");
  return value;
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [track, setTrack] = useState<Track | null>(null);
  const [nextTrack, setNextTrack] = useState<Track | null>(null);
  const pendingSeekRef = useRef<number | null>(null);
  const [stage, setStageElement] = useState<HTMLElement | null>(null);
  const [waitingForTranscript, setWaitingForTranscript] = useState(false);

  const media = useMediaElement(track?.url ?? null);

  const handle = track ? media.handle : NOOP_PLAYER;

  const layerRef = useRef<HTMLDivElement | null>(null);
  const [videoLayer, setVideoLayer] = useState<HTMLDivElement | null>(null);
  const attachLayer = useCallback((element: HTMLDivElement | null) => {
    layerRef.current = element;
    setVideoLayer(element);
  }, []);

  const [inlineVisible, setInlineVisible] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [transcriptCollapsed, setTranscriptCollapsed] = useState(false);
  const [fullscreenOpen, setFullscreenOpenState] = useState(false);
  const [videoPipMode, setVideoPipMode] = useState(false);
  const [playbackRate, setPlaybackRateState] = useState(1);
  const playbackRateRef = useRef(1);

  const setFullscreenOpen = useCallback<React.Dispatch<React.SetStateAction<boolean>>>(
    (action) => {
      setFullscreenOpenState((prev) => {
        const next = typeof action === "function" ? action(prev) : action;
        if (prev && !next) {
          // Exiting Fullscreen Media Player -> automatically transition into Picture-in-Picture mode!
          setVideoPipMode(true);
          setVideoMinimized(false);
        } else if (!prev && next) {
          // Entering Fullscreen Media Player -> exit PiP mode so Fullscreen stage owns the video
          setVideoPipMode(false);
          setVideoMinimized(false);
          if (typeof document !== "undefined" && document.pictureInPictureElement) {
            void document.exitPictureInPicture().catch(() => {});
          }
        }
        return next;
      });
    },
    []
  );

  const play = useCallback(
    (next: Track) => {
      // Stop any previous track cleanly before switching
      media.handle.pause();
      const el = media.mediaRef.current;
      if (el) {
        try {
          el.pause();
          el.currentTime = 0;
        } catch {}
      }

      setWaitingForTranscript(false);
      setVideoMinimized(false);
      setVideoPipMode(false);
      pendingSeekRef.current = next.startAt && next.startAt > 0 ? next.startAt : null;

      if (next.nextTrack !== undefined) {
        setNextTrack(next.nextTrack);
      }

      setTrack((current) => {
        if (current?.id === next.id && current?.url === next.url) {
          return { ...next };
        }
        return next;
      });

      // Start playback immediately (do NOT wait for transcript completion)
      window.setTimeout(() => {
        media.handle.setRate(playbackRateRef.current);
        media.handle.play();
      }, 60);
    },
    [media.handle, media.mediaRef],
  );

  const playNext = useCallback(() => {
    if (nextTrack) {
      play(nextTrack);
    }
  }, [nextTrack, play]);

  // Automatically mark episode as finished when audio reaches end or ends naturally
  useEffect(() => {
    const el = media.mediaRef.current;
    if (!el || !track?.id) return;

    const onEnded = () => {
      markEpisodeFinished(track.id);
      window.dispatchEvent(new CustomEvent("hoerbar:library-changed"));
    };

    const onTimeUpdate = () => {
      const dur = el.duration;
      const cur = el.currentTime;
      if (Number.isFinite(dur) && dur > 0 && cur > 0) {
        notePosition(track.id, cur, dur);
        if (cur >= dur - 20) {
          markEpisodeFinished(track.id);
        }
      }
    };

    el.addEventListener("ended", onEnded);
    el.addEventListener("timeupdate", onTimeUpdate);
    return () => {
      el.removeEventListener("ended", onEnded);
      el.removeEventListener("timeupdate", onTimeUpdate);
    };
  }, [media.mediaRef, track?.id]);

  /**
   * Applies a requested start position as soon as the element is ready.
   *
   * A media element ignores a seek before it has metadata, so resuming an
   * episode has to wait for it rather than guess at a delay.
   */
  useEffect(() => {
    const at = pendingSeekRef.current;
    if (at === null || !media.state.ready) return;
    pendingSeekRef.current = null;
    media.handle.seekTo(at, true);
    // track?.id is in the dependencies because a new episode can start while
    // the element already reports ready, and without it the effect would never
    // re-run for the second episode of a session.
  }, [media.state.ready, media.handle, track?.id]);

  const stop = useCallback(() => {
    handle.pause();
    setTrack(null);
  }, [handle]);

  /**
   * MediaSession API: powers iPhone Lock Screen, Dynamic Island, Control Center,
   * Apple Watch, and Bluetooth headphone gestures (-10s / +30s / play / pause).
   */
  useEffect(() => {
    if (typeof window === "undefined" || !("mediaSession" in navigator)) return;

    if (!track) {
      navigator.mediaSession.metadata = null;
      return;
    }

    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.showTitle,
      album: "Hörbar German Podcasts",
      artwork: track.artwork
        ? [
            { src: track.artwork, sizes: "96x96" },
            { src: track.artwork, sizes: "128x128" },
            { src: track.artwork, sizes: "256x256" },
            { src: track.artwork, sizes: "512x512" },
          ]
        : [],
    });

    const setAction = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {}
    };

    setAction("play", () => handle.play());
    setAction("pause", () => handle.pause());
    setAction("seekbackward", (details) => {
      const skip = details.seekOffset || 10;
      handle.seekTo(Math.max(0, handle.getTime() - skip), true);
    });
    setAction("seekforward", (details) => {
      const skip = details.seekOffset || 30;
      handle.seekTo(handle.getTime() + skip, true);
    });
    setAction("seekto", (details) => {
      if (details.seekTime !== undefined) {
        handle.seekTo(details.seekTime, true);
      }
    });

    return () => {
      setAction("play", null);
      setAction("pause", null);
      setAction("seekbackward", null);
      setAction("seekforward", null);
      setAction("seekto", null);
    };
  }, [track, handle]);

  // Sync position state to iOS Lock Screen scrubber bar
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("mediaSession" in navigator) ||
      !("setPositionState" in navigator.mediaSession) ||
      !track ||
      !media.state.ready
    ) {
      return;
    }

    const duration = handle.getDuration();
    if (!Number.isFinite(duration) || duration <= 0) return;

    const timer = setInterval(() => {
      try {
        const time = handle.getTime();
        navigator.mediaSession.setPositionState({
          duration: Math.max(0, duration),
          playbackRate,
          position: Math.min(duration, Math.max(0, time)),
        });
      } catch {}
    }, 2000);

    return () => clearInterval(timer);
  }, [track, media.state.ready, handle, playbackRate]);

  const setStage = useCallback<React.Dispatch<React.SetStateAction<HTMLElement | null>>>((action) => {
    setStageElement(action);
  }, []);

  useEffect(() => {
    if (!track) {
      setFullscreenOpen(false);
      setWaitingForTranscript(false);
    }
  }, [track]);

  const [generatingTranscript, setGeneratingTranscript] = useState(false);
  const [transcribingRegion, setTranscribingRegion] = useState(false);
  const [generateTranscriptError, setGenerateTranscriptError] = useState<GenerateTranscriptError | null>(null);
  const generationRunIdRef = useRef(0);
  const scannedRegionBucketsRef = useRef<Set<string>>(new Set());

  // Automatically load or generate the transcript in parallel while the episode plays
  useEffect(() => {
    liveCaptionService.clearTranscript();
    scannedRegionBucketsRef.current.clear();
    const runId = ++generationRunIdRef.current;
    setGenerateTranscriptError(null);
    setWaitingForTranscript(false);

    if (!track) {
      setGeneratingTranscript(false);
      return;
    }

    const isCancelled = () => generationRunIdRef.current !== runId;

    const loadOrGenerateInParallel = async () => {
      const best = track.transcripts?.length ? pickBestTranscript(track.transcripts) : null;
      if (best) {
        setGeneratingTranscript(true);
        const loaded = await loadPublishedTranscript(best, track.sourceLang ?? "de", isCancelled);
        if (isCancelled()) return;
        if (loaded) {
          setGeneratingTranscript(false);
          // Automatically scan the opening [0..50s] audio region to detect any dynamically inserted
          // Pre-Roll Advertisement (DAI), transcribe the ad, and shift the published transcript if offset!
          if (track.url) {
            scannedRegionBucketsRef.current.add(`${track.id}:0`);
            void transcribeAndSpliceRegion({
              url: track.url,
              startSec: 0,
              endSec: 50,
              totalDurationSec: media.handle.getDuration() || (track.durationSec ?? 0),
              sourceLang: track.sourceLang ?? "de",
            }).catch(() => {});
          }
          return;
        }
      }

      if (track.url) {
        setGeneratingTranscript(true);
        const startPos = track.startAt && track.startAt > 2 ? Math.floor(track.startAt) : 0;
        scannedRegionBucketsRef.current.add(`${track.id}:0`);
        scannedRegionBucketsRef.current.add(`${track.id}:${Math.floor(startPos / 32)}`);

        // If resuming mid-episode (startPos > 15s), immediately fetch & transcribe the active window at `startPos`
        // via HTTP Range before starting the full sequential stream from 0:00!
        if (startPos > 15) {
          await transcribeAndSpliceRegion({
            url: track.url,
            startSec: startPos,
            endSec: startPos + 42,
            totalDurationSec: media.handle.getDuration() || (track.durationSec ?? 0),
            sourceLang: track.sourceLang ?? "de",
            forceReplaceWindow: true,
          }).catch(() => {});
        }

        if (isCancelled()) return;

        await generateTranscript(
          track.url,
          track.sourceLang ?? "de",
          isCancelled,
          {
            title: track.title,
            showTitle: track.showTitle,
            description: track.description,
            durationSec: track.durationSec,
            trackId: track.id,
            pageUrl: track.pageUrl,
          },
          () => {
            if (!isCancelled()) {
              setGeneratingTranscript(false);
              setGenerateTranscriptError(null);
            }
          },
        );
        if (isCancelled()) return;
        setGeneratingTranscript(false);
        setGenerateTranscriptError(null);
      } else {
        setGeneratingTranscript(false);
      }
    };

    void loadOrGenerateInParallel();

    return () => {
      if (generationRunIdRef.current === runId) {
        generationRunIdRef.current++;
      }
    };
  }, [track?.id, track?.url]);

  const [transcriptOffsetSec, setTranscriptOffsetSecState] = useState(0);
  useEffect(() => {
    setTranscriptOffsetSecState(track ? getTranscriptOffset(track.id) : 0);
  }, [track?.id]);
  const setTranscriptOffsetSec = useCallback(
    (offsetSec: number) => {
      setTranscriptOffsetSecState(offsetSec);
      if (track) setTranscriptOffset(track.id, offsetSec);
    },
    [track],
  );

  const regionAbortRef = useRef<AbortController | null>(null);

  const triggerRegionalSyncAt = useCallback(
    (nowSec: number, isSeekJump: boolean) => {
      if (!track?.url) return;
      const totalDur = media.handle.getDuration() || (track.durationSec ?? 0);
      if (nowSec < 1.5 && !isSeekJump) return;

      const segs = liveCaptionService.getTranscript();
      // Only count verified regional segments (`dai-reg-*`) as already-calibrated on a seek jump,
      // and never count `fallback-*` show-notes placeholders as real coverage!
      const hasVerifiedRegional = segs.some(
        (s) =>
          s.id.startsWith("dai-reg-") &&
          nowSec >= s.start - 1.5 &&
          nowSec <= s.end + 2.5
      );
      if (hasVerifiedRegional) return;

      if (!isSeekJump) {
        const hasRealCoverage = segs.some(
          (s) =>
            !s.id.startsWith("fallback-") &&
            nowSec >= s.start - 2.0 &&
            nowSec <= s.end + 3.5
        );
        if (hasRealCoverage) return;
      }

      const bucketKey = `${track.id}:${Math.floor(nowSec / 32)}`;
      if (!isSeekJump && scannedRegionBucketsRef.current.has(bucketKey)) return;
      scannedRegionBucketsRef.current.add(bucketKey);

      // If the user jumped to a new position, abort any stale regional request from the old timestamp!
      if (isSeekJump && regionAbortRef.current) {
        regionAbortRef.current.abort();
      } else if (transcribingRegion) {
        return;
      }

      const ac = new AbortController();
      regionAbortRef.current = ac;
      const regionStart = Math.max(0, Math.floor(nowSec - 1));
      const regionEnd = totalDur > 15 ? Math.min(totalDur, regionStart + 42) : regionStart + 42;

      setTranscribingRegion(true);
      void transcribeAndSpliceRegion({
        url: track.url,
        startSec: regionStart,
        endSec: regionEnd,
        totalDurationSec: totalDur,
        sourceLang: track.sourceLang ?? "de",
        forceReplaceWindow: isSeekJump,
        signal: ac.signal,
      })
        .catch(() => {})
        .finally(() => {
          if (regionAbortRef.current === ac) {
            setTranscribingRegion(false);
          }
        });
    },
    [track?.id, track?.url, track?.durationSec, track?.sourceLang, media.handle, transcribingRegion]
  );

  // Instant `seeked` & `timeupdate` synchronization on the media element:
  // When jumping to any arbitrary position in a podcast, immediately sync captions and trigger regional transcription/alignment!
  useEffect(() => {
    const el = media.mediaRef.current;
    if (!el || !track) return;

    const onTimeOrSeek = () => {
      const nowSec = el.currentTime || 0;
      liveCaptionService.syncCaptionAtTime(nowSec - transcriptOffsetSec);
    };

    const onSeeked = () => {
      const nowSec = el.currentTime || 0;
      liveCaptionService.syncCaptionAtTime(nowSec - transcriptOffsetSec);
      if (nowSec >= 2) {
        triggerRegionalSyncAt(nowSec, true);
      }
    };

    el.addEventListener("timeupdate", onTimeOrSeek);
    el.addEventListener("seeked", onSeeked);
    const unsubTranscript = liveCaptionService.onTranscript(() => {
      liveCaptionService.syncCaptionAtTime((el.currentTime || 0) - transcriptOffsetSec);
    });

    return () => {
      el.removeEventListener("timeupdate", onTimeOrSeek);
      el.removeEventListener("seeked", onSeeked);
      unsubTranscript();
    };
  }, [media.mediaRef, track, transcriptOffsetSec, triggerRegionalSyncAt]);

  // Automatic Playhead Regional Monitor (every 2s while playing):
  useEffect(() => {
    if (!track?.url) return;
    const timer = window.setInterval(() => {
      if (!media.handle.isPlaying()) return;
      const nowSec = media.handle.getTime();
      liveCaptionService.syncCaptionAtTime(nowSec - transcriptOffsetSec);
      triggerRegionalSyncAt(nowSec, false);
    }, 2000);

    return () => window.clearInterval(timer);
  }, [track?.url, media.handle, transcriptOffsetSec, triggerRegionalSyncAt]);

  // Manual 1-Tap Regional Ad / Sync Transcriber for `[currentTime - 2s, currentTime + 45s]`
  const onTranscribeCurrentRegion = useCallback(() => {
    if (!track?.url) return;
    const nowSec = media.handle.getTime();
    triggerRegionalSyncAt(nowSec, true);
  }, [track?.url, media.handle, triggerRegionalSyncAt]);

  // Explicit generate trigger: ALWAYS works at any playback speed (1.0x, 1.5x, 2.0x)
  // and immediately populates the transcript UI while streaming Whisper audio in the background.
  const onGenerateTranscript = useCallback(() => {
    if (!track?.url) return;
    const runId = ++generationRunIdRef.current;
    const isCancelled = () => generationRunIdRef.current !== runId;
    setGeneratingTranscript(true);
    setGenerateTranscriptError(null);
    void generateTranscript(
      track.url,
      track.sourceLang ?? "de",
      isCancelled,
      {
        title: track.title,
        showTitle: track.showTitle,
        description: track.description,
        durationSec: track.durationSec,
        trackId: track.id,
        pageUrl: track.pageUrl,
        immediatePreview: true,
      },
      () => {
        if (!isCancelled()) {
          setGeneratingTranscript(false);
          setGenerateTranscriptError(null);
        }
      },
    ).then(() => {
      if (isCancelled()) return;
      setGeneratingTranscript(false);
      setGenerateTranscriptError(null);
    });
  }, [track]);

  const setPlaybackRate = useCallback(
    (nextRate: number) => {
      const clamped = Math.round(Math.max(0.4, Math.min(2.5, nextRate)) * 100) / 100;
      playbackRateRef.current = clamped;
      setPlaybackRateState(clamped);
      media.handle.setRate(clamped);
      // If user speeds up audio and transcript is empty and not currently generating, auto-trigger generation
      if (
        track?.url &&
        liveCaptionService.getTranscript().length === 0 &&
        !generatingTranscript
      ) {
        onGenerateTranscript();
      }
    },
    [media.handle, track?.url, generatingTranscript, onGenerateTranscript],
  );

  const [videoMinimized, setVideoMinimized] = useState(false);
  const [pipTopCorner, setPipTopCorner] = useState(false);

  const isVideoTrack = Boolean(
    track &&
      (track.kind === "video" || /\.(mp4|m3u8|webm|mov|m4v)(\?|$)/i.test(track.url || ""))
  );

  // Sync the persistent <video> layer over the active Top-Center stage box
  // (inside FullscreenPlayer or inline ListenClient player)
  const [stageRect, setStageRect] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);

  useEffect(() => {
    if (!isVideoTrack || !stage) {
      setStageRect(null);
      return;
    }
    let frame = 0;
    const updateRect = () => {
      frame = 0;
      const r = stage.getBoundingClientRect();
      const headerEl = typeof document !== "undefined" ? document.querySelector("header") : null;
      const headerBottom = !fullscreenOpen && headerEl ? headerEl.getBoundingClientRect().bottom : 0;
      const minBottom = fullscreenOpen ? 40 : Math.max(84, headerBottom + 36);
      if (r.width > 20 && r.height > 20 && r.bottom > minBottom && r.top < window.innerHeight - 40) {
        setStageRect((prev) => {
          if (
            prev &&
            Math.abs(prev.top - r.top) < 1 &&
            Math.abs(prev.left - r.left) < 1 &&
            Math.abs(prev.width - r.width) < 1 &&
            Math.abs(prev.height - r.height) < 1
          ) {
            return prev;
          }
          return { top: r.top, left: r.left, width: r.width, height: r.height };
        });
      } else {
        setStageRect(null);
      }
    };
    const scheduleUpdate = () => {
      if (!frame) frame = requestAnimationFrame(updateRect);
    };
    updateRect();
    window.addEventListener("scroll", scheduleUpdate, { passive: true, capture: true });
    window.addEventListener("resize", scheduleUpdate, { passive: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(scheduleUpdate) : null;
    ro?.observe(stage);
    ro?.observe(document.body);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", scheduleUpdate, { capture: true });
      window.removeEventListener("resize", scheduleUpdate);
      ro?.disconnect();
    };
  }, [isVideoTrack, stage, fullscreenOpen]);

  const duration = media.state.duration || 0;

  const value = useMemo<PlayerContextValue>(
    () => ({
      track,
      nextTrack,
      setNextTrack,
      playNext,
      play,
      stop,
      handle,
      mediaState: media.state,
      duration,
      retry: media.retry,
      playViaProxy: media.playViaProxy,
      isProxy: media.isProxy,
      rawSrc: media.rawSrc,
      src: media.src,
      setStage,
      mediaElement: () => media.mediaRef.current,
      videoLayer,
      inlineVisible,
      setInlineVisible,
      showTranscript,
      setShowTranscript,
      transcriptCollapsed,
      setTranscriptCollapsed,
      fullscreenOpen,
      setFullscreenOpen,
      onGenerateTranscript,
      onTranscribeCurrentRegion,
      transcribingRegion,
      generatingTranscript,
      generateTranscriptError,
      waitingForTranscript,
      isVideoTrack,
      videoPipMode,
      setVideoPipMode,
      transcriptOffsetSec,
      setTranscriptOffsetSec,
      playbackRate,
      setPlaybackRate,
    }),
    [
      track,
      nextTrack,
      playNext,
      play,
      stop,
      handle,
      media.state,
      duration,
      media.retry,
      media.playViaProxy,
      media.isProxy,
      media.rawSrc,
      media.src,
      media.mediaRef,
      setStage,
      videoLayer,
      inlineVisible,
      showTranscript,
      transcriptCollapsed,
      fullscreenOpen,
      setFullscreenOpen,
      onGenerateTranscript,
      onTranscribeCurrentRegion,
      transcribingRegion,
      generatingTranscript,
      generateTranscriptError,
      waitingForTranscript,
      isVideoTrack,
      videoPipMode,
      transcriptOffsetSec,
      setTranscriptOffsetSec,
      playbackRate,
      setPlaybackRate,
    ],
  );

  return (
    <PlayerContext.Provider value={value}>
      {children}

      {/* Mounted once, never unmounted by routing. */}
      {track && !isVideoTrack ? (
        <audio
          ref={media.mediaRef as React.RefObject<HTMLAudioElement>}
          src={media.src ?? undefined}
          preload="metadata"
          className="hidden"
        />
      ) : null}

      {track && isVideoTrack ? (
        <>
          {/* Minimized pill when user hides the PiP video */}
          {videoMinimized && !stageRect && (
            <button
              type="button"
              onClick={() => setVideoMinimized(false)}
              className={`fixed right-3 sm:right-5 z-[65] flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-zinc-950/90 px-3.5 py-1.5 text-xs font-semibold text-amber-300 shadow-2xl backdrop-blur-md transition hover:bg-zinc-900 ${
                pipTopCorner
                  ? "top-[calc(88px+env(safe-area-inset-top,0px))] sm:top-16"
                  : "bottom-[142px] sm:bottom-24"
              }`}
              title="Hiện lại cửa sổ video Picture-in-Picture"
            >
              <span>🎬</span>
              <span>Hiện PiP Video</span>
            </button>
          )}

          {/* Persistent Video Player:
              - When inside Media Player (stageRect present), docked over the active stage box
              - When exited to search/browse other podcasts (!stageRect), floats in iOS Picture-in-Picture corner window */}
          <div
            ref={attachLayer}
            style={
              stageRect
                ? {
                    position: "fixed",
                    top: `${stageRect.top}px`,
                    left: `${stageRect.left}px`,
                    width: `${stageRect.width}px`,
                    height: `${stageRect.height}px`,
                  }
                : undefined
            }
            className={
              stageRect
                ? `fixed ${fullscreenOpen ? "z-[85]" : "z-30"} overflow-hidden rounded-2xl border border-white/20 bg-black shadow-2xl`
                : `fixed right-3 sm:right-5 z-[65] overflow-hidden rounded-2xl border border-white/25 bg-black shadow-[0_16px_48px_rgba(0,0,0,0.6)] ring-1 ring-black/50 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                    pipTopCorner
                      ? "top-[calc(88px+env(safe-area-inset-top,0px))] sm:top-16"
                      : "bottom-[142px] sm:bottom-24"
                  } ${
                    videoMinimized
                      ? "pointer-events-none h-0 w-0 opacity-0 scale-75"
                      : "w-56 sm:w-80 aspect-video opacity-100 scale-100"
                  }`
            }
          >
            <div className="group relative h-full w-full">
              <video
                ref={media.mediaRef as React.RefObject<HTMLVideoElement>}
                src={media.src ?? undefined}
                poster={track.artwork ?? undefined}
                playsInline
                preload="metadata"
                onClick={() => {
                  if (waitingForTranscript) return;
                  if (handle.isPlaying()) handle.pause();
                  else handle.play();
                }}
                className="h-full w-full cursor-pointer object-contain bg-black"
              />

              {/* Overlay when waiting for transcript to complete before playing */}
              {waitingForTranscript && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/75 px-4 text-center backdrop-blur-xs">
                  <span className="h-6 w-6 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
                  <p className="text-xs font-semibold text-amber-200">
                    Đang tạo transcript trước khi phát...
                  </p>
                </div>
              )}

              <div className="
                absolute inset-x-0 top-0 flex items-center justify-between gap-1
                bg-gradient-to-b from-black/85 via-black/45 to-transparent px-2.5 py-1.5
                opacity-95 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity
              ">
                <button
                  type="button"
                  onClick={() => {
                    setVideoPipMode(false);
                    setFullscreenOpen(true);
                  }}
                  className="truncate text-left text-[10.5px] font-semibold text-amber-300 hover:underline"
                  title="Mở lại trình phát toàn màn hình"
                >
                  🎬 {track.title}
                </button>
                <div className="flex items-center gap-1 shrink-0">
                  {!stageRect && (
                    <>
                      <button
                        type="button"
                        onClick={() => setPipTopCorner((v) => !v)}
                        className="rounded bg-white/15 px-1.5 py-0.5 text-[10px] font-bold text-white hover:bg-white/30"
                        title="Đổi vị trí góc trên / góc dưới"
                      >
                        ⇅
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setVideoPipMode(false);
                          setFullscreenOpen(true);
                        }}
                        className="rounded bg-amber-500/85 px-1.5 py-0.5 text-[10px] font-bold text-black hover:bg-amber-400"
                        title="Phóng to lại Media Player"
                      >
                        ⤢
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      const el = media.mediaRef.current as HTMLVideoElement | null;
                      if (el && "requestPictureInPicture" in el) {
                        void el.requestPictureInPicture().catch(() => {});
                      }
                    }}
                    className="rounded bg-white/15 px-1.5 py-0.5 text-[10px] font-bold text-white hover:bg-white/30"
                    title="Picture-in-Picture (PiP)"
                  >
                    ⧉
                  </button>
                  {!stageRect && (
                    <button
                      type="button"
                      onClick={() => setVideoMinimized(true)}
                      className="rounded bg-white/15 px-1.5 py-0.5 text-[10px] font-bold text-white hover:bg-rose-500/40"
                      title="Thu nhỏ cửa sổ video"
                    >
                      —
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Floating Subtitle Overlay when playing in Picture-in-Picture */}
          <PipSubtitleOverlay
            active={Boolean(track && isVideoTrack && !stageRect && !videoMinimized)}
            videoRef={media.mediaRef as React.RefObject<HTMLVideoElement>}
            transcriptOffsetSec={transcriptOffsetSec}
          />
        </>
      ) : null}
    </PlayerContext.Provider>
  );
}

/**
 * Marks the element the persistent video layer should cover on this page.
 * Returns a ref to spread onto a placeholder box.
 * Uses owner-safe cleanup so an unmounting FullscreenPlayer never clobbers an active inline stage.
 */
export function useVideoStage(active: boolean) {
  const { setStage } = usePlayer();
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (active && el) {
      setStage(el);
      return () => {
        setStage(( current: HTMLElement | null ) => (current === el ? null : current) as unknown as HTMLElement | null);
      };
    }
    return undefined;
  }, [active, setStage]);

  return ref;
}
