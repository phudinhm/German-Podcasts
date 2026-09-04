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

/** Enough to suggest what kind of thing a topic is, without becoming a wall. */
const TOPICS_SHOWN = 8;

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
  const [allTopics, setAllTopics] = useState(false);
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
  const shownTopics =
    allTopics || topics.length <= TOPICS_SHOWN
      ? topics
      : [...new Set([...topics.slice(0, TOPICS_SHOWN), ...(topic ? [topic] : [])])];
  // Levels only mean something for German, so the filter only appears when
  // German shows are in view at all.
  const levelsApply = lang !== "en" && pool.some((item) => item.cefr);
  const filtered = byLevel(byTopic(pool, topic), levelsApply ? level : "");

  return (
    <div className="mt-7 space-y-7">
      {charts && charts.length > 0 ? (
        <section>
          <div className="mb-2 flex items-baseline gap-x-3">
            <h2 className="text-[15px] font-semibold">
              {lang === "en" ? t("listen.chartsEn") : t("listen.charts")}
            </h2>
            {/* The note is context, not instruction, so it is the first thing
                to go when the row is too narrow to hold both it and Refresh. */}
            <span className="hidden truncate text-[12px] text-[var(--ink-faint)] sm:block">
              {t("listen.chartsNote")}
            </span>
            <button
              type="button"
              onClick={() => void loadCharts()}
              className="ml-auto shrink-0 text-[12px] text-[var(--ink-faint)] hover:text-[var(--ink)]"
            >
              {t("listen.refresh")}
            </button>
          </div>
          <ul className="scroll-row -mx-4 gap-3 px-4 pb-2 sm:mx-0 sm:px-0">
            {charts.map((entry, index) => (
              <li key={entry.appleId} className="w-[128px] shrink-0 sm:w-[132px]">
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() =>
                    onPick(entry.pageUrl ?? `https://podcasts.apple.com/de/podcast/id${entry.appleId}`)
                  }
                >
                  <Art src={entry.artwork} alt="" size={132} seed={entry.title} />
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

          {/*
            Thirty-three topics wrapped is three full rows of chips, roughly a
            third of a laptop screen, sitting above the shows they filter. So
            only the first handful are shown and the rest are one press away.
            The currently chosen topic is always among them, otherwise
            collapsing the row would hide the filter that is in force.
          */}
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
            {shownTopics.map((item) => (
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
            {topics.length > TOPICS_SHOWN ? (
              <button
                type="button"
                className="btn shrink-0 px-2.5 py-1 text-[12px] text-[var(--ink-soft)]"
                aria-expanded={allTopics}
                onClick={() => setAllTopics((value) => !value)}
              >
                {allTopics
                  ? t("listen.fewerTopics")
                  : t("listen.moreTopics", { count: topics.length - TOPICS_SHOWN })}
              </button>
            ) : null}
          </div>
        </div>

        <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item: Suggestion) => (
            <li key={`${item.label}|${item.lang}`} className="min-w-0">
              <button
                type="button"
                className="row-hover h-full w-full p-2.5 text-left"
                onClick={() => onPick(item.query)}
              >
                <span className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
                  <span className="text-[14px] font-medium">{item.label}</span>
                  <span className="chip text-[10px]">{item.lang === "de" ? "DE" : "EN"}</span>
                  {item.cefr ? (
                    <span className="chip chip-level text-[10px]">{item.cefr}</span>
                  ) : null}
                </span>
                <span className="mt-0.5 block truncate text-[12px] text-[var(--ink-soft)]">{item.publisher}</span>
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
