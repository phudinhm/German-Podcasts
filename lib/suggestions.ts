import type { Cefr } from "./types";

/**
 * Shows worth starting from, by level.
 *
 * These are search terms rather than hard-coded feed URLs on purpose: a feed
 * address changes when a publisher moves host, and a stale URL fails silently.
 * A name goes through the same discovery path as anything the user types, so
 * these entries cannot rot in a way the rest of the app would not also hit.
 */
export interface Suggestion {
  /** What gets typed into discovery. */
  query: string;
  label: string;
  publisher: string;
  cefr: Cefr;
  why: string;
  topics: string[];
}

export const SUGGESTIONS: Suggestion[] = [
  {
    query: "Nachrichtenleicht",
    label: "Nachrichtenleicht",
    publisher: "Deutschlandfunk",
    cefr: "A1",
    why: "Weekly news in deliberately simple German. Very short sentences, clear delivery.",
    topics: ["News", "Easy German"],
  },
  {
    query: "Langsam gesprochene Nachrichten",
    label: "Langsam gesprochene Nachrichten",
    publisher: "Deutsche Welle",
    cefr: "A2",
    why: "The day's news read slowly on purpose. The classic bridge from A2 to B1.",
    topics: ["News"],
  },
  {
    query: "Slow German mit Annik Rubens",
    label: "Slow German",
    publisher: "Annik Rubens",
    cefr: "A2",
    why: "Monologues on everyday German culture, well under native pace.",
    topics: ["Culture", "Everyday life"],
  },
  {
    query: "Easy German",
    label: "Easy German",
    publisher: "Easy German",
    cefr: "B1",
    why: "Street interviews with subtitles. Real colloquial German in digestible portions.",
    topics: ["Interviews", "Colloquial"],
  },
  {
    query: "Deutsch lernen mit Nachrichten",
    label: "Deutsch lernen mit Nachrichten",
    publisher: "Various",
    cefr: "B1",
    why: "News rewritten for learners, with vocabulary explained as it goes.",
    topics: ["News", "Learners"],
  },
  {
    query: "Was jetzt ZEIT ONLINE",
    label: "Was jetzt?",
    publisher: "ZEIT ONLINE",
    cefr: "B2",
    why: "Daily news podcast with interviews. Journalistic register, normal pace.",
    topics: ["News", "Politics"],
  },
  {
    query: "Auf den Punkt Süddeutsche Zeitung",
    label: "Auf den Punkt",
    publisher: "Süddeutsche Zeitung",
    cefr: "B2",
    why: "One topic, one conversation, clear structure. A good on-ramp to C1 journalism.",
    topics: ["News", "Analysis"],
  },
  {
    query: "Quarks Daily",
    label: "Quarks Daily",
    publisher: "WDR",
    cefr: "B2",
    why: "Science explained for a general audience. Precise but not specialist.",
    topics: ["Science"],
  },
  {
    query: "Handelsblatt Today",
    label: "Handelsblatt Today",
    publisher: "Handelsblatt",
    cefr: "C1",
    why: "Business and markets daily. Specialist vocabulary, numbers, fast handovers.",
    topics: ["Business", "Finance"],
  },
  {
    query: "Lage der Nation",
    label: "Lage der Nation",
    publisher: "Lage der Nation",
    cefr: "C1",
    why: "Unscripted political review of the week, with interruptions and irony.",
    topics: ["Politics", "Analysis"],
  },
  {
    query: "OMR Podcast",
    label: "OMR Podcast",
    publisher: "OMR",
    cefr: "C1",
    why: "Long-form business and marketing interviews. Anglicisms and startup jargon throughout.",
    topics: ["Business", "Marketing"],
  },
  {
    query: "Alles gesagt ZEIT",
    label: "Alles gesagt?",
    publisher: "ZEIT ONLINE",
    cefr: "C2",
    why: "The interview that runs until the guest ends it. Everything real speech contains.",
    topics: ["Interviews", "Society"],
  },
];

export function suggestionsByLevel(): Array<{ cefr: Cefr; items: Suggestion[] }> {
  const grouped = new Map<Cefr, Suggestion[]>();
  for (const item of SUGGESTIONS) {
    const list = grouped.get(item.cefr) ?? [];
    list.push(item);
    grouped.set(item.cefr, list);
  }
  return [...grouped.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([cefr, items]) => ({ cefr, items }));
}
