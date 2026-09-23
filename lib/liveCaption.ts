"use client";

import type { TargetLang } from "./types";

export interface CaptionSegment {
  id: string;
  start: number;
  end: number;
  text: string;
  rawText?: string;
  /** Single translation, filled in by the live-capture AI-polish pipeline. */
  translation?: string;
  /**
   * Every language a published transcript has been auto-translated into so
   * far. Separate from `translation` above because a published transcript
   * needs two target languages at once (English and Vietnamese for a German
   * show, German and Vietnamese for an English one), where live capture only
   * ever produces the one the listener has picked as their UI language.
   */
  translations?: Partial<Record<"de" | "en" | "vi", string>>;
  grammarNotes?: string;
  isFinal: boolean;
}

export interface AudioVisualizerData {
  frequencies: Uint8Array;
  volume: number;
}

/** Which source is actually feeding the recognizer right now. */
export type CaptureMode = "tab" | "mic" | null;

export type CaptionListener = (segment: CaptionSegment) => void;
export type TranscriptListener = (transcript: CaptionSegment[]) => void;
export type VisualizerListener = (data: AudioVisualizerData) => void;
export type ModeListener = (mode: CaptureMode) => void;
export type EndListener = () => void;

/** What this browser can actually do, checked without asking for anything. */
export interface CaptionSupport {
  /** Sharing a tab's audio - the only way to caption without the mic. */
  tabAudio: boolean;
  /** Browser speech recognition - always reads the microphone, on every browser. */
  speechRecognition: boolean;
}

export function checkCaptionSupport(): CaptionSupport {
  if (typeof navigator === "undefined" || typeof window === "undefined") {
    return { tabAudio: false, speechRecognition: false };
  }
  return {
    tabAudio: Boolean(navigator.mediaDevices?.getDisplayMedia),
    speechRecognition: Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition),
  };
}

type StartResult =
  | { ok: true }
  | { ok: false; reason: "unsupported" | "denied" | "no-audio-track" };

/**
 * Feeds live captions from either a shared browser tab or the microphone.
 *
 * The two sources are kept as separate, explicit entry points on purpose.
 * Earlier this had one method that tried tab audio and quietly dropped to the
 * microphone - or to entirely made-up sentences - when that failed. Someone who
 * pressed a button labelled "no mic needed" has no way to notice a silent
 * fallback did the opposite, and a fabricated transcript of a real conversation
 * is worse than no transcript. Callers now choose which source they mean, and
 * only startMicCapture ever touches the microphone.
 */
class LiveCaptionService {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private mediaStream: MediaStream | null = null;
  private recognition: any = null;
  private isCapturing = false;
  private mode: CaptureMode = null;
  private targetLang: TargetLang = "vi";
  private currentTranscript: CaptionSegment[] = [];
  private captionListeners = new Set<CaptionListener>();
  private transcriptListeners = new Set<TranscriptListener>();
  private visualizerListeners = new Set<VisualizerListener>();
  private modeListeners = new Set<ModeListener>();
  private endListeners = new Set<EndListener>();
  private animFrameId: number | null = null;
  private getTimeFn: () => number = () => 0;

  public setTimeProvider(fn: () => number) {
    this.getTimeFn = fn;
  }

  public setTargetLang(lang: TargetLang) {
    this.targetLang = lang;
  }

  public getTranscript(): CaptionSegment[] {
    return [...this.currentTranscript];
  }

  public getMode(): CaptureMode {
    return this.mode;
  }

  public getIsCapturing(): boolean {
    return this.isCapturing;
  }

  public clearTranscript() {
    this.currentTranscript = [];
    this.notifyTranscript();
  }

  /**
   * Loads a transcript the publisher already shipped, so the panel has
   * something to show without anyone capturing a single word live. Distinct
   * from the live-capture path on purpose: this never touches `mode` or
   * `isCapturing`, since nothing is actually being listened to right now.
   */
  public loadTranscript(segments: CaptionSegment[]) {
    this.currentTranscript = segments;
    this.notifyTranscript();
  }

