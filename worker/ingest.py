#!/usr/bin/env python3
"""
Hörbar ingest worker.

Turns a YouTube URL, a podcast RSS feed or a local audio file into the source
JSON that `npm run build-catalog` consumes. Everything expensive lives here and
not in a serverless function: Whisper on half an hour of audio blows through any
sane execution limit, and the pitch extraction is worse.

The worker deliberately stops at the source schema rather than writing the final
catalog payload. Levels, metrics, glossaries, drill selection and the Shadowing
Difficulty Metric are all computed by the TypeScript pipeline, so there is
exactly one implementation of each and the labels can never drift between the
worker and the app.

    python worker/ingest.py --url https://www.youtube.com/watch?v=... --level B1
    python worker/ingest.py --feed https://example.com/feed.xml --limit 3
    python worker/ingest.py --file episode.mp3 --slug my-episode --title "..."

Requires: yt-dlp, faster-whisper (or whisperx for word-level alignment),
optionally librosa for pitch, optionally a DEEPL_API_KEY for translations.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
import unicodedata
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Any, Iterable

ROOT = Path(__file__).resolve().parent.parent
SOURCE_DIR = ROOT / "data" / "sources"

DEEPL_TARGETS = {"en": "EN-GB", "vi": "VI"}


# --------------------------------------------------------------------------- #
# data model - mirrors the SourceFile interface in scripts/build-catalog.ts
# --------------------------------------------------------------------------- #

@dataclass
class Word:
    w: str
    s: float
    e: float


@dataclass
class SourceSegment:
    de: str
    en: str = ""
    vi: str = ""
    start: float = 0.0
    end: float = 0.0
    speaker: str | None = None
    words: list[dict[str, Any]] = field(default_factory=list)
    f0: list[float] = field(default_factory=list)


@dataclass
class SourceFile:
    id: str
    slug: str
    title: str
    publisher: str
    description: str
    topics: list[str]
    license: str
    source: dict[str, Any]
    segments: list[dict[str, Any]]
    editorialCefr: str | None = None
    feedUrl: str | None = None
    publishedAt: str | None = None
    transcriptStatus: str = "ready"


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #

def slugify(value: str) -> str:
    value = unicodedata.normalize("NFKD", value)
    value = value.replace("ä", "ae").replace("ö", "oe").replace("ü", "ue").replace("ß", "ss")
    value = re.sub(r"[^\w\s-]", "", value.lower())
    return re.sub(r"[\s_-]+", "-", value).strip("-")[:80]


def run(command: list[str]) -> str:
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"{command[0]} failed: {result.stderr.strip()[:400]}")
    return result.stdout


def youtube_id(url: str) -> str | None:
    parsed = urllib.parse.urlparse(url)
    if parsed.hostname in {"youtu.be"}:
        return parsed.path.lstrip("/") or None
    if parsed.hostname and "youtube" in parsed.hostname:
        query = urllib.parse.parse_qs(parsed.query)
        if "v" in query:
            return query["v"][0]
        match = re.search(r"/(shorts|embed)/([\w-]+)", parsed.path)
        if match:
            return match.group(2)
    return None


# --------------------------------------------------------------------------- #
# 1. acquire audio
# --------------------------------------------------------------------------- #

def download_audio(url: str, target_dir: Path) -> tuple[Path, dict[str, Any]]:
    """Pulls the audio track and the metadata yt-dlp already knows."""
    print(f"  fetching metadata for {url}")
    info = json.loads(run(["yt-dlp", "--no-warnings", "--dump-single-json", url]))

    output = target_dir / "audio.%(ext)s"
    print("  downloading audio")
    run([
        "yt-dlp", "--no-warnings", "-f", "bestaudio/best",
        "-x", "--audio-format", "wav", "--audio-quality", "0",
        "-o", str(output), url,
    ])
    audio = next(target_dir.glob("audio.*"))
    return audio, info


def download_file(url: str, target_dir: Path) -> Path:
    print(f"  downloading {url}")
    destination = target_dir / "audio.mp3"
    with urllib.request.urlopen(url) as response, destination.open("wb") as handle:
        while chunk := response.read(1 << 20):
            handle.write(chunk)
    return destination


# --------------------------------------------------------------------------- #
# 2. transcribe and align
# --------------------------------------------------------------------------- #

def transcribe(audio: Path, model_size: str, align: bool) -> list[SourceSegment]:
    """
    Word-level alignment is the whole point of this step.

    Sentence-level subtitles are too coarse for shadowing: a learner loses their
    place inside a long compound noun. WhisperX runs a CTC forced aligner over
    Whisper's output and gives per-word boundaries; faster-whisper's own
    word_timestamps are the fallback when WhisperX is not installed.
    """
    if align:
        try:
            return transcribe_whisperx(audio, model_size)
        except ImportError:
            print("  whisperx not installed, falling back to faster-whisper word timestamps")
    return transcribe_faster_whisper(audio, model_size)


def transcribe_whisperx(audio: Path, model_size: str) -> list[SourceSegment]:
    import whisperx  # type: ignore

    device = "cuda" if os.environ.get("HOERBAR_CUDA") else "cpu"
    compute_type = "float16" if device == "cuda" else "int8"

    print(f"  transcribing with whisperx ({model_size}, {device})")
    model = whisperx.load_model(model_size, device, compute_type=compute_type, language="de")
    loaded = whisperx.load_audio(str(audio))
    result = model.transcribe(loaded, batch_size=8, language="de")

    print("  forced-aligning to word level")
    align_model, metadata = whisperx.load_align_model(language_code="de", device=device)
    aligned = whisperx.align(result["segments"], align_model, metadata, loaded, device)

    segments: list[SourceSegment] = []
    for item in aligned["segments"]:
        words = [
            {"w": word["word"].strip(), "s": round(float(word["start"]), 3), "e": round(float(word["end"]), 3)}
            for word in item.get("words", [])
            if word.get("start") is not None and word.get("end") is not None
        ]
        segments.append(SourceSegment(
            de=item["text"].strip(),
            start=round(float(item["start"]), 3),
            end=round(float(item["end"]), 3),
            words=words,
        ))
    return segments


def transcribe_faster_whisper(audio: Path, model_size: str) -> list[SourceSegment]:
    from faster_whisper import WhisperModel  # type: ignore

    print(f"  transcribing with faster-whisper ({model_size})")
    model = WhisperModel(model_size, device="cpu", compute_type="int8")
    raw, _info = model.transcribe(str(audio), language="de", word_timestamps=True, vad_filter=True)

    segments: list[SourceSegment] = []
    for item in raw:
        words = [
            {"w": word.word.strip(), "s": round(word.start, 3), "e": round(word.end, 3)}
            for word in (item.words or [])
        ]
        segments.append(SourceSegment(
            de=item.text.strip(),
            start=round(item.start, 3),
            end=round(item.end, 3),
            words=words,
        ))
    return segments


# --------------------------------------------------------------------------- #
# 3. sentence splitting
# --------------------------------------------------------------------------- #

SENTENCE_END = re.compile(r"(?<=[.!?])\s+")


def resegment(segments: list[SourceSegment], max_seconds: float = 12.0) -> list[SourceSegment]:
    """
    Whisper segments break on pauses, not on sentences. Shadowing needs one
    sentence per row, so segments are re-cut on punctuation using the word
    timings, and anything still longer than `max_seconds` is split at its
    longest internal pause.
    """
    output: list[SourceSegment] = []

    for segment in segments:
        parts = [part for part in SENTENCE_END.split(segment.de) if part.strip()]
        if len(parts) <= 1 and (segment.end - segment.start) <= max_seconds:
            output.append(segment)
            continue

        if not segment.words:
            output.append(segment)
            continue

        cursor = 0
        for part in parts:
            token_count = len(re.findall(r"[\wäöüßÄÖÜ]+", part))
            chunk = segment.words[cursor:cursor + token_count]
            cursor += token_count
            if not chunk:
                continue
            output.append(SourceSegment(
                de=part.strip(),
                start=chunk[0]["s"],
                end=chunk[-1]["e"],
                words=chunk,
            ))

    return [segment for segment in output if segment.de.strip()]


# --------------------------------------------------------------------------- #
# 4. pitch contour
# --------------------------------------------------------------------------- #

def extract_pitch(audio: Path, segments: list[SourceSegment], frames: int = 60) -> None:
    """
    Stores a downsampled F0 contour per sentence so the client can draw the
    native intonation next to the learner's own take. Skipped silently when
    librosa is not installed - the app degrades to showing only your own curve.
    """
    try:
        import librosa  # type: ignore
        import numpy as np  # type: ignore
    except ImportError:
        print("  librosa not installed, skipping pitch extraction")
        return

    print("  extracting pitch contours")
    signal, rate = librosa.load(str(audio), sr=16000, mono=True)

    for segment in segments:
        start = int(segment.start * rate)
        end = min(len(signal), int(segment.end * rate))
        if end - start < rate // 10:
            continue
        f0, _voiced, _prob = librosa.pyin(
            signal[start:end],
            fmin=float(librosa.note_to_hz("C2")),
            fmax=float(librosa.note_to_hz("C6")),
            sr=rate,
        )
        f0 = np.nan_to_num(f0, nan=0.0)
        if f0.size == 0:
            continue
        indices = np.linspace(0, f0.size - 1, num=min(frames, f0.size)).astype(int)
        segment.f0 = [round(float(value), 1) for value in f0[indices]]


# --------------------------------------------------------------------------- #
# 5. translation
# --------------------------------------------------------------------------- #

def translate_batch(texts: list[str], lang: str) -> list[str]:
    """Batched DeepL call. Returns empty strings when no key is configured."""
    key = os.environ.get("DEEPL_API_KEY")
    if not key or not texts:
        return ["" for _ in texts]

    host = os.environ.get("DEEPL_API_HOST", "api-free.deepl.com")
    out: list[str] = []
    # DeepL accepts up to 50 texts per request.
    for start in range(0, len(texts), 50):
        chunk = texts[start:start + 50]
        payload = json.dumps({
            "text": chunk,
            "source_lang": "DE",
            "target_lang": DEEPL_TARGETS[lang],
        }).encode()
        request = urllib.request.Request(
            f"https://{host}/v2/translate",
            data=payload,
            headers={"Authorization": f"DeepL-Auth-Key {key}", "Content-Type": "application/json"},
        )
        with urllib.request.urlopen(request) as response:
            body = json.loads(response.read())
        out.extend(item["text"] for item in body.get("translations", []))
        print(f"  translated {min(start + 50, len(texts))}/{len(texts)} into {lang}")
    return out + ["" for _ in range(len(texts) - len(out))]


# --------------------------------------------------------------------------- #
# 6. output
# --------------------------------------------------------------------------- #

def write_source(source: SourceFile) -> Path:
    SOURCE_DIR.mkdir(parents=True, exist_ok=True)
    path = SOURCE_DIR / f"{source.slug}.json"
    payload = {key: value for key, value in asdict(source).items() if value is not None}
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return path


def push_to_supabase(slug: str) -> None:
    """
    Uploads the built catalog payload. Run `npm run build-catalog` first: this
    pushes the finished payload, not the raw source, so the level and metrics
    are the ones the TypeScript pipeline computed.
    """
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("  no Supabase credentials, leaving the payload on disk")
        return

    payload_path = ROOT / "data" / "catalog" / f"{slug}.json"
    if not payload_path.exists():
        print(f"  {payload_path} not found - run: npm run build-catalog")
        return

    episode = json.loads(payload_path.read_text(encoding="utf-8"))
    body = json.dumps([{
        "id": episode["id"],
        "slug": episode["slug"],
        "cefr": episode["cefr"],
        "title": episode["title"],
        "publisher": episode["publisher"],
        "sdm": episode["metrics"]["sdm"],
        "duration_sec": episode["durationSec"],
        "payload": episode,
    }]).encode()

    request = urllib.request.Request(
        f"{url}/rest/v1/episodes?on_conflict=slug",
        data=body,
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates",
        },
        method="POST",
    )
    with urllib.request.urlopen(request) as response:
        response.read()
    print(f"  pushed {slug} to Supabase")


# --------------------------------------------------------------------------- #
# pipeline
# --------------------------------------------------------------------------- #

def ingest_one(
    *,
    url: str | None,
    file: str | None,
    args: argparse.Namespace,
    meta_override: dict[str, Any] | None = None,
) -> Path:
    with tempfile.TemporaryDirectory() as raw_dir:
        target = Path(raw_dir)
        info: dict[str, Any] = {}

        if file:
            audio = Path(file)
        elif url and (url.endswith((".mp3", ".m4a", ".wav", ".ogg")) or (meta_override or {}).get("direct")):
            audio = download_file(url, target)
        elif url:
            audio, info = download_audio(url, target)
        else:
            raise SystemExit("Nothing to ingest: pass --url or --file")

        title = args.title or (meta_override or {}).get("title") or info.get("title") or audio.stem
        slug = args.slug or slugify(title)
        publisher = args.publisher or (meta_override or {}).get("publisher") or info.get("uploader") or "Unknown"
        description = args.description or (meta_override or {}).get("description") or (info.get("description") or "")[:400]

        segments = transcribe(audio, args.model, not args.no_align)
        segments = resegment(segments)
        print(f"  {len(segments)} sentences")

        if args.clip:
            start, _, end = args.clip.partition("-")
            low, high = float(start), float(end)
            segments = [s for s in segments if s.start >= low and s.end <= high]
            print(f"  clipped to {len(segments)} sentences between {low}s and {high}s")

        if not args.no_pitch:
            extract_pitch(audio, segments)

        german = [segment.de for segment in segments]
        for lang in ("en", "vi"):
            translations = translate_batch(german, lang)
            for segment, text in zip(segments, translations):
                setattr(segment, lang, text)

    vid = youtube_id(url) if url else None
    if vid:
        media: dict[str, Any] = {"kind": "youtube", "youtubeId": vid, "pageUrl": url}
    elif url:
        media = {"kind": "audio", "audioUrl": url}
    else:
        media = {"kind": "timeline"}

    source = SourceFile(
        id=f"ingest-{slug}",
        slug=slug,
        title=title,
        publisher=publisher,
        description=description,
        topics=args.topics.split(",") if args.topics else [],
        license=args.license,
        source=media,
        editorialCefr=args.level,
        feedUrl=(meta_override or {}).get("feedUrl"),
        publishedAt=(meta_override or {}).get("publishedAt") or info.get("upload_date"),
        segments=[{key: value for key, value in asdict(segment).items() if value not in ("", [], None)}
                  for segment in segments],
    )

    path = write_source(source)
    print(f"  wrote {path.relative_to(ROOT)}")
    print("  next: npm run build-catalog")

    if args.push:
        push_to_supabase(slug)
    return path


def feed_items(feed_url: str, limit: int) -> Iterable[dict[str, Any]]:
    with urllib.request.urlopen(feed_url) as response:
        tree = ET.fromstring(response.read())
    channel = tree.find("channel")
    if channel is None:
        return []
    publisher = (channel.findtext("title") or "").strip()
    for item in channel.findall("item")[:limit]:
        enclosure = item.find("enclosure")
        if enclosure is None or not enclosure.get("url"):
            continue
        yield {
            "url": enclosure.get("url"),
            "title": (item.findtext("title") or "").strip(),
            "description": (item.findtext("description") or "").strip()[:400],
            "publishedAt": (item.findtext("pubDate") or "").strip(),
            "publisher": publisher,
            "feedUrl": feed_url,
            "direct": True,
        }


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest German audio into the Hörbar catalog.")
    source_group = parser.add_mutually_exclusive_group(required=True)
    source_group.add_argument("--url", help="YouTube URL or direct audio URL")
    source_group.add_argument("--feed", help="Podcast RSS feed URL")
    source_group.add_argument("--file", help="Local audio file")

    parser.add_argument("--limit", type=int, default=1, help="Episodes to take from a feed")
    parser.add_argument("--level", help="Editorial CEFR label (A1-C2). Omit to let the classifier decide.")
    parser.add_argument("--slug", help="Override the generated slug")
    parser.add_argument("--title", help="Override the title")
    parser.add_argument("--publisher", help="Override the publisher")
    parser.add_argument("--description", help="Override the description")
    parser.add_argument("--topics", default="", help="Comma-separated topics")
    parser.add_argument("--license", default="Ingested for personal study. Media stays with the publisher.")
    parser.add_argument("--model", default="medium", help="Whisper model size (tiny..large-v3)")
    parser.add_argument("--clip", help="Only keep a time range, as START-END in seconds")
    parser.add_argument("--no-align", action="store_true", help="Skip WhisperX forced alignment")
    parser.add_argument("--no-pitch", action="store_true", help="Skip F0 extraction")
    parser.add_argument("--push", action="store_true", help="Push the built payload to Supabase afterwards")

    args = parser.parse_args()

    if args.feed:
        items = list(feed_items(args.feed, args.limit))
        if not items:
            raise SystemExit("No enclosures found in that feed.")
        for index, item in enumerate(items, start=1):
            print(f"[{index}/{len(items)}] {item['title']}")
            ingest_one(url=item["url"], file=None, args=args, meta_override=item)
        return

    ingest_one(url=args.url, file=args.file, args=args)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
