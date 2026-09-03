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
import { useYouTube } from "./useYouTube";
import { NOOP_PLAYER, type PlayerHandle } from "./types";
import { proxied } from "@/lib/audio/proxy";

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
  youtubeUnavailable: boolean;
  /**
   * Registers the element the video should appear over on the current page.
   * Pass null when the page unmounts and the video docks into the mini bar.
   */
  setStage: (element: HTMLElement | null) => void;
  /** The live media element, for taking an audio tap off it. */
  mediaElement: () => HTMLMediaElement | null;
  /**
   * Routes the stream through this origin so Web Audio can read it. Costs us
   * the bandwidth, so it is only switched on for in-browser transcription.
   */
  captureMode: boolean;
  setCaptureMode: (on: boolean) => void;
  /** True once a proxied source has failed, so captions can say why. */
  captureFailed: boolean;
  /**
   * The persistent video layer, once mounted. Pages portal subtitles into it
   * so they travel with the picture instead of with the page.
   */
  videoLayer: HTMLDivElement | null;
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
  const [stage, setStageElement] = useState<HTMLElement | null>(null);
  const [captureMode, setCaptureModeState] = useState(false);

  const isYouTube = track?.kind === "youtube";
  // In capture mode the very same audio is fetched through this origin, which
  // is the only way a browser will let the audio graph read it.
  const rawUrl = isYouTube ? null : (track?.url ?? null);
  const media = useMediaElement(rawUrl && captureMode ? proxied(rawUrl) : rawUrl);
  const youtube = useYouTube(track?.youtubeId ?? null);

  const handle = isYouTube ? youtube.handle : track ? media.handle : NOOP_PLAYER;

  /** Last position seen while the element was playing without error. */
  const lastTimeRef = useRef(0);
  const rememberTime = useCallback((event: React.SyntheticEvent<HTMLMediaElement>) => {
    const element = event.currentTarget;
    if (!element.error && element.currentTime > 0) lastTimeRef.current = element.currentTime;
  }, []);

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
      // Let the element pick up the new source before asking it to play.
      window.setTimeout(() => {
        if (next.kind !== "youtube") media.handle.play();
      }, 80);
    },
    [media.handle],
  );

  const stop = useCallback(() => {
    handle.pause();
    setTrack(null);
  }, [handle]);

  const setStage = useCallback((element: HTMLElement | null) => {
    setStageElement(element);
  }, []);

  /**
   * Switching the source swaps the element's URL, which resets it. Position and
   * play state are restored so turning captions on does not feel like starting
   * the episode again.
   */
  const setCaptureMode = useCallback(
    (on: boolean) => {
      const element = media.mediaRef.current;
      // An element that has already failed reports 0, so the last position seen
      // while it was healthy is the one worth restoring.
      const live = element?.currentTime ?? 0;
      const at = element?.error || live === 0 ? Math.max(live, lastTimeRef.current) : live;
      const wasPlaying = Boolean(element && !element.paused);
      setCaptureModeState(on);
      window.setTimeout(() => {
        const next = media.mediaRef.current;
        if (!next) return;
        try {
          next.currentTime = at;
        } catch {
          // Metadata may not have arrived yet; the seek is retried below.
        }
        const restore = () => {
          try {
            next.currentTime = at;
          } catch {
            // Nothing more to do; playback simply starts from the beginning.
          }
          if (wasPlaying) void next.play().catch(() => undefined);
          next.removeEventListener("loadedmetadata", restore);
        };
        next.addEventListener("loadedmetadata", restore);
      }, 60);
    },
    [media.mediaRef],
  );

  // A new episode always starts on the cheap path.
  useEffect(() => {
    setCaptureModeState(false);
    setCaptureFailed(false);
    lastTimeRef.current = 0;
  }, [track?.id]);

  /**
   * Playback matters more than captions. If the proxied source will not load -
   * a CDN that refuses our server, a redirect we cannot follow, a timeout - the
   * element falls straight back to the publisher's URL. The user keeps the
   * episode and loses only the in-page transcription, which is the right way
   * round.
   */
  const captureFailedRef = useRef(false);
  const [captureFailed, setCaptureFailed] = useState(false);
  useEffect(() => {
    if (!captureMode) {
      captureFailedRef.current = false;
      return;
    }
    if (!media.state.error || captureFailedRef.current) return;
    captureFailedRef.current = true;
    setCaptureFailed(true);
    setCaptureMode(false);
    // The proxied element never played, so nothing above knows it should.
    window.setTimeout(() => void media.mediaRef.current?.play().catch(() => undefined), 300);
  }, [captureMode, media.state.error, setCaptureMode, media.mediaRef]);

  /**
   * Keeps the video layer glued to the stage rectangle. A rAF loop rather than
   * a ResizeObserver because the stage also moves when the page scrolls, and
   * scroll plus resize plus layout shifts is exactly the set of events a plain
   * position read handles without a case for each.
   */
  useEffect(() => {
    if (!layerRef.current) return;
    let frame = 0;
    let lastKey = "";

    function tick() {
      frame = requestAnimationFrame(tick);
      const layer = layerRef.current;
      if (!layer) return;

      if (stage && document.contains(stage)) {
        const rect = stage.getBoundingClientRect();
        const key = `${Math.round(rect.top)}:${Math.round(rect.left)}:${Math.round(rect.width)}:${Math.round(rect.height)}`;
        if (key === lastKey) return;
        lastKey = key;
        layer.style.top = `${rect.top}px`;
        layer.style.left = `${rect.left}px`;
        layer.style.width = `${rect.width}px`;
        layer.style.height = `${rect.height}px`;
        layer.style.borderRadius = "12px";
        layer.style.opacity = "1";
        layer.style.pointerEvents = "auto";
      } else {
        const key = "mini";
        if (key === lastKey) return;
        lastKey = key;
        // Docked in the mini bar: small, bottom left, still playing.
        layer.style.top = "auto";
        layer.style.bottom = "14px";
        layer.style.left = "14px";
        layer.style.width = "104px";
        layer.style.height = "58px";
        layer.style.borderRadius = "8px";
        layer.style.opacity = "1";
        layer.style.pointerEvents = "auto";
      }
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [stage]);

  const value = useMemo<PlayerContextValue>(
    () => ({
      track,
      play,
      stop,
      handle,
      mediaState: media.state,
      retry: media.retry,
      src: media.src,
      youtubeUnavailable: youtube.unavailable,
      setStage,
      mediaElement: () => media.mediaRef.current,
      captureMode,
      setCaptureMode,
      captureFailed,
      videoLayer,
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
      youtube.unavailable,
      setStage,
      captureMode,
      setCaptureMode,
      captureFailed,
      videoLayer,
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
          onTimeUpdate={rememberTime}
          // Only meaningful in capture mode, where the source is same-origin;
          // setting it on a cross-origin CDN stream is what broke playback once.
          crossOrigin={captureMode ? "anonymous" : undefined}
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
            onTimeUpdate={rememberTime}
            crossOrigin={captureMode ? "anonymous" : undefined}
            className="h-full w-full object-contain"
          />
        </div>
      ) : null}

      {track && track.kind === "youtube" ? (
        <div
          ref={attachLayer}
          className="fixed z-[60] overflow-hidden bg-black shadow-lg"
          style={{ top: 0, left: 0, width: 0, height: 0 }}
        >
          <div ref={youtube.containerRef} className="h-full w-full [&_iframe]:h-full [&_iframe]:w-full" />
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
