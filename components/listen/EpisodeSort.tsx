"use client";

import { useUi, type UiKey } from "@/lib/i18n";
import { SORT_KEYS, type SortKey } from "@/lib/episodeSort";

const LABELS: Record<SortKey, UiKey> = {
  newest: "sort.newest",
  oldest: "sort.oldest",
  longest: "sort.longest",
  shortest: "sort.shortest",
  unplayed: "sort.unplayed",
};

export function EpisodeSort({
  value,
  onChange,
}: {
  value: SortKey;
  onChange: (next: SortKey) => void;
}) {
  const { t } = useUi();
  return (
    <label className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-[var(--ink-faint)]">
      <span>{t("sort.label")}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as SortKey)}
        aria-label={t("sort.label")}
        className="btn cursor-pointer py-1 pl-2.5 pr-2 text-[12.5px] normal-case tracking-normal"
      >
        {SORT_KEYS.map((key) => (
          <option key={key} value={key}>
            {t(LABELS[key])}
          </option>
        ))}
      </select>
    </label>
  );
}
