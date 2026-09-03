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
  /** Watchable rather than only listenable, so the video filter can find it. */
  video?: boolean;
}

export const SUGGESTIONS: Suggestion[] = [
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
/**
 * Podcasts made for German speakers rather than for learners.
 *
 * This is where a learner goes once graded material stops teaching them
 * anything: the pace is native, the vocabulary is unrestricted, and the
 * subject is something worth an hour of attention. Grouped wide on purpose,
 * because interest carries a listener through difficulty better than any
 * grading does.
 */
export const NATIVE_SOURCES: Suggestion[] = [
  { query: "11KM der tagesschau Podcast", label: "11KM", publisher: "ARD", cefr: "B2", why: "One story a day, explained in eleven minutes by the reporter who covered it.", topics: ["News", "Analysis"] },
  { query: "Was jetzt ZEIT ONLINE", label: "Was jetzt?", publisher: "ZEIT ONLINE", cefr: "B2", why: "Twice-daily news briefing, clearly structured and easy to follow.", topics: ["News"] },
  { query: "Deutschlandfunk Nova Update", label: "Nova Update", publisher: "Deutschlandfunk Nova", cefr: "B1", why: "News for a young audience: plainer wording, faster delivery.", topics: ["News"] },
  { query: "Steingarts Morning Briefing", label: "Morning Briefing", publisher: "Pioneer", cefr: "C1", why: "Business and politics with strong opinions and a dense register.", topics: ["Business", "Politics"] },
  { query: "Alles auf Aktien", label: "Alles auf Aktien", publisher: "WELT", cefr: "C1", why: "Daily markets in fifteen minutes. Finance vocabulary at speed.", topics: ["Finance", "Business"] },
  { query: "Handelsblatt Morning Briefing", label: "Handelsblatt Morning Briefing", publisher: "Handelsblatt", cefr: "C1", why: "The business day ahead, read as a written column.", topics: ["Business", "Finance"] },
  { query: "Wirtschaft Welt und Weit", label: "Wirtschaft Welt & Weit", publisher: "Deutsche Welle", cefr: "B2", why: "Global economics for a general audience.", topics: ["Business"] },
  { query: "Zeit Verbrechen", label: "ZEIT Verbrechen", publisher: "ZEIT", cefr: "B2", why: "Two journalists retell a criminal case. Narrative, slow, gripping.", topics: ["True crime"] },
  { query: "Mordlust", label: "Mordlust", publisher: "Funk", cefr: "B2", why: "Two cases per episode with the legal reasoning explained.", topics: ["True crime"] },
  { query: "Verbrechen von nebenan", label: "Verbrechen von nebenan", publisher: "RTL+", cefr: "B2", why: "Small-town cases, told conversationally.", topics: ["True crime"] },
  { query: "Sprechen wir über Mord", label: "Sprechen wir über Mord?!", publisher: "MDR", cefr: "C1", why: "A judge and a journalist argue about real verdicts.", topics: ["True crime", "Law"] },
  { query: "Geschichten aus der Geschichte", label: "Geschichten aus der Geschichte", publisher: "Zeitsprung", cefr: "B2", why: "Two historians tell each other a story neither knew.", topics: ["History"] },
  { query: "His2Go Geschichte Podcast", label: "His2Go", publisher: "His2Go", cefr: "B2", why: "Long-form history, one episode per event.", topics: ["History"] },
  { query: "Zeitblende SRF", label: "Zeitblende", publisher: "SRF", cefr: "C1", why: "Swiss history. Useful exposure to Swiss standard German.", topics: ["History", "Swiss"] },
  { query: "Radiowissen Bayern 2", label: "radioWissen", publisher: "Bayerischer Rundfunk", cefr: "B2", why: "A well-made feature on one subject, scripted and clearly read.", topics: ["Science", "History"] },
  { query: "Das Wissen SWR", label: "Das Wissen", publisher: "SWR", cefr: "B2", why: "Daily knowledge feature, scripted and evenly paced.", topics: ["Science"] },
  { query: "Synapsen NDR", label: "Synapsen", publisher: "NDR Info", cefr: "C1", why: "A science journalist walks through one paper in depth.", topics: ["Science"] },
  { query: "IQ Wissenschaft und Forschung", label: "IQ", publisher: "Bayerischer Rundfunk", cefr: "B2", why: "Research news, short and well structured.", topics: ["Science"] },
  { query: "Forschung aktuell Deutschlandfunk", label: "Forschung aktuell", publisher: "Deutschlandfunk", cefr: "C1", why: "Daily research news at public-radio register.", topics: ["Science"] },
  { query: "Soziopod", label: "Soziopod", publisher: "Soziopod", cefr: "C1", why: "Philosophy and sociology argued out loud. Demanding and rewarding.", topics: ["Philosophy", "Society"] },
  { query: "Betreutes Fühlen", label: "Betreutes Fühlen", publisher: "Podimo", cefr: "B2", why: "A psychologist and a journalist on how minds work.", topics: ["Psychology"] },
  { query: "Hotel Matze", label: "Hotel Matze", publisher: "Matze Hielscher", cefr: "C1", why: "Long, patient interviews. Unscripted speech at its most natural.", topics: ["Interviews"] },
  { query: "Alles gesagt", label: "Alles gesagt?", publisher: "ZEIT", cefr: "C1", why: "The interview ends when the guest decides. Sometimes nine hours.", topics: ["Interviews"] },
  { query: "SWR1 Leute", label: "SWR1 Leute", publisher: "SWR", cefr: "B2", why: "An hour with one guest, at an unhurried radio pace.", topics: ["Interviews"] },
  { query: "Lage der Nation", label: "Lage der Nation", publisher: "Lage der Nation", cefr: "C1", why: "German politics explained weekly by a lawyer and a journalist.", topics: ["Politics"] },
  { query: "Apokalypse und Filterkaffee", label: "Apokalypse & Filterkaffee", publisher: "Micky Beisenherz", cefr: "C1", why: "The morning's news read sideways, fast and full of idiom.", topics: ["News", "Comedy"] },
  { query: "Baywatch Berlin", label: "Baywatch Berlin", publisher: "Studio Bummens", cefr: "C1", why: "Three friends, no topic. The hardest and funniest German here.", topics: ["Comedy"] },
  { query: "Fussball MML", label: "FUSSBALL MML", publisher: "Studio Bummens", cefr: "C1", why: "Football talk full of slang and interruption.", topics: ["Sport", "Colloquial"] },
  { query: "Rasenfunk", label: "Rasenfunk", publisher: "Rasenfunk", cefr: "C1", why: "Tactical football analysis at high speed.", topics: ["Sport"] },
  { query: "kicker Fussball Podcast", label: "kicker", publisher: "kicker", cefr: "B2", why: "Matchday reporting and analysis.", topics: ["Sport"] },
  { query: "OMR Podcast", label: "OMR Podcast", publisher: "OMR", cefr: "C1", why: "Founders and marketers interviewed at length.", topics: ["Business", "Tech"] },
  { query: "Doppelgänger Tech Talk", label: "Doppelgänger Tech Talk", publisher: "Doppelgänger", cefr: "C1", why: "Two investors on tech and markets. Heavy anglicism, very fast.", topics: ["Tech", "Finance"] },
  { query: "Finanzfluss Podcast", label: "Finanzfluss", publisher: "Finanzfluss", cefr: "B2", why: "Personal finance explained patiently and repeatedly.", topics: ["Finance"] },
  { query: "Lesart Deutschlandfunk Kultur", label: "Lesart", publisher: "Deutschlandfunk Kultur", cefr: "C1", why: "Daily books programme with author interviews.", topics: ["Books", "Culture"] },
  { query: "Ohrenbär", label: "Ohrenbär", publisher: "rbb", cefr: "A2", why: "Bedtime stories for children: short, slow, and complete every time.", topics: ["Stories", "Children"] },
  { query: "Die Sendung mit der Maus zum Hören", label: "Sendung mit der Maus", publisher: "WDR", cefr: "A2", why: "Explanations built for six-year-olds, which is exactly right at A2.", topics: ["Children", "Explainers"] },
  { query: "Kakadu Deutschlandfunk Kultur", label: "Kakadu", publisher: "Deutschlandfunk Kultur", cefr: "A2", why: "Children's radio: clear diction, concrete vocabulary.", topics: ["Children"] },
  { query: "Checker Tobi Podcast", label: "Checker Tobi", publisher: "Bayerischer Rundfunk", cefr: "B1", why: "One question per episode, answered by asking experts.", topics: ["Children", "Explainers"] },
  { query: "SRF News Plus", label: "SRF News Plus", publisher: "SRF", cefr: "C1", why: "Swiss news in standard German. A different accent to train on.", topics: ["News", "Swiss"] },
  { query: "Ö1 Journale", label: "Ö1 Journale", publisher: "ORF", cefr: "C1", why: "Austrian public radio bulletins. Austrian vocabulary and melody.", topics: ["News", "Austrian"] },
  { query: "FM4 Podcast", label: "FM4", publisher: "ORF", cefr: "C1", why: "Austrian youth radio, colloquial and quick.", topics: ["Culture", "Austrian"] },
  { query: "ARD Radio Tatort", label: "ARD Radio Tatort", publisher: "ARD", cefr: "C1", why: "Original radio crime drama. Several voices, atmosphere, no narrator.", topics: ["Drama", "Fiction"] },
  { query: "Die drei Fragezeichen", label: "Die drei ???", publisher: "Europa", cefr: "B1", why: "The audio drama a generation of Germans grew up on.", topics: ["Drama", "Fiction"] },
  { query: "Zeitfragen Deutschlandfunk Kultur", label: "Zeitfragen", publisher: "Deutschlandfunk Kultur", cefr: "C1", why: "Culture and society features, scripted and dense.", topics: ["Society", "Culture"] },
  { query: "Der Rest ist Geschichte", label: "Der Rest ist Geschichte", publisher: "ZDF", cefr: "B2", why: "Historical background to what is in the news now.", topics: ["History", "News"] },
];

/**
 * YouTube channels.
 *
 * A channel's public Atom feed lists its recent uploads without a key, so
 * these behave like any other subscription. Video matters for a learner in a
 * way it does not for a native listener: lip movement, gesture and the scene
 * itself carry meaning the ear has not yet learned to take from the sound.
 *
 * Named rather than linked, for the same reason as every other entry here. A
 * handle written into this file is a guess about someone else's URL, and a
 * guess that is even slightly wrong fails as a bare 404. A name goes through
 * the same resolution as anything typed into the search box, which tries the
 * obvious addresses and then simply searches.
 */
export const YOUTUBE_SOURCES: Suggestion[] = [
  { query: "Easy German", label: "Easy German", publisher: "Easy German", cefr: "A2", why: "Street interviews with German and English subtitles burnt in.", topics: ["Interviews", "Colloquial"], video: true },
  { query: "DW Deutsch lernen", label: "DW Deutsch lernen", publisher: "Deutsche Welle", cefr: "A1", why: "The full A1 to C2 course library, free and structured.", topics: ["Learners", "Course"], video: true },
  { query: "Learn German with Anja", label: "Learn German with Anja", publisher: "Anja", cefr: "A1", why: "Grammar taught slowly and very deliberately.", topics: ["Learners", "Grammar"], video: true },
  { query: "Deutsch mit Marija", label: "Deutsch mit Marija", publisher: "Marija", cefr: "A2", why: "Grammar and everyday phrasing, spoken clearly throughout.", topics: ["Learners", "Grammar"], video: true },
  { query: "Deutsch mit Benjamin", label: "Deutsch mit Benjamin", publisher: "Benjamin", cefr: "B1", why: "Explanations entirely in German at a manageable pace.", topics: ["Learners"], video: true },
  { query: "Get Germanized", label: "Get Germanized", publisher: "Dominik Hammes", cefr: "B1", why: "Language and culture, bilingual where it helps.", topics: ["Learners", "Culture"], video: true },
  { query: "Dinge Erklärt – Kurzgesagt", label: "Dinge Erklärt – Kurzgesagt", publisher: "Kurzgesagt", cefr: "B1", why: "Big questions animated. Pictures carry half the meaning.", topics: ["Science", "Explainers"], video: true },
  { query: "MrWissen2go", label: "MrWissen2go", publisher: "Mirko Drotschmann", cefr: "B2", why: "Current affairs explained by a former news journalist.", topics: ["News", "Explainers"], video: true },
  { query: "MrWissen2go Geschichte", label: "MrWissen2go Geschichte", publisher: "Mirko Drotschmann", cefr: "B2", why: "History with maps and archive footage to lean on.", topics: ["History"], video: true },
  { query: "maiLab", label: "maiLab", publisher: "Mai Thi Nguyen-Kim", cefr: "C1", why: "Science argued carefully. Fast, precise, technical.", topics: ["Science"], video: true },
  { query: "Simplicissimus", label: "Simplicissimus", publisher: "Simplicissimus", cefr: "C1", why: "Well-researched essays on how things actually work.", topics: ["Explainers", "Society"], video: true },
  { query: "STRG_F", label: "STRG_F", publisher: "NDR / funk", cefr: "C1", why: "Investigative reporting, on location and unscripted.", topics: ["Documentary"], video: true },
  { query: "Y-Kollektiv", label: "Y-Kollektiv", publisher: "funk", cefr: "C1", why: "First-person documentaries from inside the story.", topics: ["Documentary"], video: true },
  { query: "Doktor Whatson", label: "Doktor Whatson", publisher: "Cedric Engels", cefr: "B2", why: "Technology and science explained without jargon.", topics: ["Science", "Tech"], video: true },
  { query: "Breaking Lab", label: "Breaking Lab", publisher: "Jacob Beautemps", cefr: "B2", why: "Energy and climate technology, numbers on screen.", topics: ["Science"], video: true },
  { query: "tagesschau", label: "tagesschau", publisher: "ARD", cefr: "B2", why: "The evening bulletin, with the pictures that go with it.", topics: ["News"], video: true },
  { query: "ZDFheute Nachrichten", label: "ZDFheute Nachrichten", publisher: "ZDF", cefr: "B1", why: "News clips short enough to shadow one at a time.", topics: ["News"], video: true },
  { query: "logo!", label: "logo!", publisher: "ZDF", cefr: "A2", why: "The news written for children. The gentlest real news in German.", topics: ["News", "Children"], video: true },
  { query: "Sendung mit der Maus", label: "Sendung mit der Maus", publisher: "WDR", cefr: "A2", why: "How things are made, shown as well as said.", topics: ["Children", "Explainers"], video: true },
  { query: "Terra X", label: "Terra X", publisher: "ZDF", cefr: "B2", why: "Documentary narration over documentary pictures.", topics: ["Documentary", "History"], video: true },
  { query: "Quarks", label: "Quarks", publisher: "WDR", cefr: "B2", why: "Science television, clearly narrated.", topics: ["Science"], video: true },
  { query: "DW Dokumentation", label: "DW Dokumentation", publisher: "Deutsche Welle", cefr: "B2", why: "Full-length documentaries, often with German subtitles.", topics: ["Documentary"], video: true },
  { query: "Auf Klo", label: "Auf Klo", publisher: "funk", cefr: "B2", why: "Personal conversations in the smallest room. Unfiltered speech.", topics: ["Interviews", "Colloquial"], video: true },
  { query: "Die Da Oben!", label: "Die Da Oben!", publisher: "funk", cefr: "B2", why: "Politics explained for people who find politics tiring.", topics: ["Politics"], video: true },
  { query: "Wissen macht Ah!", label: "Wissen macht Ah!", publisher: "WDR", cefr: "A2", why: "Small questions answered with a demonstration.", topics: ["Children", "Explainers"], video: true },
];

/**
 * Everything, with duplicates folded away.
 *
 * The lists overlap deliberately - a show can be both a news source and a good
 * first podcast - and the label is the identity, because two entries pointing
 * at the same show under different search terms are still one show.
 */
export const ALL_SUGGESTIONS: Suggestion[] = (() => {
  const seen = new Set<string>();
  const all: Suggestion[] = [];
  for (const item of [...SUGGESTIONS, ...NEWS_SOURCES, ...NATIVE_SOURCES, ...YOUTUBE_SOURCES]) {
    const key = `${item.label.toLowerCase()}|${item.video ? "v" : "a"}`;
    if (seen.has(key)) continue;
    seen.add(key);
    all.push(item);
  }
  return all;
})();

/** Only what can be watched, for the video filter. */
export function videoOnly(items: Suggestion[]): Suggestion[] {
  return items.filter((item) => item.video);
}

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
