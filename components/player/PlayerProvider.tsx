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

  const isYouTube = track?.kind === "youtube";
  const media = useMediaElement(isYouTube ? null : (track?.url ?? null));
  const youtube = useYouTube(track?.youtubeId ?? null);

  const handle = isYouTube ? youtube.handle : track ? media.handle : NOOP_PLAYER;

  const layerRef = useRef<HTMLDivElement | null>(null);

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
    }),
    [track, play, stop, handle, media.state, media.retry, media.src, youtube.unavailable, setStage],
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
          ref={layerRef}
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

      {track && track.kind === "youtube" ? (
        <div
          ref={layerRef}
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
