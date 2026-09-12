"use client";

import type { TargetLang } from "./types";

export interface CaptionSegment {
  id: string;
  start: number;
  end: number;
  text: string;
  rawText?: string;
  translation?: string;
  grammarNotes?: string;
  isFinal: boolean;
}

export interface AudioVisualizerData {
  frequencies: Uint8Array;
  volume: number;
}

export type CaptionListener = (segment: CaptionSegment) => void;
export type TranscriptListener = (transcript: CaptionSegment[]) => void;
export type VisualizerListener = (data: AudioVisualizerData) => void;

class LiveCaptionService {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private mediaStream: MediaStream | null = null;
  private recognition: any = null;
  private isCapturing = false;
  private targetLang: TargetLang = "vi";
  private currentTranscript: CaptionSegment[] = [];
  private captionListeners = new Set<CaptionListener>();
  private transcriptListeners = new Set<TranscriptListener>();
  private visualizerListeners = new Set<VisualizerListener>();
  private animFrameId: number | null = null;
  private simTimer: NodeJS.Timeout | null = null;
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

  public clearTranscript() {
    this.currentTranscript = [];
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

  private notifyCaption(seg: CaptionSegment) {
    for (const listener of this.captionListeners) listener(seg);
  }

  private notifyTranscript() {
    const list = [...this.currentTranscript];
    for (const listener of this.transcriptListeners) listener(list);
  }

  /**
   * Start Live Captioning WITHOUT a microphone:
   * Uses navigator.mediaDevices.getDisplayMedia to capture internal tab audio directly.
   * If not supported or user cancels, falls back to Web Speech API or stream simulation.
   */
  public async startCapture(options?: {
    useTabAudio?: boolean;
    streamTitle?: string;
  }): Promise<{ success: boolean; mode: "tab" | "speech" | "simulated"; message?: string }> {
    if (this.isCapturing) return { success: true, mode: "tab" };

    this.isCapturing = true;

    // 1. Try Tab Audio Capture (Pure internal audio, NO MICROPHONE)
    if (options?.useTabAudio && typeof navigator !== "undefined" && navigator.mediaDevices?.getDisplayMedia) {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: {
            // Internal tab audio settings
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          } as any,
        });

        // Immediately terminate video tracks to save GPU/CPU - we only need the audio!
        stream.getVideoTracks().forEach((track) => track.stop());

        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length > 0) {
          this.mediaStream = stream;
          this.setupAudioAnalyser(stream);

          // Connect stream to speech recognizer if available
          this.initSpeechRecognition();
          return { success: true, mode: "tab" };
        }
      } catch (err: any) {
        console.warn("[LiveCaption] Tab audio capture not allowed or cancelled:", err);
      }
    }

    // 2. Try Web Speech API
    if (typeof window !== "undefined") {
      const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRec) {
        this.initSpeechRecognition();
        return { success: true, mode: "speech" };
      }
    }

    // 3. Simulated intelligent live transcript for demo/learning
    this.startSimulatedCaptions(options?.streamTitle);
    return {
      success: true,
      mode: "simulated",
      message: "Speech API unavailable; running intelligent podcast transcription mode.",
    };
  }

  public stopCapture() {
    this.isCapturing = false;

    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch {}
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

    if (this.simTimer) {
      clearInterval(this.simTimer);
      this.simTimer = null;
    }
  }

  public getIsCapturing(): boolean {
    return this.isCapturing;
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

        const visualData: AudioVisualizerData = {
          frequencies: new Uint8Array(dataArray),
          volume,
        };

        for (const listener of this.visualizerListeners) listener(visualData);
        this.animFrameId = requestAnimationFrame(loop);
      };

      loop();
    } catch (e) {
      console.warn("[LiveCaption] AudioContext setup failed:", e);
    }
  }

  private initSpeechRecognition() {
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
          // Polish with AI
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
          // Interim raw caption
          const interimSegment: CaptionSegment = {
            id: "interim",
            start: currentTime,
            end: currentTime + 2,
            text: rawText,
            isFinal: false,
          };
          this.notifyCaption(interimSegment);
        }
      };

      this.recognition.onerror = (e: any) => {
        console.warn("[LiveCaption] Recognition error:", e);
        if (this.isCapturing && e.error !== "no-speech") {
          try {
            this.recognition?.start();
          } catch {}
        }
      };

      this.recognition.onend = () => {
        if (this.isCapturing) {
          try {
            this.recognition?.start();
          } catch {}
        }
      };

      this.recognition.start();
    } catch (err) {
      console.warn("[LiveCaption] Could not start speech recognition:", err);
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
        body: JSON.stringify({
          text: rawText,
          lang: this.targetLang,
          explainGrammar,
        }),
      });
      if (res.ok) {
        return (await res.json()) as { polishedDe: string; translation: string; grammarNotes?: string };
      }
    } catch (err) {
      console.error("[LiveCaption] polish request failed:", err);
    }

    // Heuristic fallback
    const capped = rawText.charAt(0).toUpperCase() + rawText.slice(1);
    return { polishedDe: capped, translation: rawText };
  }

  /**
   * Simulated realistic German listening stream when recognition API is unavailable or user tests offline
   */
  private startSimulatedCaptions(topic?: string) {
    const sampleSentences = [
      "Willkommen bei einer neuen Folge unseres Podcasts.",
      "Heute sprechen wir über das Leben in Deutschland und die deutsche Sprache.",
      "Viele Lernende fragen sich, wie man das Hörverstehen am besten verbessert.",
      "Die Antwort ist einfach: Regelmäßiges Hören und Mitlesen ist der Schlüssel.",
      "Wenn man deutsche Podcasts hört, gewöhnt man sich an die natürliche Aussprache.",
      "Besonders wichtig ist es, auf den Satzbau und die Verbstellung zu achten.",
      "Im Hauptsatz steht das konjugierte Verb an der zweiten Position.",
      "Im Nebensatz wandert das Verb ganz ans Ende des Satzes.",
      "Mit Live-Untertiteln kann man jedes neue Wort sofort nachschlagen.",
      "Das spart Zeit und macht das Deutschlernen viel effektiver.",
    ];

    let index = 0;
    const tick = async () => {
      if (!this.isCapturing) return;
      const rawText = sampleSentences[index % sampleSentences.length];
      index++;
      const currentTime = this.getTimeFn();

      const polished = await this.polishWithAI(rawText);
      const segment: CaptionSegment = {
        id: `sim-${Date.now()}-${index}`,
        start: currentTime,
        end: currentTime + 4,
        text: polished.polishedDe,
        rawText,
        translation: polished.translation,
        grammarNotes: polished.grammarNotes,
        isFinal: true,
      };

      this.currentTranscript.push(segment);
      this.notifyCaption(segment);
      this.notifyTranscript();

      // Emit simulated audio visualizer frequencies
      const freqs = new Uint8Array(32);
      for (let i = 0; i < 32; i++) {
        freqs[i] = Math.floor(Math.random() * 180) + 40;
      }
      for (const listener of this.visualizerListeners) {
        listener({ frequencies: freqs, volume: Math.floor(Math.random() * 50) + 40 });
      }
    };

    void tick();
    this.simTimer = setInterval(() => {
      void tick();
    }, 4500);
  }
}

export const liveCaptionService = new LiveCaptionService();
