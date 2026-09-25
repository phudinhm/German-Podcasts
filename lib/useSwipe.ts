"use client";

import { useRef, type TouchEventHandler } from "react";

export interface SwipeOptions {
  /** Minimum distance in px to trigger a swipe (default: 52). */
  threshold?: number;
  /** Maximum time in ms for a swipe gesture (default: 750). */
  maxDurationMs?: number;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  onDragMove?: (dx: number, dy: number) => void;
  onDragEnd?: () => void;
}

function isInsideHorizontalScrollable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  let el: HTMLElement | null = target;
  while (el && el !== document.body) {
    if (
      el.tagName === "INPUT" ||
      el.tagName === "TEXTAREA" ||
      el.tagName === "SELECT" ||
      el.hasAttribute("data-no-swipe") ||
      el.classList.contains("scroll-row")
    ) {
      return true;
    }
    const style = window.getComputedStyle(el);
    if (
      (style.overflowX === "auto" || style.overflowX === "scroll") &&
      el.scrollWidth > el.clientWidth + 8
    ) {
      return true;
    }
    el = el.parentElement;
  }
  return false;
}

/**
 * Lightweight, zero-dependency touch swipe hook for mobile & tablet gestures.
 * Safely ignores horizontal carousels (.scroll-row) and form inputs (<input>, range sliders).
 */
export function useSwipe(options: SwipeOptions) {
  const threshold = options.threshold ?? 52;
  const maxDurationMs = options.maxDurationMs ?? 750;

  const stateRef = useRef<{
    startX: number;
    startY: number;
    startTime: number;
    ignoreHorizontal: boolean;
    active: boolean;
  } | null>(null);

  const onTouchStart: TouchEventHandler<HTMLElement> = (e) => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    stateRef.current = {
      startX: t.clientX,
      startY: t.clientY,
      startTime: Date.now(),
      ignoreHorizontal: isInsideHorizontalScrollable(e.target),
      active: true,
    };
  };

  const onTouchMove: TouchEventHandler<HTMLElement> = (e) => {
    const st = stateRef.current;
    if (!st || !st.active || e.touches.length !== 1) return;
    if (options.onDragMove) {
      const t = e.touches[0];
      options.onDragMove(t.clientX - st.startX, t.clientY - st.startY);
    }
  };

  const onTouchEnd: TouchEventHandler<HTMLElement> = (e) => {
    const st = stateRef.current;
    stateRef.current = null;
    options.onDragEnd?.();
    if (!st || !st.active || e.changedTouches.length === 0) return;

    const elapsed = Date.now() - st.startTime;
    if (elapsed > maxDurationMs) return;

    const t = e.changedTouches[0];
    const dx = t.clientX - st.startX;
    const dy = t.clientY - st.startY;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    if (absX > absY * 1.25 && absX >= threshold) {
      if (st.ignoreHorizontal) return;
      if (dx < 0) {
        options.onSwipeLeft?.();
      } else {
        options.onSwipeRight?.();
      }
      return;
    }

    if (absY > absX * 1.25 && absY >= threshold) {
      if (dy < 0) {
        options.onSwipeUp?.();
      } else {
        options.onSwipeDown?.();
      }
    }
  };

  const onTouchCancel: TouchEventHandler<HTMLElement> = () => {
    stateRef.current = null;
    options.onDragEnd?.();
  };

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onTouchCancel,
  };
}
