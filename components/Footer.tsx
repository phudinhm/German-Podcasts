"use client";

import { useUi } from "@/lib/i18n";

export function Footer() {
  const { t } = useUi();
  return (
    <div className="mx-auto max-w-6xl px-5 py-8 text-[12px] leading-relaxed text-[var(--ink-faint)]">
      <p>{t("footer.media")}</p>
    </div>
  );
}
