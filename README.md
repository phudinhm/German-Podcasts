# Hörbar

A CEFR-graded German listening and shadowing trainer. Side-by-side transcripts
with English or Vietnamese, click any word for its dictionary entry, loop a
sentence until you can say it back, and save what you learn into a spaced
repetition vault.

Built as a Next.js app for Vercel. It hosts no media: video and audio stream
from YouTube and public podcast CDNs, and this app is the orchestration layer
that keeps a transcript payload in sync with them.

```bash
npm install
npm run build-catalog   # compute levels, metrics, glossaries, drills
npm run dev             # http://localhost:3000
```

No API keys, no database, no accounts required to run it.

---

## What it does

**Finds the source for you.** One box on the Direkt hören page takes a show's
name or a link from anywhere, and works out what can actually be played:

| You give it | What happens |
| --- | --- |
| A show's name | Apple Podcasts search returns matching shows and their real RSS feeds. No API key. |
| An Apple Podcasts link | Looked up by id; the feed comes straight back. |
| A Spotify show link | The show is identified, then bridged to its public RSS. Spotify never permits third-party streaming of its own audio, so this is the only honest route, and the UI says so. |
| A YouTube channel, `@handle` or playlist | Resolved to the channel id and read from YouTube's keyless Atom feed; videos play through the IFrame player. |
| A YouTube video link | Plays directly. |
| A podcast's homepage | The page is fetched and its advertised `<link rel="alternate">` feed is used. |
| An RSS URL | Used as-is. |

Only YouTube *keyword* search needs a key (`YOUTUBE_API_KEY`); everything in
that table works with nothing configured.

**Interface in English by default**, with German and Vietnamese available from
the header. The app teaches German rather than assuming it, so the chrome should
never be the first hurdle. Typography is Roboto, the face YouTube uses.

**Streams real audio and video**, always straight from the source with nothing
proxied through this app. Beyond discovery you can also **attach a stream to any
episode**: a YouTube link, a direct audio or video URL, or a file from your own
machine. The attachment is remembered per episode in your browser, and the same
synchronised transcript view plays it.

The transport shows what a stream actually needs: how far it has buffered ahead,
whether it is stalled, and a readable message when a URL turns out not to be
playable. It stays pinned to the top while the transcript scrolls underneath, so
"slower" and "back ten seconds" are always one click away. Streaming works before
a transcript exists: you get speed control and A-B looping from raw timestamps
until ingest fills in the sentences.

**Playback survives navigation.** The media elements are mounted once, above
the page tree, so moving between Listen, Catalog and Vocabulary does not stop
the audio. A mini bar at the bottom keeps the controls reachable. Video is
harder, because a YouTube iframe cannot be moved in the DOM without reloading,
so it lives in one fixed layer that is positioned over whatever "stage" the
current page registers, and shrinks into the mini bar when there is none.

**Suggested shows, follow, and a rolling episode list.** The Listen page opens
with 45 German shows grouped by CEFR level and browsable by topic, each resolved
through the same search as anything you type, so a moved feed cannot silently
rot. Alongside them the live Apple Podcasts chart for Germany, which updates
itself. Fifteen of the curated entries are broadcasters rather than podcast
studios: tagesschau, heute journal, Deutschlandfunk, the regional stations, so
news audio and video sit next to the podcasts. Follow a show and it stays on the
page. An episode list shows 40 at a time and pages onward, because a weekly
programme has hundreds of back episodes.

**Transcripts on demand, live captions when there is none.** A streamed episode
that has been ingested opens its transcript on a click, in German alone, stacked
with a translation, or in two columns side by side. The translation is
deliberately smaller and dimmer than the German so the eye lands on the original
first. Either view can move into a side panel, the way lyrics sit beside a track.
Every word is clickable for a dictionary entry and one-click saving, and
selecting a run of words looks up the phrase instead. Episode titles can be
translated in a batch. Most podcast audio
has never been transcribed by anyone; for those the browser's own speech
recognition produces live captions. It listens through the microphone, because
recognition cannot read a media element and a cross-origin podcast stream cannot
be captured without CORS headers, so play the audio out loud. Nothing is
uploaded.

**Curated catalog, graded by measurement.** Episodes carry a CEFR label produced
by measuring lexical coverage against Goethe-Institut reference vocabulary,
not by guesswork. Compounds are scored by their members (*Straßenbahn* is
Straße + Bahn, both A1) and proper nouns are excluded, because not knowing
*Leipzig* is not a vocabulary gap. Speech rate can move the label one band.

