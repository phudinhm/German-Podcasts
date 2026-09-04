"use client";

import { useUi } from "@/lib/i18n";
import { Logo } from "./Logo";

export function Footer() {
  const { t } = useUi();
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 text-[12px] leading-relaxed text-[var(--ink-faint)] sm:px-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-6">
        <span className="flex shrink-0 items-center gap-2 text-[var(--ink-soft)]">
          <Logo size={20} />
          <span className="font-medium">{t("footer.builtBy")}</span>
        </span>
        <p className="max-w-xl">{t("footer.media")}</p>
      </div>
    </div>
  );
}
