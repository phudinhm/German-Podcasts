"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Segment } from "@/lib/types";
import { analysePitch, contourSimilarity, decodeToMono, smoothContour, toSemitones } from "@/lib/audio/pitch";
import { scorePronunciation, type PronunciationScore } from "@/lib/audio/scoring";

interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: unknown) => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

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
      setError("Dieser Browser gibt keinen Mikrofonzugriff frei.");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Kein Zugriff auf das Mikrofon. Bitte die Berechtigung erlauben.");
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
        setError("Die Aufnahme ließ sich nicht analysieren.");
      }
      if (heardRef.current && segmentRef.current) {
        setScore(scorePronunciation(segmentRef.current.de, heardRef.current));
      }
    };

    recorder.start();
    setRecording(true);

    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
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

  const hasSpeechApi =
    typeof window !== "undefined" && Boolean(window.SpeechRecognition ?? window.webkitSpeechRecognition);

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
          {recording ? "Aufnahme stoppen" : "Nachsprechen"}
        </button>
        {audioUrl ? (
          <audio controls src={audioUrl} className="h-8 max-w-[220px]" />
        ) : (
          <span className="text-[11px] text-[var(--ink-faint)]">
            {segment ? "Satz wählen, Taste R drücken, nachsprechen." : "Erst einen Satz in Schleife legen."}
          </span>
        )}
        {prosody !== null ? (
          <span className="ml-auto text-[11px] text-[var(--ink-soft)]">
            Melodie-Übereinstimmung <strong className="text-[var(--accent)]">{prosody}%</strong>
          </span>
        ) : null}
      </div>

      {error ? <p className="mt-2 text-[12px] text-rose-600">{error}</p> : null}

      {contour ? <PitchPlot mine={contour} native={segment?.f0} /> : null}

      {score ? (
        <div className="mt-3 border-t border-[var(--rule)] pt-2.5">
          <div className="mb-1.5 flex gap-4 text-[11px] text-[var(--ink-faint)]">
            <span>
              Genauigkeit <strong className="text-[var(--ink)]">{score.accuracy}%</strong>
            </span>
            <span>
              Vollständigkeit <strong className="text-[var(--ink)]">{score.completeness}%</strong>
            </span>
          </div>
          <p className="text-[15px] leading-relaxed" style={{ fontFamily: "var(--font-display)" }}>
            {score.words.map((word, index) => (
              <span
                key={index}
                title={word.heard ? `gehört: ${word.heard}` : "nicht erkannt"}
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
          Wortbewertung braucht die Web-Speech-API, die dieser Browser nicht anbietet. Die Tonhöhenkurve
          oben stammt aus der Analyse deiner Aufnahme und funktioniert überall.
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
        aria-label="Tonhöhenverlauf der Aufnahme"
      >
        <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke="var(--rule)" strokeWidth="1" />
        {native?.length ? (
          <path d={toPath(native)} fill="none" stroke="var(--ink-faint)" strokeWidth="2" strokeDasharray="4 3" />
        ) : null}
        <path d={toPath(mine)} fill="none" stroke="var(--accent-ring)" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      <figcaption className="mt-1 flex gap-4 text-[10px] text-[var(--ink-faint)]">
        <span className="flex items-center gap-1">
          <span className="inline-block h-[2px] w-4 bg-[var(--accent-ring)]" /> deine Aufnahme
        </span>
        {native?.length ? (
          <span className="flex items-center gap-1">
            <span className="inline-block h-[2px] w-4 border-t-2 border-dashed border-[var(--ink-faint)]" />{" "}
            Originalsprecher
          </span>
        ) : (
          <span>Originalkurve erscheint, sobald der Ingest-Worker sie mitliefert.</span>
        )}
      </figcaption>
    </figure>
  );
}
