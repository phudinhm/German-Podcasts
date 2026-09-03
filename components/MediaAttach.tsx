"use client";

import { useRef, useState } from "react";
import { parseMediaUrl } from "@/lib/media";
import { clearMedia, setMedia, type StoredMedia } from "@/lib/mediaStore";

/**
 * Attach a real stream to an episode.
 *
 * Three ways in, because the sources a learner actually has differ: a YouTube
 * link, a direct audio or video URL from a podcast feed, or a file already on
 * their machine. All three end up in the same player.
 */
export function MediaAttach({
  slug,
  current,
  onChange,
}: {
  slug: string;
  current: StoredMedia | null;
  onChange: () => void;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  function attachUrl() {
    setError(null);
    const parsed = parseMediaUrl(value);
    if (!parsed) {
      setError("Das sieht nicht nach einer abspielbaren Adresse aus. Erwartet wird ein YouTube-Link oder die Adresse einer Audio- oder Videodatei.");
      return;
    }
    setMedia(slug, { source: parsed.source, label: parsed.label, attachedAt: new Date().toISOString() });
    setValue("");
    setOpen(false);
    onChange();
  }

  function attachFile(file: File) {
    const url = URL.createObjectURL(file);
    const isVideo = file.type.startsWith("video/");
    setMedia(slug, {
      source: isVideo ? { kind: "video", videoUrl: url } : { kind: "audio", audioUrl: url },
      label: `${file.name} (lokal, nur diese Sitzung)`,
      attachedAt: new Date().toISOString(),
      ephemeral: true,
    });
    setOpen(false);
    onChange();
  }

  if (current) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--ink-faint)]">
        <span className="chip">{current.label}</span>
        <button
          type="button"
          className="underline decoration-dotted underline-offset-4 hover:text-[var(--accent)]"
          onClick={() => {
            clearMedia(slug);
            onChange();
          }}
        >
          Medien lösen
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button type="button" className="btn text-[12px]" onClick={() => setOpen(true)}>
        Stream verbinden
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-[var(--rule)] p-3">
      <label className="block text-[11px] uppercase tracking-[0.12em] text-[var(--ink-faint)]">
        YouTube-Link oder Audio-/Video-Adresse
      </label>
      <div className="mt-1.5 flex flex-wrap gap-2">
        <input
          value={value}
          autoFocus
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") attachUrl();
            if (event.key === "Escape") setOpen(false);
          }}
          placeholder="https://www.youtube.com/watch?v=… oder https://…/folge.mp3"
          className="btn min-w-[240px] flex-1 justify-start font-normal"
        />
        <button type="button" className="btn btn-primary" onClick={attachUrl} disabled={!value.trim()}>
          Verbinden
        </button>
        <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
          Datei wählen
        </button>
        <button type="button" className="btn" onClick={() => setOpen(false)}>
          Abbrechen
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="audio/*,video/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) attachFile(file);
        }}
      />
      {error ? <p className="mt-2 text-[12px] text-rose-600">{error}</p> : null}
      <p className="mt-2 text-[11px] leading-relaxed text-[var(--ink-faint)]">
        Der Stream läuft direkt vom Anbieter zu deinem Browser. Hörbar speichert nur die Adresse, und
        zwar in diesem Browser. Lokale Dateien gelten nur für diese Sitzung.
      </p>
    </div>
  );
}
