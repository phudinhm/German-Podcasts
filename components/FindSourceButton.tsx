"use client";

import { useState } from "react";
import { useUi } from "@/lib/i18n";
import type { DiscoverResult } from "@/lib/server/discover";
import type { FeedResult } from "@/lib/server/feed";
import { setMedia } from "@/lib/mediaStore";

/**
 * Attaches a real stream to a curated catalog entry.
 *
 * The curated shelf lists real shows by name with no media, which reads as
 * broken if you do not know that ingest is a separate step. This runs the same
 * discovery search the Listen page uses, takes the show's feed and attaches its
 * newest episode, so the entry becomes playable in one click.
 */
export function FindSourceButton({
  title,
  publisher,
  slug,
  onAttached,
}: {
  title: string;
  publisher?: string;
  slug: string;
  onAttached: () => void;
}) {
  const { t } = useUi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function find() {
    setBusy(true);
    setError(null);
    try {
      const discover = await fetch("/api/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: publisher ? `${title} ${publisher}` : title }),
      });
      const found = (await discover.json()) as { results?: DiscoverResult[]; error?: string };
      const withFeed = found.results?.find((item) => item.feedUrl);
      if (!withFeed?.feedUrl) {
        setError(found.error ?? t("listen.noResults"));
        return;
      }

      const feedResponse = await fetch("/api/feed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: withFeed.feedUrl }),
      });
      const feed = (await feedResponse.json()) as FeedResult & { error?: string };
      const newest = feed.episodes?.[0];
      if (!newest) {
        setError(feed.error ?? t("listen.noResults"));
        return;
      }

      setMedia(slug, {
        source: newest.type.startsWith("video/")
          ? { kind: "video", videoUrl: newest.url, pageUrl: newest.pageUrl }
          : { kind: "audio", audioUrl: newest.url, pageUrl: newest.pageUrl },
        label: `${feed.title}: ${newest.title}`,
        attachedAt: new Date().toISOString(),
      });
      onAttached();
    } catch {
      setError("The search failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button type="button" className="btn btn-primary text-[12.5px]" disabled={busy} onClick={() => void find()}>
        {busy ? t("catalog.searching") : t("catalog.findSource")}
      </button>
      {error ? <span className="text-[11.5px] text-amber-700 dark:text-amber-400">{error}</span> : null}
    </span>
  );
}
