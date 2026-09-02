"use client";

import { useEffect, useRef, useState } from "react";
import type { PlayerHandle } from "./types";

/**
 * HTML5 audio adapter. `preservesPitch` is the important line: without it a
 * 0.75x replay drops every vowel by a fourth, which teaches the wrong sound.
 */
export function useAudio(src: string | null): {
  handle: PlayerHandle;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  ready: boolean;
} {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const readyRef = useRef(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !src) return;

    function onReady() {
      readyRef.current = true;
      setReady(true);
    }
    audio.addEventListener("loadedmetadata", onReady);
    audio.preservesPitch = true;
    if (audio.readyState >= 1) onReady();

    return () => {
      audio.removeEventListener("loadedmetadata", onReady);
      readyRef.current = false;
      setReady(false);
    };
  }, [src]);

  const handleRef = useRef<PlayerHandle>({
    play: () => void audioRef.current?.play().catch(() => undefined),
    pause: () => audioRef.current?.pause(),
    seekTo: (seconds) => {
      if (audioRef.current) audioRef.current.currentTime = seconds;
    },
    setRate: (rate) => {
      if (audioRef.current) {
        audioRef.current.preservesPitch = true;
        audioRef.current.playbackRate = rate;
      }
    },
    setMuted: (muted) => {
      if (audioRef.current) audioRef.current.muted = muted;
    },
    getTime: () => audioRef.current?.currentTime ?? 0,
    getDuration: () => audioRef.current?.duration ?? 0,
    isPlaying: () => Boolean(audioRef.current && !audioRef.current.paused),
    isReady: () => readyRef.current,
  });

  return { handle: handleRef.current, audioRef, ready };
}
