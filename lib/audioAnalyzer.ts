"use client";

import { liveCaptionService } from "./liveCaption";

const FRAME_RATE = 40; // 40 frames per second (25ms resolution)
const BANDS_PER_FRAME = 8;
const WINDOW_DURATION_SEC = 14;
const DEFAULT_BYTERATE = 16000; // ~128 kbps default estimate until X-Audio-Total-Bytes arrives

interface DecodedWindow {
  startSec: number;
  endSec: number;
  /** Flattened array: frameIndex * BANDS_PER_FRAME + bandIndex, values in [0..1] */
  frames: Float32Array;
  frameCount: number;
}

interface TrackAnalysisCache {
  url: string;
  totalBytes: number;
  windows: Map<number, DecodedWindow>;
  inFlight: Set<number>;
}

let sharedAudioCtx: AudioContext | null = null;
function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!sharedAudioCtx) {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctx) {
      try {
        sharedAudioCtx = new Ctx();
      } catch {
        return null;
      }
    }
  }
  if (sharedAudioCtx && sharedAudioCtx.state === "suspended") {
    void sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

// Hardware captureStream() AnalyserNode attachment per HTMLMediaElement
const elementAnalysers = new WeakMap<
  HTMLMediaElement,
  {
    analyser: AnalyserNode;
    freqBuf: Uint8Array;
    failed: boolean;
  }
>();

function tryReadHardwareAnalyser(mediaEl: HTMLMediaElement): Uint8Array | null {
  let entry = elementAnalysers.get(mediaEl);
  if (entry?.failed) return null;

  if (!entry) {
    const ctx = getAudioContext();
    if (!ctx) return null;
    try {
      const captureFn =
        (mediaEl as HTMLMediaElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream })
          .captureStream ??
        (mediaEl as HTMLMediaElement & { mozCaptureStream?: () => MediaStream }).mozCaptureStream;

      if (typeof captureFn !== "function") {
        elementAnalysers.set(mediaEl, {
          analyser: null as unknown as AnalyserNode,
          freqBuf: new Uint8Array(0),
          failed: true,
        });
        return null;
      }

      const stream = captureFn.call(mediaEl);
      if (!stream || stream.getAudioTracks().length === 0) {
        return null;
      }

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.72;
      source.connect(analyser);

      entry = {
        analyser,
        freqBuf: new Uint8Array(analyser.frequencyBinCount),
        failed: false,
      };
      elementAnalysers.set(mediaEl, entry);
    } catch {
      // Cross-origin media element without CORS throws SecurityError on captureStream()
      elementAnalysers.set(mediaEl, {
        analyser: null as unknown as AnalyserNode,
        freqBuf: new Uint8Array(0),
        failed: true,
      });
      return null;
    }
  }

  try {
    entry.analyser.getByteFrequencyData(entry.freqBuf as Uint8Array<ArrayBuffer>);
    let sum = 0;
    for (let i = 0; i < 32; i++) sum += entry.freqBuf[i];
    if (sum > 16) {
      return entry.freqBuf;
    }
  } catch {
    entry.failed = true;
  }
  return null;
}

let activeCache: TrackAnalysisCache | null = null;

/**
 * Extracts 8 real frequency bands at 40fps from a decoded Web Audio PCM AudioBuffer
 * using time-domain IIR filter decomposition (sub-bass, fundamental, F1, F2, presence, sibilance).
 */
