"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export const ZOOM_KEY = "hoerbar.zoom.v1";
export const DEFAULT_ZOOM = 1.0;
export const ZOOM_STEPS = [0.85, 0.92, 1.0, 1.12, 1.25, 1.38, 1.5];

export const ZOOM_SCRIPT = `(function(){try{var z=localStorage.getItem("hoerbar.zoom.v1");if(z){var val=parseFloat(z);if(val>=0.7&&val<=2.0){document.documentElement.style.zoom=val;document.documentElement.style.setProperty("--page-zoom",String(val));}}}catch(e){}})();`;

export interface ZoomContextValue {
  zoom: number;
  setZoom: (level: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
}

export const ZoomContext = createContext<ZoomContextValue>({
  zoom: DEFAULT_ZOOM,
  setZoom: () => {},
  zoomIn: () => {},
  zoomOut: () => {},
  resetZoom: () => {},
});

export function useZoom(): ZoomContextValue {
  return useContext(ZoomContext);
}

export function ZoomProvider({ children }: { children: ReactNode }) {
  const [zoom, setZoomState] = useState<number>(DEFAULT_ZOOM);

  // Read saved zoom on mount
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(ZOOM_KEY);
      if (saved) {
        const val = parseFloat(saved);
        if (val >= 0.7 && val <= 2.0) {
          setZoomState(val);
          applyZoom(val);
        }
      }
    } catch {
      // Storage unavailable
    }
  }, []);

  const applyZoom = (val: number) => {
    if (typeof document === "undefined") return;
    try {
      document.documentElement.style.zoom = String(val);
      document.documentElement.style.setProperty("--page-zoom", String(val));
    } catch {
      // Fallback
    }
  };

  const setZoom = useCallback((level: number) => {
    const clamped = Math.min(1.8, Math.max(0.75, Math.round(level * 100) / 100));
    setZoomState(clamped);
    applyZoom(clamped);
    try {
      window.localStorage.setItem(ZOOM_KEY, String(clamped));
    } catch {
      // Ignore
    }
  }, []);

  const zoomIn = useCallback(() => {
    setZoomState((current) => {
      const next = ZOOM_STEPS.find((s) => s > current + 0.03) ?? Math.min(1.8, current + 0.12);
      const clamped = Math.min(1.8, Math.round(next * 100) / 100);
      applyZoom(clamped);
      try {
        window.localStorage.setItem(ZOOM_KEY, String(clamped));
      } catch {}
      return clamped;
    });
  }, []);

  const zoomOut = useCallback(() => {
    setZoomState((current) => {
      const reversed = [...ZOOM_STEPS].reverse();
      const next = reversed.find((s) => s < current - 0.03) ?? Math.max(0.75, current - 0.12);
      const clamped = Math.max(0.75, Math.round(next * 100) / 100);
      applyZoom(clamped);
      try {
        window.localStorage.setItem(ZOOM_KEY, String(clamped));
      } catch {}
      return clamped;
    });
  }, []);

  const resetZoom = useCallback(() => {
    setZoom(DEFAULT_ZOOM);
  }, [setZoom]);

  // Global hotkeys Ctrl + Plus / Minus / 0
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!e.ctrlKey && !e.metaKey) return;
      if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        zoomIn();
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        zoomOut();
      } else if (e.key === "0") {
        e.preventDefault();
        resetZoom();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [zoomIn, zoomOut, resetZoom]);

  return (
    <ZoomContext.Provider value={{ zoom, setZoom, zoomIn, zoomOut, resetZoom }}>
      {children}
    </ZoomContext.Provider>
  );
}
