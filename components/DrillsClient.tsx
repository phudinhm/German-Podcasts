"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CEFR_LEVELS, type Cefr } from "@/lib/types";
import { LevelBadge } from "./LevelBadge";
import { ShadowingBadge } from "./ShadowingBadge";
import { formatTimestamp } from "@/lib/export";

export interface DrillItem {
  episodeSlug: string;
  episodeTitle: string;
  publisher: string;
  cefr: Cefr;
  sdm: number;
  segmentId: string;
  start: number;
  end: number;
  de: string;
  en: string;
  vi: string;
  /** Syllables per second for this sentence alone. */
  rate: number;
}

const SPRINT_SECONDS = 300;

/**
 * The five-minute micro-drill.
 *
 * The constraint is real: nobody with a job sits through a 45-minute podcast on
 * a Tuesday. Five sentences, picked for lexical payload rather than for where
 * they happen to sit in the episode, is a session that survives a lunch break.
 */
export function DrillsClient({ drills }: { drills: DrillItem[] }) {
  const [level, setLevel] = useState<Cefr | "">("");
  const [running, setRunning] = useState(false);
  const [remaining, setRemaining] = useState(SPRINT_SECONDS);
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());

  const pool = useMemo(() => {
    const filtered = level ? drills.filter((drill) => drill.cefr === level) : drills;
    return [...filtered].sort((a, b) => a.sdm - b.sdm || a.rate - b.rate);
  }, [drills, level]);

  const sprint = useMemo(() => pool.slice(0, 5), [pool]);

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      setRemaining((value) => {
        if (value <= 1) {
          window.clearInterval(timer);
          setRunning(false);
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;

  return (
    <div>
      <header className="mb-5 max-w-2xl">
        <h1 className="text-[26px] font-semibold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
          Fünf Minuten, fünf Sätze
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-[var(--ink-soft)]">
          Aus jeder Folge wählt Hörbar die Sätze mit dem höchsten Lernwert: lang genug, um eine echte
          Phrase zu sein, kurz genug fürs Arbeitsgedächtnis, lexikalisch dicht und ohne phonetische
          Sackgassen. Jeder Satz öffnet direkt im Echo-Modus.
        </p>
      </header>

      <div className="mb-5 flex flex-wrap items-center gap-2 border-y border-[var(--rule)] py-2.5">
        <span className="text-[11px] uppercase tracking-[0.14em] text-[var(--ink-faint)]">Niveau</span>
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            className="btn px-2.5 py-1 text-[12px]"
            data-active={level === ""}
            onClick={() => setLevel("")}
          >
            alle
          </button>
          {CEFR_LEVELS.map((option) => {
            const count = drills.filter((drill) => drill.cefr === option).length;
            return (
              <button
                key={option}
                type="button"
                disabled={count === 0}
                className="btn px-2.5 py-1 text-[12px]"
                data-active={level === option}
                onClick={() => setLevel(option)}
              >
                {option}
                <span className="ml-1 text-[10px] text-[var(--ink-faint)]">{count}</span>
              </button>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className="font-mono text-[15px] tabular-nums">
            {minutes}:{String(seconds).padStart(2, "0")}
          </span>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              if (running) {
                setRunning(false);
                return;
              }
              if (remaining === 0) setRemaining(SPRINT_SECONDS);
              setDoneIds(new Set());
              setRunning(true);
            }}
          >
            {running ? "Pause" : remaining === SPRINT_SECONDS ? "Sprint starten" : "Weiter"}
          </button>
        </div>
      </div>

      {sprint.length === 0 ? (
        <p className="py-16 text-center text-[13px] text-[var(--ink-faint)]">
          Für dieses Niveau gibt es noch keine Drills. Lies zuerst eine Folge mit dem Ingest-Worker ein.
        </p>
      ) : (
        <ol className="space-y-3">
          {sprint.map((drill, index) => {
            const key = `${drill.episodeSlug}:${drill.segmentId}`;
            const done = doneIds.has(key);
            return (
              <li key={key} className="card p-4" data-done={done}>
                <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] text-[var(--ink-faint)]">
                  <span className="font-mono">{String(index + 1).padStart(2, "0")}</span>
                  <LevelBadge level={drill.cefr} />
                  <span>{drill.episodeTitle}</span>
                  <span>@ {formatTimestamp(drill.start)}</span>
                  <ShadowingBadge sdm={drill.sdm} showLabel={false} className="ml-auto" />
                </div>

                <p
                  className={`text-[17px] leading-[1.65] ${done ? "opacity-45" : ""}`}
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {drill.de}
                </p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-[var(--gloss)]">{drill.en}</p>

                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <Link
                    href={`/watch/${drill.episodeSlug}?seg=${drill.segmentId}&mode=echo`}
                    className="btn btn-primary text-[12px]"
                  >
                    Echo üben
                  </Link>
                  <Link
                    href={`/watch/${drill.episodeSlug}?seg=${drill.segmentId}&mode=loop`}
                    className="btn text-[12px]"
                  >
                    In Schleife
                  </Link>
                  <button
                    type="button"
                    className="btn text-[12px]"
                    onClick={() =>
                      setDoneIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(key)) next.delete(key);
                        else next.add(key);
                        return next;
                      })
                    }
                  >
                    {done ? "wieder öffnen" : "abgehakt"}
                  </button>
                  <span className="ml-auto text-[11px] text-[var(--ink-faint)]">
                    {drill.rate.toFixed(1)} Silben/s · {(drill.end - drill.start).toFixed(1)} s
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