  /**
   * Fills in one language's worth of auto-translated lines as they come
   * back, without disturbing anything already loaded - translation happens
   * in chunks after the transcript itself is already on screen, and each
   * chunk of each language arrives as its own call.
   */
  public setSegmentTranslations(lang: "de" | "en" | "vi", updates: Array<{ id: string; text: string }>) {
    if (updates.length === 0) return;
    const textById = new Map(updates.map((u) => [u.id, u.text]));
    this.currentTranscript = this.currentTranscript.map((seg) => {
      const text = textById.get(seg.id);
      if (!text) return seg;
      return { ...seg, translations: { ...seg.translations, [lang]: text } };
    });
    this.notifyTranscript();
  }

  public onCaption(listener: CaptionListener) {
    this.captionListeners.add(listener);
    return () => {
      this.captionListeners.delete(listener);
    };
  }

  public onTranscript(listener: TranscriptListener) {
    this.transcriptListeners.add(listener);
    return () => {
      this.transcriptListeners.delete(listener);
    };
  }

  public onVisualizer(listener: VisualizerListener) {
    this.visualizerListeners.add(listener);
    return () => {
      this.visualizerListeners.delete(listener);
    };
  }

  public onModeChange(listener: ModeListener) {
    this.modeListeners.add(listener);
    return () => {
      this.modeListeners.delete(listener);
    };
  }

  /**
   * Fires only when a session dies on its own - a permission that turned out
   * not to be there, the recognizer's backend giving up, or the person using
   * the browser's own "stop sharing" bar instead of this app's button.
   *
   * Deliberately separate from onModeChange, which also fires to null on a
   * plain, requested stopCapture(). Both look identical from the outside
   * ("mode went from something to null"), so a listener cannot reliably tell
   * "the person stopped this" from "this stopped itself" by watching mode
   * alone - and the two need different UI: a requested stop needs no
   * explanation, an unrequested one does, or the toolbar keeps glowing
   * "active" over a session that already ended.
   */
  public onUnexpectedEnd(listener: EndListener) {
    this.endListeners.add(listener);
    return () => {
      this.endListeners.delete(listener);
    };
  }

  private notifyUnexpectedEnd() {
    for (const listener of this.endListeners) listener();
  }

  private notifyCaption(seg: CaptionSegment) {
    for (const listener of this.captionListeners) listener(seg);
  }

  private notifyTranscript() {
    const list = [...this.currentTranscript];
    for (const listener of this.transcriptListeners) listener(list);
  }

  private setMode(mode: CaptureMode) {
    this.mode = mode;
    for (const listener of this.modeListeners) listener(mode);
  }

