"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Episode, Segment, TargetLang } from "@/lib/types";
import type { RenderedWord } from "@/lib/german/render";
import { useYouTube } from "./player/useYouTube";
import { useAudio } from "./player/useAudio";
import { useTimeline } from "./player/useTimeline";
import { useShadowEngine, type ShadowMode } from "./player/useShadowEngine";
import { NOOP_PLAYER } from "./player/types";
import { Transcript } from "./Transcript";
import { WordPopover, type WordSelection } from "./WordPopover";
import { ShadowControls, type ControlValues } from "./ShadowControls";
import { ShadowRecorder } from "./ShadowRecorder";
import { BreakdownPanel } from "./BreakdownPanel";
import { Quiz } from "./Quiz";
import { LevelBadge } from "./LevelBadge";
import { ShadowingBadge } from "./ShadowingBadge";
import { loadSettings, loadVault, saveSettings } from "@/lib/vault";

interface Props {
  episode: Episode;
  /** Deep-link target from ?t= */
  initialTime?: number;
  /** Segment to open in a practice loop, from ?seg= */
  initialSegmentId?: string;
  /** Practice mode to start in, from ?mode= */
  initialMode?: ShadowMode;
}

export function WatchClient({ episode, initialTime = 0, initialSegmentId, initialMode }: Props) {
  const source = episode.source;
  const youtubeId = source.kind === "youtube" ? source.youtubeId : null;
  const audioUrl = source.kind === "audio" ? source.audioUrl : null;

  const youtube = useYouTube(youtubeId);
  const audio = useAudio(audioUrl);
  const timeline = useTimeline(episode.durationSec);

  const handle = useMemo(() => {
    if (source.kind === "youtube") return youtube.handle;
    if (source.kind === "audio") return audio.handle;
    if (source.kind === "timeline") return timeline.handle;
    return NOOP_PLAYER;
  }, [source.kind, youtube.handle, audio.handle, timeline.handle]);

  const [values, setValues] = useState<ControlValues>({
    mode: initialMode ?? "free",
    loopCount: 3,
    echoGapFactor: 1.2,
    tempoRamp: [0.75, 0.85, 1, 1.1],
    baseRate: 1,
    autoAdvance: false,
    showDual: true,
    showHazards: true,
    karaoke: true,
    lang: "en",
  });

  // Restore the learner's own preferences on mount, then keep them in sync.
  useEffect(() => {
    const stored = loadSettings();
    setValues((prev) => ({
      ...prev,
      lang: stored.targetLang,
      showDual: stored.showDual,
      baseRate: stored.playbackRate,
      echoGapFactor: stored.echoGapFactor,
      loopCount: stored.loopCount,
      tempoRamp: stored.tempoRamp,
      showHazards: stored.hazardsEnabled,
      karaoke: stored.karaoke,
      mode: initialMode ?? (stored.echoEnabled ? "echo" : "free"),
    }));
  }, [initialMode]);

  const engine = useShadowEngine(handle, episode.transcript, {
    mode: values.mode,
    loopCount: values.loopCount,
    echoGapFactor: values.echoGapFactor,
    tempoRamp: values.tempoRamp,
    baseRate: values.baseRate,
    autoAdvance: values.autoAdvance,
  });

  const [focusIndex, setFocusIndex] = useState(-1);
  const [selection, setSelection] = useState<WordSelection | null>(null);
  const [breakdown, setBreakdown] = useState<Segment | null>(null);
  const [savedLemmas, setSavedLemmas] = useState<Set<string>>(new Set());
  const [seeded, setSeeded] = useState(false);
  const recordToggleRef = useRef<(() => void) | null>(null);

  const refreshSaved = useCallback(() => {
    const entries = loadVault().filter((entry) => entry.context.episodeSlug === episode.slug);
    const set = new Set<string>();
    for (const entry of entries) {
      set.add(entry.surface.toLowerCase());
      set.add(entry.lemma.toLowerCase());
    }
    setSavedLemmas(set);
  }, [episode.slug]);

  useEffect(() => {
    refreshSaved();
    window.addEventListener("hoerbar:vault-changed", refreshSaved);
    return () => window.removeEventListener("hoerbar:vault-changed", refreshSaved);
  }, [refreshSaved]);

  useEffect(() => {
    saveSettings({
      targetLang: values.lang,
      showDual: values.showDual,
      playbackRate: values.baseRate,
      echoEnabled: values.mode === "echo",
      echoGapFactor: values.echoGapFactor,
      loopCount: values.loopCount,
      tempoRamp: values.tempoRamp,
      hazardsEnabled: values.showHazards,
      karaoke: values.karaoke,
    });
  }, [values]);

  // Honour ?seg= and ?t= once the player reports ready. ?seg= wins, because a
  // drill link means "practise this sentence", not "jump near it".
  useEffect(() => {
    if (seeded) return;
    if (!handle.isReady()) return;
    if (initialSegmentId) {
      const index = episode.transcript.findIndex((segment) => segment.id === initialSegmentId);
      if (index >= 0) {
        engine.focusSegment(index, false);
        setFocusIndex(index);
        setSeeded(true);
        return;
      }
    }
    if (initialTime > 0) {
      handle.seekTo(initialTime, true);
      setSeeded(true);
    }
  }, [engine, episode.transcript, handle, initialSegmentId, initialTime, seeded]);

  useEffect(() => {
    if (values.mode === "free") handle.setRate(values.baseRate);
  }, [handle, values.mode, values.baseRate]);

  const seekToSegment = useCallback(
    (index: number) => {
      const segment = episode.transcript[index];
      if (!segment) return;
      if (values.mode === "free") {
        handle.seekTo(segment.start, true);
        handle.play();
        setFocusIndex(-1);
      } else {
        engine.focusSegment(index);
        setFocusIndex(index);
      }
    },
    [episode.transcript, engine, handle, values.mode],
  );

  const loopSegment = useCallback(
    (index: number) => {
      if (focusIndex === index && values.mode !== "free") {
        engine.clearFocus();
        setFocusIndex(-1);
        handle.pause();
        return;
      }
      setValues((prev) => (prev.mode === "free" ? { ...prev, mode: "loop" } : prev));
      engine.focusSegment(index);
      setFocusIndex(index);
    },
    [engine, focusIndex, handle, values.mode],
  );

  const onWord = useCallback(
    (token: string, rendered: RenderedWord, anchor: HTMLElement, segment: Segment) => {
      const rect = anchor.getBoundingClientRect();
      setSelection({
        token,
        rendered,
        segment,
        anchor: {
          top: rect.top + window.scrollY,
          left: rect.left + window.scrollX,
          width: rect.width,
          height: rect.height,
        },
      });
    },
    [],
  );

  const step = useCallback(
    (delta: number) => {
      const current = focusIndex >= 0 ? focusIndex : engine.state.activeIndex;
      const next = Math.max(0, Math.min(episode.transcript.length - 1, current + delta));
      seekToSegment(next);
    },
    [engine.state.activeIndex, episode.transcript.length, focusIndex, seekToSegment],
  );

  const playPause = useCallback(() => {
    if (handle.isPlaying()) handle.pause();
    else handle.play();
  }, [handle]);

  // Keyboard-only operation. Shadowing means both hands are busy holding a
  // coffee or a steering wheel metaphor; reaching for a trackpad breaks the loop.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      switch (event.key) {
        case " ":
          event.preventDefault();
          playPause();
          break;
        case "[":
          event.preventDefault();
          step(-1);
          break;
        case "]":
          event.preventDefault();
          step(1);
          break;
        case "s":
        case "S":
          setValues((prev) => ({ ...prev, showDual: !prev.showDual }));
          break;
        case "l":
        case "L":
          setValues((prev) => ({ ...prev, mode: prev.mode === "loop" ? "free" : ("loop" as ShadowMode) }));
          break;
        case "e":
        case "E":
          setValues((prev) => ({ ...prev, mode: prev.mode === "echo" ? "free" : ("echo" as ShadowMode) }));
          break;
        case "r":
        case "R":
          event.preventDefault();
          recordToggleRef.current?.();
          break;
        case "1":
          setValues((prev) => ({ ...prev, baseRate: 0.75 }));
          break;
        case "2":
          setValues((prev) => ({ ...prev, baseRate: 0.9 }));
          break;
        case "3":
          setValues((prev) => ({ ...prev, baseRate: 1 }));
          break;
        case "4":
          setValues((prev) => ({ ...prev, baseRate: 1.25 }));
          break;
        default:
          break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playPause, step]);

  const registerToggle = useCallback((toggle: () => void) => {
    recordToggleRef.current = toggle;
  }, []);

  const drillIds = useMemo(() => new Set(episode.drillSegmentIds), [episode.drillSegmentIds]);
  const focusedSegment = focusIndex >= 0 ? episode.transcript[focusIndex] : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0">
        <EpisodeHeader episode={episode} />

        <div className="mb-4">
          {source.kind === "youtube" ? (
            <div
              ref={youtube.containerRef}
              className="aspect-video w-full overflow-hidden rounded-xl border border-[var(--rule)] bg-black [&_iframe]:h-full [&_iframe]:w-full"
            />
          ) : null}
          {source.kind === "audio" ? (
            <audio ref={audio.audioRef} src={audioUrl ?? undefined} controls className="w-full" preload="metadata" />
          ) : null}
          {source.kind === "timeline" ? (
            <TimelineNotice progressRef={engine.progressRef} />
          ) : null}
          {source.kind === "pending" ? <PendingNotice episode={episode} /> : null}
        </div>

        {episode.transcript.length > 0 ? (
          <>
            <div className="mb-4">
              <ShadowControls
                values={values}
                state={engine.state}
                onChange={(patch) => setValues((prev) => ({ ...prev, ...patch }))}
                onPlayPause={playPause}
                onStep={step}
              />
            </div>

            <div className="mb-4">
              <ShadowRecorder segment={focusedSegment} onRegisterToggle={registerToggle} />
            </div>

            <div className="card overflow-hidden">
              <Transcript
                segments={episode.transcript}
                activeIndex={engine.state.activeIndex}
                activeWordIndex={engine.state.activeWordIndex}
                focusIndex={focusIndex}
                lang={values.lang}
                showDual={values.showDual}
                showHazards={values.showHazards}
                karaoke={values.karaoke}
                savedLemmas={savedLemmas}
                drillIds={drillIds}
                onSeek={seekToSegment}
                onWord={onWord}
                onBreakdown={setBreakdown}
                onLoop={loopSegment}
              />
            </div>

            <section className="card mt-6 p-5">
              <Quiz
                slug={episode.slug}
                onSeek={(seconds) => {
                  handle.seekTo(seconds, true);
                  handle.play();
                }}
              />
            </section>
          </>
        ) : null}
      </div>

      <aside className="space-y-4 lg:sticky lg:top-[68px] lg:self-start">
        {breakdown ? <BreakdownPanel segment={breakdown} onClose={() => setBreakdown(null)} /> : null}
        <MetricsPanel episode={episode} />
        <HazardLegend />
      </aside>

      {selection ? (
        <WordPopover
          selection={selection}
          lang={values.lang}
          episode={{ slug: episode.slug, title: episode.title, cefr: episode.cefr }}
          onClose={() => setSelection(null)}
          onSaved={refreshSaved}
        />
      ) : null}
    </div>
  );
}

