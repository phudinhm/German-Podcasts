import type { VaultEntry } from "./vault";
import type { TargetLang } from "./types";

/**
 * Export formats. Anki's plain-text importer takes tab-delimited fields with a
 * header block, which round-trips cleanly and needs no binary deck writer -
 * you point Anki at the file, map the columns once, and the deck is built.
 */

function escapeField(value: string): string {
  // Anki treats a literal tab or newline as a field boundary, so both go.
  return value.replace(/\t/g, " ").replace(/\r?\n/g, "<br>").trim();
}

export interface ExportOptions {
  lang: TargetLang;
  deckName?: string;
  includeContext?: boolean;
}

/** Tab-delimited text ready for Anki's File > Import. */
export function toAnkiTsv(entries: VaultEntry[], options: ExportOptions): string {
  const deck = options.deckName ?? "Hörbar::German";
  const lines: string[] = [
    "#separator:tab",
    "#html:true",
    `#deck:${deck}`,
    "#columns:German\tTranslation\tContext\tSource\tTags",
  ];

  for (const entry of entries) {
    const front = entry.article ? `${entry.article} ${entry.lemma}` : entry.lemma;
    const plural = entry.plural ? ` (pl. ${entry.plural})` : "";
    const translation = entry.translations[options.lang].join(", ");
    const context =
      options.includeContext === false
        ? ""
        : `${entry.context.de}<br><i>${
            (options.lang === "en" ? entry.context.en : entry.context.vi) ?? ""
          }</i>`;
    const source = `${entry.context.episodeTitle} @ ${formatTimestamp(entry.context.start)}`;
    const tags = [`hoerbar`, entry.context.cefr, entry.pos].filter(Boolean).join(" ");

    lines.push(
      [
        escapeField(front + plural),
        escapeField(translation),
        escapeField(context),
        escapeField(source),
        escapeField(tags),
      ].join("\t"),
    );
  }

  return lines.join("\n");
}

/** Spreadsheet-friendly CSV, for anyone not on Anki. */
export function toCsv(entries: VaultEntry[], options: ExportOptions): string {
  const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const header = ["lemma", "article", "plural", "pos", "translation", "context_de", "context_translation", "episode", "timestamp", "cefr", "due", "interval_days", "ease"];
  const rows = entries.map((entry) =>
    [
      entry.lemma,
      entry.article ?? "",
      entry.plural ?? "",
      entry.pos,
      entry.translations[options.lang].join("; "),
      entry.context.de,
      (options.lang === "en" ? entry.context.en : entry.context.vi) ?? "",
      entry.context.episodeTitle,
      formatTimestamp(entry.context.start),
      entry.context.cefr,
      entry.srs.due,
      String(entry.srs.interval),
      entry.srs.ease.toFixed(2),
    ].map(quote).join(","),
  );
  return [header.join(","), ...rows].join("\n");
}

/**
 * Cloze cards built from the learner's own sentences: the saved word is blanked
 * out of the exact sentence it was captured in, which beats a generic drill
 * because the context is content they chose to watch.
 */
export function toClozeTsv(entries: VaultEntry[], options: ExportOptions): string {
  const lines = ["#separator:tab", "#html:true", `#deck:${options.deckName ?? "Hörbar::Cloze"}`, "#notetype:Cloze", "#columns:Text\tExtra"];
  for (const entry of entries) {
    const cloze = makeCloze(entry.context.de, entry.surface);
    if (!cloze) continue;
    const extra = `${entry.lemma} - ${entry.translations[options.lang].join(", ")}<br>${entry.context.episodeTitle} @ ${formatTimestamp(entry.context.start)}`;
    lines.push([escapeField(cloze), escapeField(extra)].join("\t"));
  }
  return lines.join("\n");
}

/** Replaces the first occurrence of `surface` with an Anki cloze deletion. */
export function makeCloze(sentence: string, surface: string): string | null {
  const index = sentence.toLowerCase().indexOf(surface.toLowerCase());
  if (index < 0) return null;
  const actual = sentence.slice(index, index + surface.length);
  return `${sentence.slice(0, index)}{{c1::${actual}}}${sentence.slice(index + surface.length)}`;
}

export function formatTimestamp(seconds: number): string {
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

/** Deep link back to the exact frame the word came from. */
export function contextLink(entry: VaultEntry): string {
  return `/watch/${entry.context.episodeSlug}?t=${Math.floor(entry.context.start)}&seg=${entry.context.segmentId}`;
}
