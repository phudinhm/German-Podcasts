/**
 * Reading PCM out of a playing media element.
 *
 * The audio graph taps the element, passes it through to the speakers
 * unchanged, and copies frames off to the side. That copy is what gets
 * transcribed, which is why captions no longer need the microphone: the audio
 * is read from inside the page rather than heard from outside it.
 *
 * The element must be readable, which means either same-origin or served with
 * CORS headers. A cross-origin element without them does not throw: it hands
 * back silence, which is why callers check the level as well as the return
 * value.
 */

/** Whisper and most speech models expect 16 kHz mono. */
export const TARGET_SAMPLE_RATE = 16_000;

export interface CaptureWindow {
  /** Mono 16 kHz samples. */
  samples: Float32Array;
  /** Media time at the first sample. */
  at: number;
  /** Media time at the last sample. */
  until: number;
}

export interface CaptureOptions {
  /** Seconds of audio per window handed to the recogniser. */
  windowSeconds?: number;
  /** Seconds of the previous window repeated, so words on the seam survive. */
  overlapSeconds?: number;
  /** Reads the media clock, so windows carry real timestamps. */
  currentTime: () => number;
  onWindow: (window: CaptureWindow) => void;
}

export interface CaptureHandle {
  stop: () => void;
  /** True while frames are actually arriving. */
  isRunning: () => boolean;
}

/** Simple linear resampler: adequate for speech, and dependency free. */
export function resample(input: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return input;
  const ratio = from / to;
  const length = Math.floor(input.length / ratio);
  const output = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const position = i * ratio;
    const index = Math.floor(position);
    const fraction = position - index;
    const a = input[index] ?? 0;
    const b = input[index + 1] ?? a;
    output[i] = a + (b - a) * fraction;
  }
  return output;
}

/** Averages channels down to mono. */
export function toMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0];
  const length = channels[0].length;
  const output = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    let sum = 0;
    for (const channel of channels) sum += channel[i] ?? 0;
    output[i] = sum / channels.length;
  }
  return output;
}

/** Root-mean-square level, used to skip windows that are effectively silent. */
export function rms(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let total = 0;
  for (let i = 0; i < samples.length; i += 1) total += samples[i] * samples[i];
  return Math.sqrt(total / samples.length);
}

/** Below this level a window is treated as silence and never transcribed. */
export const SILENCE_THRESHOLD = 0.004;

interface WindowState {
  buffer: Float32Array;
  used: number;
  startedAt: number;
}

/**
 * Accumulates frames into fixed windows with overlap.
 *
 * Split out from the audio-graph plumbing so the buffering arithmetic, which is
 * where off-by-one errors live, can be tested without a browser.
 */
export class WindowBuffer {
  private state: WindowState;
  private readonly windowSamples: number;
  private readonly overlapSamples: number;

  constructor(
    private readonly sampleRate: number,
    windowSeconds: number,
    overlapSeconds: number,
    private readonly emit: (window: CaptureWindow) => void,
  ) {
    this.windowSamples = Math.max(1, Math.round(windowSeconds * sampleRate));
    this.overlapSamples = Math.max(0, Math.round(overlapSeconds * sampleRate));
    this.state = { buffer: new Float32Array(this.windowSamples), used: 0, startedAt: 0 };
  }

  /** Adds frames captured at `mediaTime`, flushing whenever a window fills. */
  push(frames: Float32Array, mediaTime: number): void {
    if (this.state.used === 0) {
      this.state.startedAt = mediaTime;
    }
    let offset = 0;
    while (offset < frames.length) {
      const room = this.windowSamples - this.state.used;
      const take = Math.min(room, frames.length - offset);
      this.state.buffer.set(frames.subarray(offset, offset + take), this.state.used);
      this.state.used += take;
      offset += take;

      if (this.state.used >= this.windowSamples) this.flush();
    }
  }

  /** Emits whatever is buffered, keeping the tail as the next overlap. */
  flush(): void {
    if (this.state.used === 0) return;
    const samples = this.state.buffer.slice(0, this.state.used);
    const duration = this.state.used / this.sampleRate;
    this.emit({ samples, at: this.state.startedAt, until: this.state.startedAt + duration });

    const carry = Math.min(this.overlapSamples, this.state.used);
    const tail = samples.slice(this.state.used - carry);
    this.state.buffer = new Float32Array(this.windowSamples);
    this.state.buffer.set(tail, 0);
    this.state.used = carry;
    this.state.startedAt = this.state.startedAt + duration - carry / this.sampleRate;
  }

