import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Hörbar - German shadowing for people with jobs",
    template: "%s - Hörbar",
  },
  description:
    "A CEFR-graded catalog of German podcasts and video, with side-by-side transcripts, a click-to-look-up dictionary, shadowing drills and a spaced-repetition vocabulary vault.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbf9f4" },
    { media: "(prefers-color-scheme: dark)", color: "#14161a" },
  ],
};

const NAV = [
  { href: "/", label: "Katalog" },
  { href: "/listen", label: "Direkt hören" },
  { href: "/drills", label: "Drills" },
  { href: "/vault", label: "Vokabeln" },
  { href: "/about", label: "Wie es funktioniert" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className="min-h-screen antialiased">
        <header className="sticky top-0 z-40 border-b border-[var(--rule)] bg-[color-mix(in_oklab,var(--paper)_88%,transparent)] backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-1 px-5 py-2.5 sm:py-3">
            <Link href="/" className="mr-auto flex items-baseline gap-2">
              <span
                className="text-[19px] font-semibold tracking-tight"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Hörbar
              </span>
              <span className="hidden text-[11px] uppercase tracking-[0.16em] text-[var(--ink-faint)] sm:inline">
                Deutsch hören, nachsprechen, behalten
              </span>
            </Link>
            <nav className="-mx-1 flex w-full items-center gap-1 overflow-x-auto px-1 text-[13px] [scrollbar-width:none] sm:w-auto">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="shrink-0 rounded-lg px-2.5 py-1.5 text-[var(--ink-soft)] transition-colors hover:bg-[var(--accent-soft)] hover:text-[var(--ink)] sm:px-3"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-5 py-8">{children}</main>

        <footer className="mt-16 border-t border-[var(--rule)]">
          <div className="mx-auto max-w-6xl px-5 py-8 text-[12px] leading-relaxed text-[var(--ink-faint)]">
            <p>
              Hörbar streams nothing itself. Video and audio come from YouTube and public podcast
              CDNs; this app only holds the transcript payload and keeps it in sync.
            </p>
            <p className="mt-1">
              Your vocabulary vault lives in this browser. Export it to Anki or CSV any time from the
              Vokabeln page.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
