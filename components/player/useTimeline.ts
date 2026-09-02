"use client";

import { useRef } from "react";
import type { PlayerHandle } from "./types";

/**
 * A player with no media behind it: a monotonic clock over the transcript
 * timeline.
 *
 * This exists so a curated episode is usable the moment its transcript is
 * written, before anyone has attached a recording. Every sync, loop, drill and
 * hotkey path runs against the same handle interface, so nothing downstream has
 * to know whether there is audio or not.
 */
export function useTimeline(duration: number): { handle: PlayerHandle } {
  const state = useRef({ base: 0, startedAt: 0, playing: false, rate: 1 });

  const handleRef = useRef<PlayerHandle>({
    play: () => {
      if (state.current.playing) return;
      state.current.startedAt = performance.now();
      state.current.playing = true;
    },
    pause: () => {
      if (!state.current.playing) return;
      state.current.base +=
        ((performance.now() - state.current.startedAt) / 1000) * state.current.rate;
      state.current.playing = false;
    },
    seekTo: (seconds) => {
      state.current.base = Math.max(0, seconds);
      state.current.startedAt = performance.now();
    },
    setRate: (rate) => {
      // Fold the elapsed time in at the old rate before switching.
      if (state.current.playing) {
        state.current.base +=
          ((performance.now() - state.current.startedAt) / 1000) * state.current.rate;
        state.current.startedAt = performance.now();
      }
      state.current.rate = rate;
    },
    setMuted: () => {},
    getTime: () => {
      if (!state.current.playing) return state.current.base;
      const elapsed = ((performance.now() - state.current.startedAt) / 1000) * state.current.rate;
      return Math.min(duration, state.current.base + elapsed);
    },
    getDuration: () => duration,
    isPlaying: () => state.current.playing,
    isReady: () => true,
  });

  return { handle: handleRef.current };
}
