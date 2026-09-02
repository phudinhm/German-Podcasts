import Link from "next/link";
import { listSummaries } from "@/lib/catalog";
import { CEFR_DESCRIPTIONS } from "@/lib/cefr";
import { CatalogGrid } from "@/components/CatalogGrid";
import { CEFR_LEVELS } from "@/lib/types";

export default async function CatalogPage() {
  const episodes = await listSummaries();
  const ready = episodes.filter((e) => e.transcriptStatus !== "pending").length;

  return (
    <div>
      <section className="mb-9 max-w-2xl">
        <h1
          className="text-[30px] leading-tight font-semibold tracking-tight sm:text-[36px]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Echtes Deutsch, in Portionen, die zu deinem Niveau passen.
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-[var(--ink-soft)]">
          Jede Folge ist nach GER-Niveau eingeordnet und trägt einen Wert für die Sprech&shy;schwierigkeit,
          damit du nicht mitten in einer Debatte landest, die du zwar verstehst, aber nie nachsprechen kannst.
          Klick auf ein Wort für Grundform, Genus und Übersetzung. Klick auf einen Satz, um genau dorthin zu springen.
        </p>
        <p className="mt-3 text-[13px] text-[var(--ink-faint)]">
          {ready} von {episodes.length} Einträgen haben ein fertiges Transkript.{" "}
          <Link href="/about" className="underline decoration-dotted underline-offset-4 hover:text-[var(--ink)]">
            Wie die Einstufung funktioniert
          </Link>
          .
        </p>
      </section>

      <section className="mb-8 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {CEFR_LEVELS.map((level) => (
          <div key={level} className="flex gap-3 rounded-lg border border-[var(--rule)] px-3 py-2">
            <span className="text-[11px] font-semibold tracking-wide text-[var(--accent)]">{level}</span>
            <span className="text-[12px] leading-snug text-[var(--ink-faint)]">{CEFR_DESCRIPTIONS[level]}</span>
          </div>
        ))}
      </section>

      <CatalogGrid episodes={episodes} />
    </div>
  );
}
