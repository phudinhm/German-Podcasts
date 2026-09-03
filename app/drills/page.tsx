import type { Metadata } from "next";
import { loadEpisodes } from "@/lib/catalog";
import { countSyllablesInText } from "@/lib/german/orthography";
import { DrillsClient, type DrillItem } from "@/components/DrillsClient";

export const metadata: Metadata = {
  title: "Five-minute drills",
  description:
    "The highest-payload sentences from every episode, as a short shadowing sprint for a lunch break.",
};

export default async function DrillsPage() {
  const episodes = await loadEpisodes();
  const drills: DrillItem[] = [];

  for (const episode of episodes) {
    if (episode.transcript.length === 0) continue;
    for (const segmentId of episode.drillSegmentIds) {
      const segment = episode.transcript.find((item) => item.id === segmentId);
      if (!segment) continue;
      const duration = Math.max(0.1, segment.end - segment.start);
      drills.push({
        episodeSlug: episode.slug,
        episodeTitle: episode.title,
        publisher: episode.publisher,
        cefr: episode.cefr,
        sdm: episode.metrics.sdm,
        segmentId: segment.id,
        start: segment.start,
        end: segment.end,
        de: segment.de,
        en: segment.en,
        vi: segment.vi,
        rate: Number((countSyllablesInText(segment.de) / duration).toFixed(2)),
      });
    }
  }

  return <DrillsClient drills={drills} />;
}
