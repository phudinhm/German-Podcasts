"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Segment } from "@/lib/types";
import type { PlayerHandle } from "./types";

export type ShadowMode = "free" | "loop" | "echo";

export interface ShadowOptions {
  mode: ShadowMode;
  /** Repetitions per sentence before the engine moves on. 0 means infinite. */
  loopCount: number;
  /** Silent gap length as a multiple of the sentence duration. */
  echoGapFactor: number;
  /** Playback rate for repetition 1, 2, 3, ... The last value repeats. */
  tempoRamp: number[];
  /** Base rate used in free playback. */
  baseRate: number;
  /** Advance to the next sentence when the repetitions are done. */
  autoAdvance: boolean;
}

export interface ShadowState {
  /** Index into `segments`, or -1 before playback reaches the first one. */
  activeIndex: number;
  /** Index into the active segment's word list, or -1. */
  activeWordIndex: number;
  playing: boolean;
  /** What the engine is doing right now, for the status line. */
  phase: "idle" | "listen" | "gap";
  /** Completed repetitions of the focused sentence. */
  iteration: number;
  /** Milliseconds left in the speaking gap, for the countdown ring. */
  gapRemaining: number;
  currentRate: number;
}

const EPSILON = 0.04;

function findSegmentIndex(segments: Segment[], time: number, hint: number): number {
  // The common case is "same segment as last frame" or "the next one".
  if (hint >= 0 && hint < segments.length) {
    const current = segments[hint];
    if (time >= current.start && time < current.end) return hint;
    const next = segments[hint + 1];
    if (next && time >= next.start && time < next.end) return hint + 1;
  }
  let low = 0;
  let high = segments.length - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const segment = segments[mid];
    if (time < segment.start) high = mid - 1;
    else if (time >= segment.end) low = mid + 1;
    else return mid;
  }
  // Between two sentences: stay on the one we just left, so the highlight does
  // not flicker off during a pause.
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    if (time >= segments[i].start) {
      found = i;
      break;
    }
  }
  return found;
}

function findWordIndex(segment: Segment | undefined, time: number): number {
  if (!segment?.words?.length) return -1;
  const words = segment.words;
  let low = 0;
  let high = words.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (time < words[mid].s) high = mid - 1;
    else if (time >= words[mid].e) low = mid + 1;
    else return mid;
  }
  return Math.min(words.length - 1, Math.max(-1, high));
}

/**
 * Drives playback against the transcript.
 *
 * One requestAnimationFrame loop reads the player clock, resolves the active
 * sentence and word, and runs the repetition state machine. State is only
 * pushed into React when the sentence or word actually changes, so a 60 Hz loop
 * does not cause 60 renders a second: the transcript re-renders a handful of
 * times per sentence instead.
 */
