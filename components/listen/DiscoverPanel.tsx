"use client";

import { useCallback, useEffect, useState } from "react";
import { useUi } from "@/lib/i18n";
import { ALL_SUGGESTIONS, byTopic, suggestionsByLevel, topicsOf, type Suggestion } from "@/lib/suggestions";
import type { ChartEntry } from "@/app/api/charts/route";
import { LevelBadge } from "../LevelBadge";
import { Art } from "./Art";

/**
 * What you see before searching for anything.
 *
 * Two halves on purpose: a hand-picked list chosen for a learner, grouped by
 * level and stable, and the live Apple chart, which is whatever Germany is
 * listening to this week. One is pedagogically useful, the other is current;
 * neither substitutes for the other.
 */
export function DiscoverPanel({ onPick }: { onPick: (query: string) => void }) {
  const { t } = useUi();
  const [topic, setTopic] = useState("");
  const [medium, setMedium] = useState<"all" | "video" | "audio">("all");
  const [charts, setCharts] = useState<ChartEntry[] | null>(null);
  const [chartError, setChartError] = useState<string | null>(null);

  const loadCharts = useCallback(async () => {
    setChartError(null);
    try {
      const response = await fetch("/api/charts?country=de&limit=30");
      const data = (await response.json()) as { entries?: ChartEntry[]; error?: string };
      setCharts(data.entries ?? []);
      if (data.error) setChartError(data.error);
    } catch {
      setCharts([]);
      setChartError("The chart could not be reached.");
    }
  }, []);

  useEffect(() => {
    void loadCharts();
  }, [loadCharts]);

  const pool =
    medium === "all"
      ? ALL_SUGGESTIONS
      : ALL_SUGGESTIONS.filter((item) => (medium === "video" ? item.video : !item.video));
  const topics = topicsOf(pool);
  const filtered = byTopic(pool, topic);

  return (
    <div className="mt-8 space-y-9">
      {charts && charts.length > 0 ? (
        <section>
          <div className="mb-2 flex flex-wrap items-baseline gap-x-3">
            <h2 className="text-[15px] font-semibold">{t("listen.charts")}</h2>
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
                    <span className="line-clamp-2 text-[12.5px] font-medium leading-snug">
                      {entry.title}
                    </span>
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
              {(["all", "video", "audio"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  data-active={medium === option}
                  onClick={() => {
                    setMedium(option);
                    setTopic("");
                  }}
                  className="btn rounded-none border-0 border-r border-[var(--rule)] px-2.5 py-1 text-[12px] last:border-r-0"
                >
                  {option === "all"
                    ? t("common.all")
                    : option === "video"
                      ? t("listen.videoOnly")
                      : t("listen.audioOnly")}
                </button>
              ))}
            </div>
          </div>

          {/*
            Twenty-six topics wrap into eight rows on a phone, which pushed
            every actual show below the fold - the filter took the whole screen
            and the thing being filtered was nowhere. One scrolling row keeps it
            to a single line until there is width to wrap into.
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

        <div className="space-y-5">
          {suggestionsByLevel(filtered).map((group) => (
            <div key={group.cefr}>
              <div className="mb-2 flex items-center gap-2">
                <LevelBadge level={group.cefr} />
                <span className="text-[12px] text-[var(--ink-faint)]">
                  {group.items.length} {group.items.length === 1 ? "show" : "shows"}
                </span>
              </div>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {group.items.map((item: Suggestion) => (
                  <li key={`${item.query}|${item.video ? "v" : "a"}`}>
                    <button
                      type="button"
                      className="row-hover w-full p-2.5 text-left"
                      onClick={() => onPick(item.query)}
                    >
                      <span className="flex items-baseline gap-1.5">
                        <span className="text-[14px] font-medium">{item.label}</span>
                        {item.video ? (
                          <span className="chip text-[10px]">{t("listen.video")}</span>
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
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
