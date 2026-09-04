"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useUi } from "@/lib/i18n";
import type { LookupResult, TargetLang } from "@/lib/types";

export interface QuickSelection {
  word: string;
  sentence: string;
  /** Seconds into the episode, so the saved card can link back. */
  at: number;
  anchor: { top: number; left: number; width: number };
}

export interface QuickContext {
  episodeSlug: string;
  episodeTitle: string;
}

/**
 * Dictionary popover for text that is not a catalog transcript: live captions
 * and streamed episodes. Same lookup chain as the main transcript, but it does
 * not assume a graded episode behind it, so a saved word still carries its
 * sentence and timestamp and simply records B1 as an unknown level.
 */
export function QuickLookup({
  selection,
  lang,
  context,
  onClose,
}: {
  selection: QuickSelection;
  lang: TargetLang;
  context: QuickContext;
  onClose: () => void;
}) {
  const { t } = useUi();
  const [result, setResult] = useState<LookupResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setResult(null);
    setError(null);
    fetch("/api/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word: selection.word, sentence: selection.sentence, lang }),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Lookup failed (${response.status})`);
        return (await response.json()) as LookupResult;
      })
      .then((data) => {
        setResult(data);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : "Lookup failed");
        }
      });
    return () => controller.abort();
  }, [selection.word, selection.sentence, lang, context.episodeSlug]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    function onAway(event: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) onClose();
    }
    window.addEventListener("keydown", onKey);
    const timer = window.setTimeout(() => document.addEventListener("mousedown", onAway), 0);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(timer);
      document.removeEventListener("mousedown", onAway);
    };
  }, [onClose]);


  const glosses = result?.translations[lang] ?? [];
  const sentenceGloss = lang === "en" ? result?.sentence?.en : result?.sentence?.vi;
  const width = 330;
  const left = Math.max(
    8,
    Math.min(
      selection.anchor.left + selection.anchor.width / 2 - width / 2,
      (typeof window !== "undefined" ? window.innerWidth : 1200) - width - 12,
    ),
  );

  return (
    <div
      ref={boxRef}
      className="card p-3.5 text-[13px] shadow-lg"
      style={{ position: "absolute", top: selection.anchor.top + 24, left, width, zIndex: 70 }}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-x-2">
            {result?.noun ? (
              <span className="text-[13px] font-medium text-[var(--accent)]">{result.noun.gender}</span>
            ) : null}
            <span className="text-[17px] font-semibold">{result?.lemma ?? selection.word}</span>
            {result?.noun?.plural ? (
              <span className="text-[12px] text-[var(--ink-faint)]">
                {t("word.plural")} die {result.noun.plural}
              </span>
            ) : null}
          </p>
          <p className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-[var(--ink-faint)]">
            <span>{result?.pos ?? "…"}</span>
            {result && result.surface.toLowerCase() !== result.lemma.toLowerCase() ? (
              <span>
                {t("word.inText")}: <span className="italic">{result.surface}</span>
              </span>
            ) : null}
            {result?.separable ? (
              <span className="text-[var(--accent)]">
                {t("word.separable")}: {result.separable.prefix} + {result.separable.stem}
              </span>
            ) : null}
          </p>
        </div>
        <button type="button" onClick={onClose} className="btn px-2 py-0.5 text-[11px]">
          esc
        </button>
      </div>

      {error ? <p className="mt-2 text-[12px] text-rose-600">{error}</p> : null}
      {!result && !error ? (
        <p className="mt-3 text-[12px] text-[var(--ink-faint)]">{t("word.lookingUp")}</p>
      ) : null}

      {result ? (
        <>
          <p className="mt-2.5 leading-relaxed">
            {glosses.length > 0 ? (
              glosses.join(", ")
            ) : (
              <span className="text-[var(--ink-faint)]">
                {t("word.noOffline", { lang: lang === "en" ? "English" : "Vietnamese" })}
              </span>
            )}
          </p>
          {result.notes ? (
            <p className="mt-2 border-l-2 border-[var(--accent-ring)] pl-2 text-[12px] leading-relaxed text-[var(--ink-soft)]">
              {result.notes}
            </p>
          ) : null}

          <div className="mt-3 border-t border-[var(--rule)] pt-2.5">
            <p className="text-[12px] leading-relaxed text-[var(--ink-soft)]">{selection.sentence}</p>
            {sentenceGloss ? (
              <p className="mt-1 text-[12px] leading-relaxed text-[var(--ink-faint)]">{sentenceGloss}</p>
            ) : null}
          </div>

        </>
      ) : null}
    </div>
  );
}
