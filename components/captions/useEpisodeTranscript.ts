"use client";

import { useCallback, useRef, useState } from "react";
import { canReadDirectly, resample, toMono, TARGET_SAMPLE_RATE } from "@/lib/audio/capture";
import { proxied } from "@/lib/audio/proxy";
import { mergePieces, planChunks, type TimedPiece } from "@/lib/audio/chunks";
import { offTimed, transcribeWindow, warmWhisper, type WhisperStatus } from "@/lib/audio/whisper";
import type { CaptionLine } from "./useCaptions";

export interface TranscribeState {
  running: boolean;
  /** "fetching" while the audio downloads, "reading" while the model works. */
  stage: "idle" | "fetching" | "decoding" | "reading" | "done" | "error";
  /** 0..1 through the episode. */
  progress: number;
  error: string | null;
  whisper: WhisperStatus;
  lines: CaptionLine[];
  /** Seconds the whole run took, once it is done. */
  tookMs: number | null;
}

const IDLE: TranscribeState = {
  running: false,
  stage: "idle",
  progress: 0,
  error: null,
  whisper: { state: "idle" },
  lines: [],
  tookMs: null,
};

/**
 * Transcribes an entire episode in the browser, with real timestamps.
 *
 * Live captions can only ever transcribe what you have already heard, which is
 * the wrong shape for a native podcast with no published script: you want the
 * text before you listen, so you can read along, jump around and export it.
 *
 * So this reads the file rather than the playhead. It downloads the audio once,
 * decodes it, and hands the model twenty-eight-second windows as fast as the
 * machine will take them - several times faster than real time on a GPU. The
 * timestamps come from the model itself, offset by each window's position, so
 * clicking a sentence lands on that sentence rather than near it.
 */
export function useEpisodeTranscript() {
  const [state, setState] = useState<TranscribeState>(IDLE);
  const cancelRef = useRef(false);

  const cancel = useCallback(() => {
    cancelRef.current = true;
    setState((previous) => ({ ...previous, running: false, stage: "idle" }));
  }, []);

  const run = useCallback(async (url: string) => {
    cancelRef.current = false;
    const startedAt = performance.now();
    setState({ ...IDLE, running: true, stage: "fetching" });

    const stopWatching = warmWhisper((whisper) =>
      setState((previous) => ({ ...previous, whisper })),
    );

    try {
      const direct = await canReadDirectly(url);
      const response = await fetch(direct ? url : proxied(url));
      if (!response.ok) throw new Error(`The audio could not be downloaded (${response.status}).`);
      const bytes = await response.arrayBuffer();
      if (cancelRef.current) return;

      setState((previous) => ({ ...previous, stage: "decoding" }));
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) throw new Error("This browser cannot decode audio.");
      const context = new Ctor();
      const decoded = await context.decodeAudioData(bytes);
      void context.close();
      if (cancelRef.current) return;

      const channels: Float32Array[] = [];
      for (let i = 0; i < decoded.numberOfChannels; i += 1) channels.push(decoded.getChannelData(i));
      const samples = resample(toMono(channels), decoded.sampleRate, TARGET_SAMPLE_RATE);

      const chunks = planChunks(samples.length, TARGET_SAMPLE_RATE);
      setState((previous) => ({ ...previous, stage: "reading", progress: 0 }));

      let pieces: TimedPiece[] = [];
      for (let index = 0; index < chunks.length; index += 1) {
        if (cancelRef.current) return;
        const chunk = chunks[index];

        // One window at a time. The model is the bottleneck, and queueing the
        // whole episode at once would only make it impossible to stop.
        const incoming = await new Promise<TimedPiece[]>((resolve, reject) => {
          const handler = (timed: { id: number; offset: number; pieces: Array<{ text: string; from: number; to: number | null }> }) => {
            if (timed.id !== index) return;
            offTimed(handler);
            resolve(
              timed.pieces.map((piece) => ({
                text: piece.text,
                at: timed.offset + piece.from,
                until: timed.offset + (piece.to ?? piece.from + 2),
              })),
            );
          };
          offTimed(handler);
          transcribeWindow(samples.subarray(chunk.from, chunk.to), chunk.at, index, handler);
          window.setTimeout(() => {
            offTimed(handler);
            reject(new Error("The model stopped responding."));
          }, 180_000);
        });

        pieces = mergePieces(pieces, incoming);
        const lines: CaptionLine[] = pieces.map((piece, i) => ({
          id: `t${Math.round(piece.at * 1000)}-${i}`,
          at: piece.at,
          until: piece.until,
          de: piece.text,
        }));
        setState((previous) => ({
          ...previous,
          progress: (index + 1) / chunks.length,
          lines,
        }));
      }

      setState((previous) => ({
        ...previous,
        running: false,
        stage: "done",
        progress: 1,
        tookMs: Math.round(performance.now() - startedAt),
      }));
    } catch (error) {
      if (cancelRef.current) return;
      setState((previous) => ({
        ...previous,
        running: false,
        stage: "error",
        error: error instanceof Error ? error.message : String(error),
      }));
    } finally {
      stopWatching();
    }
  }, []);

  return { state, run, cancel };
}
