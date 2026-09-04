"use client";

import { useEffect, useRef, useState } from "react";
import { useUi } from "@/lib/i18n";
import { CaptionWord, splitLine } from "../CaptionWord";
import type { CaptionMode, CaptionState } from "./useCaptions";

/**
 * The caption reader: a mode switch, a status line, and the text itself.
 *
 * The two modes are not variants of one feature, they are two different
 * bargains. Reading the page's own audio costs a model download and works with
 * headphones on a noisy train; the microphone starts instantly and needs a
 * quiet room with the sound played out loud. Both are offered because neither
 * is right for everyone.
 */
export function CaptionPanel({
  state,
  mode,
  onMode,
  onStart,
  onStop,
  onClear,
  onSeek,
  showTranslation,
  onWord,
  savedWords,
}: {
  state: CaptionState;
  mode: CaptionMode;
  onMode: (mode: CaptionMode) => void;
  onStart: () => void;
  onStop: () => void;
  onClear: () => void;
  onSeek: (seconds: number) => void;
  showTranslation: boolean;
  onWord?: (word: string, sentence: string, anchor: HTMLElement) => void;
  savedWords?: Set<string>;
}) {
  const { t } = useUi();
  const listRef = useRef<HTMLDivElement | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (!state.activeId || !autoScroll) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-line="${state.activeId}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [state.activeId, autoScroll]);

  useEffect(() => {
    if (state.replaying || !autoScroll) return;
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [state.lines.length, state.interim, state.replaying, autoScroll]);

  const loading = state.whisper.state === "loading";
  const percent = Math.round((state.whisper.progress ?? 0) * 100);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-full border border-[var(--rule)]">
          {(["mic", "internal"] as const).map((option) => (
            <button
              key={option}
              type="button"
              data-active={mode === option}
              disabled={state.running || (option === "mic" && state.micSupported === false)}
              onClick={() => onMode(option)}
              className="btn rounded-none border-0 border-r border-[var(--rule)] px-3 py-1 text-[12px] last:border-r-0"
            >
              {option === "internal" ? t("caption.modeInternal") : t("caption.modeMic")}
            </button>
          ))}
        </div>

        <button type="button" className="btn btn-primary" onClick={() => (state.running ? onStop() : onStart())}>
          {state.running ? t("listen.stopCaption") : t("listen.liveCaption")}
        </button>

        {state.running || loading ? (
          loading ? (
            <span className="text-[11px] text-[var(--ink-faint)]">
              {t("caption.loadingModel")} {percent > 0 ? `${percent}%` : ""}
            </span>
          ) : state.replaying ? (
            <span className="text-[11px] text-[var(--ink-faint)]">{t("caption.replaying")}</span>
          ) : (
            <span className="flex items-center gap-1.5 text-[11px] text-[var(--accent)]">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[var(--accent-ring)]" />
              {t("caption.listening")}
            </span>
          )
        ) : null}

        {state.whisper.device ? (
          <span className="chip text-[10px]" title={state.whisper.model}>
            {state.whisper.device === "webgpu" ? "WebGPU" : "WASM"}
          </span>
        ) : mode === "internal" && !state.webGpu && state.running ? (
          // Worth saying up front rather than leaving someone to wonder why it
          // is slow: without a GPU the model runs on the CPU and lags.
          <span className="chip text-[10px]">{t("caption.noWebGpu")}</span>
        ) : null}

        {state.route ? (
          <span className="chip text-[10px]">
            {state.route === "direct" ? t("caption.routeDirect") : t("caption.routeProxy")}
          </span>
        ) : null}

        {state.firstResultMs !== null ? (
          <span className="text-[11px] text-[var(--ink-faint)]">
            {(state.firstResultMs / 1000).toFixed(1)}s {t("caption.toFirstLine")}
          </span>
        ) : null}

        {state.covered > 0 ? (
          <span className="text-[11px] text-[var(--ink-faint)]">
            {Math.round(state.covered)}s {t("caption.captured")}
          </span>
        ) : null}

        {state.lines.length > 0 ? (
          <button
            type="button"
            className="ml-auto text-[11px] text-[var(--ink-faint)] hover:text-[var(--ink)]"
            onClick={onClear}
          >
            {t("caption.clear")}
          </button>
        ) : null}
      </div>

      <p className="mt-2 text-[12px] leading-relaxed text-[var(--ink-faint)]">
        {mode === "internal" ? t("caption.internalHint") : t("caption.micHint")}
        {onWord ? ` ${t("caption.saveWord")} ${t("caption.selectHint")}` : ""}
      </p>

      {state.error ? <p className="mt-2 text-[12.5px] text-rose-600">{state.error}</p> : null}

      {state.lines.length > 0 || state.interim ? (
        <div
          ref={listRef}
          onWheel={() => setAutoScroll(false)}
          className="surface mt-3 max-h-[300px] overflow-y-auto p-3"
        >
          {!autoScroll ? (
            <button type="button" className="btn mb-2 px-2 py-0.5 text-[11px]" onClick={() => setAutoScroll(true)}>
              {t("caption.follow")}
            </button>
          ) : null}

          {state.lines.map((line) => (
            <p
              key={line.id}
              data-line={line.id}
              data-active={line.id === state.activeId}
              className="segment mb-2.5 rounded-md px-1 py-0.5 last:mb-0"
            >
              <button
                type="button"
                onClick={() => onSeek(Math.max(0, line.at))}
                className="mr-2 align-top font-mono text-[10px] text-[var(--ink-faint)] hover:text-[var(--accent)]"
                title={t("caption.playFromHere")}
              >
                {Math.floor(line.at / 60)}:{String(Math.floor(line.at % 60)).padStart(2, "0")}
              </button>
              <span className="caption-line">
                {onWord
                  ? splitLine(line.de).map((piece, index) =>
                      /^\s+$/.test(piece) ? (
                        <span key={index}>{piece}</span>
                      ) : (
                        <CaptionWord
                          key={index}
                          word={piece}
                          saved={Boolean(savedWords?.has(piece.replace(/[^\p{L}]/gu, "").toLowerCase()))}
                          onSelect={(word, anchor) => {
                            const selected = window.getSelection()?.toString().trim() ?? "";
                            onWord(selected.length > word.length ? selected : word, line.de, anchor);
                          }}
                        />
                      ),
                    )
                  : line.de}
              </span>
              {showTranslation && line.translation ? (
                // Smaller and dimmer than the German on purpose: the original
                // holds the eye, the translation is there as a check.
                <span className="mt-0.5 block pl-[38px] text-[13px] leading-snug text-[var(--ink-faint)]">
                  {line.translation}
                </span>
              ) : null}
            </p>
          ))}

          {state.interim && !state.replaying ? (
            <p className="caption-line pl-[38px] text-[var(--ink-faint)]">{state.interim}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