export function useShadowEngine(
  handle: PlayerHandle,
  segments: Segment[],
  options: ShadowOptions,
) {
  const [state, setState] = useState<ShadowState>({
    activeIndex: -1,
    activeWordIndex: -1,
    playing: false,
    phase: "idle",
    iteration: 0,
    gapRemaining: 0,
    currentRate: options.baseRate,
  });

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const focusRef = useRef<number>(-1);
  const iterationRef = useRef(0);
  const phaseRef = useRef<"idle" | "listen" | "gap">("idle");
  const gapUntilRef = useRef(0);
  const timeRef = useRef(0);
  const progressRef = useRef<HTMLElement | null>(null);

  const rateFor = useCallback((iteration: number): number => {
    const { mode, tempoRamp, baseRate } = optionsRef.current;
    if (mode === "free" || tempoRamp.length === 0) return baseRate;
    return tempoRamp[Math.min(iteration, tempoRamp.length - 1)];
  }, []);

  /** Focus a sentence: seek to it and reset the repetition counter. */
  const focusSegment = useCallback(
    (index: number, autoplay = true) => {
      const segment = segments[index];
      if (!segment) return;
      focusRef.current = index;
      iterationRef.current = 0;
      phaseRef.current = "listen";
      gapUntilRef.current = 0;
      handle.setRate(rateFor(0));
      handle.seekTo(segment.start, true);
      handle.setMuted(false);
      if (autoplay) handle.play();
      setState((prev) => ({
        ...prev,
        activeIndex: index,
        activeWordIndex: -1,
        iteration: 0,
        phase: "listen",
        currentRate: rateFor(0),
      }));
    },
    [handle, rateFor, segments],
  );

  const clearFocus = useCallback(() => {
    focusRef.current = -1;
    iterationRef.current = 0;
    phaseRef.current = "idle";
    handle.setMuted(false);
    handle.setRate(optionsRef.current.baseRate);
  }, [handle]);

  useEffect(() => {
    let frame = 0;
    let lastIndex = -1;
    let lastWord = -1;
    let lastPlaying = false;
    let lastPhase: ShadowState["phase"] = "idle";
    let lastIteration = 0;

    function tick() {
      frame = requestAnimationFrame(tick);
      const opts = optionsRef.current;
      const now = performance.now();

      if (phaseRef.current === "gap") {
        const remaining = Math.max(0, gapUntilRef.current - now);
        if (progressRef.current) {
          progressRef.current.style.setProperty("--gap", String(remaining));
        }
        if (remaining <= 0) {
          const segment = segments[focusRef.current];
          if (segment) {
            handle.setMuted(false);
            handle.setRate(rateFor(iterationRef.current));
            handle.seekTo(segment.start, true);
            handle.play();
          }
          phaseRef.current = "listen";
        }
        if (lastPhase !== phaseRef.current || Math.abs(remaining - lastIteration) > 100) {
          setState((prev) => ({ ...prev, phase: phaseRef.current, gapRemaining: remaining }));
          lastPhase = phaseRef.current;
          lastIteration = remaining;
        }
        return;
      }

      const time = handle.getTime();
      timeRef.current = time;
      const playing = handle.isPlaying();

      const focus = focusRef.current;
      const focused = focus >= 0 ? segments[focus] : undefined;

      if (focused && opts.mode !== "free" && time >= focused.end - EPSILON) {
        iterationRef.current += 1;
        const done = opts.loopCount > 0 && iterationRef.current >= opts.loopCount;

        if (opts.mode === "echo") {
          // Mute and hold for a gap proportional to the sentence, so there is
          // room to say it back without racing the next line.
          const duration = (focused.end - focused.start) / Math.max(0.25, rateFor(iterationRef.current - 1));
          handle.pause();
          handle.setMuted(true);
          gapUntilRef.current = now + duration * opts.echoGapFactor * 1000;
          phaseRef.current = done && !opts.autoAdvance ? "idle" : "gap";
          if (done) {
            if (opts.autoAdvance && segments[focus + 1]) {
              focusSegment(focus + 1);
              return;
            }
            iterationRef.current = 0;
          }
          setState((prev) => ({
            ...prev,
            phase: phaseRef.current,
            iteration: iterationRef.current,
            playing: false,
          }));
          return;
        }

        if (!done) {
          handle.setRate(rateFor(iterationRef.current));
          handle.seekTo(focused.start, true);
          handle.play();
          setState((prev) => ({
            ...prev,
            iteration: iterationRef.current,
            currentRate: rateFor(iterationRef.current),
          }));
          return;
        }
        if (opts.autoAdvance && segments[focus + 1]) {
          focusSegment(focus + 1);
          return;
        }
        handle.pause();
        clearFocus();
        setState((prev) => ({ ...prev, phase: "idle", iteration: 0, playing: false }));
        return;
      }

      const index = findSegmentIndex(segments, time, lastIndex);
      const wordIndex = findWordIndex(segments[index], time);

      if (progressRef.current && segments[index]) {
        const segment = segments[index];
        const ratio = Math.min(1, Math.max(0, (time - segment.start) / (segment.end - segment.start)));
        progressRef.current.style.setProperty("--progress", ratio.toFixed(4));
      }

      if (index !== lastIndex || wordIndex !== lastWord || playing !== lastPlaying) {
        lastIndex = index;
        lastWord = wordIndex;
        lastPlaying = playing;
        setState((prev) => ({
          ...prev,
          activeIndex: index,
          activeWordIndex: wordIndex,
          playing,
        }));
      }
    }

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [handle, segments, rateFor, focusSegment, clearFocus]);

  const getTime = useCallback(() => timeRef.current, []);

  return { state, focusSegment, clearFocus, getTime, progressRef, focusRef };
}