function EpisodeHeader({ episode }: { episode: Episode }) {
  return (
    <header className="mb-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <LevelBadge level={episode.cefr} />
        <span className="text-[12px] text-[var(--ink-faint)]">{episode.publisher}</span>
        <ShadowingBadge sdm={episode.metrics.sdm} />
        {episode.transcriptStatus === "demo" ? (
          <span className="chip border-dashed">Demo-Transkript</span>
        ) : null}
      </div>
      <h1 className="text-[24px] font-semibold leading-tight sm:text-[28px]" style={{ fontFamily: "var(--font-display)" }}>
        {episode.title}
      </h1>
      <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-[var(--ink-soft)]">
        {episode.description}
      </p>
    </header>
  );
}

function TimelineNotice({ progressRef }: { progressRef: React.RefObject<HTMLElement | null> }) {
  return (
    <div className="card p-4">
      <p className="text-[13px] leading-relaxed text-[var(--ink-soft)]">
        Diese Folge läuft auf der Transkript-Zeitachse, ohne Ton. Alles andere funktioniert schon:
        Satz-Synchronisierung, Wort-Teleprompter, Schleifen, Echo-Pausen, Wörterbuch und Vokabelheft.
        Sobald der Ingest-Worker eine Aufnahme anhängt, spielt genau dieselbe Ansicht das echte Audio.
      </p>
      <div
        ref={progressRef as React.RefObject<HTMLDivElement>}
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--rule)]"
      >
        <div
          className="h-full rounded-full bg-[var(--accent-ring)]"
          style={{ width: "calc(var(--progress, 0) * 100%)" }}
        />
      </div>
    </div>
  );
}

