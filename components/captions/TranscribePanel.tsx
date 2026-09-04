"use client";

import { useUi } from "@/lib/i18n";
import type { TranscribeState } from "./useEpisodeTranscript";

/**
 * The offer to read a whole episode before you listen to it.
 *
 * Deliberately separate from live captions, because it answers a different
 * question. Live captions tell you what was just said; this gives you the
 * whole text with timings, so you can read ahead, click into any sentence, and
 * take it away as a subtitle file.
 */
export function TranscribePanel({
  state,
  onRun,
  onCancel,
  disabled,
}: {
  state: TranscribeState;
  onRun: () => void;
  onCancel: () => void;
  disabled?: boolean;
}) {
  const { t } = useUi();
  const percent = Math.round(state.progress * 100);
  const modelPercent = Math.round((state.whisper.progress ?? 0) * 100);

  return (
    <div className="surface mt-3 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn btn-primary"
          disabled={disabled || state.running}
          onClick={onRun}
        >
          {state.stage === "done" ? t("transcribe.again") : t("transcribe.start")}
        </button>

        {state.running ? (
          <>
            <button type="button" className="btn px-2.5 py-1 text-[12px]" onClick={onCancel}>
              {t("common.cancel")}
            </button>
            <span className="text-[11.5px] text-[var(--ink-faint)]">
              {state.whisper.state === "loading"
                ? `${t("caption.loadingModel")} ${modelPercent > 0 ? `${modelPercent}%` : ""}`
                : state.stage === "fetching"
                  ? t("transcribe.fetching")
                  : state.stage === "decoding"
                    ? t("transcribe.decoding")
                    : `${t("transcribe.reading")} ${percent}%`}
            </span>
          </>
        ) : null}

        {state.whisper.device ? (
          <span className="chip text-[10px]" title={state.whisper.model}>
            {state.whisper.device === "webgpu" ? "WebGPU" : "WASM"}
          </span>
        ) : null}

        {state.stage === "done" && state.tookMs ? (
          <span className="text-[11.5px] text-[var(--ink-faint)]">
            {t("transcribe.done", { count: state.lines.length })} ·{" "}
            {Math.round(state.tookMs / 1000)}s
          </span>
        ) : null}
      </div>

      {state.running && state.stage === "reading" ? (
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-[var(--rule)]">
          <div
            className="h-full rounded-full bg-[var(--accent-ring)] transition-[width] duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>
      ) : null}

      <p className="mt-2 text-[12px] leading-relaxed text-[var(--ink-faint)]">
        {t("transcribe.hint")}
      </p>

      {state.error ? <p className="mt-2 text-[12.5px] text-rose-600">{state.error}</p> : null}
    </div>
  );
}
