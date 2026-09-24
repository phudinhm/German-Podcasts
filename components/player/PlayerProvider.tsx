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
  /**
   * Manual correction, in seconds, for a transcript timed against the
   * ad-free master while the episode's actual stream has a dynamically
   * inserted, country-varying ad break spliced in ahead of it - the two
   * clocks then drift apart by a roughly constant amount for the rest of
   * the episode. Lives here rather than on any one transcript surface for
   * the same reason `track` does: every one of them needs the same value.
   */
  transcriptOffsetSec: number;
  setTranscriptOffsetSec: (offsetSec: number) => void;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function usePlayer(): PlayerContextValue {
  const value = useContext(PlayerContext);
  if (!value) throw new Error("usePlayer must be used inside PlayerProvider");
  return value;
}

/**
 * Holds playback above the page tree.
 *
 * The media elements are mounted once, in the layout, so navigating between
 * Listen, Catalog and Vocabulary does not unmount them and audio keeps running.
 * A React component that owns its own <audio> cannot do that: routing destroys
 * it. Everything else here follows from that one decision.
 *
 * Video is harder, because a YouTube iframe cannot be moved between two places
 * in the DOM without reloading. So the iframe lives in a single fixed-position
 * layer, and a page that wants to show it registers a "stage" element; the
 * layer is then positioned over that rectangle every frame. When no stage is
 * registered it shrinks into the mini bar and playback simply continues.
 */
export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [track, setTrack] = useState<Track | null>(null);
  const pendingSeekRef = useRef<number | null>(null);
  const [stage, setStageElement] = useState<HTMLElement | null>(null);
  // Playback always streams from the publisher. Transcription keeps its own
  // silent copy of the episode, so nothing it does can reach this element.
  const media = useMediaElement(track?.url ?? null);

  const handle = track ? media.handle : NOOP_PLAYER;

  const layerRef = useRef<HTMLDivElement | null>(null);
  const [videoLayer, setVideoLayer] = useState<HTMLDivElement | null>(null);
  const attachLayer = useCallback((element: HTMLDivElement | null) => {
    layerRef.current = element;
    setVideoLayer(element);
  }, []);

  const play = useCallback(
    (next: Track) => {
      setTrack((current) => {
        if (current?.id === next.id) return current;
        return next;
      });
      pendingSeekRef.current = next.startAt && next.startAt > 0 ? next.startAt : null;
      // Let the element pick up the new source before asking it to play.
      window.setTimeout(() => {
        media.handle.play();
      }, 80);
    },
    [media.handle],
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
          playbackRate: 1,
          position: Math.min(duration, Math.max(0, time)),
        });
      } catch {}
    }, 2000);

    return () => clearInterval(timer);
  }, [track, media.state.ready, handle]);

  const setStage = useCallback((element: HTMLElement | null) => {
    setStageElement(element);
  }, []);

  // Defaults to false so a page with no inline player, such as the library,
  // gets the docked one straight away.
  const [inlineVisible, setInlineVisible] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [transcriptCollapsed, setTranscriptCollapsed] = useState(false);
  const [fullscreenOpen, setFullscreenOpen] = useState(false);

  // Nothing is playing any more but the fullscreen view is still up over
  // whatever comes next - closing it here matches every other player's
  // now-playing screen, which dismisses itself once playback actually stops.
  useEffect(() => {
    if (!track) setFullscreenOpen(false);
  }, [track]);

  // Some feeds already ship a real transcript for the episode (the
  // Podcasting 2.0 tag Apple Podcasts is one of the bigger publishers of) -
  // when one exists there is nothing to capture live, so this loads it
  // straight into the shared transcript instead. Lives here, not on any one
  // page, because `track` does too, and every surface that shows a
  // transcript (this page, the full-screen view, the floating panel) needs
  // the same one loaded regardless of which of them happens to be mounted.
  useEffect(() => {
    liveCaptionService.clearTranscript();
    const best = track?.transcripts?.length ? pickBestTranscript(track.transcripts) : null;
    if (!best) return;
    let cancelled = false;
    void loadPublishedTranscript(best, track?.sourceLang ?? "de", () => cancelled);
    return () => {
      cancelled = true;
    };
  }, [track?.id, track?.sourceLang]);

  // The explicit fallback for an episode whose feed has no transcript at
  // all: generates one from the audio itself via a free speech-to-text
  // provider, only when someone asks for it.
  const [generatingTranscript, setGeneratingTranscript] = useState(false);
  const [generateTranscriptError, setGenerateTranscriptError] = useState<GenerateTranscriptError | null>(null);
  const generateCancelledRef = useRef(false);

  const onGenerateTranscript = useCallback(() => {
    if (!track?.url || generatingTranscript) return;
    generateCancelledRef.current = false;
    setGeneratingTranscript(true);
    setGenerateTranscriptError(null);
    void generateTranscript(track.url, track.sourceLang ?? "de", () => generateCancelledRef.current).then(
      (result) => {
        if (generateCancelledRef.current) return;
        setGeneratingTranscript(false);
        if (!result.ok) setGenerateTranscriptError(result.error);
      },
    );
  }, [track?.url, track?.sourceLang, generatingTranscript]);

  useEffect(() => {
    generateCancelledRef.current = false;
    setGeneratingTranscript(false);
    setGenerateTranscriptError(null);
    return () => {
      generateCancelledRef.current = true;
    };
  }, [track?.id]);

  // Loads whatever correction was last dialed in for this specific episode,
  // if any - the ad break's length tends to repeat for the same episode and
  // listener, even though it varies from show to show and country to country.
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

  const value = useMemo<PlayerContextValue>(
    () => ({
      track,
      play,
      stop,
      handle,
      mediaState: media.state,
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
      transcriptOffsetSec,
      setTranscriptOffsetSec,
    }),
    [
      track,
      play,
      stop,
      handle,
      media.state,
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
      transcriptOffsetSec,
      setTranscriptOffsetSec,
    ],
  );

  return (
    <PlayerContext.Provider value={value}>
      {children}

      {/* Mounted once, never unmounted by routing. */}
      {track && track.kind === "audio" ? (
        <audio
          ref={media.mediaRef as React.RefObject<HTMLAudioElement>}
          src={media.src ?? undefined}
          preload="metadata"
          className="hidden"
        />
      ) : null}

      {track && track.kind === "video" ? (
        <div
          ref={attachLayer}
          className="fixed z-[60] overflow-hidden bg-black shadow-lg transition-[opacity] duration-150"
          style={{ top: 0, left: 0, width: 0, height: 0 }}
        >
          <video
            ref={media.mediaRef as React.RefObject<HTMLVideoElement>}
            src={media.src ?? undefined}
            poster={track.artwork ?? undefined}
            playsInline
            preload="metadata"
            className="h-full w-full object-contain"
          />
        </div>
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
