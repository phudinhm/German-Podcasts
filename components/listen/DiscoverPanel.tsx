"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
export function DiscoverPanel({
  onPick,
  searchQuery = "",
  onSearchChange,
}: {
  onPick: (query: string) => void;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
}) {
  const { t } = useUi();
  const [lang, setLang] = useState<SourceLang | "">("");
  const [topic, setTopic] = useState("");
  const [level, setLevel] = useState<Cefr | "">("");
  const [catalogSort, setCatalogSort] = useState<"popular" | "az" | "level">("popular");
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

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredBySearch = useMemo(() => {
    if (!normalizedQuery) return null;
    return pool.filter((item) => {
      const matchLabel = item.label.toLowerCase().includes(normalizedQuery);
      const matchPublisher = item.publisher.toLowerCase().includes(normalizedQuery);
      const matchWhy = item.why.toLowerCase().includes(normalizedQuery);
      const matchTopics = item.topics.some((t) => t.toLowerCase().includes(normalizedQuery));
      const matchCefr = item.cefr?.toLowerCase() === normalizedQuery;
      return matchLabel || matchPublisher || matchWhy || matchTopics || matchCefr;
    });
  }, [pool, normalizedQuery]);

  const basePool = filteredBySearch !== null ? filteredBySearch : pool;
  const topics = topicsOf(basePool);
  const shownTopics =
    allTopics || topics.length <= TOPICS_SHOWN
      ? topics
      : [...new Set([...topics.slice(0, TOPICS_SHOWN), ...(topic ? [topic] : [])])];
  // Levels only mean something for German, so the filter only appears when
  // German shows are in view at all.
  const levelsApply = lang !== "en" && basePool.some((item) => item.cefr);
  const filtered = byLevel(byTopic(basePool, topic), levelsApply ? level : "");

  const filteredCharts = useMemo(() => {
    if (!charts) return null;
    if (!normalizedQuery) return charts;
    return charts.filter(
      (entry) =>
        entry.title.toLowerCase().includes(normalizedQuery) ||
        (entry.publisher && entry.publisher.toLowerCase().includes(normalizedQuery))
    );
  }, [charts, normalizedQuery]);

  const sortedCatalog = useMemo(() => {
    const list = [...filtered];
    if (catalogSort === "az") {
      return list.sort((a, b) => a.label.localeCompare(b.label, "de", { sensitivity: "base" }));
    }
    if (catalogSort === "level") {
      const CEFR_ORDER: Record<string, number> = { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6 };
      return list.sort((a, b) => {
        const orderA = a.cefr ? (CEFR_ORDER[a.cefr] ?? 99) : 99;
        const orderB = b.cefr ? (CEFR_ORDER[b.cefr] ?? 99) : 99;
        return orderA - orderB || a.label.localeCompare(b.label, "de");
      });
    }
    // "popular" (default: most listened): keeps natural curated popularity ranking
    return list;
  }, [filtered, catalogSort]);

  return (
    <div className="mt-7 space-y-7">
      {filteredCharts && filteredCharts.length > 0 ? (
        <section>
          <div className="mb-2 flex items-baseline gap-x-3">
            <h2 className="text-[15px] font-semibold">
              {lang === "en" ? t("listen.chartsEn") : t("listen.charts")}
              {normalizedQuery ? ` (${filteredCharts.length})` : ""}
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
            {filteredCharts.map((entry, index) => (
              <li key={entry.appleId} className="w-[132px] shrink-0 sm:w-[140px]">
                <button
                  type="button"
                  className="group w-full text-left transition-transform duration-200 hover:-translate-y-0.5 active:scale-95"
                  onClick={() =>
                    onPick(entry.pageUrl ?? `https://podcasts.apple.com/de/podcast/id${entry.appleId}`)
                  }
                >
                  <div className="relative overflow-hidden rounded-2xl shadow-sm ring-1 ring-black/5 dark:ring-white/10">
                    <Art src={entry.artwork} alt="" size={140} seed={entry.title} />
                    <span className="absolute left-2 top-2 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-black/70 px-1.5 font-mono text-[11px] font-bold text-white backdrop-blur-md">
                      #{index + 1}
                    </span>
                  </div>
                  <span className="mt-2 block line-clamp-2 text-[12.5px] font-semibold leading-snug text-[var(--ink)] group-hover:text-[var(--accent)] transition-colors">
                    {entry.title}
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
            {normalizedQuery ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[var(--accent)]/10 text-[var(--accent)] text-[11.5px] font-medium">
                <span>{t("library.matchingCount", { n: filtered.length })}</span>
                {onSearchChange && (
                  <button
                    type="button"
                    onClick={() => onSearchChange("")}
                    className="hover:opacity-75 p-0.5 font-bold"
                    title={t("library.clearSearch") || "Clear search"}
                  >
                    ×
                  </button>
                )}
              </span>
            ) : (
              <span className="text-[12px] text-[var(--ink-faint)]">
                {filtered.length} {filtered.length === 1 ? "show" : "shows"}
              </span>
            )}
            <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
              <div className="flex overflow-hidden rounded-full border border-[var(--rule)] bg-[var(--surface)] p-0.5">
                {([" ", "de", "en"] as const).map((option) => {
                  const value = option.trim() as SourceLang | "";
                  const isActive = lang === value;
                  return (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={isActive}
                      onClick={() => {
                        setLang(value);
                        setTopic("");
                        if (value === "en") setLevel("");
                      }}
                      className={`rounded-full px-3 py-1 text-[12px] font-semibold transition-all ${
                        isActive
                          ? "bg-[var(--accent)] text-[var(--paper)] shadow-xs"
                          : "text-[var(--ink-soft)] hover:text-[var(--ink)]"
                      }`}
                    >
                      {value === "" ? t("common.all") : value === "de" ? "Deutsch" : "English"}
                    </button>
                  );
                })}
              </div>

              {/* Sort pills: Most listened (default) vs A-Z */}
              <div className="flex overflow-hidden rounded-full border border-[var(--rule)] bg-[var(--surface)] p-0.5">
                <button
                  type="button"
                  onClick={() => setCatalogSort("popular")}
                  className={`rounded-full px-2.5 py-1 text-[11.5px] font-medium transition ${
                    catalogSort === "popular"
                      ? "bg-[var(--accent)] text-[var(--paper)] shadow-xs"
                      : "text-[var(--ink-soft)] hover:text-[var(--ink)]"
                  }`}
                  title={t("sort.mostListened")}
                >
                  🔥 {t("sort.mostListened")}
                </button>
                <button
                  type="button"
                  onClick={() => setCatalogSort("az")}
                  className={`rounded-full px-2.5 py-1 text-[11.5px] font-medium transition ${
                    catalogSort === "az"
                      ? "bg-[var(--accent)] text-[var(--paper)] shadow-xs"
                      : "text-[var(--ink-soft)] hover:text-[var(--ink)]"
                  }`}
                  title={t("sort.az")}
                >
                  🔤 {t("sort.az")}
                </button>
                {levelsApply && (
                  <button
                    type="button"
                    onClick={() => setCatalogSort("level")}
                    className={`rounded-full px-2.5 py-1 text-[11.5px] font-medium transition ${
                      catalogSort === "level"
                        ? "bg-[var(--accent)] text-[var(--paper)] shadow-xs"
                        : "text-[var(--ink-soft)] hover:text-[var(--ink)]"
                    }`}
                    title={t("sort.level")}
                  >
                    📊 {t("sort.level")}
                  </button>
                )}
              </div>
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
        {normalizedQuery && sortedCatalog.length > 0 ? (
          <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2.5 rounded-xl bg-[var(--surface)] p-2.5 sm:p-3 border border-[var(--rule)]/70 text-[12.5px] shadow-2xs">
            <span className="text-[var(--ink-soft)]">
              {t("library.searchGlobal")}: <strong className="text-[var(--ink)]">&ldquo;{searchQuery}&rdquo;</strong>
            </span>
            <button
              type="button"
              onClick={() => onPick(searchQuery)}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--accent)] text-[var(--paper)] text-[12px] font-semibold hover:opacity-95 active:scale-95 transition shadow-2xs"
            >
              <span>{t("library.searchGlobalAction", { q: searchQuery })}</span>
              <span>→</span>
            </button>
          </div>
        ) : null}

        {sortedCatalog.length === 0 ? (
          <div className="py-12 text-center rounded-2xl border border-dashed border-[var(--rule)] bg-[var(--surface)]/40 p-6">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent)]/10 text-[var(--accent)]">
              <svg viewBox="0 0 24 24" className="w-6 h-6 stroke-current fill-none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
            </div>
            <h3 className="text-[15px] font-semibold text-[var(--ink)]">
              {normalizedQuery
                ? t("library.noSourceMatch", { q: searchQuery })
                : t("feed.noMatch")}
            </h3>
            <p className="mt-1 text-[13px] text-[var(--ink-soft)] max-w-md mx-auto">
              {topic && basePool.length > 0
                ? `Không có kết quả trong chủ đề "${topic}". Bạn có thể xóa bộ lọc chủ đề để xem ${basePool.length} nguồn khác.`
                : t("library.noSourceMatchHint")}
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              {normalizedQuery && (
                <button
                  type="button"
                  onClick={() => onPick(searchQuery)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[var(--accent)] text-[var(--paper)] text-[13px] font-semibold shadow-xs hover:opacity-95 active:scale-95 transition"
                >
                  <svg viewBox="0 0 24 24" className="w-4 h-4 stroke-current fill-none shrink-0" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <path d="M21 21l-4.35-4.35" />
                  </svg>
                  <span>{t("library.searchGlobalAction", { q: searchQuery })}</span>
                </button>
              )}
              {topic && basePool.length > 0 && (
                <button
                  type="button"
                  onClick={() => setTopic("")}
                  className="px-3.5 py-2 rounded-full bg-[var(--surface)] text-[var(--ink)] text-[13px] font-medium border border-[var(--rule)] hover:bg-[var(--surface-high)] active:scale-95 transition"
                >
                  Xóa lọc chủ đề ({basePool.length})
                </button>
              )}
              {onSearchChange && normalizedQuery && (
                <button
                  type="button"
                  onClick={() => onSearchChange("")}
                  className="px-3.5 py-2 rounded-full bg-[var(--surface)] text-[var(--ink)] text-[13px] font-medium border border-[var(--rule)] hover:bg-[var(--surface-high)] active:scale-95 transition"
                >
                  {t("common.all")}
                </button>
              )}
            </div>
          </div>
        ) : (
          <ul className="grid gap-3 pt-1 sm:grid-cols-2 lg:grid-cols-3">
            {sortedCatalog.map((item: Suggestion) => (
              <li key={`${item.label}|${item.lang}`} className="min-w-0">
                <button
                  type="button"
                  className="group relative flex h-full w-full flex-col justify-between rounded-2xl border border-[var(--rule)]/80 bg-[var(--paper-raised)] p-4 text-left shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--accent)]/60 hover:shadow-md active:scale-[0.985]"
                  onClick={() => onPick(item.feedUrl ?? item.query)}
                >
                  <div>
                    <div className="flex flex-wrap items-baseline justify-between gap-1.5">
                      <span className="text-[14.5px] font-semibold text-[var(--ink)] group-hover:text-[var(--accent)] transition-colors">
                        {item.label}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="chip text-[10px] uppercase font-medium">{item.lang === "de" ? "DE" : "EN"}</span>
                        {item.cefr ? (
                          <span className="chip chip-level text-[10px] font-semibold">{item.cefr}</span>
                        ) : null}
                      </div>
                    </div>
                    <span className="mt-1 block truncate text-[12px] font-medium text-[var(--ink-soft)]">{item.publisher}</span>
                  </div>
                  <span className="mt-2 block text-[12px] leading-relaxed text-[var(--ink-faint)]">
                    {item.why}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
