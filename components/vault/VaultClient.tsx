"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { loadSettings, loadVault, removeEntry, saveSettings, type VaultEntry } from "@/lib/vault";
import { describeDue, isDue, leitnerBox, LEITNER_INTERVALS } from "@/lib/srs";
import {
  contextLink,
  formatTimestamp,
  toAnkiTsv,
  toClozeTsv,
  toCsv,
  toNotionCsv,
  toObsidianMarkdown,
  toQuizlet,
} from "@/lib/export";
import { CEFR_LEVELS, type Cefr, type TargetLang } from "@/lib/types";
import { LevelBadge } from "@/components/LevelBadge";
import { ReviewSession } from "./ReviewSession";
import { useUi } from "@/lib/i18n";

type Tab = "list" | "review";

export function VaultClient() {
  const { t } = useUi();
  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [lang, setLang] = useState<TargetLang>("en");
  const [tab, setTab] = useState<Tab>("list");
  const [levelFilter, setLevelFilter] = useState<Cefr | "">("");
  const [query, setQuery] = useState("");
  const [hydrated, setHydrated] = useState(false);

  const refresh = useCallback(() => setEntries(loadVault()), []);

  useEffect(() => {
    refresh();
    setLang(loadSettings().targetLang);
    setHydrated(true);
    window.addEventListener("hoerbar:vault-changed", refresh);
    return () => window.removeEventListener("hoerbar:vault-changed", refresh);
  }, [refresh]);

  const due = useMemo(() => entries.filter((entry) => isDue(entry.srs)), [entries]);

  const boxes = useMemo(() => {
    const counts = [0, 0, 0, 0, 0];
    for (const entry of entries) counts[leitnerBox(entry.srs) - 1] += 1;
    return counts;
  }, [entries]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return entries.filter((entry) => {
      if (levelFilter && entry.context.cefr !== levelFilter) return false;
      if (!needle) return true;
      return (
        entry.lemma.toLowerCase().includes(needle) ||
        entry.context.de.toLowerCase().includes(needle) ||
        entry.translations.en.join(" ").toLowerCase().includes(needle) ||
        entry.translations.vi.join(" ").toLowerCase().includes(needle)
      );
    });
  }, [entries, levelFilter, query]);

  function download(filename: string, content: string, type: string) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function changeLang(next: TargetLang) {
    setLang(next);
    saveSettings({ ...loadSettings(), targetLang: next });
  }

  if (!hydrated) {
    return <p className="py-16 text-center text-[13px] text-[var(--ink-faint)]">{t("common.loading")}</p>;
  }

  if (entries.length === 0) {
    return (
      <div className="card mx-auto max-w-lg p-8 text-center">
        <h1 className="text-[20px] font-semibold" style={{ fontFamily: "var(--font-display)" }}>
          {t("vault.empty")}
        </h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--ink-soft)]">
          {t("vault.emptyBody")}
        </p>
        <Link href="/catalog" className="btn btn-primary mt-4">
          {t("vault.toCatalog")}
        </Link>
      </div>
    );
  }

  return (
    <div>
      <header className="mb-5 flex flex-wrap items-end gap-x-4 gap-y-2">
        <div>
          <h1 className="text-[24px] font-semibold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
            {t("vault.title")}
          </h1>
          <p className="mt-0.5 text-[13px] text-[var(--ink-soft)]">
            {entries.length === 1 ? t("vault.wordCountOne") : t("vault.wordCount", { n: entries.length })} · {t("vault.dueToday", { n: due.length })}
          </p>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-[var(--rule)]">
            {(["en", "vi"] as const).map((option) => (
              <button
                key={option}
                type="button"
                data-active={lang === option}
                onClick={() => changeLang(option)}
                className="btn rounded-none border-0 border-r border-[var(--rule)] px-2.5 py-1 text-[12px] last:border-r-0"
              >
                {option === "en" ? "English" : "Tiếng Việt"}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setTab(tab === "review" ? "list" : "review")}
            disabled={due.length === 0 && tab === "list"}
          >
            {tab === "review" ? t("vault.toList") : t("vault.review", { n: due.length })}
          </button>
        </div>
      </header>

      <LeitnerStrip boxes={boxes} total={entries.length} />

      {tab === "review" ? (
        <div className="mt-5">
          <ReviewSession entries={entries} lang={lang} onDone={() => { refresh(); setTab("list"); }} />
        </div>
      ) : (
        <>
          <div className="mt-5 flex flex-wrap items-center gap-2 border-y border-[var(--rule)] py-2.5">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("vault.searchPlaceholder")}
              className="btn w-[180px] justify-start font-normal"
            />
            <select
              value={levelFilter}
              onChange={(event) => setLevelFilter(event.target.value as Cefr | "")}
              className="btn py-1 text-[12px]"
            >
              <option value="">{t("vault.allLevels")}</option>
              {CEFR_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>

            <div className="ml-auto flex flex-wrap gap-1.5">
              <button
                type="button"
                className="btn text-[12px]"
                onClick={() =>
                  download("hoerbar-anki.txt", toAnkiTsv(visible, { lang }), "text/plain;charset=utf-8")
                }
              >
                {t("vault.export")}
              </button>
              <button
                type="button"
                className="btn text-[12px]"
                onClick={() =>
                  download("hoerbar-cloze.txt", toClozeTsv(visible, { lang }), "text/plain;charset=utf-8")
                }
              >
                {t("vault.cloze")}
              </button>
              <button
                type="button"
                className="btn text-[12px]"
                onClick={() => download("hoerbar-vokabeln.csv", toCsv(visible, { lang }), "text/csv;charset=utf-8")}
              >
                CSV
              </button>
              <button
                type="button"
                className="btn text-[12px]"
                onClick={() =>
                  download("hoerbar-quizlet.txt", toQuizlet(visible, { lang }), "text/plain;charset=utf-8")
                }
              >
                Quizlet
              </button>
              <button
                type="button"
                className="btn text-[12px]"
                onClick={() =>
                  download("hoerbar-notion.csv", toNotionCsv(visible, { lang }), "text/csv;charset=utf-8")
                }
              >
                Notion
              </button>
              <button
                type="button"
                className="btn text-[12px]"
                onClick={() =>
                  download(
                    "hoerbar-vokabeln.md",
                    toObsidianMarkdown(visible, { lang }),
                    "text/markdown;charset=utf-8",
                  )
                }
              >
                Obsidian
              </button>
            </div>
          </div>

          <ul className="mt-1 divide-y divide-[var(--rule)]">
            {visible.map((entry) => (
              <li key={entry.id} className="grid grid-cols-[1fr_auto] gap-x-4 py-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-[16px] font-semibold" style={{ fontFamily: "var(--font-display)" }}>
                      {entry.article ? <span className="text-[var(--accent)]">{entry.article} </span> : null}
                      {entry.lemma}
                    </span>
                    {entry.plural ? (
                      <span className="text-[11px] text-[var(--ink-faint)]">{t("word.plural")} die {entry.plural}</span>
                    ) : null}
                    <span className="text-[13px] text-[var(--ink-soft)]">
                      {entry.translations[lang].join(", ")}
                    </span>
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-relaxed text-[var(--ink-faint)]">
                    {entry.context.de}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[var(--ink-faint)]">
                    <LevelBadge level={entry.context.cefr} />
                    <Link
                      href={contextLink(entry)}
                      className="underline decoration-dotted underline-offset-4 hover:text-[var(--accent)]"
                    >
                      {entry.context.episodeTitle} @ {formatTimestamp(entry.context.start)}
                    </Link>
                  </p>
                </div>

                <div className="flex flex-col items-end gap-1 text-right">
                  <span className="chip">{t("review.box", { n: leitnerBox(entry.srs) })}</span>
                  <span className="text-[11px] text-[var(--ink-faint)]">{describeDue(entry.srs)}</span>
                  <button
                    type="button"
                    className="text-[11px] text-[var(--ink-faint)] underline decoration-dotted underline-offset-4 hover:text-rose-600"
                    onClick={() => {
                      removeEntry(entry.id);
                      refresh();
                    }}
                  >
                    {t("vault.remove")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function LeitnerStrip({ boxes, total }: { boxes: number[]; total: number }) {
  const { t } = useUi();
  return (
    <div className="card p-3.5">
      <div className="flex items-baseline gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-faint)]">
          {t("vault.leitner")}
        </h2>
        <span className="text-[11px] text-[var(--ink-faint)]">
          {t("vault.intervals", { list: LEITNER_INTERVALS.join(", ") })}
        </span>
      </div>
      <div className="mt-2.5 flex gap-2">
        {boxes.map((count, index) => (
          <div key={index} className="flex-1">
            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--rule)]">
              <div
                className="h-full rounded-full bg-[var(--accent-ring)]"
                style={{ width: `${total ? (count / total) * 100 : 0}%` }}
              />
            </div>
            <p className="mt-1 text-[10px] text-[var(--ink-faint)]">
              {t("review.box", { n: index + 1 })} · {count}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
