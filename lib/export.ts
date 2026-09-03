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

/**
 * Quizlet's importer asks for a separator between the two sides of a card and
 * another between cards. Tab and newline are its own defaults, so a plain paste
 * into the import box works with nothing to configure. Only two fields exist
 * there, so the sentence rides along on the back, where it is still useful.
 */
export function toQuizlet(entries: VaultEntry[], options: ExportOptions): string {
  return entries
    .map((entry) => {
      const front = entry.article ? `${entry.article} ${entry.lemma}` : entry.lemma;
      const translation = entry.translations[options.lang].join(", ");
      const back =
        options.includeContext === false ? translation : `${translation} — ${entry.context.de}`;
      return `${escapeField(front)}\t${escapeField(back)}`;
    })
    .join("\n");
}

/**
 * Notion builds a database from a CSV whose first row is the column names, and
 * it types the columns from what it finds. Dates are given as ISO so it reads
 * them as dates rather than text, which is what makes the review queue
 * sortable once it is in there.
 */
export function toNotionCsv(entries: VaultEntry[], options: ExportOptions): string {
  const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const header = ["Word", "Article", "Plural", "Part of speech", "Translation", "Sentence", "Sentence translation", "Episode", "Timestamp", "Level", "Due", "Saved"];
  const rows = entries.map((entry) =>
    [
      entry.lemma,
      entry.article ?? "",
      entry.plural ?? "",
      entry.pos,
      entry.translations[options.lang].join(", "),
      entry.context.de,
      (options.lang === "en" ? entry.context.en : entry.context.vi) ?? "",
      entry.context.episodeTitle,
      formatTimestamp(entry.context.start),
      entry.context.cefr,
      entry.srs.due,
      entry.savedAt,
    ]
      .map(quote)
      .join(","),
  );
  return [header.join(","), ...rows].join("\n");
}

/**
 * One Markdown note for Obsidian.
 *
 * Written to be useful twice: readable as a note on its own, and directly
 * reviewable by the Spaced Repetition plugin, which turns any `front::back`
 * line into a card. Frontmatter carries the counts so the note sorts and
 * queries alongside the rest of a vault.
 */
export function toObsidianMarkdown(entries: VaultEntry[], options: ExportOptions): string {
  const today = new Date().toISOString().slice(0, 10);
  const out: string[] = [
    "---",
    "tags: [german, hoerbar]",
    `exported: ${today}`,
    `words: ${entries.length}`,
    "---",
    "",
    "# German vocabulary",
    "",
    `Exported from Hörbar on ${today}. Lines written as \`front::back\` are picked up`,
    "by the Spaced Repetition plugin as cards.",
    "",
  ];

  const byEpisode = new Map<string, VaultEntry[]>();
  for (const entry of entries) {
    const key = entry.context.episodeTitle || "Unsorted";
    const list = byEpisode.get(key) ?? [];
    list.push(entry);
    byEpisode.set(key, list);
  }

  for (const [episode, list] of byEpisode) {
    out.push(`## ${episode}`, "");
    for (const entry of list) {
      const front = entry.article ? `${entry.article} ${entry.lemma}` : entry.lemma;
      const plural = entry.plural ? ` (pl. ${entry.plural})` : "";
      const translation = entry.translations[options.lang].join(", ");
      out.push(`**${front}${plural}**::${translation}`);
      if (options.includeContext !== false) {
        out.push(`> ${entry.context.de}`);
        const gloss = options.lang === "en" ? entry.context.en : entry.context.vi;
        if (gloss) out.push(`> *${gloss}*`);
      }
      out.push(`<small>${entry.context.cefr} · ${formatTimestamp(entry.context.start)}</small>`, "");
    }
  }

  return out.join("\n");
}

/** A line of timed text, which is all a subtitle file is. */
export interface TimedLine {
  at: number;
  until: number;
  de: string;
  translation?: string;
}

function clockSrt(seconds: number): string {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const rest = ms % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(rest).padStart(3, "0")}`;
}

function clockVtt(seconds: number): string {
  return clockSrt(seconds).replace(",", ".");
}

export type SubtitleFlavour = "original" | "both" | "translated";

function subtitleText(line: TimedLine, flavour: SubtitleFlavour): string | null {
  if (flavour === "original") return line.de;
  if (flavour === "translated") return line.translation ?? null;
  return line.translation ? `${line.de}\n${line.translation}` : line.de;
}

/**
 * SubRip. Every player made in the last twenty years reads it, which is the
 * point: a transcript captured here should be usable in VLC, on a TV, or in
 * whatever the learner already watches things in.
 */
export function toSrt(lines: TimedLine[], flavour: SubtitleFlavour = "both"): string {
  const blocks: string[] = [];
  let index = 1;
  for (const line of lines) {
    const text = subtitleText(line, flavour);
    if (!text) continue;
    // A cue with no duration never renders, and rounding can produce one.
    const end = Math.max(line.until, line.at + 0.2);
    blocks.push(`${index}\n${clockSrt(line.at)} --> ${clockSrt(end)}\n${text}\n`);
    index += 1;
  }
  return blocks.join("\n");
}

/** WebVTT, which is what a browser's own <track> element wants. */
export function toVtt(lines: TimedLine[], flavour: SubtitleFlavour = "both"): string {
  const blocks: string[] = ["WEBVTT", ""];
  for (const line of lines) {
    const text = subtitleText(line, flavour);
    if (!text) continue;
    const end = Math.max(line.until, line.at + 0.2);
    blocks.push(`${clockVtt(line.at)} --> ${clockVtt(end)}\n${text}\n`);
  }
  return blocks.join("\n");
}
