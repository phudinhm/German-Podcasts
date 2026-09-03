"use client";

import { useEffect, useState } from "react";
import type { Segment } from "@/lib/types";
import type { SyntaxNote } from "@/lib/german/syntax";
import { useUi } from "@/lib/i18n";

interface Response {
  rules: SyntaxNote[];
  model: SyntaxNote[];
  source: string;
}

/** The Grammar Deconstructor drawer. */
export function BreakdownPanel({ segment, onClose }: { segment: Segment; onClose: () => void }) {
  const { t } = useUi();
  const [data, setData] = useState<Response | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError(null);
    fetch("/api/breakdown", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sentence: segment.de }),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Breakdown failed (${response.status})`);
        return (await response.json()) as Response;
      })
      .then(setData)
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : "Breakdown failed");
        }
      });
    return () => controller.abort();
  }, [segment.de]);

  const notes = [...(data?.model ?? []), ...(data?.rules ?? [])];
  const focus = new Set(notes.flatMap((note) => note.focus.map((word) => word.toLowerCase())));

  return (
    <aside className="card p-4">
      <div className="flex items-start gap-2">
        <h3 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-faint)]">
          {t("syntax.title")}
        </h3>
        <button type="button" onClick={onClose} className="btn ml-auto px-2 py-0.5 text-[11px]">
          {t("common.close")}
        </button>
      </div>

      <p className="mt-2 text-[15px] leading-[1.7]" style={{ fontFamily: "var(--font-display)" }}>
        {segment.de.split(/(\s+)/).map((piece, index) => {
          const clean = piece.replace(/[^\p{L}]/gu, "").toLowerCase();
          return focus.has(clean) && clean ? (
            <mark key={index} className="rounded bg-[var(--accent-soft)] px-0.5 text-[var(--ink)]">
              {piece}
            </mark>
          ) : (
            <span key={index}>{piece}</span>
          );
        })}
      </p>

      {error ? <p className="mt-2 text-[12px] text-rose-600">{error}</p> : null}
      {!data && !error ? (
        <p className="mt-3 text-[12px] text-[var(--ink-faint)]">{t("syntax.analysing")}</p>
      ) : null}

      {notes.length > 0 ? (
        <ul className="mt-3 space-y-2.5">
          {notes.map((note, index) => (
            <li key={index} className="border-l-2 border-[var(--accent-ring)] pl-2.5">
              <p className="text-[13px] font-semibold">{note.title}</p>
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-[var(--ink-soft)]">{note.detail}</p>
            </li>
          ))}
        </ul>
      ) : null}

      {data && notes.length === 0 ? (
        <p className="mt-3 text-[12px] text-[var(--ink-faint)]">
          {t("syntax.nothing")}
        </p>
      ) : null}

      {data ? (
        <p className="mt-3 border-t border-[var(--rule)] pt-2 text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
          {data.source === "rules"
            ? t("syntax.rulesOnly")
            : t("syntax.rulesModel")}
        </p>
      ) : null}
    </aside>
  );
}