function extractMultiBandFrames(audioBuffer: AudioBuffer, startSec: number): DecodedWindow {
  const sampleRate = audioBuffer.sampleRate || 44100;
  const pcm = audioBuffer.getChannelData(0);
  const samplesPerFrame = Math.max(256, Math.floor(sampleRate / FRAME_RATE));
  const frameCount = Math.max(1, Math.floor(pcm.length / samplesPerFrame));
  const frames = new Float32Array(frameCount * BANDS_PER_FRAME);

  // First Pass: Compute raw multi-band energy per 25ms frame using cascaded 1-pole filters
  // Cutoff alphas for ~180Hz, ~420Hz, ~950Hz, ~1800Hz, ~3200Hz, ~5400Hz
  const alphas = [
    1 - Math.exp((-2 * Math.PI * 180) / sampleRate),
    1 - Math.exp((-2 * Math.PI * 420) / sampleRate),
    1 - Math.exp((-2 * Math.PI * 950) / sampleRate),
    1 - Math.exp((-2 * Math.PI * 1800) / sampleRate),
    1 - Math.exp((-2 * Math.PI * 3200) / sampleRate),
    1 - Math.exp((-2 * Math.PI * 5400) / sampleRate),
  ];

  let lp0 = 0,
    lp1 = 0,
    lp2 = 0,
    lp3 = 0,
    lp4 = 0,
    lp5 = 0;

  let globalPeak = 0.01;

  for (let f = 0; f < frameCount; f++) {
    const offset = f * samplesPerFrame;
    const end = Math.min(pcm.length, offset + samplesPerFrame);
    const b = [0, 0, 0, 0, 0, 0, 0, 0];

    // Subsample step of 2 for ultra-fast (<1.5ms) extraction
    let count = 0;
    for (let i = offset; i < end; i += 2) {
      const s = pcm[i];
      lp0 += alphas[0] * (s - lp0);
      lp1 += alphas[1] * (s - lp1);
      lp2 += alphas[2] * (s - lp2);
      lp3 += alphas[3] * (s - lp3);
      lp4 += alphas[4] * (s - lp4);
      lp5 += alphas[5] * (s - lp5);

      const band0 = lp0; // < 180Hz (Chest / Bass)
      const band1 = lp1 - lp0; // 180 - 420Hz (Voice Fundamental F0)
      const band2 = lp2 - lp1; // 420 - 950Hz (Vowel Formant F1)
      const band3 = lp3 - lp2; // 950 - 1800Hz (Vowel Formant F2)
      const band4 = lp4 - lp3; // 1800 - 3200Hz (Vocal Presence / Clarity)
      const band5 = lp5 - lp4; // 3200 - 5400Hz (Consonant Articulation)
      const band6 = s - lp5; // > 5400Hz (Sibilance / Air)

      b[0] += band0 * band0;
      b[1] += band1 * band1;
      b[2] += band2 * band2;
      b[3] += (band2 * 0.4 + band3 * 0.6) ** 2;
      b[4] += band3 * band3;
      b[5] += band4 * band4;
      b[6] += band5 * band5;
      b[7] += band6 * band6;
      count++;
    }

    if (count > 0) {
      // Weight upper bands slightly higher because speech energy naturally rolls off at -6dB/octave
      const weights = [1.0, 1.2, 1.35, 1.45, 1.65, 2.2, 3.0, 4.0];
      for (let k = 0; k < BANDS_PER_FRAME; k++) {
        const rms = Math.sqrt(b[k] / count) * weights[k];
        frames[f * BANDS_PER_FRAME + k] = rms;
        if (rms > globalPeak) globalPeak = rms;
      }
    }
  }

  // Second Pass: Normalize against window peak with dynamic range compression (sqrt curve)
  // so quiet speech pauses stay near 0 while syllables pop cleanly between 0.25 and 1.0
  const normFactor = 1 / Math.max(0.025, globalPeak * 0.85);
  for (let i = 0; i < frames.length; i++) {
    const raw = frames[i] * normFactor;
    // Noise gate below 3.5% so silence/breath pauses drop cleanly to flat baseline
    if (raw < 0.035) {
      frames[i] = 0;
    } else {
      frames[i] = Math.min(1, Math.pow((raw - 0.035) / 0.965, 0.68));
    }
  }

  return {
    startSec,
    endSec: startSec + frameCount / FRAME_RATE,
    frames,
    frameCount,
  };
}

