"use client";

import type { ShadowMode, ShadowState } from "./player/useShadowEngine";
import type { TargetLang } from "@/lib/types";

export interface ControlValues {
  mode: ShadowMode;
  loopCount: number;
  echoGapFactor: number;
  tempoRamp: number[];
  baseRate: number;
  autoAdvance: boolean;
  showDual: boolean;
  showHazards: boolean;
  karaoke: boolean;
  lang: TargetLang;
}

interface Props {
  values: ControlValues;
  state: ShadowState;
  onChange: (patch: Partial<ControlValues>) => void;
  onPlayPause: () => void;
  onStep: (delta: number) => void;
}

const RAMPS: Array<{ label: string; value: number[] }> = [
  { label: "konstant", value: [1] },
  { label: "0,75 → 1,0", value: [0.75, 0.85, 1] },
  { label: "0,75 → 1,1", value: [0.75, 0.85, 1, 1.1] },
  { label: "0,9 → 1,25", value: [0.9, 1, 1.15, 1.25] },
];

export function ShadowControls({ values, state, onChange, onPlayPause, onStep }: Props) {
  return (
    <div className="card p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-primary w-[92px]" onClick={onPlayPause}>
          {state.playing ? "Pause" : "Abspielen"}
        </button>
        <button type="button" className="btn px-2.5" onClick={() => onStep(-1)} title="Vorheriger Satz">
          ←
        </button>
        <button type="button" className="btn px-2.5" onClick={() => onStep(1)} title="Nächster Satz">
          →
        </button>

        <div className="ml-1 flex overflow-hidden rounded-lg border border-[var(--rule)]">
          {(["free", "loop", "echo"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => onChange({ mode })}
              data-active={values.mode === mode}
              className="btn rounded-none border-0 border-r border-[var(--rule)] px-3 py-1.5 text-[12px] last:border-r-0"
            >
              {mode === "free" ? "durchlaufen" : mode === "loop" ? "A-B-Schleife" : "Echo"}
            </button>
          ))}
        </div>

        <StatusPill state={state} mode={values.mode} />
      </div>

      <div className="mt-3 grid gap-3 border-t border-[var(--rule)] pt-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Wiederholungen">
          <div className="flex gap-1">
            {[2, 3, 5, 0].map((count) => (
              <button
                key={count}
                type="button"
                className="btn flex-1 px-0 py-1 text-[12px]"
                data-active={values.loopCount === count}
                onClick={() => onChange({ loopCount: count })}
              >
                {count === 0 ? "∞" : `${count}×`}
              </button>
            ))}
          </div>
        </Field>

        <Field label={`Sprechpause ${values.echoGapFactor.toFixed(1)}×`}>
          <input
            type="range"
            min={0.6}
            max={2.5}
            step={0.1}
            value={values.echoGapFactor}
            onChange={(event) => onChange({ echoGapFactor: Number(event.target.value) })}
            className="w-full"
            disabled={values.mode !== "echo"}
          />
        </Field>

        <Field label="Tempo-Rampe">
          <select
            className="btn w-full py-1 text-[12px]"
            value={JSON.stringify(values.tempoRamp)}
            onChange={(event) => onChange({ tempoRamp: JSON.parse(event.target.value) as number[] })}
            disabled={values.mode === "free"}
          >
            {RAMPS.map((ramp) => (
              <option key={ramp.label} value={JSON.stringify(ramp.value)}>
                {ramp.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label={`Grundtempo ${values.baseRate.toFixed(2)}×`}>
          <input
            type="range"
            min={0.5}
            max={1.5}
            step={0.05}
            value={values.baseRate}
            onChange={(event) => onChange({ baseRate: Number(event.target.value) })}
            className="w-full"
          />
        </Field>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--rule)] pt-3 text-[12px]">
        <Toggle
          checked={values.showDual}
          onChange={(showDual) => onChange({ showDual })}
          label="Übersetzung zeigen"
        />
        <div className="flex overflow-hidden rounded-lg border border-[var(--rule)]">
          {(["en", "vi"] as const).map((lang) => (
            <button
              key={lang}
              type="button"
              data-active={values.lang === lang}
              onClick={() => onChange({ lang })}
              className="btn rounded-none border-0 border-r border-[var(--rule)] px-2.5 py-0.5 text-[11px] last:border-r-0"
            >
              {lang === "en" ? "English" : "Tiếng Việt"}
            </button>
          ))}
        </div>
        <Toggle
          checked={values.karaoke}
          onChange={(karaoke) => onChange({ karaoke })}
          label="Wort-Teleprompter"
        />
        <Toggle
          checked={values.showHazards}
          onChange={(showHazards) => onChange({ showHazards })}
          label="Aussprache-Warnungen"
        />
        <Toggle
          checked={values.autoAdvance}
          onChange={(autoAdvance) => onChange({ autoAdvance })}
          label="automatisch weiter"
        />
      </div>

      <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-[var(--rule)] pt-2.5 text-[11px] text-[var(--ink-faint)]">
        <Hotkey keys="Space" label="Play/Pause" />
        <Hotkey keys="[ ]" label="Satz zurück/vor" />
        <Hotkey keys="L" label="Schleife an" />
        <Hotkey keys="E" label="Echo-Modus" />
        <Hotkey keys="S" label="Übersetzung" />
        <Hotkey keys="R" label="Aufnahme" />
        <Hotkey keys="1-4" label="Tempo" />
      </dl>
    </div>
  );
}

function StatusPill({ state, mode }: { state: ShadowState; mode: ShadowMode }) {
  if (mode === "free") {
    return (
      <span className="ml-auto text-[11px] text-[var(--ink-faint)]">
        {state.currentRate.toFixed(2)}× · durchlaufend
      </span>
    );
  }
  if (state.phase === "gap") {
    return (
      <span className="ml-auto flex items-center gap-1.5 text-[11px] font-medium text-[var(--accent)]">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[var(--accent-ring)]" />
        jetzt nachsprechen · {(state.gapRemaining / 1000).toFixed(1)} s
      </span>
    );
  }
  return (
    <span className="ml-auto text-[11px] text-[var(--ink-faint)]">
      Durchgang {state.iteration + 1} · {state.currentRate.toFixed(2)}×
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] uppercase tracking-[0.12em] text-[var(--ink-faint)]">
        {label}
      </span>
      {children}
    </label>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5 text-[var(--ink-soft)]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="accent-[var(--accent-ring)]"
      />
      {label}
    </label>
  );
}

function Hotkey({ keys, label }: { keys: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <kbd>{keys}</kbd>
      {label}
    </span>
  );
}
