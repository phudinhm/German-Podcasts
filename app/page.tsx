import type { Metadata } from "next";
import { Suspense } from "react";
import { ListenClient } from "@/components/ListenClient";

/**
 * Listening is the front door.
 *
 * The catalog used to be here, and it made a poor first impression: most of its
 * entries have no transcript yet, so the first thing a new arrival saw was a
 * grid of things they could not play, with the one feature that actually works
 * on any show - paste a link, press play - hidden behind a nav item. The
 * catalog is still worth having, as graded material for shadowing, but it is a
 * second room rather than the entrance.
 */
export const metadata: Metadata = {
  title: "Hörbar - listen to German podcasts with transcripts",
  description:
    "Find German podcasts on Apple Podcasts, Spotify, YouTube or any RSS feed and stream them straight away, with transcripts or live captions.",
};

export default function HomePage() {
  // ListenClient reads ?feed= so the library can link straight to a show's
  // episodes. Reading search params opts a page out of static prerendering
  // unless the boundary is here to say what to show meanwhile.
  return (
    <Suspense fallback={<p className="text-[13px] text-[var(--ink-faint)]">Loading…</p>}>
      <ListenClient />
    </Suspense>
  );
}
