import { shadowingBadge } from "@/lib/sdm";

const TONE = {
  easy: "text-emerald-700 dark:text-emerald-400",
  steady: "text-sky-700 dark:text-sky-400",
  brisk: "text-amber-700 dark:text-amber-400",
  punishing: "text-rose-700 dark:text-rose-400",
} as const;

/**
 * Shadowing readiness. The bar is the honest part: two episodes at the same
 * CEFR level can sit twenty points apart on speaking difficulty, and that gap
 * is what decides whether a shadowing session works or just frustrates.
 */
export function ShadowingBadge({
  sdm,
  showLabel = true,
  className = "",
}: {
  sdm: number;
  showLabel?: boolean;
  className?: string;
}) {
  const badge = shadowingBadge(sdm);
  return (
    <span className={`inline-flex items-center gap-2 ${className}`} title={`Shadowing Difficulty Metric ${sdm}/100`}>
      <span aria-hidden className="flex h-3 items-end gap-[2px]">
        {[0, 1, 2, 3].map((index) => (
          <span
            key={index}
            className="w-[3px] rounded-[1px]"
            style={{
              height: `${5 + index * 2.6}px`,
              background:
                sdm >= (index + 1) * 22 ? "currentColor" : "color-mix(in oklab, currentColor 22%, transparent)",
            }}
          />
        ))}
      </span>
      <span className={`text-[11px] font-medium ${TONE[badge.tone]}`}>
        {showLabel ? badge.label : null} {sdm}
      </span>
    </span>
  );
}
