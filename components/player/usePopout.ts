"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Chromium's Document Picture-in-Picture. Not in lib.dom yet, so it is declared
 * here rather than cast away at each call site.
 */
interface DocumentPictureInPicture {
  requestWindow: (options?: {
    width?: number;
    height?: number;
    disallowReturnToOpener?: boolean;
    preferInitialWindowPlacement?: boolean;
  }) => Promise<Window>;
  window: Window | null;
}

declare global {
  interface Window {
    documentPictureInPicture?: DocumentPictureInPicture;
  }
}

/**
 * Copies the page's styling into the pop-out document.
 *
 * A picture-in-picture window is a genuinely separate document: it inherits no
 * stylesheet from its opener, so without this the controls arrive as unstyled
 * HTML. Same-origin sheets are copied rule by rule; cross-origin ones, which is
 * the webfont, cannot be read, so their <link> is cloned instead and the
 * browser fetches them again.
 */
function adoptStyles(target: Window) {
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const text = Array.from(sheet.cssRules)
        .map((rule) => rule.cssText)
        .join("\n");
      const style = target.document.createElement("style");
      style.textContent = text;
      target.document.head.appendChild(style);
    } catch {
      const owner = sheet.ownerNode;
      if (owner instanceof HTMLLinkElement) {
        target.document.head.appendChild(owner.cloneNode(true));
      }
    }
  }
  // The pop-out has its own root element, so the chosen theme has to be carried
  // across explicitly; it does not inherit the opener's attribute.
  const theme = document.documentElement.getAttribute("data-theme");
  if (theme) target.document.documentElement.setAttribute("data-theme", theme);
  target.document.documentElement.style.colorScheme =
    getComputedStyle(document.documentElement).colorScheme;
}

export interface Popout {
  /** Whether this browser can do it at all. Chromium only, at time of writing. */
  supported: boolean;
  /** The element to portal into, or null while closed. */
  container: HTMLElement | null;
  open: () => Promise<void>;
  close: () => void;
}

export function usePopout(size: { width: number; height: number }): Popout {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const [supported, setSupported] = useState(false);

  // Feature detection runs after mount: the server has no window, and deciding
  // during render would make the first paint disagree with the markup.
  useEffect(() => {
    setSupported(typeof window !== "undefined" && Boolean(window.documentPictureInPicture));
  }, []);

  const { width, height } = size;

  const open = useCallback(async () => {
    const api = window.documentPictureInPicture;
    if (!api) return;
    try {
      const pip = await api.requestWindow({ width, height });
      adoptStyles(pip);
      pip.document.body.style.margin = "0";
      pip.document.body.style.background = "var(--paper)";
      const host = pip.document.createElement("div");
      pip.document.body.appendChild(host);
      // Closing the window is the user's business, not ours, so the only thing
      // to do is notice and let the page take the controls back.
      pip.addEventListener("pagehide", () => setContainer(null), { once: true });
      setContainer(host);
    } catch {
      // A blocked request, usually because the click was not treated as a
      // gesture. Nothing to recover: the docked player is still there.
      setContainer(null);
    }
  }, [width, height]);

  const close = useCallback(() => {
    window.documentPictureInPicture?.window?.close();
    setContainer(null);
  }, []);

  // A page that navigates away must not leave an orphaned window floating over
  // the desktop with controls for audio that no longer exists.
  useEffect(() => () => window.documentPictureInPicture?.window?.close(), []);

  return { supported, container, open, close };
}
