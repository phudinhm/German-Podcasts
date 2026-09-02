"use client";

import { useEffect, useRef, useState } from "react";
import type { PlayerHandle } from "./types";

/** Minimal shape of the bits of the IFrame API we actually call. */
interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  setPlaybackRate(rate: number): void;
  mute(): void;
  unMute(): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  destroy(): void;
}

declare global {
  interface Window {
    YT?: {
      Player: new (element: HTMLElement | string, options: unknown) => YTPlayer;
      PlayerState: { PLAYING: number };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

const API_SRC = "https://www.youtube.com/iframe_api";
let apiPromise: Promise<void> | null = null;

function loadApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  if (apiPromise) return apiPromise;

  apiPromise = new Promise<void>((resolve) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve();
    };
    if (!document.querySelector(`script[src="${API_SRC}"]`)) {
      const script = document.createElement("script");
      script.src = API_SRC;
      script.async = true;
      document.head.appendChild(script);
    }
  });
  return apiPromise;
}

/**
 * Wraps the YouTube IFrame Player API. The handle is stable across renders, so
 * the synchronisation loop can hold on to it without re-subscribing.
 */
export function useYouTube(videoId: string | null): {
  handle: PlayerHandle;
  containerRef: React.RefObject<HTMLDivElement | null>;
  ready: boolean;
} {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const readyRef = useRef(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!videoId || !containerRef.current) return;
    let cancelled = false;
    const mount = containerRef.current;

    loadApi().then(() => {
      if (cancelled || !window.YT?.Player) return;
      const host = document.createElement("div");
      mount.replaceChildren(host);

      playerRef.current = new window.YT.Player(host, {
        videoId,
        playerVars: {
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          cc_load_policy: 0,
        },
        events: {
          onReady: () => {
            if (cancelled) return;
            readyRef.current = true;
            setReady(true);
          },
        },
      });
    });

    return () => {
      cancelled = true;
      readyRef.current = false;
      setReady(false);
      try {
        playerRef.current?.destroy();
      } catch {
        // The iframe may already be gone during a fast route change.
      }
      playerRef.current = null;
    };
  }, [videoId]);

  const handleRef = useRef<PlayerHandle>({
    play: () => playerRef.current?.playVideo(),
    pause: () => playerRef.current?.pauseVideo(),
    seekTo: (seconds, allowSeekAhead = true) => playerRef.current?.seekTo(seconds, allowSeekAhead),
    setRate: (rate) => playerRef.current?.setPlaybackRate(rate),
    setMuted: (muted) => (muted ? playerRef.current?.mute() : playerRef.current?.unMute()),
    getTime: () => playerRef.current?.getCurrentTime() ?? 0,
    getDuration: () => playerRef.current?.getDuration() ?? 0,
    isPlaying: () => playerRef.current?.getPlayerState() === 1,
    isReady: () => readyRef.current,
  });

  return { handle: handleRef.current, containerRef, ready };
}
