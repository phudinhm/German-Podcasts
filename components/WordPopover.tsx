"use client";

import { useEffect, useRef, useState } from "react";
import type { LookupResult, Segment, TargetLang, Cefr } from "@/lib/types";
import type { RenderedWord } from "@/lib/german/render";
import { HAZARD_LABEL } from "@/lib/german/render";
import { useUi } from "@/lib/i18n";

export interface WordSelection {
  token: string;
  rendered: RenderedWord;
  segment: Segment;
  anchor: { top: number; left: number; width: number; height: number };
}

interface Props {
  selection: WordSelection;
  lang: TargetLang;
  episode: { slug: string; title: string; cefr: Cefr };
  onClose: () => void;
}

const LANG_LABEL: Record<TargetLang, string> = { en: "English", vi: "Vietnamese" };

export function WordPopover({ selection, lang, episode, onClose }: Props) {
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
      body: JSON.stringify({
        word: selection.token,
        sentence: selection.segment.de,
        lang,
        slug: episode.slug,
      }),
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
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : "Lookup failed");
      });

    return () => controller.abort();
  }, [selection.token, selection.segment.de, lang, episode.slug]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    function onClickAway(event: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) onClose();
    }
    window.addEventListener("keydown", onKey);
    // Defer so the click that opened the popover does not immediately close it.
    const timer = window.setTimeout(() => document.addEventListener("mousedown", onClickAway), 0);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(timer);
      document.removeEventListener("mousedown", onClickAway);
    };
  }, [onClose]);


  const { top, left, width } = selection.anchor;
  const style: React.CSSProperties = {
    position: "absolute",
    top: top + 26,
    left: Math.max(8, Math.min(left + width / 2 - 170, (typeof window !== "undefined" ? window.innerWidth : 1200) - 356)),
    width: 340,
    zIndex: 50,
  };

  const glosses = result?.translations[lang] ?? [];
  const sentenceGloss = lang === "en" ? result?.sentence?.en : result?.sentence?.vi;
  const fallbackGloss = lang === "en" ? selection.segment.en : selection.segment.vi;

  return (
    <div ref={boxRef} style={style} className="card p-3.5 text-[13px] shadow-lg">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            {result?.noun ? (
              <span className="text-[13px] font-medium text-[var(--accent)]">{result.noun.gender}</span>
            ) : null}
            <span className="text-[17px] font-semibold" style={{ fontFamily: "var(--font-display)" }}>
              {result?.lemma ?? selection.token}
            </span>
            {result?.noun?.plural ? (
              <span className="text-[12px] text-[var(--ink-faint)]">
                {t("word.plural")} die {result.noun.plural}
              </span>
            ) : null}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-[var(--ink-faint)]">
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
          </div>
        </div>
        <button type="button" onClick={onClose} className="btn px-2 py-0.5 text-[11px]" aria-label="Schließen">
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
                {t("word.noOffline", { lang: LANG_LABEL[lang] })}
              </span>
            )}
          </p>

          {result.notes ? (
            <p className="mt-2 border-l-2 border-[var(--accent-ring)] pl-2 text-[12px] leading-relaxed text-[var(--ink-soft)]">
              {result.notes}
            </p>
          ) : null}

          <div className="mt-3 border-t border-[var(--rule)] pt-2.5">
            <p className="text-[12px] leading-relaxed text-[var(--ink-soft)]">{selection.segment.de}</p>
            <p className="mt-1 text-[12px] leading-relaxed text-[var(--gloss)]">
              {sentenceGloss || fallbackGloss || "-"}
            </p>
          </div>

          <PhoneticNote rendered={selection.rendered} />

          <div className="mt-3 flex justify-end">
            <span className="text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
              {result.source}
            </span>
          </div>
        </>
      ) : null}
    </div>
  );
}

function PhoneticNote({ rendered }: { rendered: RenderedWord }) {
  const { t } = useUi();
  const kinds = [...new Set(rendered.hazards.map((h) => h.kind))];
  if (rendered.syllables.length < 2 && kinds.length === 0) return null;

  return (
    <div className="mt-3 border-t border-[var(--rule)] pt-2.5">
      <p className="font-mono text-[12px] tracking-wide">
        {rendered.syllables.map((syllable, index) => (
          <span key={index}>
            {index > 0 ? <span className="text-[var(--ink-faint)]">-</span> : null}
            <span className={index === rendered.stressIndex ? "font-semibold uppercase text-[var(--accent)]" : ""}>
              {syllable}
            </span>
          </span>
        ))}
        {rendered.parts.length > 1 ? (
          <span className="ml-2 text-[11px] text-[var(--ink-faint)]">
            {t("word.compound")}: {rendered.parts.join(" + ")}
          </span>
        ) : null}
      </p>
      {kinds.length > 0 ? (
        <ul className="mt-1.5 space-y-0.5">
          {kinds.map((kind) => {
            const hazard = rendered.hazards.find((h) => h.kind === kind)!;
            return (
              <li key={kind} className="text-[11px] leading-snug text-[var(--ink-soft)]">
                <span className="font-medium">{HAZARD_LABEL[kind]}</span>
                {": "}
                {hazard.hint}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