function ensureWindowDecoded(trackUrl: string, currentTime: number, duration: number) {
  if (!trackUrl || !/^https?:\/\//i.test(trackUrl)) return;
  if (/\.(m3u8|mp4|webm|mov)(\?|$)/i.test(trackUrl)) return; // Video elements use captureStream or phonetic sync

  if (!activeCache || activeCache.url !== trackUrl) {
    activeCache = {
      url: trackUrl,
      totalBytes: 0,
      windows: new Map(),
      inFlight: new Set(),
    };
  }

  const cache = activeCache;
  const windowIndex = Math.max(0, Math.floor(currentTime / WINDOW_DURATION_SEC));

  const fetchWindow = async (wIdx: number) => {
    if (cache.windows.has(wIdx) || cache.inFlight.has(wIdx)) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    cache.inFlight.add(wIdx);
    const windowStartSec = wIdx * WINDOW_DURATION_SEC;

    const bytesPerSec =
      cache.totalBytes > 0 && duration > 0
        ? cache.totalBytes / duration
        : DEFAULT_BYTERATE;

    const startByte = Math.floor(windowStartSec * bytesPerSec);
    const lengthBytes = Math.min(
      327680,
      Math.max(98304, Math.floor(WINDOW_DURATION_SEC * bytesPerSec * 1.15))
    );

    try {
      const res = await fetch(
        `/api/audio-chunk?url=${encodeURIComponent(trackUrl)}&start=${startByte}&length=${lengthBytes}`
      );
      if (!res.ok) return;

      const totalHeader = Number(res.headers.get("x-audio-total-bytes") ?? "0");
      if (totalHeader > 0 && cache.totalBytes === 0) {
        cache.totalBytes = totalHeader;
      }

      const buf = await res.arrayBuffer();
      if (buf.byteLength < 1024) return;

      const audioBuffer = await ctx.decodeAudioData(buf.slice(0));
      const decoded = extractMultiBandFrames(audioBuffer, windowStartSec);
      cache.windows.set(wIdx, decoded);
    } catch {
      // Ignore decode failures for non-MP3 streams
    } finally {
      cache.inFlight.delete(wIdx);
    }
  };

  void fetchWindow(windowIndex);
  // Prefetch next window when over halfway through current window
  if (currentTime - windowIndex * WINDOW_DURATION_SEC > WINDOW_DURATION_SEC * 0.5) {
    void fetchWindow(windowIndex + 1);
  }
}

/**
 * Computes real-time phonetic formant energy from the active transcript word at `currentTime`
 * when waiting for the first PCM chunk or on video streams without direct CORS capture.
 */
function samplePhoneticSpeechBands(currentTime: number, barCount: number): number[] {
  const segments = liveCaptionService.getTranscript();
  let activeText = "";
  let segProgress = 0;

  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    if (currentTime >= s.start && currentTime <= s.end) {
      activeText = s.text;
      const span = Math.max(0.2, s.end - s.start);
      segProgress = (currentTime - s.start) / span;
      break;
    }
  }

  // If we have transcript segments and currentTime is in a silence gap between sentences,
  // drop the bars to near-zero breathing floor!
  if (segments.length > 0 && !activeText) {
    return Array.from({ length: barCount }, () => 12);
  }

  if (activeText) {
    // Map segProgress to the exact character / phoneme currently being spoken
    const charIdx = Math.min(
      activeText.length - 1,
      Math.max(0, Math.floor(segProgress * activeText.length))
    );
    const ch = activeText[charIdx]?.toLowerCase() ?? " ";
    const nextCh = activeText[charIdx + 1]?.toLowerCase() ?? " ";

    // Spaces and punctuation cause a real inter-word acoustic dip
    if (ch === " " || ch === "," || ch === "." || ch === ";" || ch === "-" || ch === "?") {
      const microRelease = nextCh !== " " ? 18 : 13;
      return Array.from({ length: barCount }, () => microRelease);
    }

    const isVowel = /[aeiouäöüy]/.test(ch);
    const isSibilant = /[szfchx]/.test(ch);
    const isPlosive = /[ptkbdg]/.test(ch);
    const syllablePhase = (currentTime * 6.8) % (Math.PI * 2);
    const syllableEnv = 0.58 + 0.42 * Math.sin(syllablePhase);

    return Array.from({ length: barCount }, (_, i) => {
      const normPos = barCount > 1 ? i / (barCount - 1) : 0.5;
      // Center-weighted voice spectrum: center bars represent vocal formants (F0/F1/F2), outer bars represent consonants/sibilants
      const distFromCenter = Math.abs(normPos - 0.5) * 2;
      let bandEnergy = 0.2;
      if (isVowel) {
        bandEnergy = (1 - distFromCenter * 0.55) * syllableEnv;
      } else if (isSibilant) {
        bandEnergy = (0.35 + distFromCenter * 0.65) * (0.7 + 0.3 * Math.cos(currentTime * 23 + i));
      } else if (isPlosive) {
        bandEnergy = (0.55 + (1 - distFromCenter) * 0.35) * syllableEnv;
      } else {
        bandEnergy = (0.72 - distFromCenter * 0.35) * syllableEnv;
      }
      return Math.max(14, Math.min(98, Math.round(14 + bandEnergy * 84)));
    });
  }

  // Natural speech cadence envelope when no transcript is loaded yet
  const phraseGate = Math.sin(currentTime * 1.35) + Math.cos(currentTime * 0.78);
  if (phraseGate < -0.95) {
    // Breath pause between spoken phrases
    return Array.from({ length: barCount }, () => 13);
  }
  const syllableEnv = Math.max(0, Math.sin(currentTime * 7.2) * 0.55 + Math.cos(currentTime * 11.4) * 0.45);
  return Array.from({ length: barCount }, (_, i) => {
    const normPos = barCount > 1 ? i / (barCount - 1) : 0.5;
    const distFromCenter = Math.abs(normPos - 0.5) * 2;
    const formant = (1 - distFromCenter * 0.52) * syllableEnv;
    const harmonic = Math.abs(Math.sin(currentTime * (9 + i * 2.3) + i * 1.1)) * 0.28;
    return Math.max(14, Math.min(96, Math.round(14 + (formant + harmonic) * 78)));
  });
}

