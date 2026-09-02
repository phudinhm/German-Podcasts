"use client";

import { useEffect, useState } from "react";
import type { QuizQuestion } from "@/lib/types";

/**
 * Comprehension check. It exists to catch the failure mode this whole app
 * invites: reading the English column and calling it listening practice.
 */
export function Quiz({ slug, onSeek }: { slug: string; onSeek: (seconds: number) => void }) {
  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/quiz", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug }),
      signal: controller.signal,
    })
      .then(async (response) => (await response.json()) as { questions: QuizQuestion[]; note?: string })
      .then((data) => {
        setQuestions(data.questions);
        setNote(data.note ?? null);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [slug]);

  if (!questions) return null;
  if (questions.length === 0) {
    return note ? <p className="text-[12px] text-[var(--ink-faint)]">{note}</p> : null;
  }

  const answered = Object.keys(answers).length;
  const correct = questions.filter((q) => answers[q.id] === q.answerIndex).length;

  return (
    <div>
      <div className="mb-3 flex items-baseline gap-3">
        <h3 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-faint)]">
          Verständnis-Check
        </h3>
        {revealed ? (
          <span className="text-[12px] text-[var(--ink-soft)]">
            {correct} von {questions.length} richtig
          </span>
        ) : (
          <span className="text-[12px] text-[var(--ink-faint)]">
            {answered}/{questions.length} beantwortet
          </span>
        )}
      </div>

      <ol className="space-y-5">
        {questions.map((question, index) => {
          const chosen = answers[question.id];
          return (
            <li key={question.id}>
              <p className="text-[14px] font-medium leading-snug">
                <span className="mr-1.5 text-[var(--ink-faint)]">{index + 1}.</span>
                {question.prompt}
              </p>
              <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
                {question.choices.map((choice, choiceIndex) => {
                  const isChosen = chosen === choiceIndex;
                  const isRight = choiceIndex === question.answerIndex;
                  const tone = revealed
                    ? isRight
                      ? "border-emerald-500/60 bg-emerald-500/10"
                      : isChosen
                        ? "border-rose-500/60 bg-rose-500/10"
                        : ""
                    : isChosen
                      ? "border-[var(--accent-ring)] bg-[var(--accent-soft)]"
                      : "";
                  return (
                    <li key={choiceIndex}>
                      <button
                        type="button"
                        disabled={revealed}
                        onClick={() => setAnswers((prev) => ({ ...prev, [question.id]: choiceIndex }))}
                        className={`btn w-full justify-start text-left text-[13px] font-normal ${tone}`}
                      >
                        {choice}
                      </button>
                    </li>
                  );
                })}
              </ul>
              {revealed && question.explanation ? (
                <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px] text-[var(--ink-soft)]">
                  {question.explanation}
                  <button
                    type="button"
                    className="btn px-2 py-0.5 text-[11px]"
                    onClick={() => onSeek(question.anchor)}
                  >
                    Stelle anhören
                  </button>
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          className="btn btn-primary"
          disabled={answered < questions.length || revealed}
          onClick={() => setRevealed(true)}
        >
          Auswerten
        </button>
        {revealed ? (
          <button
            type="button"
            className="btn"
            onClick={() => {
              setAnswers({});
              setRevealed(false);
            }}
          >
            Nochmal
          </button>
        ) : null}
      </div>
    </div>
  );
}