function PendingNotice({ episode }: { episode: Episode }) {
  const hint = episode.source.kind === "pending" ? episode.source.ingestHint : undefined;
  const pageUrl = episode.source.kind === "pending" ? episode.source.pageUrl : undefined;
  return (
    <div className="card p-5">
      <h2 className="text-[14px] font-semibold">Kuratiert, aber noch nicht eingelesen</h2>
      <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--ink-soft)]">
        Diese Sendung steht mit einer redaktionellen Niveau-Einstufung im Katalog. Transkript, Wort-Timing
        und Übersetzungen entstehen im Ingest-Worker; danach erscheint hier derselbe Player wie bei den
        fertigen Folgen.
      </p>
      {hint ? (
        <pre className="mt-3 overflow-x-auto rounded-lg border border-[var(--rule)] bg-[var(--paper)] p-2.5 font-mono text-[11px] text-[var(--ink-soft)]">
          {hint}
        </pre>
      ) : null}
      <div className="mt-3 flex gap-2">
        {pageUrl ? (
          <a href={pageUrl} target="_blank" rel="noreferrer noopener" className="btn">
            Zur Sendung
          </a>
        ) : null}
        <Link href="/about" className="btn">
          Wie der Ingest läuft
        </Link>
      </div>
    </div>
  );
}

