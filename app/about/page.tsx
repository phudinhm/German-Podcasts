import type { Metadata } from "next";
import Link from "next/link";
import { CEFR_DESCRIPTIONS } from "@/lib/cefr";
import { SDM_WEIGHTS } from "@/lib/sdm";
import { LEITNER_INTERVALS } from "@/lib/srs";
import { CEFR_LEVELS } from "@/lib/types";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "How Hörbar finds sources, grades content by CEFR level, aligns transcripts, marks pronunciation and schedules vocabulary.",
};

export default function AboutPage() {
  return (
    <article className="mx-auto max-w-2xl">
      <h1 className="text-[28px] font-semibold">How it works</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-[var(--ink-soft)]">
        Hörbar is deliberately narrow: the media lives with its publishers, the heavy analysis runs
        once at ingest, and the app is only the layer in between that keeps everything in sync. That
        is why a page appears instantly and why the server bill does not grow with practice time.
      </p>

      <Section title="Where the sound comes from">
        <p>
          Hörbar hosts nothing. What you hear travels from the publisher&apos;s own server to your
          browser: from YouTube, from a podcast CDN, or from a file on your machine. For an RSS feed
          this app reads only the list of episodes and returns the real enclosure addresses; the media
          bytes never pass through our server. That is what keeps the bill flat however much you
          listen.
        </p>
        <p>
          You do not have to find a feed yourself. Type a show&apos;s name or paste a link from
          anywhere. Apple Podcasts runs a search that needs no key and returns the show&apos;s real RSS
          feed, which makes it the best front door by a distance. YouTube publishes a per-channel Atom
          feed, also keyless, and videos play through its own player.
        </p>
        <p>
          Spotify is different, and the difference is not cosmetic: Spotify does not permit any other
          app to stream its audio. So a Spotify link is treated as an identification problem. Hörbar
          works out which show it is and looks for the same programme&apos;s public RSS feed, which most
          podcasts also publish. Where a show is a Spotify exclusive there is no honest way to play it
          here, and the interface says so rather than failing strangely.
        </p>
      </Section>

      <Section title="Transcripts, and what happens without one">
        <p>
          An episode that has been through the ingest worker carries a real transcript with word-level
          timings. Open it from the player and every sentence is clickable, in German alone or beside
          English or Vietnamese.
        </p>
        <p>
          Most podcast audio has never been transcribed by anyone. For those, live captions run in the
          browser using its own speech recognition. The mechanics are worth being plain about: browser
          speech recognition listens to the microphone rather than to a media element, and a
          cross-origin podcast stream cannot be captured for analysis because its CDN sends no CORS
          headers. So the captions hear the audio the same way a person in the room does, through your
          speakers. It sounds like a workaround and it is the only route that works on arbitrary
          podcast audio without uploading the recording anywhere.
        </p>
      </Section>

      <Section title="CEFR grading">
        <p>
          Every transcript is measured against the Goethe-Institut word lists. We count how many tokens
          fall inside A1, A2 and B1, how many fall outside, and how many are compounds. A compound is
          only as hard as its hardest member: <em>Straßenbahn</em> is Straße plus Bahn, both A1, so it
          does not land in the unknown bucket. Proper nouns do not count at all, because not knowing{" "}
          <em>Leipzig</em> is not reading above your level.
        </p>
        <p>
          Vocabulary sets the base level and delivery speed may move it by exactly one band. The same
          words at 6.5 syllables per second are a different task than at 4.
        </p>
        <dl className="mt-3 space-y-1.5">
          {CEFR_LEVELS.map((level) => (
            <div key={level} className="flex gap-3 text-[13px]">
              <dt className="w-8 shrink-0 font-semibold text-[var(--accent)]">{level}</dt>
              <dd className="text-[var(--ink-soft)]">{CEFR_DESCRIPTIONS[level]}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-[12.5px] text-[var(--ink-faint)]">
          The shipped lists are representative extracts of the published Zertifikat lists, large enough
          for a stable grade. Swap in the full lists and the thresholds need re-fitting with{" "}
          <code className="font-mono">npm run classify</code>.
        </p>
      </Section>

      <Section title="Shadowing Difficulty Metric">
        <p>
          Two B2 episodes can sit twenty points apart once you try to say them back. A calm documentary
          is not the same task as an interview full of interruptions. The SDM score combines three
          measurements:
        </p>
        <ul className="mt-2 space-y-1 text-[13.5px]">
          <li>
            <strong>Articulation rate</strong> ({Math.round(SDM_WEIGHTS.rate * 100)}%), syllables per
            second with the pauses between sentences excluded.
          </li>
          <li>
            <strong>Lexical diversity</strong> ({Math.round(SDM_WEIGHTS.diversity * 100)}%), as a mean
            segmental type-token ratio over 50-word windows, so a four-hour interview is not counted as
            easy purely because of its length.
          </li>
          <li>
            <strong>Phonetic load</strong> ({Math.round(SDM_WEIGHTS.phonetics * 100)}%), the share of
            words with consonant clusters, ich/ach alternations and final devoicing.
          </li>
        </ul>
        <p className="mt-2">
          Rate weighs heaviest because a hard cluster can be practised slowly, whereas a passage that
          is simply too fast cannot be shadowed at all.
        </p>
      </Section>

      <Section title="Pronunciation markers">
        <p>
          The markers in a transcript are rules, not guesses: final devoicing (b, d, g harden to p, t,
          k at the end of a syllable), the switch between the ich-Laut [ç] and the ach-Laut [x]
          depending on the preceding vowel, consonant clusters from three sounds up, st- and sp- at the
          start of a stem read as scht- and schp-, and the vocalised final -r. Compounds are split and
          the primary stress marked on the first member, so{" "}
          <span className="font-mono">WIRT-schafts-kri-se</span> is not stressed in the middle.
        </p>
      </Section>

      <Section title="Repetition">
        <p>
          Saved words run through SM-2, the same algorithm Anki uses, displayed as a five-box Leitner
          ladder because five boxes read faster than an ease factor. Intervals grow roughly along{" "}
          {LEITNER_INTERVALS.join(", ")} days. Every card carries the sentence the word appeared in
          plus a link back to that exact moment, which is the difference between a word list and a
          memory.
        </p>
      </Section>

      <Section title="What runs where">
        <p>
          Transcription, word alignment and translation happen in the ingest worker, outside the
          serverless functions: Whisper on half an hour of audio exceeds any sensible execution limit.
          The result is a JSON payload of sentence and word boundaries, translations and a glossary,
          sitting ready in the database.
        </p>
        <p>
          All audio analysis happens in the browser: pitch contour, loudness, pronunciation scoring.
          Microphone recordings never leave the device, latency is zero, and the compute cost stays at
          zero too.
        </p>
      </Section>

      <Section title="Without keys, and with them">
        <p>
          With no configuration at all you get: source discovery across Apple Podcasts, Spotify and
          YouTube, streaming, the catalog, sentence synchronisation, the word teleprompter, loops and
          echo gaps, pronunciation markers, the bundled dictionary, the vocabulary vault with review
          and export, rule-based sentence analysis, live captions, and the precomputed comprehension
          questions.
        </p>
        <p>
          A DeepL or Anthropic key adds lookups for words outside the offline lexicon, sentence
          translations for freshly ingested episodes and for live captions, fuller sentence-structure
          explanations, and generated quizzes.
        </p>
      </Section>

      <p className="mt-8 text-[13px]">
        <Link href="/" className="btn">
          Back to the catalog
        </Link>
      </p>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-[17px] font-semibold">{title}</h2>
      <div className="mt-2 space-y-2.5 text-[14px] leading-relaxed text-[var(--ink-soft)] [&_code]:text-[12px] [&_strong]:text-[var(--ink)]">
        {children}
      </div>
    </section>
  );
}
