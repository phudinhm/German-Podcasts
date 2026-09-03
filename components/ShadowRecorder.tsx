"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Segment } from "@/lib/types";
import { analysePitch, contourSimilarity, decodeToMono, smoothContour, toSemitones } from "@/lib/audio/pitch";
import { scorePronunciation, type PronunciationScore } from "@/lib/audio/scoring";
import { getSpeechRecognition, type SpeechRecognitionLike } from "@/lib/audio/speech";
import { useUi } from "@/lib/i18n";

interface Props {
  segment: Segment | null;
  /** Registers the "start/stop recording" action so the R hotkey can call it. */
  onRegisterToggle?: (toggle: () => void) => void;
}

/**
 * Records a take, plots its pitch contour next to the native one when the
 * ingest worker supplied it, and scores the words. Nothing here touches the
 * network unless the browser's own speech recogniser does.
 */
export function ShadowRecorder({ segment, onRegisterToggle }: Props) {
  const { t } = useUi();
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contour, setContour] = useState<number[] | null>(null);
  const [score, setScore] = useState<PronunciationScore | null>(null);
  const [prosody, setProsody] = useState<number | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const heardRef = useRef<string>("");
  const segmentRef = useRef(segment);
  segmentRef.current = segment;

  const stop = useCallback(() => {
    recorderRef.current?.stop();
    recorderRef.current?.stream.getTracks().forEach((track) => track.stop());
    recorderRef.current = null;
    try {
      recognitionRef.current?.stop();
    } catch {
      // Recognition may already have ended on its own.
    }
    recognitionRef.current = null;
    setRecording(false);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setScore(null);
    setContour(null);
    setProsody(null);
    heardRef.current = "";

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("This browser does not allow microphone access.");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("No access to the microphone. Please allow the permission.");
      return;
    }

    chunksRef.current = [];
    const recorder = new MediaRecorder(stream);
    recorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
      if (blob.size === 0) return;
      setAudioUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return URL.createObjectURL(blob);
      });
      try {
        const { samples, sampleRate } = await decodeToMono(blob);
        const track = analysePitch(samples, sampleRate);
        const smoothed = smoothContour(track.f0);
        setContour(smoothed);
        const native = segmentRef.current?.f0;
        if (native?.length) setProsody(Math.round(contourSimilarity(native, smoothed) * 100));
      } catch {
        setError("That recording could not be analysed.");
      }
      if (heardRef.current && segmentRef.current) {
        setScore(scorePronunciation(segmentRef.current.de, heardRef.current));
      }
    };

    recorder.start();
    setRecording(true);

    const Recognition = getSpeechRecognition();
    if (Recognition) {
      const recognition = new Recognition();
      recognition.lang = "de-DE";
      recognition.interimResults = false;
      recognition.continuous = true;
      recognition.onresult = (event) => {
        let text = "";
        for (let i = 0; i < event.results.length; i += 1) text += ` ${event.results[i][0].transcript}`;
        heardRef.current = text.trim();
      };
      recognition.onerror = () => undefined;
      recognitionRef.current = recognition;
      try {
        recognition.start();
      } catch {
        recognitionRef.current = null;
      }
    }
  }, []);

  const toggle = useCallback(() => {
    if (recording) stop();
    else void start();
  }, [recording, start, stop]);

  useEffect(() => {
    onRegisterToggle?.(toggle);
  }, [onRegisterToggle, toggle]);

  useEffect(() => () => stop(), [stop]);

  const [hasSpeechApi, setHasSpeechApi] = useState(true);
  useEffect(() => setHasSpeechApi(Boolean(getSpeechRecognition())), []);

  return (
    <div className="card p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn btn-primary w-[132px]"
          onClick={toggle}
          disabled={!segment}
          data-active={recording}
        >
          {recording ? t("controls.stopRecording") : t("controls.record")}
        </button>
        {audioUrl ? (
          <audio controls src={audioUrl} className="h-8 max-w-[220px]" />
        ) : (
          <span className="text-[11px] text-[var(--ink-faint)]">
            {segment ? t("controls.recordHint") : t("controls.recordPick")}
          </span>
        )}
        {prosody !== null ? (
          <span className="ml-auto text-[11px] text-[var(--ink-soft)]">
            Melody match <strong className="text-[var(--accent)]">{prosody}%</strong>
          </span>
        ) : null}
      </div>

      {error ? <p className="mt-2 text-[12px] text-rose-600">{error}</p> : null}

      {contour ? <PitchPlot mine={contour} native={segment?.f0} /> : null}

      {score ? (
        <div className="mt-3 border-t border-[var(--rule)] pt-2.5">
          <div className="mb-1.5 flex gap-4 text-[11px] text-[var(--ink-faint)]">
            <span>
              Accuracy <strong className="text-[var(--ink)]">{score.accuracy}%</strong>
            </span>
            <span>
              Completeness <strong className="text-[var(--ink)]">{score.completeness}%</strong>
            </span>
          </div>
          <p className="text-[15px] leading-relaxed" style={{ fontFamily: "var(--font-display)" }}>
            {score.words.map((word, index) => (
              <span
                key={index}
                title={word.heard ? `heard: ${word.heard}` : "not recognised"}
                className={
                  word.verdict === "good"
                    ? "text-emerald-600 dark:text-emerald-400"
                    : word.verdict === "close"
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-rose-600 line-through decoration-1 dark:text-rose-400"
                }
              >
                {word.target}{" "}
              </span>
            ))}
          </p>
        </div>
      ) : null}

      {!hasSpeechApi && contour ? (
        <p className="mt-2 text-[11px] text-[var(--ink-faint)]">
          Word scoring needs the Web Speech API, which this browser does not offer. The pitch contour
          above comes from analysing your own recording and works everywhere.
        </p>
      ) : null}
    </div>
  );
}

