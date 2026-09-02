# Ingest worker

Long jobs live here, not in a serverless function. Whisper on half an hour of
audio takes minutes and will hit any Vercel execution limit; pitch extraction is
worse. Run this on a cheap VPS, a Modal container, or your own laptop, and let
Vercel serve the finished JSON.

## What it does

1. Pulls the audio with `yt-dlp` (YouTube) or straight from a podcast enclosure.
2. Transcribes German with WhisperX, or faster-whisper as a fallback.
3. Forced-aligns to **word level**, which is what makes the karaoke teleprompter
   land on the right syllable inside a long compound.
4. Re-cuts Whisper's pause-based segments into **one sentence per row**, because
   shadowing is a sentence-level activity.
5. Extracts a per-sentence F0 contour with librosa, so the app can plot native
   intonation next to yours.
6. Translates every sentence into English and Vietnamese via DeepL.
7. Writes `data/sources/<slug>.json`.

It deliberately stops there. CEFR level, Goethe coverage, the Shadowing
Difficulty Metric, the per-episode glossary and the drill selection are all
computed by `npm run build-catalog`, so there is one implementation of each and
the worker can never disagree with the app about what level something is.

## Setup

```bash
cd worker
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# optional extras
pip install whisperx librosa soundfile
```

`ffmpeg` must be on the PATH; yt-dlp needs it to extract audio.

## Use

```bash
# one YouTube video, labelled B1
python worker/ingest.py --url 'https://www.youtube.com/watch?v=...' \
  --level B1 --topics 'Alltag,Interviews'

# the three most recent episodes of a podcast feed
python worker/ingest.py --feed 'https://example.com/feed.xml' --limit 3 --level C1

# a local file, keeping only the first ten minutes
python worker/ingest.py --file episode.mp3 --slug my-episode \
  --title 'Folge 12' --clip 0-600

# then, always:
npm run build-catalog
```

Add `--push` to upload the built payload to Supabase once the catalog step has
run. Without Supabase the JSON on disk is already everything the app needs.

## Environment

| Variable | Effect when unset |
| --- | --- |
| `DEEPL_API_KEY` | Translations come out empty; the app falls back to on-demand lookup. |
| `HOERBAR_CUDA` | Runs Whisper on CPU with int8, which is slower but works anywhere. |
| `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | `--push` is a no-op and the payload stays on disk. |

## Cost and time, roughly

On a 4-core CPU with the `medium` model, expect around 1.5x real time for
transcription, plus about 0.3x for alignment and 0.2x for pitch. A 20-minute
episode is therefore about 40 minutes of wall clock. On a small GPU it is closer
to 3 minutes. This is exactly why it does not belong in a request handler.

## Licensing

Ingest content you have the right to process. The worker downloads media to a
temporary directory and deletes it when it exits: the app never hosts or
redistributes audio or video, it only stores a transcript payload and points the
player at the publisher's own stream.
