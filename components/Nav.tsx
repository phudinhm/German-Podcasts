"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUi, type UiKey } from "@/lib/i18n";
import { UiLangSwitch } from "./UiLangProvider";

const ITEMS: Array<{ href: string; key: UiKey }> = [
  { href: "/", key: "nav.listen" },
  { href: "/library", key: "nav.library" },
  { href: "/about", key: "nav.about" },
];

export function Nav() {
  const { t } = useUi();
  const pathname = usePathname();

  return (
    <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-1 px-4 py-2 sm:px-5">
      <Link href="/" className="mr-auto flex items-baseline gap-2">
        <span className="text-[20px] font-semibold tracking-[-0.03em]">Hörbar</span>
        <span className="hidden text-[12px] text-[var(--ink-faint)] sm:inline">
          {t("nav.tagline")}
        </span>
      </Link>

      <nav className="-mx-1 flex w-full items-center gap-1 overflow-x-auto px-1 text-[14px] [scrollbar-width:none] sm:w-auto">
        {ITEMS.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`shrink-0 rounded-full px-3 py-1.5 transition-colors ${
                active
                  ? "bg-[var(--surface)] font-medium text-[var(--ink)]"
                  : "text-[var(--ink-soft)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
              }`}
            >
              {t(item.key)}
            </Link>
          );
        })}
        <span className="ml-1 shrink-0">
          <UiLangSwitch />
        </span>
      </nav>
    </div>
  );
}
