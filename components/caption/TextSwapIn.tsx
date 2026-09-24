"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

/**
 * Plays the "enter" half of transitions-dev's text-states-swap on whatever
 * mounts inside it: translation lines have no meaningful old value to exit
 * from (they go straight from absent to present, whether that's a fresh
 * translation arriving or a new line becoming the active one), so only the
 * blurred slide-up-to-rest entrance applies here - see 04-text-states-swap.md.
 */
export function TextSwapIn({
  as: Tag = "span",
  className = "",
  style,
  children,
}: {
  as?: "span" | "p";
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <Tag className={`t-text-swap ${entered ? "" : "is-enter-start"} ${className}`} style={style}>
      {children}
    </Tag>
  );
}