  get buffered(): number {
    return this.state.used;
  }
}

/**
 * Taps a media element. Returns null when the browser has no Web Audio, and
 * throws nothing: a failed capture should degrade to the microphone path
 * rather than break playback.
 */
export interface CaptureOptionsFull extends CaptureOptions {
  /**
   * Whether this element's sound should reach the speakers. False for a hidden
   * capture element that shadows the real player: connecting it would play the
   * episode twice, a fraction of a second apart.
   */
  passthrough?: boolean;
}

/**
 * Asks whether a media URL can be read directly.
 *
 * A one-byte range request is enough: if the CDN sends CORS headers the fetch
 * resolves, and if it does not the browser rejects it before any body arrives.
 * Cheap enough to do on every start, and it decides whether the passthrough is
 * needed at all - which for a cooperative CDN means no server bandwidth and no
 * second download.
 */
export async function canReadDirectly(url: string): Promise<boolean> {
  if (typeof fetch === "undefined") return false;
  try {
    const response = await fetch(url, {
      method: "GET",
      mode: "cors",
      headers: { Range: "bytes=0-1" },
      signal: AbortSignal.timeout(6_000),
    });
    // Reading the body proves the response is genuinely readable, not opaque.
    await response.arrayBuffer();
    return response.ok || response.status === 206;
  } catch {
    return false;
  }
}

/**
 * Taps a media element. Returns null when the browser has no Web Audio or the
 * element cannot be tapped, and throws nothing: a failed capture degrades to
 * the microphone path rather than breaking playback.
 */
export function captureFromElement(
  element: HTMLMediaElement,
  options: CaptureOptionsFull,
): CaptureHandle | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;

  const context = new Ctor();
  let source: MediaElementAudioSourceNode;
  try {
    source = context.createMediaElementSource(element);
  } catch {
    // An element can only be tapped once; a second attempt throws.
    void context.close();
    return null;
  }

  // Once an element feeds the graph, its audio no longer reaches the speakers
  // by itself: what keeps a shadow copy silent is not connecting it to the
  // destination, not muting it. Muting mutes the graph as well, so a muted
  // element yields nothing but zeroes to transcribe - which looks exactly like
  // a browser refusing to expose the audio, and is not.
  element.muted = false;
  element.volume = 1;

  const windowBuffer = new WindowBuffer(
    TARGET_SAMPLE_RATE,
    options.windowSeconds ?? 6,
    options.overlapSeconds ?? 0.8,
    options.onWindow,
  );

  let running = true;
  const nodes: AudioNode[] = [];

  function accept(mono: Float32Array, sampleRate: number) {
    if (!running) return;
    windowBuffer.push(resample(mono, sampleRate, TARGET_SAMPLE_RATE), options.currentTime());
  }

  // The worklet runs on the audio thread, so a busy main thread cannot make it
  // drop frames. It needs an async module load, so the graph is wired up when
  // it arrives; until then no frames are lost, because the element has barely
  // started playing.
  const silent = context.createGain();
  silent.gain.value = 0;
  silent.connect(context.destination);
  nodes.push(silent);

  if (options.passthrough !== false) source.connect(context.destination);

  void context.audioWorklet
    ?.addModule("/capture-worklet.js")
    .then(() => {
      if (!running) return;
      const node = new AudioWorkletNode(context, "capture-processor");
      node.port.onmessage = (event: MessageEvent) => {
        const data = event.data as { samples: Float32Array; sampleRate: number };
        accept(data.samples, data.sampleRate);
      };
      source.connect(node);
      node.connect(silent);
      nodes.push(node);
    })
    .catch(() => {
      if (!running) return;
      // Older Safari has no worklet. ScriptProcessor is deprecated and runs on
      // the main thread, but a missing tap is worse than a deprecated one.
      const processor = context.createScriptProcessor(4096, 1, 1);
      processor.onaudioprocess = (event) => {
        const input = event.inputBuffer;
        const channels: Float32Array[] = [];
        for (let i = 0; i < input.numberOfChannels; i += 1) channels.push(input.getChannelData(i));
        accept(toMono(channels), input.sampleRate);
      };
      source.connect(processor);
      processor.connect(silent);
      nodes.push(processor);
    });

  void context.resume().catch(() => undefined);

  return {
    stop: () => {
      running = false;
      windowBuffer.flush();
      try {
        for (const node of nodes) node.disconnect();
        source.disconnect();
      } catch {
        // Already torn down.
      }
      void context.close().catch(() => undefined);
    },
    isRunning: () => running,
  };
}
