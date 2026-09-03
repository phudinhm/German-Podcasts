"use client";

/**
 * Client-side wrapper around the Whisper worker.
 *
 * Everything heavy lives in the worker: the library, the model weights, and the
 * inference itself. This side only marshals audio in and text out, so a slow
 * transcription never blocks the player or the interface.
 */

export interface WhisperStatus {
  state: "idle" | "loading" | "ready" | "error";
  device?: "webgpu" | "wasm";
  model?: string;
  /** 0..1 while model weights download. */
  progress?: number;
  error?: string;
}

export interface WhisperResult {
  text: string;
  at: number;
  until: number;
}

/** WebGPU is what makes a base model keep up with real time. */
export function hasWebGpu(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

export class WhisperEngine {
  private worker: Worker | null = null;
  private nextId = 1;
  private status: WhisperStatus = { state: "idle" };

  constructor(
    private readonly onStatus: (status: WhisperStatus) => void,
    private readonly onResult: (result: WhisperResult) => void,
  ) {}

  /** Starts the worker and begins downloading weights. */
  start(): void {
    if (this.worker) return;
    try {
      this.worker = new Worker("/whisper-worker.js", { type: "module" });
    } catch (error) {
      this.update({ state: "error", error: `The transcription worker could not start: ${String(error)}` });
      return;
    }

    this.worker.onmessage = (event: MessageEvent) => {
      const message = event.data as Record<string, unknown>;
      switch (message.type) {
        case "progress": {
          const loaded = Number(message.loaded ?? 0);
          const total = Number(message.total ?? 0);
          this.update({
            ...this.status,
            state: "loading",
            progress: total > 0 ? Math.min(1, loaded / total) : undefined,
          });
          break;
        }
        case "ready":
          this.update({
            state: "ready",
            device: message.device as "webgpu" | "wasm",
            model: String(message.model ?? ""),
            progress: 1,
          });
          break;
        case "result":
          if (typeof message.text === "string" && message.text.trim()) {
            this.onResult({
              text: message.text.trim(),
              at: Number(message.at ?? 0),
              until: Number(message.until ?? 0),
            });
          }
          break;
        case "error":
          this.update({ state: "error", error: String(message.error ?? "Transcription failed") });
          break;
        default:
          break;
      }
    };

    this.worker.onerror = (event) => {
      this.update({ state: "error", error: event.message || "The transcription worker failed." });
    };

    this.update({ state: "loading" });
    this.worker.postMessage({ type: "load", preferWebGpu: hasWebGpu() });
  }

  /** Queues one window of 16 kHz mono audio. */
  transcribe(samples: Float32Array, at: number, until: number): void {
    if (!this.worker || this.status.state === "error") return;
    const id = this.nextId++;
    // Transferred rather than copied: a six-second window is 384 KB.
    const buffer = samples.slice();
    this.worker.postMessage({ type: "transcribe", id, samples: buffer, at, until, preferWebGpu: hasWebGpu() }, [
      buffer.buffer,
    ]);
  }

  stop(): void {
    this.worker?.terminate();
    this.worker = null;
    this.update({ state: "idle" });
  }

  getStatus(): WhisperStatus {
    return this.status;
  }

  private update(status: WhisperStatus): void {
    this.status = status;
    this.onStatus(status);
  }
}
