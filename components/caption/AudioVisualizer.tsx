"use client";

import { useEffect, useRef } from "react";
import { liveCaptionService, type AudioVisualizerData } from "@/lib/liveCaption";
import { sampleRealAudioSpectrum } from "@/lib/audioAnalyzer";
import { usePlayer } from "../player/PlayerProvider";

export function AudioVisualizer({
  isPlaying = false,
  barCount = 6,
}: {
  isPlaying?: boolean;
  barCount?: number;
}) {
  const { mediaElement, track, duration } = usePlayer();
  const barRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const smoothedRef = useRef<Float32Array>(new Float32Array(barCount).fill(12));
  const liveMicDataRef = useRef<AudioVisualizerData | null>(null);

  useEffect(() => {
    if (smoothedRef.current.length !== barCount) {
      smoothedRef.current = new Float32Array(barCount).fill(12);
    }
  }, [barCount]);

  useEffect(() => {
    const unsub = liveCaptionService.onVisualizer((newData) => {
      liveMicDataRef.current = newData;
    });
    return unsub;
  }, []);

  useEffect(() => {
    let rafId = 0;

    const tick = () => {
      rafId = requestAnimationFrame(tick);
      const currentBars = smoothedRef.current;
      const mediaEl = mediaElement();
      const actuallyPlaying =
        isPlaying || Boolean(mediaEl && !mediaEl.paused && !mediaEl.ended);

      let targets: number[];

      // 1. If microphone/system capture has live FFT data with energy, use it
      const mic = liveMicDataRef.current;
      if (actuallyPlaying && mic && mic.frequencies.length > 0 && mic.volume > 0.01) {
        targets = Array.from({ length: barCount }, (_, i) => {
          const idx = Math.floor((i / barCount) * Math.min(48, mic.frequencies.length));
          const val = mic.frequencies[idx] ?? 0;
          return Math.max(12, Math.min(100, Math.round(12 + (val / 255) * 88)));
        });
      } else if (actuallyPlaying) {
        // 2. Sample real decoded PCM multi-band spectrum / hardware AnalyserNode / phonetic envelope at mediaEl.currentTime
        targets = sampleRealAudioSpectrum(
          mediaEl,
          track?.url,
          duration || (mediaEl?.duration ?? 0),
          barCount
        );
      } else {
        targets = Array.from({ length: barCount }, () => 12);
      }

      // Apply asymmetric attack/release smoothing (snappy attack when syllable hits, smooth decay on silence)
      for (let i = 0; i < barCount; i++) {
        const prev = currentBars[i] ?? 12;
        const target = targets[i] ?? 12;
        const alpha = target > prev ? 0.62 : 0.24;
        const next = prev + (target - prev) * alpha;
        currentBars[i] = next;

        const el = barRefs.current[i];
        if (el) {
          const clamped = Math.max(12, Math.min(100, next));
          el.style.height = `${clamped.toFixed(1)}%`;
          el.style.opacity = actuallyPlaying
            ? (0.68 + (clamped / 100) * 0.32).toFixed(2)
            : "0.32";
        }
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, barCount, mediaElement, track?.url, duration]);

  return (
    <div
      className="flex h-5 items-center gap-[2.5px] px-1 select-none"
      title="Real-Time Audio Spectrum"
      aria-hidden
    >
      {Array.from({ length: barCount }, (_, idx) => (
        <span
          key={idx}
          ref={(el) => {
            barRefs.current[idx] = el;
          }}
          className="inline-block w-[2.5px] rounded-full bg-[var(--accent)] will-change-[height,opacity]"
          style={{
            height: "12%",
            opacity: isPlaying ? 0.85 : 0.32,
          }}
        />
      ))}
    </div>
  );
}