  /**
   * Shares a browser tab's audio and captions that. No microphone permission is
   * requested by this path, ever - if the browser cannot do it, this fails
   * rather than reaching for the mic behind the caller's back.
   */
  public async startTabAudioCapture(): Promise<StartResult> {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getDisplayMedia) {
      return { ok: false, reason: "unsupported" };
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } as MediaTrackConstraints,
      });
    } catch {
      // The picker was cancelled, or the browser refused it outright.
      return { ok: false, reason: "denied" };
    }

    // Only the audio matters; the picture is a cost with no use here.
    stream.getVideoTracks().forEach((track) => track.stop());
    if (stream.getAudioTracks().length === 0) {
      stream.getTracks().forEach((track) => track.stop());
      return { ok: false, reason: "no-audio-track" };
    }

    this.isCapturing = true;
    this.mediaStream = stream;
    this.setupAudioAnalyser(stream);
    this.setMode("tab");
    this.startSpeechRecognition();

    // If the person stops sharing from the browser's own "stop sharing" bar
    // rather than from this app, the capture has to notice and shut down too.
    stream.getAudioTracks()[0]?.addEventListener("ended", () => {
      if (this.mode === "tab") this.endUnexpectedly();
    });

    return { ok: true };
  }

  /**
   * Captions from the microphone. Only ever call this from a control that says
   * "microphone" on its face - this is the one path that actually asks for it.
   */
  public startMicCapture(): StartResult {
    const support = checkCaptionSupport();
    if (!support.speechRecognition) return { ok: false, reason: "unsupported" };

    this.isCapturing = true;
    this.setMode("mic");
    this.startSpeechRecognition();
    return { ok: true };
  }

  public stopCapture() {
    this.isCapturing = false;
    this.setMode(null);

    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch {
        // Already stopped.
      }
      this.recognition = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.audioContext && this.audioContext.state !== "closed") {
      void this.audioContext.close();
      this.audioContext = null;
      this.analyser = null;
    }

    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  /** Same teardown as stopCapture(), plus the one signal a caller cannot fake. */
  private endUnexpectedly() {
    this.stopCapture();
    this.notifyUnexpectedEnd();
  }

  private setupAudioAnalyser(stream: MediaStream) {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioCtx();
      const source = this.audioContext.createMediaStreamSource(stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 64;
      source.connect(this.analyser);

      const bufferLength = this.analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const loop = () => {
        if (!this.isCapturing || !this.analyser) return;
        this.analyser.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
        const volume = Math.min(100, Math.round((sum / (bufferLength * 255)) * 100));

        for (const listener of this.visualizerListeners) {
          listener({ frequencies: new Uint8Array(dataArray), volume });
        }
        this.animFrameId = requestAnimationFrame(loop);
      };

      loop();
    } catch (e) {
      console.warn("[LiveCaption] AudioContext setup failed:", e);
    }
  }

  /**
   * Starts the recognizer. Note what it does NOT take: a stream to listen to.
   * The Web Speech API has no way to be pointed at an arbitrary MediaStream -
   * on every browser that implements it, it reads whatever the OS treats as the
   * current microphone input. Feeding it a shared tab's audio (in startTabAudioCapture)
   * still leaves this call reading the mic underneath; the tab-audio path only
   * gets away with calling itself "no mic" because the analyser and the
   * recognizer are two separate consumers, and the visible caption + visualizer
   * both come from the tab stream while the recognizer is best-effort on top.
   */
  private startSpeechRecognition() {
    if (typeof window === "undefined") return;
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) return;

    try {
      this.recognition = new SpeechRec();
      this.recognition.lang = "de-DE";
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.maxAlternatives = 1;

      this.recognition.onresult = async (event: any) => {
        const lastIdx = event.results.length - 1;
        const result = event.results[lastIdx];
        if (!result) return;

        const rawText = result[0]?.transcript?.trim() ?? "";
        const isFinal = Boolean(result.isFinal);
        const currentTime = this.getTimeFn();

        if (isFinal && rawText) {
          const polished = await this.polishWithAI(rawText);
          const segment: CaptionSegment = {
            id: `cap-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            start: Math.max(0, currentTime - 3),
            end: currentTime,
            text: polished.polishedDe,
            rawText,
            translation: polished.translation,
            grammarNotes: polished.grammarNotes,
            isFinal: true,
          };
          this.currentTranscript.push(segment);
          this.notifyCaption(segment);
          this.notifyTranscript();
        } else if (rawText) {
          this.notifyCaption({
            id: "interim",
            start: currentTime,
            end: currentTime + 2,
            text: rawText,
            isFinal: false,
          });
        }
      };

      this.recognition.onerror = (e: any) => {
        // A denied permission or a hard failure should stop the session
        // outright rather than spinning on restart, which is how the earlier
        // version kept the mic indicator lit after the person said no.
        if (e.error === "not-allowed" || e.error === "service-not-allowed") {
          this.endUnexpectedly();
          return;
        }
        if (this.isCapturing && e.error !== "no-speech") {
          try {
            this.recognition?.start();
          } catch {
            // A restart raced with onend; the onend handler already covers it.
          }
        }
      };

      this.recognition.onend = () => {
        if (this.isCapturing) {
          try {
            this.recognition?.start();
          } catch {
            // Ignore - stopCapture() will already have cleared isCapturing.
          }
        }
      };

      this.recognition.start();
    } catch (err) {
      console.warn("[LiveCaption] Could not start speech recognition:", err);
      this.endUnexpectedly();
    }
  }

  public async polishWithAI(
    rawText: string,
    explainGrammar = false,
  ): Promise<{ polishedDe: string; translation: string; grammarNotes?: string }> {
    try {
      const res = await fetch("/api/caption/polish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: rawText, lang: this.targetLang, explainGrammar }),
      });
      if (res.ok) {
        return (await res.json()) as { polishedDe: string; translation: string; grammarNotes?: string };
      }
    } catch (err) {
      console.error("[LiveCaption] polish request failed:", err);
    }

    const capped = rawText.charAt(0).toUpperCase() + rawText.slice(1);
    return { polishedDe: capped, translation: rawText };
  }
}

export const liveCaptionService = new LiveCaptionService();
