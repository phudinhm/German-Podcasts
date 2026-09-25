"use client";

import { useRef, useState, type TouchEventHandler } from "react";

export interface SwipeOptions {
  /** Minimum distance in px to trigger a swipe (default: 48). */
  threshold?: number;
  /** Minimum velocity in px/ms to trigger a fast flick swipe even below distance threshold (default: 0.42). */
  velocityThreshold?: number;
  /** Maximum time in ms for a swipe gesture (default: 800). */
  maxDurationMs?: number;
  /** Track live horizontal/vertical drag state for iOS 1:1 finger following. */
  trackDrag?: boolean;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  onDragMove?: (dx: number, dy: number, isEdge: boolean) => void;
  onDragEnd?: (dx: number, dy: number, vx: number, vy: number) => void;
}

function triggerLightHaptic() {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(8);
    }
  } catch {
    // Ignore on unsupported devices
  }
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
 * iOS-grade touch gesture hook with velocity flick detection, edge-swipe recognition,
 * rubber-band damping, and 1:1 interactive finger tracking.
 */
export function useSwipe(options: SwipeOptions) {
  const threshold = options.threshold ?? 48;
  const velocityThreshold = options.velocityThreshold ?? 0.42;
  const maxDurationMs = options.maxDurationMs ?? 800;

  const [drag, setDrag] = useState<{ x: number; y: number; active: boolean; isEdge: boolean }>({
    x: 0,
    y: 0,
    active: false,
    isEdge: false,
  });

  const stateRef = useRef<{
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    startTime: number;
    ignoreHorizontal: boolean;
    isEdge: boolean;
    lockedAxis: "x" | "y" | null;
    active: boolean;
  } | null>(null);

  const onTouchStart: TouchEventHandler<HTMLElement> = (e) => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    const isEdge = t.clientX <= 36 || t.clientX >= window.innerWidth - 36;
    stateRef.current = {
      startX: t.clientX,
      startY: t.clientY,
      lastX: t.clientX,
      lastY: t.clientY,
      startTime: performance.now(),
      ignoreHorizontal: !isEdge && isInsideHorizontalScrollable(e.target),
      isEdge,
      lockedAxis: null,
      active: true,
    };
    if (options.trackDrag) {
      setDrag({ x: 0, y: 0, active: true, isEdge });
    }
  };

  const onTouchMove: TouchEventHandler<HTMLElement> = (e) => {
    const st = stateRef.current;
    if (!st || !st.active || e.touches.length !== 1) return;
    const t = e.touches[0];
    const dx = t.clientX - st.startX;
    const dy = t.clientY - st.startY;
    st.lastX = t.clientX;
    st.lastY = t.clientY;

    if (!st.lockedAxis && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      st.lockedAxis = Math.abs(dx) > Math.abs(dy) * 1.15 ? "x" : "y";
    }

    if (options.onDragMove) {
      options.onDragMove(dx, dy, st.isEdge);
    }
    if (options.trackDrag) {
      const effectiveX = st.ignoreHorizontal && st.lockedAxis === "x" ? 0 : dx;
      setDrag({ x: effectiveX, y: dy, active: true, isEdge: st.isEdge });
    }
  };

  const finishGesture = (clientX: number, clientY: number) => {
    const st = stateRef.current;
    stateRef.current = null;
    if (options.trackDrag) {
      setDrag({ x: 0, y: 0, active: false, isEdge: false });
    }
    if (!st || !st.active) {
      options.onDragEnd?.(0, 0, 0, 0);
      return;
    }

    const elapsed = Math.max(1, performance.now() - st.startTime);
    const dx = clientX - st.startX;
    const dy = clientY - st.startY;
    const vx = dx / elapsed;
    const vy = dy / elapsed;

    options.onDragEnd?.(dx, dy, vx, vy);

    if (elapsed > maxDurationMs && Math.abs(vx) < velocityThreshold && Math.abs(vy) < velocityThreshold) {
      return;
    }

    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    const absVx = Math.abs(vx);
    const absVy = Math.abs(vy);

    // Horizontal iOS swipe (distance threshold OR fast flick velocity)
    if (absX > absY * 1.2 && (absX >= threshold || (absX >= 22 && absVx >= velocityThreshold))) {
      if (st.ignoreHorizontal) return;
      triggerLightHaptic();
      if (dx < 0) {
        options.onSwipeLeft?.();
      } else {
        options.onSwipeRight?.();
      }
      return;
    }

    // Vertical iOS swipe (distance threshold OR fast flick velocity)
    if (absY > absX * 1.2 && (absY >= threshold || (absY >= 22 && absVy >= velocityThreshold))) {
      triggerLightHaptic();
      if (dy < 0) {
        options.onSwipeUp?.();
      } else {
        options.onSwipeDown?.();
      }
    }
  };

  const onTouchEnd: TouchEventHandler<HTMLElement> = (e) => {
    const st = stateRef.current;
    const t = e.changedTouches[0];
    finishGesture(t ? t.clientX : st?.lastX ?? 0, t ? t.clientY : st?.lastY ?? 0);
  };

  const onTouchCancel: TouchEventHandler<HTMLElement> = () => {
    stateRef.current = null;
    if (options.trackDrag) {
      setDrag({ x: 0, y: 0, active: false, isEdge: false });
    }
    options.onDragEnd?.(0, 0, 0, 0);
  };

  return {
    handlers: {
      onTouchStart,
      onTouchMove,
      onTouchEnd,
      onTouchCancel,
    },
    drag,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onTouchCancel,
  };
}
