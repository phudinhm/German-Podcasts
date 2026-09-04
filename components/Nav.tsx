"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUi, type UiKey } from "@/lib/i18n";
import { SettingsMenu } from "./SettingsMenu";
import { Logo } from "./Logo";

/**
 * `short` is the label used below the sm breakpoint. At 390px the full set plus
 * the wordmark and the language button came to more than the screen, and the
 * nav simply sat on top of "Hörbar".
 */
/**
 * `short` is the label used below the sm breakpoint.
 *
 * `wideOnly` items are dropped from the header on a phone and offered in the
 * settings menu instead. Only "How it works" qualifies: it is read once, where
 * Listen and Library are the whole app. Keeping all three cut the last one in
 * half at 360px in every language, and a sliced nav item reads as a bug rather
 * than as something you can scroll to.
 */
const ITEMS: Array<{ href: string; key: UiKey; short?: UiKey; wideOnly?: boolean }> = [
  { href: "/", key: "nav.listen", short: "nav.listenShort" },
  { href: "/library", key: "nav.library" },
  { href: "/about", key: "nav.about", wideOnly: true },
];

export function Nav() {
  const { t } = useUi();
  const pathname = usePathname();

  return (
    // One row at every width. The wordmark shrinks and the tagline goes rather
    // than the nav wrapping to a second line, which cost forty pixels of every
    // phone screen for no information at all.
    <div className="mx-auto flex max-w-6xl items-center gap-x-3 px-4 py-2 sm:gap-x-5 sm:px-5">
      <Link href="/" className="mr-auto flex shrink-0 items-center gap-2">
        <Logo size={26} />
        {/* Below 360px the mark carries the brand on its own: at that width the
            word and the nav cannot both fit, and a clipped nav item reads as a
            bug where a bare mark reads as a logo. */}
        <span className="hidden text-[18px] font-semibold tracking-[-0.03em] min-[360px]:inline sm:text-[20px]">
          Hörbar
        </span>
        <span className="hidden truncate text-[12px] text-[var(--ink-faint)] lg:inline">
          {t("nav.tagline")}
        </span>
      </Link>

      {/*
        The links scroll rather than push the page wide. Short labels keep them
        on one screen in English, but "Direkt hören" and "Wie es funktioniert"
        are half again as long, and no amount of padding tuning survives a
        translation. Settings sits outside the scroller so it stays reachable
        whatever the labels do.
      */}
      <nav className="flex min-w-0 items-center gap-0.5 overflow-x-auto text-[13.5px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:gap-1 sm:text-[14px]">
        {ITEMS.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`shrink-0 rounded-full px-2.5 py-1.5 transition-colors sm:px-3 ${
                item.wideOnly ? "hidden sm:inline-flex " : ""
              }${
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
      </nav>

      <span className="shrink-0">
        <SettingsMenu />
      </span>
    </div>
  );
}
