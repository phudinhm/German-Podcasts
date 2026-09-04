"use client";

import { useCallback, useEffect, useState } from "react";
import { useUi } from "@/lib/i18n";
import {
  ALL_SUGGESTIONS,
  byLang,
  byLevel,
  byTopic,
  LEVEL_HINTS,
  topicsOf,
  type SourceLang,
  type Suggestion,
} from "@/lib/suggestions";
import { CEFR_LEVELS, type Cefr } from "@/lib/types";
import type { ChartEntry } from "@/app/api/charts/route";
import { Art } from "./Art";

/**
 * What you see before searching for anything.
 *
 * Two halves: a hand-picked list, and the live Apple chart, which is whatever
 * people are actually listening to this week. Sorted by language first because
 * that is the only filter that changes what a listener can use at all - a
 * German show is no use to someone who wanted English, whatever its topic.
 */
export function DiscoverPanel({ onPick }: { onPick: (query: string) => void }) {
  const { t } = useUi();
  const [lang, setLang] = useState<SourceLang | "">("");
  const [topic, setTopic] = useState("");
  const [level, setLevel] = useState<Cefr | "">("");
  const [charts, setCharts] = useState<ChartEntry[] | null>(null);
  const [chartError, setChartError] = useState<string | null>(null);

  const loadCharts = useCallback(async () => {
    setChartError(null);
    try {
      const response = await fetch(`/api/charts?country=${lang === "en" ? "us" : "de"}&limit=30`);
      const data = (await response.json()) as { entries?: ChartEntry[]; error?: string };
      setCharts(data.entries ?? []);
      if (data.error) setChartError(data.error);
    } catch {
      setCharts([]);
      setChartError("The chart could not be reached.");
    }
  }, [lang]);

  useEffect(() => {
    void loadCharts();
  }, [loadCharts]);

  const pool = byLang(ALL_SUGGESTIONS, lang);
  const topics = topicsOf(pool);
  // Levels only mean something for German, so the filter only appears when
  // German shows are in view at all.
  const levelsApply = lang !== "en" && pool.some((item) => item.cefr);
  const filtered = byLevel(byTopic(pool, topic), levelsApply ? level : "");

  return (
    <div className="mt-8 space-y-9">
      {charts && charts.length > 0 ? (
        <section>
          <div className="mb-2 flex flex-wrap items-baseline gap-x-3">
            <h2 className="text-[15px] font-semibold">
              {lang === "en" ? t("listen.chartsEn") : t("listen.charts")}
            </h2>
            <span className="text-[12px] text-[var(--ink-faint)]">{t("listen.chartsNote")}</span>
            <button
              type="button"
              onClick={() => void loadCharts()}
              className="ml-auto text-[12px] text-[var(--ink-faint)] hover:text-[var(--ink)]"
            >
              {t("listen.refresh")}
            </button>
          </div>
          <ul className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
            {charts.map((entry, index) => (
              <li key={entry.appleId} className="w-[132px] shrink-0">
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() =>
                    onPick(entry.pageUrl ?? `https://podcasts.apple.com/de/podcast/id${entry.appleId}`)
                  }
                >
                  <Art src={entry.artwork} alt="" size={132} />
                  <span className="mt-1.5 flex items-baseline gap-1">
                    <span className="text-[11px] text-[var(--ink-faint)]">{index + 1}</span>
                    <span className="line-clamp-2 text-[12.5px] font-medium leading-snug">{entry.title}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-[var(--ink-faint)]">
                    {entry.publisher}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {chartError ? <p className="text-[12px] text-[var(--ink-faint)]">{chartError}</p> : null}

      <section>
        <div className="mb-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[15px] font-semibold">{t("listen.suggested")}</h2>
            <span className="text-[12px] text-[var(--ink-faint)]">
              {filtered.length} {filtered.length === 1 ? "show" : "shows"}
            </span>
            <div className="flex overflow-hidden rounded-full border border-[var(--rule)] sm:ml-auto">
              {([" ", "de", "en"] as const).map((option) => {
                const value = option.trim() as SourceLang | "";
                return (
                  <button
                    key={option}
                    type="button"
                    data-active={lang === value}
                    onClick={() => {
                      setLang(value);
                      setTopic("");
                      if (value === "en") setLevel("");
                    }}
                    className="btn rounded-none border-0 border-r border-[var(--rule)] px-2.5 py-1 text-[12px] last:border-r-0"
                  >
                    {value === "" ? t("common.all") : value === "de" ? "Deutsch" : "English"}
                  </button>
                );
              })}
            </div>
          </div>

          {levelsApply ? (
            <div className="-mx-4 mt-2 flex items-center gap-1 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
              <span className="shrink-0 pr-1 text-[11px] uppercase tracking-[0.14em] text-[var(--ink-faint)]">
                {t("listen.level")}
              </span>
              <button
                type="button"
                className="btn shrink-0 px-2.5 py-1 text-[12px]"
                data-active={level === ""}
                onClick={() => setLevel("")}
              >
                {t("common.all")}
              </button>
              {CEFR_LEVELS.map((item) => (
                <button
                  key={item}
                  type="button"
                  className="btn shrink-0 px-2.5 py-1 text-[12px]"
                  data-active={level === item}
                  title={LEVEL_HINTS[item]}
                  onClick={() => setLevel(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          ) : null}

          {level ? (
            <p className="mt-1.5 text-[12px] text-[var(--ink-faint)]">{LEVEL_HINTS[level]}</p>
          ) : null}

          {/* One scrolling row on a phone: wrapped, these topics take the whole
              screen and push every actual show below the fold. */}
          <div className="-mx-4 mt-2 flex items-center gap-1 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
            <span className="shrink-0 pr-1 text-[11px] uppercase tracking-[0.14em] text-[var(--ink-faint)]">
              {t("listen.topic")}
            </span>
            <button
              type="button"
              className="btn shrink-0 px-2.5 py-1 text-[12px]"
              data-active={topic === ""}
              onClick={() => setTopic("")}
            >
              {t("common.all")}
            </button>
            {topics.map((item) => (
              <button
                key={item}
                type="button"
                className="btn shrink-0 px-2.5 py-1 text-[12px]"
                data-active={topic === item}
                onClick={() => setTopic(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item: Suggestion) => (
            <li key={`${item.label}|${item.lang}`}>
              <button
                type="button"
                className="row-hover w-full p-2.5 text-left"
                onClick={() => onPick(item.query)}
              >
                <span className="flex items-baseline gap-1.5">
                  <span className="text-[14px] font-medium">{item.label}</span>
                  <span className="chip text-[10px]">{item.lang === "de" ? "DE" : "EN"}</span>
                  {item.cefr ? (
                    <span className="chip border-[var(--accent-ring)] text-[10px] text-[var(--accent)]">
                      {item.cefr}
                    </span>
                  ) : null}
                </span>
                <span className="block text-[12px] text-[var(--ink-soft)]">{item.publisher}</span>
                <span className="mt-1 block text-[12px] leading-snug text-[var(--ink-faint)]">
                  {item.why}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
