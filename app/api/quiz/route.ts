import { NextResponse } from "next/server";
import { getEpisode } from "@/lib/catalog";
import { askClaude, extractJson } from "@/lib/server/translate";
import type { QuizQuestion } from "@/lib/types";

export const runtime = "nodejs";

const SYSTEM = `You write comprehension checks for a German listening app.
Given a German transcript, reply with JSON only:
{"questions":[{"prompt":"German question","choices":["a","b","c","d"],"answerIndex":0,"explanation":"one German sentence"}]}
Rules:
- Exactly 3 questions, in German, testing whether the listener followed the CONTENT.
- Never ask about vocabulary in isolation, and never ask something answerable without listening.
- Four plausible choices each; the wrong ones must be wrong on the facts, not on grammar.
- Keep every question answerable from the transcript alone.`;

/**
 * Returns the episode's precomputed quiz, or generates one from the transcript
 * when the catalog does not carry one and a model key is configured.
 */
export async function POST(request: Request) {
  let slug: string;
  try {
    const body = (await request.json()) as { slug?: string };
    slug = (body.slug ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const episode = await getEpisode(slug);
  if (!episode) return NextResponse.json({ error: "Unknown episode" }, { status: 404 });
  if (episode.quiz.length > 0) {
    return NextResponse.json({ questions: episode.quiz, source: "precomputed" });
  }
  if (episode.transcript.length === 0) {
    return NextResponse.json({ questions: [], source: "empty" });
  }

  const transcript = episode.transcript.map((segment) => segment.de).join(" ").slice(0, 8000);
  const raw = await askClaude({ system: SYSTEM, user: transcript, maxTokens: 1200 });
  const parsed = extractJson<{
    questions?: Array<{ prompt: string; choices: string[]; answerIndex: number; explanation?: string }>;
  }>(raw);

  if (!parsed?.questions?.length) {
    return NextResponse.json({
      questions: [],
      source: "unavailable",
      note: "No precomputed quiz, and no ANTHROPIC_API_KEY is configured to generate one.",
    });
  }

  const questions: QuizQuestion[] = parsed.questions.slice(0, 3).map((question, index) => ({
    id: `gen${index}`,
    anchor: episode.transcript[Math.floor((index / 3) * episode.transcript.length)]?.start ?? 0,
    prompt: question.prompt,
    choices: question.choices.slice(0, 4),
    answerIndex: Math.max(0, Math.min(3, question.answerIndex)),
    explanation: question.explanation,
  }));

  return NextResponse.json({ questions, source: "model" });
}
