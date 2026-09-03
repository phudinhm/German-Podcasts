/**
 * Reading PCM out of a playing media element.
 *
 * The audio graph taps the element, passes it through to the speakers
 * unchanged, and copies frames off to the side. That copy is what gets
 * transcribed, which is why captions no longer need the microphone: the audio
 * is read from inside the page rather than heard from outside it.
 *
 * The element must be same-origin, or Web Audio hands back silence. Callers
 * are expected to have routed the URL through the passthrough first.
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
export function captureFromElement(
  element: HTMLMediaElement,
  options: CaptureOptions,
): CaptureHandle | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;

  const context = new Ctor();
  let source: MediaElementAudioSourceNode;
  try {
    source = context.createMediaElementSource(element);
  } catch {
    // An element can only be tapped once; a second attempt throws. It also
    // throws for cross-origin media without CORS, which is exactly the case
    // the same-origin passthrough exists to avoid.
    void context.close();
    return null;
  }

  const windowBuffer = new WindowBuffer(
    TARGET_SAMPLE_RATE,
    options.windowSeconds ?? 6,
    options.overlapSeconds ?? 0.8,
    options.onWindow,
  );

  // ScriptProcessor is deprecated but is the only node available everywhere
  // without shipping a worklet file; the work done per callback is a copy and
  // a resample, which is far below the budget even on a phone.
  const processor = context.createScriptProcessor(4096, 1, 1);
  let running = true;

  processor.onaudioprocess = (event) => {
    if (!running) return;
    const input = event.inputBuffer;
    const channels: Float32Array[] = [];
    for (let i = 0; i < input.numberOfChannels; i += 1) channels.push(input.getChannelData(i));
    const mono = toMono(channels);
    const resampled = resample(mono, input.sampleRate, TARGET_SAMPLE_RATE);
    windowBuffer.push(resampled, options.currentTime());
  };

  // Pass the audio through to the speakers, and give the processor a
  // destination so it actually runs; a muted gain keeps it silent.
  const silent = context.createGain();
  silent.gain.value = 0;
  source.connect(context.destination);
  source.connect(processor);
  processor.connect(silent);
  silent.connect(context.destination);

  void context.resume().catch(() => undefined);

  return {
    stop: () => {
      running = false;
      windowBuffer.flush();
      try {
        processor.disconnect();
        silent.disconnect();
        source.disconnect();
        source.connect(context.destination);
      } catch {
        // Already torn down.
      }
      void context.close().catch(() => undefined);
    },
    isRunning: () => running,
  };
}
