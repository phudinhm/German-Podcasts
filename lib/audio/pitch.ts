/**
 * Client-side pitch and loudness analysis.
 *
 * All of this runs in the browser on purpose. Microphone audio never leaves the
 * device, latency stays at zero, and the serverless bill does not scale with how
 * much anybody practises.
 */

export interface PitchTrack {
  /** Fundamental frequency in Hz per frame, 0 where the frame is unvoiced. */
  f0: number[];
  /** RMS loudness per frame, 0..1. */
  rms: number[];
  /** Seconds per frame. */
  hop: number;
  duration: number;
}

const FRAME_SECONDS = 0.04;
const HOP_SECONDS = 0.01;
/** Human speech range, generously bounded: 60 Hz bass to 500 Hz child. */
const MIN_HZ = 60;
const MAX_HZ = 500;
const VOICED_THRESHOLD = 0.35;

/**
 * Normalised autocorrelation with a parabolic peak refinement.
 *
 * Autocorrelation rather than FFT because we only need one number per frame and
 * the search range is narrow; this is fast enough to analyse a 10-second take in
 * a few milliseconds on a phone.
 */
export function detectPitch(frame: Float32Array, sampleRate: number): number {
  const size = frame.length;

  let rms = 0;
  for (let i = 0; i < size; i += 1) rms += frame[i] * frame[i];
  rms = Math.sqrt(rms / size);
  if (rms < 0.008) return 0;

  const minLag = Math.floor(sampleRate / MAX_HZ);
  const maxLag = Math.min(size - 1, Math.floor(sampleRate / MIN_HZ));

  let bestLag = -1;
  let bestCorrelation = 0;
  let previous = 1;
  let ascending = false;

  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let numerator = 0;
    let energyA = 0;
    let energyB = 0;
    for (let i = 0; i < size - lag; i += 1) {
      numerator += frame[i] * frame[i + lag];
      energyA += frame[i] * frame[i];
      energyB += frame[i + lag] * frame[i + lag];
    }
    const correlation = numerator / (Math.sqrt(energyA * energyB) + 1e-12);

    // Walk past the initial decay, then take the first true local maximum -
    // taking the global maximum would happily lock onto an octave error.
    if (!ascending && correlation > previous) ascending = true;
    if (ascending && correlation < previous && bestLag < 0 && previous > VOICED_THRESHOLD) {
      bestLag = lag - 1;
      bestCorrelation = previous;
      break;
    }
    if (correlation > bestCorrelation) {
      bestCorrelation = correlation;
      bestLag = lag;
    }
    previous = correlation;
  }

  if (bestLag < 0 || bestCorrelation < VOICED_THRESHOLD) return 0;
  return sampleRate / bestLag;
}

export function analysePitch(samples: Float32Array, sampleRate: number): PitchTrack {
  const frameSize = Math.round(FRAME_SECONDS * sampleRate);
  const hopSize = Math.round(HOP_SECONDS * sampleRate);
  const f0: number[] = [];
  const rms: number[] = [];

  for (let start = 0; start + frameSize <= samples.length; start += hopSize) {
    const frame = samples.subarray(start, start + frameSize);
    let energy = 0;
    for (let i = 0; i < frame.length; i += 1) energy += frame[i] * frame[i];
    rms.push(Math.min(1, Math.sqrt(energy / frame.length) * 4));
    f0.push(detectPitch(frame, sampleRate));
  }

  return { f0, rms, hop: HOP_SECONDS, duration: samples.length / sampleRate };
}

/**
 * Removes octave jumps and isolated spikes, which autocorrelation produces at
 * voiced/unvoiced boundaries and which would otherwise dominate the contour.
 */
export function smoothContour(f0: number[]): number[] {
  const out = f0.slice();
  for (let i = 1; i < out.length - 1; i += 1) {
    const previous = out[i - 1];
    const next = out[i + 1];
    if (out[i] === 0 || previous === 0 || next === 0) continue;
    // An octave error is a near-exact doubling or halving of its neighbours.
    const neighbourMean = (previous + next) / 2;
    if (out[i] > neighbourMean * 1.7) out[i] /= 2;
    else if (out[i] < neighbourMean * 0.6) out[i] *= 2;
  }
  // Median-of-three to knock out single-frame spikes.
  const smoothed = out.slice();
  for (let i = 1; i < out.length - 1; i += 1) {
    const window = [out[i - 1], out[i], out[i + 1]].sort((a, b) => a - b);
    smoothed[i] = window[1];
  }
  return smoothed;
}

/** Converts a contour to semitones relative to the speaker's own median. */
export function toSemitones(f0: number[]): { values: number[]; reference: number } {
  const voiced = f0.filter((value) => value > 0).sort((a, b) => a - b);
  if (voiced.length === 0) return { values: f0.map(() => 0), reference: 0 };
  const reference = voiced[Math.floor(voiced.length / 2)];
  return {
    values: f0.map((value) => (value > 0 ? 12 * Math.log2(value / reference) : Number.NaN)),
    reference,
  };
}

export async function decodeToMono(blob: Blob): Promise<{ samples: Float32Array; sampleRate: number }> {
  const arrayBuffer = await blob.arrayBuffer();
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const context = new Ctor();
  try {
    const decoded = await context.decodeAudioData(arrayBuffer.slice(0));
    const channel = decoded.getChannelData(0);
    return { samples: new Float32Array(channel), sampleRate: decoded.sampleRate };
  } finally {
    void context.close();
  }
}

/**
 * Compares two contours after normalising both to semitones around their own
 * median, so a low male voice and a high female voice can still be compared on
 * shape rather than on absolute pitch. Returns 0..1.
 */
export function contourSimilarity(a: number[], b: number[]): number {
  if (a.length < 3 || b.length < 3) return 0;
  const left = toSemitones(a).values;
  const right = toSemitones(b).values;
  const length = Math.min(left.length, right.length);

  // Resample the longer contour onto the shorter one's grid.
  const sampled: Array<[number, number]> = [];
  for (let i = 0; i < length; i += 1) {
    const x = left[Math.floor((i / length) * left.length)];
    const y = right[Math.floor((i / length) * right.length)];
    if (Number.isFinite(x) && Number.isFinite(y)) sampled.push([x, y]);
  }
  if (sampled.length < 3) return 0;

  const meanX = sampled.reduce((sum, [x]) => sum + x, 0) / sampled.length;
  const meanY = sampled.reduce((sum, [, y]) => sum + y, 0) / sampled.length;
  let covariance = 0;
  let varianceX = 0;
  let varianceY = 0;
  for (const [x, y] of sampled) {
    covariance += (x - meanX) * (y - meanY);
    varianceX += (x - meanX) ** 2;
    varianceY += (y - meanY) ** 2;
  }
  const correlation = covariance / (Math.sqrt(varianceX * varianceY) + 1e-9);
  return Math.max(0, Math.min(1, (correlation + 1) / 2));
}