function MetricsPanel({ episode }: { episode: Episode }) {
  const rows: Array<[string, string]> = [
    ["Silben pro Sekunde", episode.metrics.syllablesPerSecond ? episode.metrics.syllablesPerSecond.toFixed(2) : "-"],
    ["Lexikalische Vielfalt", episode.metrics.lexicalDiversity ? episode.metrics.lexicalDiversity.toFixed(2) : "-"],
    ["Phonetische Last", episode.metrics.phoneticComplexity ? episode.metrics.phoneticComplexity.toFixed(2) : "-"],
    ["Wortschatz A1-B1", episode.metrics.goetheCoverage.B1 ? `${Math.round(episode.metrics.goetheCoverage.B1 * 100)}%` : "-"],
    ["außerhalb der Listen", episode.metrics.outOfListRatio ? `${Math.round(episode.metrics.outOfListRatio * 100)}%` : "-"],
  ];
  return (
    <section className="card p-4">
      <h3 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-faint)]">
        Messwerte
      </h3>
      <dl className="mt-2.5 space-y-1.5">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-3 text-[12.5px]">
            <dt className="text-[var(--ink-soft)]">{label}</dt>
            <dd className="font-mono text-[12px]">{value}</dd>
          </div>
        ))}
      </dl>
      {episode.cefrNote ? (
        <p className="mt-3 border-t border-[var(--rule)] pt-2 text-[11.5px] leading-relaxed text-[var(--ink-faint)]">
          {episode.cefrNote}
        </p>
      ) : null}
      <p className="mt-2 text-[11px] text-[var(--ink-faint)]">{episode.license}</p>
    </section>
  );
}

function HazardLegend() {
  return (
    <section className="card p-4">
      <h3 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-faint)]">
        Aussprache-Markierungen
      </h3>
      <ul className="mt-2.5 space-y-1.5 text-[12px] leading-snug text-[var(--ink-soft)]">
        <li>
          <span className="hz hz-ich px-1">ch</span> Ich-Laut [ç]: vorne, weich, nach hellen Vokalen.
        </li>
        <li>
          <span className="hz hz-ach px-1">ch</span> Ach-Laut [x]: hinten im Rachen, nach a, o, u, au.
        </li>
        <li>
          <span className="hz hz-devoice px-1">d</span> Auslautverhärtung: b, d, g werden am Ende zu p, t, k.
        </li>
        <li>
          <span className="hz hz-cluster px-1">rbst</span> Konsonantencluster: Zunge vorher in Position bringen.
        </li>
        <li>
          <span className="hz hz-onset px-1">st</span> st- und sp- am Wortanfang klingen wie scht-, schp-.
        </li>
        <li>
          <span className="hz hz-r px-1">er</span> Endungs-r wird zum dunklen Vokal [ɐ].
        </li>
      </ul>
    </section>
  );
}
