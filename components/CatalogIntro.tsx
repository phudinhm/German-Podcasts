"use client";

import Link from "next/link";
import { useUi } from "@/lib/i18n";
import { CEFR_DESCRIPTIONS } from "@/lib/cefr";
import { CEFR_LEVELS } from "@/lib/types";

export function CatalogIntro({ ready, total }: { ready: number; total: number }) {
  const { t } = useUi();
  return (
    <>
      <section className="mb-8 max-w-2xl">
        <h1 className="text-[30px] font-semibold leading-tight sm:text-[34px]">
          {t("catalog.title")}
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-[var(--ink-soft)]">{t("catalog.lede")}</p>
        <p className="mt-3 rounded-xl bg-[var(--surface)] px-3 py-2 text-[13px] leading-relaxed text-[var(--ink-soft)]">
          {t("catalog.what")}{" "}
          <Link href="/listen" className="underline decoration-dotted underline-offset-4 hover:text-[var(--ink)]">
            {t("nav.listen")}
          </Link>
        </p>
        <p className="mt-3 text-[13px] text-[var(--ink-faint)]">
          {t("catalog.ready", { ready, total })}{" "}
          <Link href="/about" className="underline decoration-dotted underline-offset-4 hover:text-[var(--ink)]">
            {t("catalog.howLevels")}
          </Link>
        </p>
      </section>

      <section className="mb-7 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {CEFR_LEVELS.map((level) => (
          <div key={level} className="surface flex gap-3 px-3 py-2">
            <span className="text-[12px] font-semibold text-[var(--accent)]">{level}</span>
            <span className="text-[12.5px] leading-snug text-[var(--ink-faint)]">
              {CEFR_DESCRIPTIONS[level]}
            </span>
          </div>
        ))}
      </section>
    </>
  );
}
