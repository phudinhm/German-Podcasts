"use client";

import Link from "next/link";
import { useUi } from "@/lib/i18n";
import { CEFR_DESCRIPTIONS } from "@/lib/cefr";
import { CEFR_LEVELS } from "@/lib/types";

/**
 * The page header, trimmed to what earns its place above the fold.
 *
 * It used to open with a headline, a five-line paragraph, an explainer box, a
 * count and six level descriptions - so on a phone you scrolled through a full
 * screen of prose before reaching a single episode. The level guide is
 * reference material people consult once and then never again, so it folds
 * away, and the explanation of what this page is sits with it rather than
 * ahead of the content it describes.
 */
export function CatalogIntro({ ready, total }: { ready: number; total: number }) {
  const { t } = useUi();
  return (
    <section className="mb-6 max-w-2xl">
      <h1 className="text-[30px] font-semibold leading-tight sm:text-[34px]">{t("catalog.title")}</h1>
      <p className="mt-2.5 text-[15px] leading-relaxed text-[var(--ink-soft)]">{t("catalog.lede")}</p>

      <p className="mt-2.5 text-[13px] text-[var(--ink-faint)]">
        {t("catalog.ready", { ready, total })}{" "}
        <Link href="/" className="underline decoration-dotted underline-offset-4 hover:text-[var(--ink)]">
          {t("catalog.orListen")}
        </Link>
      </p>

      <details className="group mt-3">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-[13px] text-[var(--ink-faint)] hover:text-[var(--ink)]">
          <span className="transition-transform group-open:rotate-90">›</span>
          {t("catalog.levelGuide")}
        </summary>
        <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
          {CEFR_LEVELS.map((level) => (
            <div key={level} className="surface flex gap-3 px-3 py-2">
              <span className="text-[12px] font-semibold text-[var(--accent)]">{level}</span>
              <span className="text-[12.5px] leading-snug text-[var(--ink-faint)]">
                {CEFR_DESCRIPTIONS[level]}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-2.5 text-[12.5px] leading-relaxed text-[var(--ink-faint)]">
          {t("catalog.what")}{" "}
          <Link href="/about" className="underline decoration-dotted underline-offset-4 hover:text-[var(--ink)]">
            {t("catalog.howLevels")}
          </Link>
        </p>
      </details>
    </section>
  );
}
