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
    query: "Coffee Break German",
    label: "Coffee Break German",
    publisher: "Coffee Break Languages",
    cefr: "A1",
    why: "Structured lessons that explain as they go. A gentle first listen.",
    topics: ["Learners", "Course"],
  },
  {
    query: "Deutsch Warum Nicht",
    label: "Deutsch - warum nicht?",
    publisher: "Deutsche Welle",
    cefr: "A1",
    why: "The classic DW radio course, story-driven and slow.",
    topics: ["Learners", "Course"],
  },
  {
    query: "Der Trapp Podcast Deutsch lernen",
    label: "Deutsch lernen mit Geschichten",
    publisher: "Various",
    cefr: "A2",
    why: "Short stories retold at learner pace, then discussed.",
    topics: ["Learners", "Stories"],
  },
  {
    query: "Dinge Erklärt Kurzgesagt",
    label: "Dinge Erklärt - Kurzgesagt",
    publisher: "Kurzgesagt",
    cefr: "B1",
    why: "Big questions answered in eight minutes, with visuals to lean on.",
    topics: ["Science", "Video"],
  },
  {
    query: "Gemischtes Hack",
    label: "Gemischtes Hack",
    publisher: "Felix Lobrecht, Tommi Schmitt",
    cefr: "C1",
    why: "Fast, slangy, unscripted comedy. The hardest listening on this list.",
    topics: ["Comedy", "Colloquial"],
  },
  {
    query: "Fest und Flauschig",
    label: "Fest & Flauschig",
    publisher: "Jan Böhmermann, Olli Schulz",
    cefr: "C1",
    why: "Two friends talking over each other. Irony, register shifts, interruptions.",
    topics: ["Comedy", "Colloquial"],
  },
  {
    query: "Zeit Verbrechen",
    label: "ZEIT Verbrechen",
    publisher: "ZEIT ONLINE",
    cefr: "B2",
    why: "True crime told as a conversation. Narrative structure makes it followable.",
    topics: ["True crime", "Society"],
  },
  {
    query: "Geschichten aus der Geschichte",
    label: "Geschichten aus der Geschichte",
    publisher: "Richard Hemmer, Daniel Meßner",
    cefr: "B2",
    why: "History told to a friend who does not know it yet. Clear and structured.",
    topics: ["History"],
  },
  {
    query: "Doppelgänger Tech Talk",
    label: "Doppelgänger Tech Talk",
    publisher: "Doppelgänger",
    cefr: "C1",
    why: "Tech and markets, twice a week, dense with Anglicisms.",
    topics: ["Business", "Tech"],
  },
  {
    query: "Finanzfluss",
    label: "Finanzfluss",
    publisher: "Finanzfluss",
    cefr: "B2",
    why: "Personal finance explained plainly. Useful vocabulary for anyone working here.",
    topics: ["Business", "Finance"],
  },
  {
    query: "Kicker Podcast Fussball",
    label: "kicker Fußball-Podcast",
    publisher: "kicker",
    cefr: "B2",
    why: "Football talk. Fast, idiomatic, and endlessly repetitive in a way that helps.",
    topics: ["Sport"],
  },
  {
    query: "Rasenfunk",
    label: "Rasenfunk",
    publisher: "Rasenfunk",
    cefr: "C1",
    why: "Long-form football analysis. Precise, opinionated, quick.",
    topics: ["Sport"],
  },
  {
    query: "Der Tag Deutschlandfunk",
    label: "Der Tag",
    publisher: "Deutschlandfunk",
    cefr: "C1",
    why: "The day's story taken apart in half an hour.",
    topics: ["News", "Analysis"],
  },
  {
    query: "Apokalypse und Filterkaffee",
    label: "Apokalypse & Filterkaffee",
    publisher: "Micky Beisenherz",
    cefr: "C1",
    why: "Morning news review with a guest. Conversational and fast.",
    topics: ["News", "Comedy"],
  },
  {
    query: "Baywatch Berlin",
    label: "Baywatch Berlin",
    publisher: "Klaas Heufer-Umlauf",
    cefr: "C2",
    why: "Three comedians riffing. Wordplay, in-jokes, no concessions.",
    topics: ["Comedy", "Colloquial"],
  },
  {
    query: "Psychologie to go",
    label: "Psychologie to go!",
    publisher: "Franca Cerutti",
    cefr: "B2",
    why: "Psychology explained calmly and clearly by a practitioner.",
    topics: ["Psychology", "Society"],
  },
  {
    query: "Eine Stunde History",
    label: "Eine Stunde History",
    publisher: "Deutschlandfunk Nova",
    cefr: "B2",
    why: "One historical episode per week, with historians interviewed.",
    topics: ["History"],
  },
  {
    query: "Update Wirtschaft",
    label: "Update Wirtschaft",
    publisher: "tagesschau",
    cefr: "C1",
    why: "Daily business briefing in five minutes. Numbers-heavy.",
    topics: ["Business", "News"],
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


/**
 * News, current affairs and documentary output that ships audio or video.
 *
 * These are broadcasters rather than podcast studios, which matters for a
 * learner: bulletin German is the most transferable register there is, and the
 * same broadcasters publish at several speeds, from deliberately slow learner
 * bulletins to full-speed evening news.
 */
export const NEWS_SOURCES: Suggestion[] = [
  { query: "Nachrichtenleicht Deutschlandfunk", label: "Nachrichtenleicht", publisher: "Deutschlandfunk", cefr: "A1", why: "Weekly news in deliberately simple German.", topics: ["News", "Easy German"] },
  { query: "DW Langsam gesprochene Nachrichten", label: "Langsam gesprochene Nachrichten", publisher: "Deutsche Welle", cefr: "A2", why: "The day's bulletin read slowly, then again at normal speed.", topics: ["News"] },
  { query: "tagesschau in 100 Sekunden", label: "tagesschau in 100 Sekunden", publisher: "ARD", cefr: "B2", why: "The whole news day in a hundred seconds. Very dense, very fast.", topics: ["News"] },
  { query: "tagesschau", label: "tagesschau", publisher: "ARD", cefr: "B2", why: "Germany's main evening bulletin, as audio and video.", topics: ["News", "Video"] },
  { query: "heute journal ZDF", label: "heute journal", publisher: "ZDF", cefr: "C1", why: "Evening news with analysis and interviews.", topics: ["News", "Video"] },
  { query: "Deutschlandfunk Nachrichten", label: "Deutschlandfunk Nachrichten", publisher: "Deutschlandfunk", cefr: "B2", why: "Hourly public radio bulletins, updated all day.", topics: ["News", "Radio"] },
  { query: "WDR aktuell", label: "WDR aktuell", publisher: "WDR", cefr: "B2", why: "Regional news from Germany's largest broadcaster.", topics: ["News", "Regional"] },
  { query: "SWR Aktuell", label: "SWR Aktuell", publisher: "SWR", cefr: "B2", why: "Southwest regional news, with a noticeably softer accent.", topics: ["News", "Regional"] },
  { query: "BR24", label: "BR24", publisher: "Bayerischer Rundfunk", cefr: "B2", why: "Bavarian news. Good exposure to southern pronunciation.", topics: ["News", "Regional"] },
  { query: "NDR Info", label: "NDR Info", publisher: "NDR", cefr: "B2", why: "Northern news and background, famously clear diction.", topics: ["News", "Regional"] },
  { query: "ZDF heute Nachrichten", label: "ZDF heute", publisher: "ZDF", cefr: "B1", why: "Mainstream evening news, shorter sentences than heute journal.", topics: ["News", "Video"] },
  { query: "Deutsche Welle Nachrichten", label: "DW Nachrichten", publisher: "Deutsche Welle", cefr: "B1", why: "International news written for a global audience, so unusually plain.", topics: ["News"] },
  { query: "Terra X", label: "Terra X", publisher: "ZDF", cefr: "B2", why: "Documentary narration: measured pace, rich vocabulary.", topics: ["Documentary", "Science"] },
  { query: "Quarks", label: "Quarks", publisher: "WDR", cefr: "B2", why: "Science explained for a general audience.", topics: ["Science"] },
  { query: "Deutschlandfunk Hintergrund", label: "Hintergrund", publisher: "Deutschlandfunk", cefr: "C1", why: "Long-form background reporting on one story.", topics: ["Analysis"] },
];

/** Everything, for the category browser. */
export const ALL_SUGGESTIONS: Suggestion[] = [...SUGGESTIONS, ...NEWS_SOURCES];

export function topicsOf(items: Suggestion[]): string[] {
  return [...new Set(items.flatMap((item) => item.topics))].sort((a, b) => a.localeCompare(b));
}

export function byTopic(items: Suggestion[], topic: string): Suggestion[] {
  return topic ? items.filter((item) => item.topics.includes(topic)) : items;
}

export function suggestionsByLevel(items: Suggestion[] = ALL_SUGGESTIONS): Array<{ cefr: Cefr; items: Suggestion[] }> {
  const grouped = new Map<Cefr, Suggestion[]>();
  for (const item of items) {
    const list = grouped.get(item.cefr) ?? [];
    list.push(item);
    grouped.set(item.cefr, list);
  }
  return [...grouped.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([cefr, items]) => ({ cefr, items }));
}
