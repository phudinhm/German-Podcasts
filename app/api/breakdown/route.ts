import { NextResponse } from "next/server";
import { deconstruct, type SyntaxNote } from "@/lib/german/syntax";
import { askClaude, extractJson } from "@/lib/server/translate";

export const runtime = "nodejs";

const SYSTEM = `You explain German sentence structure to a learner who already knows the vocabulary.
Reply with JSON only: {"notes":[{"title":"...","detail":"...","focus":["word"]}]}
Rules:
- At most 3 notes, ordered by how much they would trip a learner up.
- title: at most 8 words, naming the structure.
- detail: exactly one sentence, concrete about THIS sentence, no generic grammar lecture.
- focus: the words in the sentence the note points at.
- Prioritise verb position, the verb bracket, separable prefixes, case after prepositions,
  and anything that reorders the clause. Skip what is obvious.`;

/**
 * Grammar Deconstructor. The rule-based pass always runs and is always
 * returned; a model call is layered on top when a key is configured, so the
 * button is never dead.
 */
export async function POST(request: Request) {
  let sentence: string;
  try {
    const body = (await request.json()) as { sentence?: string };
    sentence = (body.sentence ?? "").trim().slice(0, 600);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!sentence) return NextResponse.json({ error: "sentence is required" }, { status: 400 });

  const rules = deconstruct(sentence);

  const raw = await askClaude({
    system: SYSTEM,
    user: sentence,
    maxTokens: 500,
  });
  const parsed = extractJson<{ notes?: Array<{ title: string; detail: string; focus?: string[] }> }>(raw);

  const modelNotes: SyntaxNote[] =
    parsed?.notes?.slice(0, 3).map((note) => ({
      kind: "order" as const,
      title: note.title,
      detail: note.detail,
      focus: note.focus ?? [],
    })) ?? [];

  return NextResponse.json({
    sentence,
    rules,
    model: modelNotes,
    source: modelNotes.length > 0 ? "rules+model" : "rules",
  });
}
