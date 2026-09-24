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
import { getTranscriptOffset, setTranscriptOffset } from "@/lib/transcriptSync";

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
}

interface PlayerContextValue {
  track: Track | null;
  play: (track: Track) => void;
  stop: () => void;
  handle: PlayerHandle;
  mediaState: MediaElementState;
  duration: number;
  retry: () => void;
  /** URL actually handed to the element, after the https upgrade. */
  src: string | null;
  /**
   * Registers the element the video should appear over on the current page.
   * Pass null when the page unmounts and the video docks into the mini bar.
   */
  setStage: (element: HTMLElement | null) => void;
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
  generatingTranscript: boolean;
  generateTranscriptError: GenerateTranscriptError | null;
  waitingForTranscript: boolean;
  isVideoTrack: boolean;
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
  const [showTranscript, setShowTranscript] = useState(true);
  const [transcriptCollapsed, setTranscriptCollapsed] = useState(false);
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const [playbackRate, setPlaybackRateState] = useState(1);
  const playbackRateRef = useRef(1);

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

      setShowTranscript(true);
      setWaitingForTranscript(false);
      pendingSeekRef.current = next.startAt && next.startAt > 0 ? next.startAt : null;

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

  const setStage = useCallback((element: HTMLElement | null) => {
    setStageElement(element);
  }, []);

  useEffect(() => {
    if (!track) {
      setFullscreenOpen(false);
      setWaitingForTranscript(false);
    }
  }, [track]);

  const [generatingTranscript, setGeneratingTranscript] = useState(false);
  const [generateTranscriptError, setGenerateTranscriptError] = useState<GenerateTranscriptError | null>(null);
  const generationRunIdRef = useRef(0);

  // Automatically load or generate the transcript in parallel while the episode plays
  useEffect(() => {
    liveCaptionService.clearTranscript();
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
          return;
        }
      }

      if (track.url) {
        setGeneratingTranscript(true);
        await generateTranscript(
          track.url,
          track.sourceLang ?? "de",
          isCancelled,
          {
            title: track.title,
            showTitle: track.showTitle,
            description: track.description,
            durationSec: track.durationSec,
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

  // Explicit generate trigger: ALWAYS works at any playback speed (1.0x, 1.5x, 2.0x)
  // and is NEVER blocked if an earlier background run is still in progress.
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

  const [videoMinimized, setVideoMinimized] = useState(false);

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
      const r = stage.getBoundingClientRect();
      if (r.width > 20 && r.height > 20 && r.bottom > 40 && r.top < window.innerHeight - 40) {
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
      frame = requestAnimationFrame(updateRect);
    };
    frame = requestAnimationFrame(updateRect);
    return () => cancelAnimationFrame(frame);
  }, [isVideoTrack, stage]);

  const duration = media.state.duration || 0;

  const value = useMemo<PlayerContextValue>(
    () => ({
      track,
      play,
      stop,
      handle,
      mediaState: media.state,
      duration,
      retry: media.retry,
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
      generatingTranscript,
      generateTranscriptError,
      waitingForTranscript,
      isVideoTrack,
      transcriptOffsetSec,
      setTranscriptOffsetSec,
      playbackRate,
      setPlaybackRate,
    }),
    [
      track,
      play,
      stop,
      handle,
      media.state,
      duration,
      media.retry,
      media.src,
      media.mediaRef,
      setStage,
      videoLayer,
      inlineVisible,
      showTranscript,
      transcriptCollapsed,
      fullscreenOpen,
      onGenerateTranscript,
      generatingTranscript,
      generateTranscriptError,
      waitingForTranscript,
      isVideoTrack,
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
          {/* Minimized pill when user hides the video */}
          {videoMinimized && !stageRect && (
            <button
              type="button"
              onClick={() => setVideoMinimized(false)}
              className="fixed top-14 left-1/2 -translate-x-1/2 z-[90] flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-zinc-950/90 px-3.5 py-1.5 text-xs font-semibold text-amber-300 shadow-2xl backdrop-blur-md transition hover:bg-zinc-900"
              title="Hiện lại cửa sổ video"
            >
              <span>🎬</span>
              <span>Hiện Video</span>
            </button>
          )}

          {/* Persistent Video Player:
              - When inside Media Player (stageRect present), docked at TOP CENTER directly above the Transcript (YouTube layout)
              - When scrolled away without stage, docked cleanly at Top Center mini bar */}
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
                ? "fixed z-[85] overflow-hidden rounded-2xl border border-white/20 bg-black shadow-2xl"
                : `fixed top-14 left-1/2 -translate-x-1/2 z-[85] overflow-hidden rounded-2xl border border-white/20 bg-black shadow-2xl transition-all duration-300 ${
                    videoMinimized
                      ? "pointer-events-none h-0 w-0 opacity-0"
                      : "w-64 sm:w-80 aspect-video opacity-100"
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
                bg-gradient-to-b from-black/80 via-black/40 to-transparent px-2.5 py-1.5
                opacity-90 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity
              ">
                <span className="truncate text-[10px] font-semibold text-amber-300">
                  🎬 {track.title}
                </span>
                <div className="flex items-center gap-1">
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
        </>
      ) : null}
    </PlayerContext.Provider>
  );
}

/**
 * Marks the element the persistent video layer should cover on this page.
 * Returns a ref to spread onto a placeholder box.
 */
export function useVideoStage(active: boolean) {
  const { setStage } = usePlayer();
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setStage(active ? ref.current : null);
    return () => setStage(null);
  }, [active, setStage]);

  return ref;
}
