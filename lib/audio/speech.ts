/**
 * Browser speech recognition types.
 *
 * Declared once and shared, because two components use the API and TypeScript
 * rejects two different structural declarations of the same global.
 */

export interface SpeechAlternative {
  transcript: string;
  confidence?: number;
}

export interface SpeechResult extends ArrayLike<SpeechAlternative> {
  isFinal: boolean;
  length: number;
}

export interface SpeechResultEvent {
  resultIndex: number;
  results: ArrayLike<SpeechResult> & { length: number };
}

export interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

export function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}
