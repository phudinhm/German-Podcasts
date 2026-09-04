"use client";

/**
 * Client-side wrapper around the Whisper worker.
 *
 * Everything heavy lives in the worker: the library, the model weights, and the
 * inference itself. This side only marshals audio in and text out, so a slow
 * transcription never blocks the player or the interface.
 *
 * The worker is deliberately a singleton that outlives every component using
 * it. The first version created one per caption session and terminated it on
 * stop, which was quietly fatal: picking a new episode stopped captions, that
 * killed the worker mid-download, and a browser only caches a response it
 * received in full. So each attempt restarted the download from nothing and
 * the progress bar could never finish. Weights are downloaded once per browser
 * and reused from cache after that, which is only true if nothing interrupts
 * the first one.
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

type StatusListener = (status: WhisperStatus) => void;
type ResultListener = (result: WhisperResult) => void;

let worker: Worker | null = null;
let status: WhisperStatus = { state: "idle" };
let nextId = 1;
const statusListeners = new Set<StatusListener>();
const resultListeners = new Set<ResultListener>();

function publish(next: WhisperStatus): void {
  status = next;
  for (const listener of statusListeners) listener(next);
}

/**
 * Brings the worker up if it is not already, and asks it to load the model.
 *
 * Safe to call repeatedly: the worker ignores a second load once one is in
 * flight, and a model already in memory answers immediately.
 */
function ensureWorker(): Worker | null {
  if (worker) return worker;
  try {
    worker = new Worker("/whisper-worker.js", { type: "module" });
  } catch (error) {
    publish({ state: "error", error: `The transcription worker could not start: ${String(error)}` });
    return null;
  }

  worker.onmessage = (event: MessageEvent) => {
    const message = event.data as Record<string, unknown>;
    switch (message.type) {
      case "progress": {
        const loaded = Number(message.loaded ?? 0);
        const total = Number(message.total ?? 0);
        publish({
          ...status,
          state: "loading",
          progress: total > 0 ? Math.min(1, loaded / total) : undefined,
        });
        break;
      }
      case "ready":
        publish({
          state: "ready",
          device: message.device as "webgpu" | "wasm",
          model: String(message.model ?? ""),
          progress: 1,
        });
        break;
      case "result":
        if (typeof message.text === "string" && message.text.trim()) {
          const result: WhisperResult = {
            text: message.text.trim(),
            at: Number(message.at ?? 0),
            until: Number(message.until ?? 0),
          };
          for (const listener of resultListeners) listener(result);
        }
        break;
      case "error":
        publish({ state: "error", error: String(message.error ?? "Transcription failed") });
        break;
      default:
        break;
    }
  };

  worker.onerror = (event) => {
    publish({ state: "error", error: event.message || "The transcription worker failed." });
  };

  return worker;
}

/**
 * One caption session's view of the shared worker.
 *
 * Starting subscribes and makes sure the model is loading; stopping only
 * unsubscribes. The worker, and everything it has downloaded, stays.
 */
export class WhisperEngine {
  private live = false;

  constructor(
    private readonly onStatus: StatusListener,
    private readonly onResult: ResultListener,
  ) {}

  start(): void {
    if (this.live) return;
    this.live = true;
    statusListeners.add(this.onStatus);
    resultListeners.add(this.onResult);

    const active = ensureWorker();
    if (!active) return;

    // Report where things already stand, so a session joining a model that is
    // loaded does not sit on "idle" waiting for a message that will not come.
    if (status.state === "ready" || status.state === "error") {
      this.onStatus(status);
    } else {
      publish({ ...status, state: "loading" });
    }
    active.postMessage({ type: "load", preferWebGpu: hasWebGpu() });
  }

  /** Queues one window of 16 kHz mono audio. */
  transcribe(samples: Float32Array, at: number, until: number): void {
    if (!this.live || !worker || status.state === "error") return;
    const id = nextId++;
    // Transferred rather than copied: a six-second window is 384 KB.
    const buffer = samples.slice();
    worker.postMessage({ type: "transcribe", id, samples: buffer, at, until, preferWebGpu: hasWebGpu() }, [
      buffer.buffer,
    ]);
  }

  /**
   * Leaves the shared worker running. Tearing it down here is what broke the
   * download; a worker sitting idle costs a few megabytes of memory and saves
   * every future session the wait.
   */
  stop(): void {
    if (!this.live) return;
    this.live = false;
    statusListeners.delete(this.onStatus);
    resultListeners.delete(this.onResult);
  }

  getStatus(): WhisperStatus {
    return status;
  }
}

/** Current shared state, for a component that wants it before starting. */
export function whisperStatus(): WhisperStatus {
  return status;
}
