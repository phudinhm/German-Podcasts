import { NextResponse } from "next/server";
import { askLLM, translate } from "@/lib/server/translate";
import type { TargetLang } from "@/lib/types";

export const runtime = "nodejs";

interface PolishRequestBody {
  text: string;
  lang?: TargetLang;
  explainGrammar?: boolean;
  engine?: string;
}

interface PolishResponse {
  polishedDe: string;
  translation: string;
  grammarNotes?: string;
  source: "llm" | "heuristic";
}

/**
 * Heuristic German grammar and punctuation normalizer when no LLM key is present.
 * Capitalizes first letter, capitalizes words after articles/prepositions or ending in common noun suffixes,
 * and fixes terminal punctuation.
 */
function heuristicPolishGerman(raw: string): string {
  if (!raw.trim()) return "";
  let text = raw.trim();

  // Capitalize first character
  text = text.charAt(0).toUpperCase() + text.slice(1);

  // Common noun suffixes in German
  const nounSuffixes = /(ung|heit|keit|schaft|tion|tät|ment|tum|ismus|ling|or)$/i;
  // Words that precede nouns in German
  const nounTriggers = new Set([
    "der", "die", "das", "des", "dem", "den",
    "ein", "eine", "einer", "eines", "einem", "einen",
    "kein", "keine", "keiner", "keines", "keinem", "keinen",
    "mein", "meine", "dein", "deine", "sein", "seine", "ihr", "ihre", "unser", "euer",
    "dieser", "diese", "dieses", "diesem", "diesen",
    "jeder", "jede", "jedes", "jedem", "jeden",
  ]);

  const words = text.split(/\s+/);
  for (let i = 0; i < words.length; i++) {
    const prev = i > 0 ? words[i - 1].toLowerCase().replace(/[^a-zäöüß]/gi, "") : "";
    const cleanWord = words[i].replace(/[^a-zA-ZäöüÄÖÜß]/g, "");

    if (nounTriggers.has(prev) || nounSuffixes.test(cleanWord)) {
      if (words[i].length > 1 && !words[i].startsWith("http")) {
        words[i] = words[i].charAt(0).toUpperCase() + words[i].slice(1);
      }
    }
  }
  text = words.join(" ");

  // Ensure trailing punctuation
  if (!/[.!?]$/.test(text)) {
    text += ".";
  }

  return text;
}

export async function POST(request: Request) {
  let body: PolishRequestBody;
  try {
    body = (await request.json()) as PolishRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawText = (body.text ?? "").trim().slice(0, 1000);
  if (!rawText) {
    return NextResponse.json({ error: "Text is required" }, { status: 400 });
  }

  const targetLang: TargetLang = body.lang === "vi" ? "vi" : "en";
  const targetName = targetLang === "vi" ? "Vietnamese" : "English";

  // 1. Try LLM if any key is configured
  if (
    process.env.ANTHROPIC_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.GROQ_API_KEY ||
    process.env.DEEPSEEK_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.OPENROUTER_API_KEY
  ) {
    const systemPrompt = `You are an expert German language tutor and transcription polisher.
Given a raw speech-to-text German segment:
1. Polish the German text: Correct capitalization (ALL German nouns must be capitalized), fix punctuation, fix any obvious speech recognition typos or run-on words.
2. Translate naturally into ${targetName}.
${body.explainGrammar ? "3. Provide a brief 1-2 sentence grammar explanation highlighting key grammatical features (cases, verb placement, separable prefixes, conjunctions)." : ""}
Reply ONLY with a JSON object in this exact format:
{
  "polishedDe": "corrected German text",
  "translation": "${targetName} translation",
  "grammarNotes": ${body.explainGrammar ? '"grammar explanation in ' + targetName + '"' : "null"}
}`;

    const llmResult = await askLLM({
      system: systemPrompt,
      user: rawText,
      maxTokens: 500,
      json: true,
    }, body.engine ?? "auto");

    if (llmResult) {
      try {
        const parsed = JSON.parse(llmResult) as {
          polishedDe?: string;
          translation?: string;
          grammarNotes?: string;
        };
        if (parsed.polishedDe) {
          const res: PolishResponse = {
            polishedDe: parsed.polishedDe,
            translation: parsed.translation ?? "",
            grammarNotes: parsed.grammarNotes ?? undefined,
            source: "llm",
          };
          return NextResponse.json(res);
        }
      } catch {
        // Fall back if JSON parsing failed
      }
    }
  }

  // 2. Fallback heuristic polish + standard translation (always works with zero keys)
  const polishedDe = heuristicPolishGerman(rawText);
  const trans = await translate(polishedDe, targetLang);

  const res: PolishResponse = {
    polishedDe,
    translation: trans.text ?? rawText,
    grammarNotes: body.explainGrammar
      ? targetLang === "vi"
        ? "Cấu trúc câu tiếng Đức chuẩn với vị trí động từ và viết hoa danh từ."
        : "Standard German sentence order with capitalized nouns."
      : undefined,
    source: "heuristic",
  };

  return NextResponse.json(res);
}
