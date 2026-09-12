"use client";

import { useEffect, useState } from "react";
import { liveCaptionService, type AudioVisualizerData } from "@/lib/liveCaption";

export function AudioVisualizer({ isPlaying = false, barCount = 12 }: { isPlaying?: boolean; barCount?: number }) {
  const [data, setData] = useState<AudioVisualizerData | null>(null);

  useEffect(() => {
    const unsub = liveCaptionService.onVisualizer((newData) => {
      setData(newData);
    });
    return unsub;
  }, []);

  // Compute height for each bar based on frequencies or animated wave
  const bars = Array.from({ length: barCount }, (_, i) => {
    if (!isPlaying) return 15;
    if (data && data.frequencies.length > 0) {
      const idx = Math.floor((i / barCount) * data.frequencies.length);
      const val = data.frequencies[idx] ?? 0;
      return Math.max(15, Math.min(100, Math.round((val / 255) * 100)));
    }
    // Animated fallback when playing
    return Math.max(20, Math.min(95, Math.sin(Date.now() / 200 + i * 0.7) * 40 + 55));
  });

  return (
    <div className="flex h-5 items-center gap-[2.5px] px-1" title="Live Audio Visualizer">
      {bars.map((height, idx) => (
        <span
          key={idx}
          className="inline-block w-[2.5px] rounded-full bg-[var(--accent)] transition-all duration-100 ease-out"
          style={{
            height: `${height}%`,
            opacity: isPlaying ? 0.85 + (height / 100) * 0.15 : 0.3,
          }}
        />
      ))}
    </div>
  );
}
