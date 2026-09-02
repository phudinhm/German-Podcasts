"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { describeDue, leitnerBox, review, sortQueue, type Grade } from "@/lib/srs";
import { updateEntry, type VaultEntry } from "@/lib/vault";
import { contextLink, makeCloze } from "@/lib/export";
import type { TargetLang } from "@/lib/types";

type Mode = "recall" | "cloze";

const GRADES: Array<{ grade: Grade; label: string; hint: string; tone: string }> = [
  { grade: 1, label: "Nochmal", hint: "keine Ahnung", tone: "border-rose-500/50" },
  { grade: 3, label: "Schwer", hint: "mit Mühe", tone: "border-amber-500/50" },
  { grade: 4, label: "Gut", hint: "sicher", tone: "border-sky-500/50" },
  { grade: 5, label: "Leicht", hint: "sofort", tone: "border-emerald-500/50" },
];

/**
 * The review flow. SM-2 decides the schedule; the two modes decide what you are
 * actually asked to do - produce the word from its meaning, or produce it back
 * into the sentence you first heard it in.
 */
export function ReviewSession({
  entries,
  lang,
  onDone,
}: {
  entries: VaultEntry[];
  lang: TargetLang;
  onDone: () => void;
}) {
  const [mode, setMode] = useState<Mode>("recall");
  const [queue, setQueue] = useState<VaultEntry[]>([]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState(0);

  useEffect(() => {
    setQueue(sortQueue(entries));
    setIndex(0);
    setRevealed(false);
    setDone(0);
  }, [entries]);

  const card = queue[index];
  const cloze = useMemo(() => (card ? makeCloze(card.context.de, card.surface) : null), [card]);

  function answer(grade: Grade) {
    if (!card) return;
    const next = review(card.srs, grade);
    updateEntry(card.id, {
      srs: next,
      history: [...card.history, { at: new Date().toISOString(), grade }],
    });
    setDone((value) => value + 1);
    setRevealed(false);
    if (index + 1 >= queue.length) onDone();
    else setIndex(index + 1);
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (!card) return;
      if (event.key === " ") {
        event.preventDefault();
        setRevealed(true);
        return;
      }
      if (!revealed) return;
      const grade = GRADES.find((option) => String(option.grade) === event.key);
      if (grade) {
        event.preventDefault();
        answer(grade.grade);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (queue.length === 0) {
    return (
      <div className="card p-6 text-center">
        <p className="text-[15px] font-medium">Nichts fällig.</p>
        <p className="mt-1 text-[13px] text-[var(--ink-soft)]">
          Genau darum geht es bei verteilter Wiederholung: die meisten Tage sind kurz.
        </p>
        <button type="button" className="btn mt-3" onClick={onDone}>
          Zurück zur Liste
        </button>
      </div>
    );
  }

  if (!card) {
    return (
      <div className="card p-6 text-center">
        <p className="text-[15px] font-medium">{done} Karten geschafft.</p>
        <button type="button" className="btn mt-3" onClick={onDone}>
          Zurück zur Liste
        </button>
      </div>
    );
  }

  const glosses = card.translations[lang];
  const contextGloss = lang === "en" ? card.context.en : card.context.vi;
  const front = mode === "cloze" && cloze ? cloze.replace(/\{\{c1::(.+?)\}\}/, "______") : null;

  return (
    <div className="card p-5">
      <div className="mb-4 flex flex-wrap items-center gap-2 text-[11px] text-[var(--ink-faint)]">
        <span>
          Karte {index + 1} von {queue.length}
        </span>
        <span>·</span>
        <span>Box {leitnerBox(card.srs)}</span>
        <span>·</span>
        <span>{describeDue(card.srs)}</span>
        <div className="ml-auto flex overflow-hidden rounded-lg border border-[var(--rule)]">
          {(["recall", "cloze"] as const).map((option) => (
            <button
              key={option}
              type="button"
              data-active={mode === option}
              onClick={() => {
                setMode(option);
                setRevealed(false);
              }}
              className="btn rounded-none border-0 border-r border-[var(--rule)] px-2.5 py-0.5 text-[11px] last:border-r-0"
            >
              {option === "recall" ? "Bedeutung → Wort" : "Lückensatz"}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-[150px]">
        {mode === "cloze" && front ? (
          <p className="text-[19px] leading-[1.6]" style={{ fontFamily: "var(--font-display)" }}>
            {front}
          </p>
        ) : (
          <>
            <p className="text-[19px] leading-snug" style={{ fontFamily: "var(--font-display)" }}>
              {glosses.length > 0 ? (
                glosses.join(", ")
              ) : (
                <span className="text-[var(--ink-faint)]">ohne Übersetzung gespeichert</span>
              )}
            </p>
            <p className="mt-1 text-[12px] text-[var(--ink-faint)]">{card.pos}</p>
          </>
        )}

        {revealed ? (
          <div className="mt-4 border-t border-[var(--rule)] pt-3">
            <p className="text-[22px] font-semibold" style={{ fontFamily: "var(--font-display)" }}>
              {card.article ? <span className="mr-1.5 text-[var(--accent)]">{card.article}</span> : null}
              {card.lemma}
              {card.plural ? (
                <span className="ml-2 text-[13px] font-normal text-[var(--ink-faint)]">
                  Pl. die {card.plural}
                </span>
              ) : null}
            </p>
            <p className="mt-2 text-[14px] leading-relaxed">{card.context.de}</p>
            {contextGloss ? (
              <p className="mt-0.5 text-[13px] leading-relaxed text-[var(--gloss)]">{contextGloss}</p>
            ) : null}
            <Link
              href={contextLink(card)}
              className="mt-2 inline-block text-[11px] text-[var(--ink-faint)] underline decoration-dotted underline-offset-4 hover:text-[var(--accent)]"
            >
              {card.context.episodeTitle} · an der Stelle anhören
            </Link>
          </div>
        ) : null}
      </div>

      <div className="mt-5 border-t border-[var(--rule)] pt-3">
        {revealed ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {GRADES.map((option) => (
              <button
                key={option.grade}
                type="button"
                onClick={() => answer(option.grade)}
                className={`btn flex-col py-2 ${option.tone}`}
              >
                <span className="text-[13px] font-medium">{option.label}</span>
                <span className="text-[10px] text-[var(--ink-faint)]">
                  {option.hint} · {option.grade}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <button type="button" className="btn btn-primary w-full" onClick={() => setRevealed(true)}>
            Aufdecken <kbd className="ml-1">Space</kbd>
          </button>
        )}
      </div>
    </div>
  );
}
