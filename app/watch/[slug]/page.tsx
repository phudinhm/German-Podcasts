import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getEpisode, loadEpisodes } from "@/lib/catalog";
import { WatchClient } from "@/components/WatchClient";

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ t?: string; seg?: string }>;
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
  const { t } = await searchParams;
  const episode = await getEpisode(slug);
  if (!episode) notFound();

  const initialTime = Number.parseFloat(t ?? "");

  return (
    <WatchClient
      episode={episode}
      initialTime={Number.isFinite(initialTime) ? initialTime : 0}
    />
  );
}
