"use client";

export interface SavedWord {
  id: string;
  word: string;
  normalizedWord: string;
  meaning: string;
  contextSentence?: string;
  contextTranslation?: string;
  showTitle?: string;
  episodeTitle?: string;
  timestamp?: number;
  createdAt: number;
}

const VOCAB_KEY = "hoerbar.vocabulary.v1";

export function normalizeVocabWord(raw: string): string {
  return raw
    .trim()
    .replace(/^[.,!?;:"'„“”‚‘’()\[\]{}«»—–-]+|[.,!?;:"'„“”‚‘’()\[\]{}«»—–-]+$/g, "")
    .toLowerCase();
}

export function listVocabulary(): SavedWord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(VOCAB_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeVocabulary(list: SavedWord[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(VOCAB_KEY, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent("hoerbar:vocab-changed"));
  } catch {
    // ignore storage quota errors
  }
}

export function isWordSaved(word: string): SavedWord | undefined {
  const norm = normalizeVocabWord(word);
  if (!norm) return undefined;
  return listVocabulary().find((item) => item.normalizedWord === norm);
}

export function saveVocabularyWord(input: {
  word: string;
  meaning: string;
  contextSentence?: string;
  contextTranslation?: string;
  showTitle?: string;
  episodeTitle?: string;
  timestamp?: number;
}): SavedWord {
  const cleanWord = input.word
    .trim()
    .replace(/^[.,!?;:"'„“”‚‘’()\[\]{}«»—–-]+|[.,!?;:"'„“”‚‘’()\[\]{}«»—–-]+$/g, "");
  const normalizedWord = normalizeVocabWord(cleanWord);
  const current = listVocabulary();
  const existingIdx = current.findIndex((item) => item.normalizedWord === normalizedWord);

  const entry: SavedWord = {
    id: existingIdx >= 0 ? current[existingIdx].id : `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    word: cleanWord || input.word.trim(),
    normalizedWord,
    meaning: input.meaning.trim(),
    contextSentence: input.contextSentence,
    contextTranslation: input.contextTranslation,
    showTitle: input.showTitle,
    episodeTitle: input.episodeTitle,
    timestamp: input.timestamp,
    createdAt: Date.now(),
  };

  if (existingIdx >= 0) {
    current[existingIdx] = entry;
    writeVocabulary(current);
  } else {
    writeVocabulary([entry, ...current]);
  }
  return entry;
}

export function removeVocabularyWord(wordOrId: string): void {
  const norm = normalizeVocabWord(wordOrId);
  const current = listVocabulary();
  const next = current.filter(
    (item) => item.id !== wordOrId && item.normalizedWord !== norm
  );
  writeVocabulary(next);
}

export function clearVocabulary(): void {
  writeVocabulary([]);
}