/**
 * Plots the contour in semitones around each speaker's own median, so a low and
 * a high voice can be compared on shape. German drops hard at a full stop and
 * rises on a question; that shape is the thing worth copying.
 */
function PitchPlot({ mine, native }: { mine: number[]; native?: number[] }) {
  const width = 560;
  const height = 84;
  const range = 14; // semitones above and below the median

  function toPath(values: number[]): string {
    const { values: semitones } = toSemitones(values);
    let path = "";
    let open = false;
    semitones.forEach((value, index) => {
      if (!Number.isFinite(value)) {
        open = false;
        return;
      }
      const x = (index / Math.max(1, semitones.length - 1)) * width;
      const y = height / 2 - (Math.max(-range, Math.min(range, value)) / range) * (height / 2 - 6);
      path += `${open ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)} `;
      open = true;
    });
    return path.trim();
  }

  return (
    <figure className="mt-3">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-[84px] w-full"
        role="img"
        aria-label="Pitch contour of the recording"
      >
        <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke="var(--rule)" strokeWidth="1" />
        {native?.length ? (
          <path d={toPath(native)} fill="none" stroke="var(--ink-faint)" strokeWidth="2" strokeDasharray="4 3" />
        ) : null}
        <path d={toPath(mine)} fill="none" stroke="var(--accent-ring)" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      <figcaption className="mt-1 flex gap-4 text-[10px] text-[var(--ink-faint)]">
        <span className="flex items-center gap-1">
          <span className="inline-block h-[2px] w-4 bg-[var(--accent-ring)]" /> your recording
        </span>
        {native?.length ? (
          <span className="flex items-center gap-1">
            <span className="inline-block h-[2px] w-4 border-t-2 border-dashed border-[var(--ink-faint)]" />{" "}
            native speaker
          </span>
        ) : (
          <span>The native contour appears once the ingest worker supplies it.</span>
        )}
      </figcaption>
    </figure>
  );
}
