/**
 * Whisper in a Web Worker.
 *
 * Loaded as a plain script rather than bundled, and the library itself comes
 * from a CDN at runtime, so the main bundle stays small and a deployment that
 * never turns this on pays nothing for it.
 *
 * WebGPU is used when the browser exposes it, because a base Whisper model on
 * WASM alone is slower than real time on most laptops and the point of this
 * path is captions that keep up. WASM remains the fallback with a smaller
 * model, which is worse but still useful.
 */

/* global self */

let transcriber = null;
let loading = null;
let currentModel = null;

// Two mirrors of the same package. One CDN being unreachable - a corporate
// proxy, a regional block, a bad afternoon - should not be the end of the
// feature, and the second attempt costs nothing when the first works.
const CDNS = [
  "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2/dist/transformers.min.js",
  "https://unpkg.com/@huggingface/transformers@3.0.2/dist/transformers.min.js",
];

async function loadLibrary() {
  let last = null;
  for (const url of CDNS) {
    try {
      return await import(url);
    } catch (error) {
      last = error;
    }
  }
  throw new Error(
    `The speech library could not be downloaded (${last && last.message ? last.message : last}).`,
  );
}

async function load(preferWebGpu) {
  if (transcriber) return transcriber;
  if (loading) return loading;

  loading = (async () => {
    const { pipeline, env } = await loadLibrary();
    // Models come from the Hugging Face CDN; nothing is served from our origin.
    env.allowLocalModels = false;

    let device = "wasm";
    if (preferWebGpu && typeof navigator !== "undefined" && navigator.gpu) {
      try {
        const adapter = await navigator.gpu.requestAdapter();
        if (adapter) device = "webgpu";
      } catch {
        device = "wasm";
      }
    }

    // A larger model is only worth loading when there is a GPU to run it on.
    const model = device === "webgpu" ? "onnx-community/whisper-base" : "onnx-community/whisper-tiny";
    currentModel = model;

    transcriber = await pipeline("automatic-speech-recognition", model, {
      device,
      dtype: device === "webgpu" ? "fp16" : "q8",
      progress_callback: (progress) => {
        if (progress && progress.status === "progress" && progress.total) {
          self.postMessage({
            type: "progress",
            loaded: progress.loaded,
            total: progress.total,
            file: progress.file,
          });
        }
      },
    });

    self.postMessage({ type: "ready", device, model });
    return transcriber;
  })();

  // A failed load must not be cached, or every retry replays the same error.
  loading.catch(() => {
    loading = null;
  });

  return loading;
}

self.onmessage = async (event) => {
  const message = event.data;

  if (message.type === "load") {
    try {
      await load(message.preferWebGpu !== false);
    } catch (error) {
      self.postMessage({ type: "error", error: String(error && error.message ? error.message : error) });
    }
    return;
  }

  if (message.type === "transcribe") {
    try {
      const pipe = await load(message.preferWebGpu !== false);
      const output = await pipe(message.samples, {
        language: "german",
        task: "transcribe",
        // Chunking is handled on the client, so each call is one short window.
        return_timestamps: false,
      });
      const text = (output && output.text ? output.text : "").trim();
      self.postMessage({ type: "result", id: message.id, text, at: message.at, until: message.until });
    } catch (error) {
      self.postMessage({
        type: "error",
        id: message.id,
        error: String(error && error.message ? error.message : error),
      });
    }
    return;
  }

  if (message.type === "info") {
    self.postMessage({ type: "info", model: currentModel, loaded: Boolean(transcriber) });
  }
};
