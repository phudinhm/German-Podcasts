import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "How it works",
  description: "What Hörbar does, where the audio comes from, and where your library is kept.",
};

export default function AboutPage() {
  return (
    <div className="max-w-2xl">
      <h1 className="text-[27px] font-semibold">How it works</h1>

      <section className="mt-6 space-y-3 text-[14.5px] leading-relaxed text-[var(--ink-soft)]">
        <p>
          Hörbar is a podcast player. Type a show&apos;s name or paste a link from Apple Podcasts,
          Spotify or a podcast&apos;s own site, and it finds the feed and plays it.
        </p>
        <p>
          It streams nothing itself. Audio comes straight from the publisher&apos;s own servers, the
          same as any other podcast app, so the people who made the show get the download.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-[16px] font-semibold">Where your library lives</h2>
        <div className="mt-3 space-y-3 text-[14.5px] leading-relaxed text-[var(--ink-soft)]">
          <p>
            Saved shows and your listening positions are kept in this browser. Nothing is sent
            anywhere and no account is needed for any of it to work.
          </p>
          <p>
            Connecting Google is optional and does not change that. It writes one small file into a
            hidden folder in your own Google Drive that only this app can see. We never hold it,
            there is no database behind this app, and disconnecting leaves your local library
            exactly where it was.
          </p>
          <p>
            When two devices disagree, they are merged rather than one overwriting the other: a show
            saved anywhere stays saved, and an episode heard on both keeps whichever position is
            further along. Losing a saved show to a stale copy on an old phone is the failure people
            actually notice.
          </p>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-[16px] font-semibold">Sources</h2>
        <div className="mt-3 space-y-3 text-[14.5px] leading-relaxed text-[var(--ink-soft)]">
          <p>
            Any RSS feed works, and search covers Apple Podcasts directly. A Spotify show link is
            bridged to that show&apos;s public feed where one exists, because Spotify does not let
            other apps stream its audio.
          </p>
          <p>
            The suggestions are German and English shows and news programmes, chosen rather than
            ranked. They are stored as names rather than addresses, so they go through the same
            search as anything you type and cannot quietly rot into dead links.
          </p>
        </div>
      </section>

      <p className="mt-8">
        <Link href="/" className="btn">
          Start listening
        </Link>
      </p>
    </div>
  );
}
