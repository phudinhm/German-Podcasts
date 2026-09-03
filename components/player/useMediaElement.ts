"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PlayerHandle } from "./types";

export interface MediaElementState {
  ready: boolean;
  duration: number;
  /** Seconds buffered ahead of the playhead, for the transport bar. */
  buffered: number;
  /** True between a seek or src change and the first playable frame. */
  loading: boolean;
  error: string | null;
}

/**
 * Adapter for a real streaming <audio> or <video> element.
 *
 * `preservesPitch` is the line that matters for language learning: without it a
 * 0.75x replay drops every vowel by a fourth, which teaches the wrong sound.
 * The rest is stream plumbing - buffering state, network errors, and a duration
 * that only becomes known once the server answers.
 */
export function useMediaElement(src: string | null): {
  handle: PlayerHandle;
  mediaRef: React.RefObject<HTMLMediaElement | null>;
  state: MediaElementState;
  retry: () => void;
} {
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const readyRef = useRef(false);
  const [state, setState] = useState<MediaElementState>({
    ready: false,
    duration: 0,
    buffered: 0,
    loading: Boolean(src),
    error: null,
  });

  useEffect(() => {
    const media = mediaRef.current;
    readyRef.current = false;
    if (!media || !src) {
      setState({ ready: false, duration: 0, buffered: 0, loading: false, error: null });
      return;
    }

    setState((prev) => ({ ...prev, ready: false, loading: true, error: null }));
    media.preservesPitch = true;

    function onLoadedMetadata() {
      readyRef.current = true;
      setState((prev) => ({
        ...prev,
        ready: true,
        loading: false,
        duration: Number.isFinite(media!.duration) ? media!.duration : 0,
      }));
    }
    function onProgress() {
      if (!media) return;
      const ranges = media.buffered;
      let ahead = 0;
      for (let i = 0; i < ranges.length; i += 1) {
        if (media.currentTime >= ranges.start(i) && media.currentTime <= ranges.end(i)) {
          ahead = ranges.end(i);
          break;
        }
        if (ranges.start(i) > media.currentTime) {
          ahead = Math.max(ahead, ranges.end(i));
        }
      }
      setState((prev) => (Math.abs(prev.buffered - ahead) < 0.25 ? prev : { ...prev, buffered: ahead }));
    }
    function onWaiting() {
      setState((prev) => ({ ...prev, loading: true }));
    }
    function onPlaying() {
      setState((prev) => ({ ...prev, loading: false, error: null }));
    }
    function onError() {
      const code = media?.error?.code;
      const message =
        code === MediaError.MEDIA_ERR_NETWORK
          ? "Netzwerkfehler beim Streamen. Verbindung prüfen und erneut versuchen."
          : code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
            ? "Dieser Stream lässt sich im Browser nicht abspielen. Die URL zeigt vielleicht auf eine Seite statt auf eine Mediendatei, oder das Format wird nicht unterstützt."
            : code === MediaError.MEDIA_ERR_DECODE
              ? "Der Stream ist beschädigt oder wird nicht unterstützt."
              : "Der Stream konnte nicht geladen werden.";
      readyRef.current = false;
      setState((prev) => ({ ...prev, ready: false, loading: false, error: message }));
    }
    function onDurationChange() {
      if (!media) return;
      setState((prev) => ({
        ...prev,
        duration: Number.isFinite(media.duration) ? media.duration : prev.duration,
      }));
    }

    media.addEventListener("loadedmetadata", onLoadedMetadata);
    media.addEventListener("durationchange", onDurationChange);
    media.addEventListener("progress", onProgress);
    media.addEventListener("waiting", onWaiting);
    media.addEventListener("playing", onPlaying);
    media.addEventListener("canplay", onPlaying);
    media.addEventListener("error", onError);
    if (media.readyState >= 1) onLoadedMetadata();

    return () => {
      media.removeEventListener("loadedmetadata", onLoadedMetadata);
      media.removeEventListener("durationchange", onDurationChange);
      media.removeEventListener("progress", onProgress);
      media.removeEventListener("waiting", onWaiting);
      media.removeEventListener("playing", onPlaying);
      media.removeEventListener("canplay", onPlaying);
      media.removeEventListener("error", onError);
    };
  }, [src]);

  const retry = useCallback(() => {
    const media = mediaRef.current;
    if (!media) return;
    setState((prev) => ({ ...prev, error: null, loading: true }));
    media.load();
  }, []);

  const handleRef = useRef<PlayerHandle>({
    play: () => void mediaRef.current?.play().catch(() => undefined),
    pause: () => mediaRef.current?.pause(),
    seekTo: (seconds) => {
      const media = mediaRef.current;
      if (!media) return;
      // Seeking past what the server has told us about throws in some browsers.
      const limit = Number.isFinite(media.duration) ? media.duration : Number.MAX_SAFE_INTEGER;
      media.currentTime = Math.max(0, Math.min(seconds, limit));
    },
    setRate: (rate) => {
      const media = mediaRef.current;
      if (!media) return;
      media.preservesPitch = true;
      media.playbackRate = rate;
    },
    setMuted: (muted) => {
      if (mediaRef.current) mediaRef.current.muted = muted;
    },
    getTime: () => mediaRef.current?.currentTime ?? 0,
    getDuration: () => {
      const duration = mediaRef.current?.duration;
      return Number.isFinite(duration) ? (duration as number) : 0;
    },
    isPlaying: () => Boolean(mediaRef.current && !mediaRef.current.paused && !mediaRef.current.ended),
    isReady: () => readyRef.current,
  });

  return { handle: handleRef.current, mediaRef, state, retry };
}
