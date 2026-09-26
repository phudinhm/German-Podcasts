"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Stages a conditionally-rendered t-dropdown / t-modal / t-panel-slide
 * element through mount -> entered so a CSS transition has a pre-open frame
 * to animate from (a React state flipping true->true-with-.is-open in one
 * render gives the browser nothing to transition across), and keeps the
 * element mounted for one close-duration after `open` goes false so the
 * closing transition can play out before it leaves the DOM.
 */
export function useTransitionStage(open: boolean, closeDurVar: string, fallbackMs = 150) {
  const [mounted, setMounted] = useState(false);
  const [entered, setEntered] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (open) {
      window.clearTimeout(closeTimerRef.current);
      setMounted(true);
      setEntered(false);
      const raf = requestAnimationFrame(() => setEntered(true));
      return () => cancelAnimationFrame(raf);
    }
    setEntered(false);
    const closeDur =
      parseFloat(getComputedStyle(document.documentElement).getPropertyValue(closeDurVar)) || fallbackMs;
    closeTimerRef.current = setTimeout(() => setMounted(false), closeDur);
    return () => window.clearTimeout(closeTimerRef.current);
  }, [open, closeDurVar, fallbackMs]);

  return { mounted, entered };
}
