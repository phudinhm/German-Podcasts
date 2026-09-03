"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CEFR_LEVELS, type Cefr, type EpisodeSummary } from "@/lib/types";
import { useUi } from "@/lib/i18n";
import { LevelBadge } from "./LevelBadge";
import { ShadowingBadge } from "./ShadowingBadge";

function formatDuration(seconds: number): string {
  if (!seconds) return "-";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${minutes % 60} min`;
}

type SortKey = "level" | "sdm" | "duration";

export function CatalogGrid({ episodes }: { episodes: EpisodeSummary[] }) {
  const { t } = useUi();
  const [levels, setLevels] = useState<Set<Cefr>>(new Set());
  const [topic, setTopic] = useState<string>("");
  const [sort, setSort] = useState<SortKey>("level");
  const [readyOnly, setReadyOnly] = useState(false);

  const topics = useMemo(
    () => [...new Set(episodes.flatMap((e) => e.topics))].sort((a, b) => a.localeCompare(b, "de")),
    [episodes],
  );

  const visible = useMemo(() => {
    const filtered = episodes.filter((episode) => {
      if (levels.size > 0 && !levels.has(episode.cefr)) return false;
      if (topic && !episode.topics.includes(topic)) return false;
      if (readyOnly && episode.transcriptStatus === "pending") return false;
      return true;
    });

    return filtered.sort((a, b) => {
      if (sort === "sdm") return a.metrics.sdm - b.metrics.sdm;
      if (sort === "duration") return a.durationSec - b.durationSec;
      return (
        CEFR_LEVELS.indexOf(a.cefr) - CEFR_LEVELS.indexOf(b.cefr) ||
        a.metrics.sdm - b.metrics.sdm
      );
    });
  }, [episodes, levels, topic, sort, readyOnly]);

  function toggleLevel(level: Cefr) {
    setLevels((current) => {
      const next = new Set(current);
      if (next.has(level)) next.delete(level);
      else next.add(level);
      return next;
    });
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 border-y border-[var(--rule)] py-3">
        <span className="text-[11px] uppercase tracking-[0.14em] text-[var(--ink-faint)]">{t("common.level")}</span>
        <div className="flex flex-wrap gap-1">
          {CEFR_LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              onClick={() => toggleLevel(level)}
              data-active={levels.has(level)}
              className="btn px-2.5 py-1 text-[12px]"
              aria-pressed={levels.has(level)}
            >
              {level}
            </button>
          ))}
          {levels.size > 0 ? (
            <button type="button" className="btn px-2.5 py-1 text-[12px]" onClick={() => setLevels(new Set())}>
              {t("common.all")}
            </button>
          ) : null}
        </div>

        <span className="ml-2 text-[11px] uppercase tracking-[0.14em] text-[var(--ink-faint)]">{t("common.topic")}</span>
        <select
          value={topic}
          onChange={(event) => setTopic(event.target.value)}
          className="btn px-2 py-1 text-[12px]"
        >
          <option value="">{t("common.all")}</option>
          {topics.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>

        <span className="ml-2 text-[11px] uppercase tracking-[0.14em] text-[var(--ink-faint)]">{t("common.sort")}</span>
        <select
          value={sort}
          onChange={(event) => setSort(event.target.value as SortKey)}
          className="btn px-2 py-1 text-[12px]"
        >
          <option value="level">{t("catalog.byLevel")}</option>
          <option value="sdm">{t("catalog.byPace")}</option>
          <option value="duration">{t("catalog.byLength")}</option>
        </select>

        <label className="ml-auto flex cursor-pointer items-center gap-2 text-[12px] text-[var(--ink-soft)]">
          <input
            type="checkbox"
            checked={readyOnly}
            onChange={(event) => setReadyOnly(event.target.checked)}
            className="accent-[var(--accent-ring)]"
          />
          {t("catalog.transcriptOnly")}
        </label>
      </div>

      {visible.length === 0 ? (
        <p className="py-16 text-center text-sm text-[var(--ink-faint)]">
          {t("catalog.noResults")}
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((episode) => (
            <li key={episode.id}>
              <EpisodeCard episode={episode} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EpisodeCard({ episode }: { episode: EpisodeSummary }) {
  const { t } = useUi();
  const pending = episode.transcriptStatus === "pending";
  const body = (
    <article className="card flex h-full flex-col gap-3 p-4 transition-transform hover:-translate-y-0.5">
      <div className="flex items-center gap-2">
        <LevelBadge level={episode.cefr} />
        <span className="text-[11px] text-[var(--ink-faint)]">{episode.publisher}</span>
        <ShadowingBadge sdm={episode.metrics.sdm} showLabel={false} className="ml-auto" />
      </div>

      <h3 className="text-[15px] font-semibold leading-snug" style={{ fontFamily: "var(--font-display)" }}>
        {episode.title}
      </h3>

      <p className="line-clamp-3 text-[13px] leading-relaxed text-[var(--ink-soft)]">
        {episode.description}
      </p>

      <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
        {episode.topics.slice(0, 2).map((item) => (
          <span key={item} className="chip">
            {item}
          </span>
        ))}
        <span className="chip">{formatDuration(episode.durationSec)}</span>
        {pending ? (
          <span className="chip border-dashed text-[var(--ink-faint)]">{t("catalog.noTranscript")}</span>
        ) : null}
      </div>
    </article>
  );

  if (pending) {
    return (
      <Link href={`/watch/${episode.slug}`} className="block h-full opacity-80">
        {body}
      </Link>
    );
  }
  return (
    <Link href={`/watch/${episode.slug}`} className="block h-full">
      {body}
    </Link>
  );
}
