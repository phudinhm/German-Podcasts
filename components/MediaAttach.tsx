"use client";

import { useRef, useState } from "react";
import { parseMediaUrl } from "@/lib/media";
import { clearMedia, setMedia, type StoredMedia } from "@/lib/mediaStore";
import { useUi } from "@/lib/i18n";

/**
 * Attach a real stream to an episode.
 *
 * Three ways in, because the sources a learner actually has differ: a podcast
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
  const { t } = useUi();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  function attachUrl() {
    setError(null);
    const parsed = parseMediaUrl(value);
    if (!parsed) {
      setError(t("watch.badUrl"));
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
      label: `${file.name} (local, this session only)`,
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
          {t("watch.detachStream")}
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button type="button" className="btn text-[12px]" onClick={() => setOpen(true)}>
        {t("watch.connectStream")}
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-[var(--rule)] p-3">
      <label className="block text-[11px] uppercase tracking-[0.12em] text-[var(--ink-faint)]">
        {t("watch.attachLabel")}
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
          placeholder={t("watch.attachPlaceholder")}
          className="btn min-w-[240px] flex-1 justify-start font-normal"
        />
        <button type="button" className="btn btn-primary" onClick={attachUrl} disabled={!value.trim()}>
          {t("watch.connect")}
        </button>
        <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
          {t("watch.chooseFile")}
        </button>
        <button type="button" className="btn" onClick={() => setOpen(false)}>
          {t("common.cancel")}
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
        {t("watch.attachHint")}
      </p>
    </div>
  );
}
