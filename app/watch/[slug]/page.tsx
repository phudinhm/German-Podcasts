import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getEpisode, loadEpisodes } from "@/lib/catalog";
import { WatchClient } from "@/components/WatchClient";

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ t?: string; seg?: string; mode?: string }>;
}

export async function generateStaticParams() {
  const episodes = await loadEpisodes();
  return episodes.map((episode) => ({ slug: episode.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const episode = await getEpisode(slug);
  if (!episode) return { title: "Nicht gefunden" };
  return {
    title: episode.title,
    description: episode.description,
  };
}

export default async function WatchPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const { t, seg, mode } = await searchParams;
  const episode = await getEpisode(slug);
  if (!episode) notFound();

  const initialTime = Number.parseFloat(t ?? "");

  // The glossary stays on the server. /api/lookup reads it from the same
  // payload, so shipping it to the browser would only double the page weight.
  const { glossary: _glossary, ...clientEpisode } = episode;

  return (
    <WatchClient
      episode={{ ...clientEpisode, glossary: {} }}
      initialTime={Number.isFinite(initialTime) ? initialTime : 0}
      initialSegmentId={seg}
      initialMode={mode === "echo" || mode === "loop" ? mode : undefined}
    />
  );
}
