import { listSummaries } from "@/lib/catalog";
import { CatalogGrid } from "@/components/CatalogGrid";
import { CatalogIntro } from "@/components/CatalogIntro";

export default async function CatalogPage() {
  const episodes = await listSummaries();
  const ready = episodes.filter((e) => e.transcriptStatus !== "pending").length;

  return (
    <div>
      <CatalogIntro ready={ready} total={episodes.length} />
      <CatalogGrid episodes={episodes} />
    </div>
  );
}
