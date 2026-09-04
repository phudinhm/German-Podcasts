"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUi, type UiKey } from "@/lib/i18n";
import { UiLangSwitch } from "./UiLangProvider";

/**
 * `short` is the label used below the sm breakpoint. At 390px the full set plus
 * the wordmark and the language button came to more than the screen, and the
 * nav simply sat on top of "Hörbar".
 */
const ITEMS: Array<{ href: string; key: UiKey; short?: UiKey }> = [
  { href: "/", key: "nav.listen" },
  { href: "/library", key: "nav.library" },
  { href: "/about", key: "nav.about", short: "nav.aboutShort" },
];

export function Nav() {
  const { t } = useUi();
  const pathname = usePathname();

  return (
    // One row at every width. The wordmark shrinks and the tagline goes rather
    // than the nav wrapping to a second line, which cost forty pixels of every
    // phone screen for no information at all.
    <div className="mx-auto flex max-w-6xl items-center gap-x-3 px-4 py-2 sm:gap-x-5 sm:px-5">
      <Link href="/" className="mr-auto flex shrink-0 items-baseline gap-2">
        <span className="text-[18px] font-semibold tracking-[-0.03em] sm:text-[20px]">Hörbar</span>
        <span className="hidden truncate text-[12px] text-[var(--ink-faint)] lg:inline">
          {t("nav.tagline")}
        </span>
      </Link>

      <nav className="-mx-1 flex shrink-0 items-center gap-0.5 px-1 text-[13.5px] sm:gap-1 sm:text-[14px]">
        {ITEMS.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`shrink-0 rounded-full px-2.5 py-1.5 transition-colors sm:px-3 ${
                active
                  ? "bg-[var(--surface)] font-medium text-[var(--ink)]"
                  : "text-[var(--ink-soft)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
              }`}
            >
              {item.short ? (
                <>
                  <span className="sm:hidden">{t(item.short)}</span>
                  <span className="hidden sm:inline">{t(item.key)}</span>
                </>
              ) : (
                t(item.key)
              )}
            </Link>
          );
        })}
        <span className="ml-0.5 shrink-0 sm:ml-1">
          <UiLangSwitch />
        </span>
      </nav>
    </div>
  );
}
