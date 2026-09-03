"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { canReadDirectly } from "@/lib/audio/capture";
import { proxied } from "@/lib/audio/proxy";
import type { PlayerHandle } from "../player/types";

export type CaptureRoute = "direct" | "proxy";

/**
 * A second, silent copy of the episode, for the transcriber to read.
 *
 * The first version of this swapped the source of the element the listener was
 * actually hearing, which meant a transcription feature could interrupt
 * playback - and did, whenever the passthrough had any trouble at all. That is
 * the wrong way round: the episode is the product, captions are a help.
 *
 * So capture gets its own hidden element. It is muted, it shadows the real
 * playhead, and if it fails nothing audible changes. It is pointed at the
 * publisher directly whenever the CDN sends CORS headers, which costs the
 * server nothing, and at the passthrough only when the direct read is refused.
 */
export function useCaptureElement(handle: PlayerHandle) {
  const elementRef = useRef<HTMLAudioElement | null>(null);
  const syncRef = useRef<number | null>(null);
  const [route, setRoute] = useState<CaptureRoute | null>(null);

  const release = useCallback(() => {
    if (syncRef.current !== null) {
      window.clearInterval(syncRef.current);
      syncRef.current = null;
    }
    const element = elementRef.current;
    if (element) {
      element.pause();
      element.removeAttribute("src");
      element.load();
      element.remove();
    }
    elementRef.current = null;
    setRoute(null);
  }, []);

  /**
   * Builds the shadow element and waits until it can actually play. Resolves
   * null when neither route works, which is a real answer rather than an
   * error: the microphone path is still there.
   */
  const acquire = useCallback(
    async (url: string): Promise<{ element: HTMLMediaElement; route: CaptureRoute } | null> => {
      release();

      const direct = await canReadDirectly(url);
      const chosen: CaptureRoute = direct ? "direct" : "proxy";
      const src = direct ? url : proxied(url);

      const element = document.createElement("audio");
      element.crossOrigin = "anonymous";
      element.preload = "auto";
      // Muted only until the audio graph takes it over: between creating this
      // element and tapping it, an unmuted copy would play the episode twice.
      element.muted = true;
      element.volume = 0;
      element.src = src;
      element.style.display = "none";
      document.body.appendChild(element);
      elementRef.current = element;

      const ready = await new Promise<boolean>((resolve) => {
        const done = (value: boolean) => {
          element.removeEventListener("loadedmetadata", onReady);
          element.removeEventListener("error", onError);
          window.clearTimeout(timer);
          resolve(value);
        };
        const onReady = () => done(true);
        const onError = () => done(false);
        const timer = window.setTimeout(() => done(false), 15_000);
        element.addEventListener("loadedmetadata", onReady);
        element.addEventListener("error", onError);
        element.load();
      });

      if (!ready) {
        release();
        return null;
      }

      // Follow the real playhead. A second of drift is inaudible to the
      // listener but puts a caption on the wrong sentence, so it is corrected
      // rather than tolerated.
      const follow = () => {
        const media = elementRef.current;
        if (!media) return;
        const target = handle.getTime();
        if (Math.abs(media.currentTime - target) > 0.7) {
          try {
            media.currentTime = target;
          } catch {
            // Seeking before enough is buffered simply fails; the next tick retries.
          }
        }
        if (media.paused) void media.play().catch(() => undefined);
      };

      try {
        element.currentTime = handle.getTime();
      } catch {
        // Corrected on the first tick.
      }
      await element.play().catch(() => undefined);
      syncRef.current = window.setInterval(follow, 1000);

      setRoute(chosen);
      return { element, route: chosen };
    },
    [handle, release],
  );

  // Memoised so a consumer can depend on these without their own callbacks
  // changing identity on every render.
  return useMemo(() => ({ acquire, release, route }), [acquire, release, route]);
}
