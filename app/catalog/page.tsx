import type { Metadata } from "next";
import { listSummaries } from "@/lib/catalog";
import { CatalogGrid } from "@/components/CatalogGrid";
import { CatalogIntro } from "@/components/CatalogIntro";

export const metadata: Metadata = {
  title: "Catalog",
  description:
    "Episodes with a finished transcript, graded by CEFR level and shadowing difficulty.",
};

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
