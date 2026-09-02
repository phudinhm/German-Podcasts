import fs from "node:fs";
import path from "node:path";
import type { Cefr, Episode, EpisodeSummary } from "./types";

/**
 * Catalog access.
 *
 * The default store is the bundled JSON in data/catalog, which means a cold
 * Vercel page load needs no database round trip at all. When Supabase
 * credentials are present the loader prefers the table, so a curator can add
 * episodes without a redeploy.
 */

const CATALOG_DIR = path.join(process.cwd(), "data", "catalog");

let cache: Episode[] | null = null;

function readFromDisk(): Episode[] {
  if (!fs.existsSync(CATALOG_DIR)) return [];
  const files = fs.readdirSync(CATALOG_DIR).filter((f) => f.endsWith(".json"));
  const episodes: Episode[] = [];
  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(CATALOG_DIR, file), "utf8");
      episodes.push(JSON.parse(raw) as Episode);
    } catch (error) {
      console.error(`[catalog] skipping ${file}:`, error);
    }
  }
  return episodes;
}

export async function loadEpisodes(): Promise<Episode[]> {
  if (cache) return cache;

  const remote = await loadFromSupabase();
  cache = remote ?? readFromDisk();
  cache.sort((a, b) => a.cefr.localeCompare(b.cefr) || a.title.localeCompare(b.title));
  return cache;
}

async function loadFromSupabase(): Promise<Episode[] | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  try {
    const response = await fetch(`${url}/rest/v1/episodes?select=payload`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      next: { revalidate: 300 },
    });
    if (!response.ok) {
      console.error("[catalog] Supabase responded", response.status);
      return null;
    }
    const rows = (await response.json()) as Array<{ payload: Episode }>;
    return rows.map((row) => row.payload).filter(Boolean);
  } catch (error) {
    console.error("[catalog] Supabase unreachable, falling back to bundled JSON:", error);
    return null;
  }
}

export function toSummary(episode: Episode): EpisodeSummary {
  const { transcript: _transcript, quiz: _quiz, drillSegmentIds: _drills, ...summary } = episode;
  return summary;
}

export async function listSummaries(): Promise<EpisodeSummary[]> {
  return (await loadEpisodes()).map(toSummary);
}

export async function getEpisode(slug: string): Promise<Episode | null> {
  const episodes = await loadEpisodes();
  return episodes.find((e) => e.slug === slug || e.id === slug) ?? null;
}

export async function groupByLevel(): Promise<Record<Cefr, EpisodeSummary[]>> {
  const summaries = await listSummaries();
  const grouped = {} as Record<Cefr, EpisodeSummary[]>;
  for (const summary of summaries) {
    (grouped[summary.cefr] ??= []).push(summary);
  }
  return grouped;
}

/** Builds the episode-scoped glossary lookup used by the dictionary endpoint. */
export async function getGlossary(slug: string): Promise<Record<string, unknown> | null> {
  const episode = await getEpisode(slug);
  if (!episode) return null;
  return (episode as unknown as { glossary?: Record<string, unknown> }).glossary ?? null;
}

export function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}
