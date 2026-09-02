import type { Cefr } from "@/lib/types";

const TONE: Record<Cefr, string> = {
  A1: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  A2: "bg-teal-500/12 text-teal-700 dark:text-teal-400 border-teal-500/30",
  B1: "bg-sky-500/12 text-sky-700 dark:text-sky-400 border-sky-500/30",
  B2: "bg-indigo-500/12 text-indigo-700 dark:text-indigo-400 border-indigo-500/30",
  C1: "bg-violet-500/12 text-violet-700 dark:text-violet-400 border-violet-500/30",
  C2: "bg-rose-500/12 text-rose-700 dark:text-rose-400 border-rose-500/30",
};

export function LevelBadge({ level, className = "" }: { level: Cefr; className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-semibold tracking-wide ${TONE[level]} ${className}`}
    >
      {level}
    </span>
  );
}