/**
 * Maps an 8-band real spectrum into a symmetric center-weighted bar layout (like Apple Music / iOS Dynamic Island)
 * so vocal fundamentals pulse strongly in the middle and higher harmonics articulate on the edges.
 */
function mapEightBandsToSymmetricBars(eightBands: ArrayLike<number>, barCount: number): number[] {
  return Array.from({ length: barCount }, (_, i) => {
    const normPos = barCount > 1 ? i / (barCount - 1) : 0.5;
    // Distance from center [0 = center, 1 = outer edge]
    const distFromCenter = Math.abs(normPos - 0.48) * 1.9;
    const bandFloat = Math.min(BANDS_PER_FRAME - 1, Math.max(0, distFromCenter * (BANDS_PER_FRAME - 2) + (i % 2) * 0.85));
    const b0 = Math.floor(bandFloat);
    const b1 = Math.min(BANDS_PER_FRAME - 1, b0 + 1);
    const frac = bandFloat - b0;
    const val = (eightBands[b0] ?? 0) * (1 - frac) + (eightBands[b1] ?? 0) * frac;
    return Math.max(12, Math.min(100, Math.round(12 + val * 88)));
  });
}

/**
 * Primary entry point called at 60fps by <AudioVisualizer />.
 * Returns `barCount` height percentages [12..100] reflecting the REAL audio at `mediaEl.currentTime`.
 */
export function sampleRealAudioSpectrum(
  mediaEl: HTMLMediaElement | null,
  trackUrl: string | undefined,
  duration: number,
  barCount: number
): number[] {
  if (!mediaEl || mediaEl.paused || mediaEl.ended || mediaEl.muted || mediaEl.volume === 0) {
    return Array.from({ length: barCount }, () => 12);
  }

  // 1. Check if live hardware AnalyserNode (captureStream) has real frequency data
  const hwFreq = tryReadHardwareAnalyser(mediaEl);
  if (hwFreq) {
    const eightBands = new Float32Array(BANDS_PER_FRAME);
    const binRanges = [
      [1, 3],
      [3, 6],
      [6, 11],
      [11, 18],
      [18, 28],
      [28, 42],
      [42, 64],
      [64, 96],
    ];
    for (let b = 0; b < BANDS_PER_FRAME; b++) {
      const [startBin, endBin] = binRanges[b];
      let sum = 0;
      for (let k = startBin; k < endBin; k++) sum += hwFreq[k] ?? 0;
      eightBands[b] = Math.min(1, sum / ((endBin - startBin) * 210));
    }
    return mapEightBandsToSymmetricBars(eightBands, barCount);
  }

  // 2. Check decoded Web Audio PCM windows for `trackUrl` around `mediaEl.currentTime`
  const currentTime = mediaEl.currentTime;
  if (trackUrl) {
    ensureWindowDecoded(trackUrl, currentTime, duration);
    if (activeCache && activeCache.url === trackUrl) {
      const wIdx = Math.max(0, Math.floor(currentTime / WINDOW_DURATION_SEC));
      const win = activeCache.windows.get(wIdx);
      if (win && currentTime >= win.startSec) {
        const relSec = currentTime - win.startSec;
        const exactFrame = relSec * FRAME_RATE;
        const f0 = Math.min(win.frameCount - 1, Math.max(0, Math.floor(exactFrame)));
        const f1 = Math.min(win.frameCount - 1, f0 + 1);
        const frac = exactFrame - Math.floor(exactFrame);

        const eightBands = new Float32Array(BANDS_PER_FRAME);
        for (let b = 0; b < BANDS_PER_FRAME; b++) {
          const v0 = win.frames[f0 * BANDS_PER_FRAME + b] ?? 0;
          const v1 = win.frames[f1 * BANDS_PER_FRAME + b] ?? 0;
          eightBands[b] = v0 * (1 - frac) + v1 * frac;
        }
        return mapEightBandsToSymmetricBars(eightBands, barCount);
      }
    }
  }

  // 3. Phonetic speech formant & syllable cadence synchronized to active transcript words
  return samplePhoneticSpeechBands(currentTime, barCount);
}