**Shadowing Difficulty Metric.** Two B2 episodes can be twenty points apart on
speaking difficulty. Every card carries a 0-100 score combining articulation
rate (50%), length-independent lexical diversity (30%) and phonetic load (20%),
so you can progress from cadence-friendly content to fast native debate on
purpose rather than by accident.

**Sentence-synced transcripts.** A requestAnimationFrame loop reads the player
clock, highlights the active sentence and runs a word-level teleprompter over
it. Click any sentence to seek straight to it.

**Interactive dictionary.** Click a word and get its lemma, not its surface
form: *gesprochen* resolves to *sprechen*, and *steht … auf* is reunited into
*aufstehen* by finding the stranded prefix at the end of the clause. Nouns come
with gender and plural, and the whole sentence is translated alongside for
idiomatic clarity.

**Pronunciation intelligence.** The transcript marks the mechanics that actually
trip up English and Vietnamese speakers: final devoicing (*Tag* → *Tak*), the
ich-Laut/ach-Laut split, three-plus consonant clusters, st-/sp- onsets read as
scht-/schp-, vocalised final -r, and primary stress inside compounds
(*WIRT-schafts-kri-se*).

**Shadowing engine.** Three modes: free playback, A-B looping with an iteration
threshold, and the Echo protocol, which mutes the player after each sentence for
a gap scaled to that sentence's length so you can say it back without racing
incoming audio. Tempo ramps step from 0.75x to 1.1x across repetitions, with
`preservesPitch` on so slow playback does not distort vowels.

**Keyboard-only operation.** `Space` play/pause, `[` `]` sentence boundaries,
`L` loop, `E` echo, `S` toggle translations, `R` record, `1-4` speed.

**Recording and feedback.** Your take is analysed in the browser: an
autocorrelation pitch tracker draws your intonation contour against the native
one, and word-level scoring colours the sentence green, amber or red. Audio
never leaves your device.

**Grammar Deconstructor.** A rule-based pass names which conjunction pushed the
verb to the end, where the verb bracket opens and closes, which preposition
governs which case, and where a separable prefix was stranded. It works with no
API key; a model layer adds to it when one is configured.

**Vocabulary vault.** Saving a word captures three things: the word, the exact
sentence as real-world context, and a deep link back to that timestamp. Review
runs on SM-2, displayed as a five-box Leitner ladder. Cloze mode blanks the
saved word out of your own sentence. Export to Anki (tab-delimited, with a cloze
deck variant) or CSV.

**Five-minute micro-drills.** The five highest-payload sentences from each
episode, picked for lexical density and phrase length rather than position, each
opening straight into an echo loop.

**Comprehension checks.** Three multiple-choice questions per episode, because
side-by-side translation makes it very easy to feel like you understood
something you only read.

---

## Architecture

```
data/sources/*.json        hand-written or worker-produced transcripts
        │
        │  npm run build-catalog   (lemmatise, classify, score, align, glossary)
        ▼
data/catalog/*.json        precomputed payloads - one file, one page load
        │
        ├── Next.js server components read them directly (no DB round trip)
        └── or Supabase serves them, when configured

worker/ingest.py           yt-dlp + WhisperX + librosa + DeepL, run off-platform
```

Three deliberate placements:

- **Heavy analysis happens once, at build time.** Lemmatising, classifying and
  glossing a transcript on every request would be slow and pointless: the text
  does not change. A page load reads one JSON file.
- **Long jobs never touch a serverless function.** Whisper on a 20-minute
  episode is roughly 40 CPU-minutes and blows any execution limit. The worker
  runs on a VPS or a Modal container and writes finished JSON.
- **Audio analysis happens in the browser.** Pitch tracking and pronunciation
  scoring run on the Web Audio API, so microphone data stays on the device,
  latency is zero, and server cost does not scale with practice time.

The worker stops at the source schema rather than writing the final payload, so
levels and metrics have exactly one implementation and the worker can never
disagree with the app about what level something is.

---

## Configuration

Everything is optional. Copy `.env.example` to `.env.local` for the extras.

