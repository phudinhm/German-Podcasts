import type { Metadata } from "next";
import { Suspense } from "react";
import { ListenClient } from "@/components/ListenClient";

/**
 * Listening is the front door.
 *
 * Everything else in the app exists to get someone back to a stream they were
 * part-way through, so the search box and the shelf are the first things on the
 * page rather than a room you navigate to.
 */
export const metadata: Metadata = {
  title: "Hörbar - podcasts, and where you left off",
  description:
    "Find podcasts on Apple Podcasts, Spotify or any RSS feed, follow the shows you like, and pick up every episode where you left it.",
};

export default function HomePage() {
  // ListenClient reads ?feed= so the library can link straight to a show's
  // episodes. Reading search params opts a page out of static prerendering
  // unless the boundary is here to say what to show meanwhile. The fallback is
  // shaped like the page it replaces, so the layout does not jump when the real
  // thing arrives.
  return (
    <Suspense
      fallback={
        <div className="animate-pulse" aria-hidden>
          <div className="h-7 w-56 rounded-lg bg-[var(--surface)]" />
          <div className="mt-3 h-4 w-full max-w-xl rounded bg-[var(--surface)]" />
          <div className="mt-2 h-4 w-3/4 max-w-md rounded bg-[var(--surface)]" />
          <div className="mt-5 h-11 w-full rounded-full bg-[var(--surface)]" />
        </div>
      }
    >
      <ListenClient />
    </Suspense>
  );
}
