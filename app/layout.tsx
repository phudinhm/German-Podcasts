import type { Metadata, Viewport } from "next";
import "./globals.css";
import { UiLangProvider } from "@/components/UiLangProvider";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { PlayerProvider } from "@/components/player/PlayerProvider";
import { MiniPlayer } from "@/components/player/MiniPlayer";

export const metadata: Metadata = {
  title: {
    default: "Hörbar - podcasts, and where you left off",
    template: "%s - Hörbar",
  },
  description:
    "Find podcasts from Apple Podcasts, Spotify or any RSS feed, follow the shows you like, and pick up every episode where you left it. Your library can sync through your own Google Drive.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f0f0f" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Roboto, the typeface YouTube uses. Loaded from Google Fonts rather
            than bundled so the build needs no network; the stack in globals.css
            keeps metrics close if it never arrives. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&family=Roboto+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="flex min-h-screen flex-col antialiased">
        <UiLangProvider>
          <PlayerProvider>
          <header className="sticky top-0 z-40 border-b border-[var(--rule)] bg-[color-mix(in_oklab,var(--paper)_92%,transparent)] backdrop-blur">
            <Nav />
          </header>

          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-7 sm:px-5">{children}</main>

          <footer className="mt-16 border-t border-[var(--rule)] pb-24">
            <Footer />
          </footer>

          <MiniPlayer />
          </PlayerProvider>
        </UiLangProvider>
      </body>
    </html>
  );
}