| Variable | What it unlocks |
| --- | --- |
| `ANTHROPIC_API_KEY` | Dictionary lookups for words outside the bundled lexicon, richer sentence-structure notes, generated quizzes. |
| `YOUTUBE_API_KEY` | Keyword search across YouTube channels. Channel, handle and playlist links work without it. |
| `SPOTIFY_CLIENT_ID` + `SPOTIFY_CLIENT_SECRET` | Exact show metadata for Spotify links. Without them the public page's Open Graph tags are used instead. |
| `DEEPL_API_KEY` | Sentence translation for freshly ingested episodes. Preferred over Google for German. |
| `GOOGLE_TRANSLATE_API_KEY` | Alternative translation provider. |
| `NEXT_PUBLIC_SUPABASE_URL` + keys | Serves the catalog from Postgres so curators can publish without a redeploy. |
| `AZURE_SPEECH_KEY` | True phoneme-level pronunciation assessment, replacing the on-device fallback. |

### Without any keys

Working: source discovery across Apple Podcasts, Spotify (bridged), YouTube and
any podcast website; streaming from RSS feeds, YouTube, direct media URLs and
local files;
the catalog; sentence and word synchronisation; looping, echo gaps, tempo ramps
and hotkeys; phonetic hazard marking and compound stress; the 333-entry offline
dictionary; the vocabulary vault with SM-2 review and export; the rule-based
grammar deconstructor; precomputed quizzes; recording with pitch contour and
on-device word scoring.

Degraded: clicking a word outside the bundled lexicon returns a phonetic
breakdown and says so rather than a translation; sentence translations for
newly ingested episodes stay empty until a provider is configured.

---

## Deploying to Vercel

1. Push this repository to GitHub.
2. Import it at vercel.com. The framework preset is detected; `vercel.json`
   already sets the build command to `npm run build-catalog && next build`.
3. Add environment variables if you want any of the optional features.
4. Deploy.

Media bandwidth stays on YouTube and the podcast CDNs, so the hosting cost is
the transcript payloads and the occasional API route.

---

## Adding content

### Curated shelf

`data/sources/curated.json` lists real German shows with an editorial level and
no transcript yet. They render as cards that link out and print the ingest
command. Edit that file to change the shelf.

### Just listen to something now

Open **Direkt hören** and type the name of a show, or paste a link from Apple
Podcasts, Spotify, YouTube, or the podcast's own site. Pick an episode and play.
No ingest, no transcript, no waiting; you get tempo control and an A-B loop
straight away.

Some publishers only serve their feed to podcast apps and will answer 403. In
that case copy a single episode's media URL and attach it on the episode page
with **Stream verbinden**; the browser fetches it directly, so the publisher's
feed policy does not apply.

### A real episode, with a transcript

```bash
python worker/ingest.py --url 'https://www.youtube.com/watch?v=...' --level B1
npm run build-catalog
```

See `worker/README.md` for setup, feed ingestion and Supabase pushing.

### Checking a level by hand

```bash
npm run classify -- data/sources/feierabend-arbeitskultur.json
```

Prints lexical coverage per Goethe band, the out-of-list share, the compound
ratio, all three SDM inputs and the hardest words to articulate.

---

## A note on the shipped data

The three demo episodes are **original German scripts written for this project**
(CC BY 4.0), laid out on a transcript timeline with no audio attached. They
exist so every feature is visible on a fresh clone without waiting on a
transcription run; attach any stream to one with **Stream verbinden** and the
same view plays real media against the same transcript. Their word timings are synthesised from syllable counts at a
level-appropriate rate; they are not measurements of a recording. Run the ingest
worker to replace them with real forced alignment.

The Goethe word lists in `data/lexicon/goethe.ts` are representative subsets of
the published Zertifikat lists, large enough to classify text reliably at
around 1,800 lemmas. The band thresholds in `lib/cefr.ts` are calibrated against
those subsets. Dropping the full official lists in will shift coverage up by
roughly ten points and the thresholds need re-fitting; the file says so, and
`npm run classify` is the tool for it.

---

## Development

```bash
npm run dev            # dev server
npm run build          # production build
npm test               # language-logic test suite
npm run typecheck      # tsc --noEmit
npm run build-catalog  # rebuild data/catalog from data/sources
```

The tests cover the https upgrade and mixed-content rules, syllabification, compound splitting, phonetic hazard detection,
lemmatisation, separable-prefix reunification, sentence deconstruction, RSS and
YouTube Atom feed parsing, source-link classification for every provider, iTunes
result mapping, channel-id and feed-link extraction, media-URL routing and the
SSRF guard on the outbound endpoints. That is where
the correctness risk lives; the UI is comparatively forgiving.

Streaming is verified in a real browser against a range-serving HTTP endpoint:
metadata load, playback, seeking from the transport and from a transcript
sentence, buffered reporting, `preservesPitch` under a tempo ramp, the echo
protocol muting and gapping, attachment persistence across a reload, and the
error path for a URL that is not playable.
