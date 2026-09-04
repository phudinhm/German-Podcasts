
/**
 * Shows worth starting from, by level.
 *
 * These are search terms rather than hard-coded feed URLs on purpose: a feed
 * address changes when a publisher moves host, and a stale URL fails silently.
 * A name goes through the same discovery path as anything the user types, so
 * these entries cannot rot in a way the rest of the app would not also hit.
 */
import type { Cefr } from "./types";

export type SourceLang = "de" | "en";

export interface Suggestion {
  /** What gets typed into discovery. */
  query: string;
  label: string;
  publisher: string;
  lang: SourceLang;
  /**
   * Rough listening difficulty, for German only. It is a genuinely useful
   * filter for a learner deciding what they can follow today, and meaningless
   * for a native-language feed, so it is optional rather than faked.
   */
  cefr?: Cefr;
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
    lang: "de",
    cefr: "B2",
    why: "True crime told as a conversation. Narrative structure makes it followable.",
    topics: ["True crime", "Society"],
  },
  {
    query: "Geschichten aus der Geschichte",
    label: "Geschichten aus der Geschichte",
    publisher: "Richard Hemmer, Daniel Meßner",
    lang: "de",
    cefr: "B2",
    why: "History told to a friend who does not know it yet. Clear and structured.",
    topics: ["History"],
  },
  {
    query: "Doppelgänger Tech Talk",
    label: "Doppelgänger Tech Talk",
    publisher: "Doppelgänger",
    lang: "de",
    cefr: "C1",
    why: "Tech and markets, twice a week, dense with Anglicisms.",
    topics: ["Business", "Tech"],
  },
  {
    query: "Finanzfluss",
    label: "Finanzfluss",
    publisher: "Finanzfluss",
    lang: "de",
    cefr: "B2",
    why: "Personal finance explained plainly. Useful vocabulary for anyone working here.",
    topics: ["Business", "Finance"],
  },
  {
    query: "Kicker Podcast Fussball",
    label: "kicker Fußball-Podcast",
    publisher: "kicker",
    lang: "de",
    cefr: "B2",
    why: "Football talk. Fast, idiomatic, and endlessly repetitive in a way that helps.",
    topics: ["Sport"],
  },
  {
    query: "Rasenfunk",
    label: "Rasenfunk",
    publisher: "Rasenfunk",
    lang: "de",
    cefr: "C1",
    why: "Long-form football analysis. Precise, opinionated, quick.",
    topics: ["Sport"],
  },
  {
    query: "Der Tag Deutschlandfunk",
    label: "Der Tag",
    publisher: "Deutschlandfunk",
    lang: "de",
    cefr: "C1",
    why: "The day's story taken apart in half an hour.",
    topics: ["News", "Analysis"],
  },
  {
    query: "Apokalypse und Filterkaffee",
    label: "Apokalypse & Filterkaffee",
    publisher: "Micky Beisenherz",
    lang: "de",
    cefr: "C1",
    why: "Morning news review with a guest. Conversational and fast.",
    topics: ["News", "Comedy"],
  },
  {
    query: "Baywatch Berlin",
    label: "Baywatch Berlin",
    publisher: "Klaas Heufer-Umlauf",
    lang: "de",
    cefr: "C1",
    why: "Three comedians riffing. Wordplay, in-jokes, no concessions.",
    topics: ["Comedy", "Colloquial"],
  },
  {
    query: "Psychologie to go",
    label: "Psychologie to go!",
    publisher: "Franca Cerutti",
    lang: "de",
    cefr: "B2",
    why: "Psychology explained calmly and clearly by a practitioner.",
    topics: ["Psychology", "Society"],
  },
  {
    query: "Eine Stunde History",
    label: "Eine Stunde History",
    publisher: "Deutschlandfunk Nova",
    lang: "de",
    cefr: "B2",
    why: "One historical episode per week, with historians interviewed.",
    topics: ["History"],
  },
  {
    query: "Update Wirtschaft",
    label: "Update Wirtschaft",
    publisher: "tagesschau",
    lang: "de",
    cefr: "C1",
    why: "Daily business briefing in five minutes. Numbers-heavy.",
    topics: ["Business", "News"],
  },
  {
    query: "Alles gesagt ZEIT",
    label: "Alles gesagt?",
    publisher: "ZEIT ONLINE",
    lang: "de",
    cefr: "C1",
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
  { query: "Nachrichtenleicht Deutschlandfunk", label: "Nachrichtenleicht", publisher: "Deutschlandfunk", lang: "de", cefr: "A1", why: "Weekly news in deliberately simple German.", topics: ["News", "Easy German"] },
  { query: "DW Langsam gesprochene Nachrichten", label: "Langsam gesprochene Nachrichten", publisher: "Deutsche Welle", lang: "de", cefr: "A2", why: "The day's bulletin read slowly, then again at normal speed.", topics: ["News"] },
  { query: "tagesschau in 100 Sekunden", label: "tagesschau in 100 Sekunden", publisher: "ARD", lang: "de", cefr: "B2", why: "The whole news day in a hundred seconds. Very dense, very fast.", topics: ["News"] },
  { query: "tagesschau", label: "tagesschau", publisher: "ARD", lang: "de", cefr: "B2", why: "Germany's main evening bulletin, as audio and video.", topics: ["News", "Video"] },
  { query: "heute journal ZDF", label: "heute journal", publisher: "ZDF", lang: "de", cefr: "C1", why: "Evening news with analysis and interviews.", topics: ["News", "Video"] },
  { query: "Deutschlandfunk Nachrichten", label: "Deutschlandfunk Nachrichten", publisher: "Deutschlandfunk", lang: "de", cefr: "B2", why: "Hourly public radio bulletins, updated all day.", topics: ["News", "Radio"] },
  { query: "WDR aktuell", label: "WDR aktuell", publisher: "WDR", lang: "de", cefr: "B2", why: "Regional news from Germany's largest broadcaster.", topics: ["News", "Regional"] },
  { query: "SWR Aktuell", label: "SWR Aktuell", publisher: "SWR", lang: "de", cefr: "B2", why: "Southwest regional news, with a noticeably softer accent.", topics: ["News", "Regional"] },
  { query: "BR24", label: "BR24", publisher: "Bayerischer Rundfunk", lang: "de", cefr: "B2", why: "Bavarian news. Good exposure to southern pronunciation.", topics: ["News", "Regional"] },
  { query: "NDR Info", label: "NDR Info", publisher: "NDR", lang: "de", cefr: "B2", why: "Northern news and background, famously clear diction.", topics: ["News", "Regional"] },
  { query: "ZDF heute Nachrichten", label: "ZDF heute", publisher: "ZDF", lang: "de", cefr: "B1", why: "Mainstream evening news, shorter sentences than heute journal.", topics: ["News", "Video"] },
  { query: "Deutsche Welle Nachrichten", label: "DW Nachrichten", publisher: "Deutsche Welle", lang: "de", cefr: "B1", why: "International news written for a global audience, so unusually plain.", topics: ["News"] },
  { query: "Terra X", label: "Terra X", publisher: "ZDF", lang: "de", cefr: "B2", why: "Documentary narration: measured pace, rich vocabulary.", topics: ["Documentary", "Science"] },
  { query: "Quarks", label: "Quarks", publisher: "WDR", lang: "de", cefr: "B2", why: "Science explained for a general audience.", topics: ["Science"] },
  { query: "Deutschlandfunk Hintergrund", label: "Hintergrund", publisher: "Deutschlandfunk", lang: "de", cefr: "C1", why: "Long-form background reporting on one story.", topics: ["Analysis"] },
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
  { query: "11KM der tagesschau Podcast", label: "11KM", publisher: "ARD", lang: "de", cefr: "B2", why: "One story a day, explained in eleven minutes by the reporter who covered it.", topics: ["News", "Analysis"] },
  { query: "Was jetzt ZEIT ONLINE", label: "Was jetzt?", publisher: "ZEIT ONLINE", lang: "de", cefr: "B2", why: "Twice-daily news briefing, clearly structured and easy to follow.", topics: ["News"] },
  { query: "Deutschlandfunk Nova Update", label: "Nova Update", publisher: "Deutschlandfunk Nova", lang: "de", cefr: "B1", why: "News for a young audience: plainer wording, faster delivery.", topics: ["News"] },
  { query: "Steingarts Morning Briefing", label: "Morning Briefing", publisher: "Pioneer", lang: "de", cefr: "C1", why: "Business and politics with strong opinions and a dense register.", topics: ["Business", "Politics"] },
  { query: "Alles auf Aktien", label: "Alles auf Aktien", publisher: "WELT", lang: "de", cefr: "C1", why: "Daily markets in fifteen minutes. Finance vocabulary at speed.", topics: ["Finance", "Business"] },
  { query: "Handelsblatt Morning Briefing", label: "Handelsblatt Morning Briefing", publisher: "Handelsblatt", lang: "de", cefr: "C1", why: "The business day ahead, read as a written column.", topics: ["Business", "Finance"] },
  { query: "Wirtschaft Welt und Weit", label: "Wirtschaft Welt & Weit", publisher: "Deutsche Welle", lang: "de", cefr: "B2", why: "Global economics for a general audience.", topics: ["Business"] },
  { query: "Zeit Verbrechen", label: "ZEIT Verbrechen", publisher: "ZEIT", lang: "de", cefr: "B2", why: "Two journalists retell a criminal case. Narrative, slow, gripping.", topics: ["True crime"] },
  { query: "Mordlust", label: "Mordlust", publisher: "Funk", lang: "de", cefr: "B2", why: "Two cases per episode with the legal reasoning explained.", topics: ["True crime"] },
  { query: "Verbrechen von nebenan", label: "Verbrechen von nebenan", publisher: "RTL+", lang: "de", cefr: "B2", why: "Small-town cases, told conversationally.", topics: ["True crime"] },
  { query: "Sprechen wir über Mord", label: "Sprechen wir über Mord?!", publisher: "MDR", lang: "de", cefr: "C1", why: "A judge and a journalist argue about real verdicts.", topics: ["True crime", "Law"] },
  { query: "Geschichten aus der Geschichte", label: "Geschichten aus der Geschichte", publisher: "Zeitsprung", lang: "de", cefr: "B2", why: "Two historians tell each other a story neither knew.", topics: ["History"] },
  { query: "His2Go Geschichte Podcast", label: "His2Go", publisher: "His2Go", lang: "de", cefr: "B2", why: "Long-form history, one episode per event.", topics: ["History"] },
  { query: "Zeitblende SRF", label: "Zeitblende", publisher: "SRF", lang: "de", cefr: "C1", why: "Swiss history. Useful exposure to Swiss standard German.", topics: ["History", "Swiss"] },
  { query: "Radiowissen Bayern 2", label: "radioWissen", publisher: "Bayerischer Rundfunk", lang: "de", cefr: "B2", why: "A well-made feature on one subject, scripted and clearly read.", topics: ["Science", "History"] },
  { query: "Das Wissen SWR", label: "Das Wissen", publisher: "SWR", lang: "de", cefr: "B2", why: "Daily knowledge feature, scripted and evenly paced.", topics: ["Science"] },
  { query: "Synapsen NDR", label: "Synapsen", publisher: "NDR Info", lang: "de", cefr: "C1", why: "A science journalist walks through one paper in depth.", topics: ["Science"] },
  { query: "IQ Wissenschaft und Forschung", label: "IQ", publisher: "Bayerischer Rundfunk", lang: "de", cefr: "B2", why: "Research news, short and well structured.", topics: ["Science"] },
  { query: "Forschung aktuell Deutschlandfunk", label: "Forschung aktuell", publisher: "Deutschlandfunk", lang: "de", cefr: "C1", why: "Daily research news at public-radio register.", topics: ["Science"] },
  { query: "Soziopod", label: "Soziopod", publisher: "Soziopod", lang: "de", cefr: "C1", why: "Philosophy and sociology argued out loud. Demanding and rewarding.", topics: ["Philosophy", "Society"] },
  { query: "Betreutes Fühlen", label: "Betreutes Fühlen", publisher: "Podimo", lang: "de", cefr: "B2", why: "A psychologist and a journalist on how minds work.", topics: ["Psychology"] },
  { query: "Hotel Matze", label: "Hotel Matze", publisher: "Matze Hielscher", lang: "de", cefr: "C1", why: "Long, patient interviews. Unscripted speech at its most natural.", topics: ["Interviews"] },
  { query: "Alles gesagt", label: "Alles gesagt?", publisher: "ZEIT", lang: "de", cefr: "C1", why: "The interview ends when the guest decides. Sometimes nine hours.", topics: ["Interviews"] },
  { query: "SWR1 Leute", label: "SWR1 Leute", publisher: "SWR", lang: "de", cefr: "B2", why: "An hour with one guest, at an unhurried radio pace.", topics: ["Interviews"] },
  { query: "Lage der Nation", label: "Lage der Nation", publisher: "Lage der Nation", lang: "de", cefr: "C1", why: "German politics explained weekly by a lawyer and a journalist.", topics: ["Politics"] },
  { query: "Apokalypse und Filterkaffee", label: "Apokalypse & Filterkaffee", publisher: "Micky Beisenherz", lang: "de", cefr: "C1", why: "The morning's news read sideways, fast and full of idiom.", topics: ["News", "Comedy"] },
  { query: "Baywatch Berlin", label: "Baywatch Berlin", publisher: "Studio Bummens", lang: "de", cefr: "C1", why: "Three friends, no topic. The hardest and funniest German here.", topics: ["Comedy"] },
  { query: "Fussball MML", label: "FUSSBALL MML", publisher: "Studio Bummens", lang: "de", cefr: "C1", why: "Football talk full of slang and interruption.", topics: ["Sport", "Colloquial"] },
  { query: "Rasenfunk", label: "Rasenfunk", publisher: "Rasenfunk", lang: "de", cefr: "C1", why: "Tactical football analysis at high speed.", topics: ["Sport"] },
  { query: "kicker Fussball Podcast", label: "kicker", publisher: "kicker", lang: "de", cefr: "B2", why: "Matchday reporting and analysis.", topics: ["Sport"] },
  { query: "OMR Podcast", label: "OMR Podcast", publisher: "OMR", lang: "de", cefr: "C1", why: "Founders and marketers interviewed at length.", topics: ["Business", "Tech"] },
  { query: "Doppelgänger Tech Talk", label: "Doppelgänger Tech Talk", publisher: "Doppelgänger", lang: "de", cefr: "C1", why: "Two investors on tech and markets. Heavy anglicism, very fast.", topics: ["Tech", "Finance"] },
  { query: "Finanzfluss Podcast", label: "Finanzfluss", publisher: "Finanzfluss", lang: "de", cefr: "B2", why: "Personal finance explained patiently and repeatedly.", topics: ["Finance"] },
  { query: "Lesart Deutschlandfunk Kultur", label: "Lesart", publisher: "Deutschlandfunk Kultur", lang: "de", cefr: "C1", why: "Daily books programme with author interviews.", topics: ["Books", "Culture"] },
  { query: "Ohrenbär", label: "Ohrenbär", publisher: "rbb", lang: "de", cefr: "A2", why: "Bedtime stories for children: short, slow, and complete every time.", topics: ["Stories", "Children"] },
  { query: "Die Sendung mit der Maus zum Hören", label: "Sendung mit der Maus", publisher: "WDR", lang: "de", cefr: "A2", why: "Explanations built for six-year-olds, which is exactly right at A2.", topics: ["Children", "Explainers"] },
  { query: "Kakadu Deutschlandfunk Kultur", label: "Kakadu", publisher: "Deutschlandfunk Kultur", lang: "de", cefr: "A2", why: "Children's radio: clear diction, concrete vocabulary.", topics: ["Children"] },
  { query: "Checker Tobi Podcast", label: "Checker Tobi", publisher: "Bayerischer Rundfunk", lang: "de", cefr: "B1", why: "One question per episode, answered by asking experts.", topics: ["Children", "Explainers"] },
  { query: "SRF News Plus", label: "SRF News Plus", publisher: "SRF", lang: "de", cefr: "C1", why: "Swiss news in standard German. A different accent to train on.", topics: ["News", "Swiss"] },
  { query: "Ö1 Journale", label: "Ö1 Journale", publisher: "ORF", lang: "de", cefr: "C1", why: "Austrian public radio bulletins. Austrian vocabulary and melody.", topics: ["News", "Austrian"] },
  { query: "FM4 Podcast", label: "FM4", publisher: "ORF", lang: "de", cefr: "C1", why: "Austrian youth radio, colloquial and quick.", topics: ["Culture", "Austrian"] },
  { query: "ARD Radio Tatort", label: "ARD Radio Tatort", publisher: "ARD", lang: "de", cefr: "C1", why: "Original radio crime drama. Several voices, atmosphere, no narrator.", topics: ["Drama", "Fiction"] },
  { query: "Die drei Fragezeichen", label: "Die drei ???", publisher: "Europa", lang: "de", cefr: "B1", why: "The audio drama a generation of Germans grew up on.", topics: ["Drama", "Fiction"] },
  { query: "Zeitfragen Deutschlandfunk Kultur", label: "Zeitfragen", publisher: "Deutschlandfunk Kultur", lang: "de", cefr: "C1", why: "Culture and society features, scripted and dense.", topics: ["Society", "Culture"] },
  { query: "Der Rest ist Geschichte", label: "Der Rest ist Geschichte", publisher: "ZDF", lang: "de", cefr: "B2", why: "Historical background to what is in the news now.", topics: ["History", "News"] },
];

/**
 * Everything, with duplicates folded away.
 *
 * The lists overlap deliberately - a show can be both a news source and a good
 * first podcast - and the label is the identity, because two entries pointing
 * at the same show under different search terms are still one show.
 */
/**
 * English-language podcasts.
 *
 * Grouped by what someone would actually be in the mood for rather than by
 * difficulty, because for a fluent listener the question is never "can I
 * follow this" but "is this worth an hour".
 */
export const ENGLISH_SOURCES: Suggestion[] = [
  { query: "The Daily New York Times", label: "The Daily", publisher: "The New York Times", lang: "en", why: "One story a day, reported at length by the journalist who covered it.", topics: ["News"] },
  { query: "Up First NPR", label: "Up First", publisher: "NPR", lang: "en", why: "The morning's three biggest stories in about twelve minutes.", topics: ["News"] },
  { query: "Global News Podcast BBC", label: "Global News Podcast", publisher: "BBC World Service", lang: "en", why: "World news twice a day, plainly told and genuinely global.", topics: ["News"] },
  { query: "The Intelligence Economist", label: "The Intelligence", publisher: "The Economist", lang: "en", why: "Three stories a day with the Economist's habit of explaining the why.", topics: ["News", "Analysis"] },
  { query: "Today in Focus Guardian", label: "Today in Focus", publisher: "The Guardian", lang: "en", why: "One story unpacked properly, usually with the reporter on it.", topics: ["News", "Analysis"] },
  { query: "The Journal Wall Street Journal", label: "The Journal", publisher: "The Wall Street Journal", lang: "en", why: "Money, business and power, told as narrative rather than bulletin.", topics: ["Business", "News"] },
  { query: "FT News Briefing", label: "FT News Briefing", publisher: "Financial Times", lang: "en", why: "The markets day ahead in under ten minutes.", topics: ["Finance", "News"] },
  { query: "Odd Lots Bloomberg", label: "Odd Lots", publisher: "Bloomberg", lang: "en", why: "The strange corners of finance, taken seriously and explained well.", topics: ["Finance"] },
  { query: "Masters in Business Bloomberg", label: "Masters in Business", publisher: "Bloomberg", lang: "en", why: "Long interviews with the people who actually move capital.", topics: ["Finance", "Interviews"] },
  { query: "Planet Money NPR", label: "Planet Money", publisher: "NPR", lang: "en", why: "Economics as storytelling. The standard the rest are measured against.", topics: ["Economics"] },
  { query: "The Indicator from Planet Money", label: "The Indicator", publisher: "NPR", lang: "en", why: "One economic number a day, in ten minutes.", topics: ["Economics"] },
  { query: "Freakonomics Radio", label: "Freakonomics Radio", publisher: "Freakonomics", lang: "en", why: "Incentives and hidden sides of everything, well produced.", topics: ["Economics", "Society"] },
  { query: "Marketplace APM", label: "Marketplace", publisher: "APM", lang: "en", why: "The daily business programme that treats the economy as a story about people.", topics: ["Economics", "Business"] },
  { query: "Acquired podcast", label: "Acquired", publisher: "Acquired", lang: "en", why: "Company histories at extraordinary depth. Episodes run for hours and earn it.", topics: ["Business", "Tech"] },
  { query: "How I Built This NPR", label: "How I Built This", publisher: "Wondery", lang: "en", why: "Founders on what the early years were actually like.", topics: ["Business", "Interviews"] },
  { query: "Hard Fork New York Times", label: "Hard Fork", publisher: "The New York Times", lang: "en", why: "Technology news argued out by two people who disagree usefully.", topics: ["Tech"] },
  { query: "Dwarkesh Podcast", label: "Dwarkesh Podcast", publisher: "Dwarkesh Patel", lang: "en", why: "Unusually well-prepared long interviews on AI, history and progress.", topics: ["Tech", "Interviews"] },
  { query: "Conversations with Tyler", label: "Conversations with Tyler", publisher: "Mercatus", lang: "en", why: "An economist asking the questions nobody else thought to ask.", topics: ["Economics", "Interviews"] },
  { query: "The Knowledge Project Shane Parrish", label: "The Knowledge Project", publisher: "Farnam Street", lang: "en", why: "Decision-making and judgement, with practitioners rather than pundits.", topics: ["Business", "Interviews"] },
  { query: "The Ezra Klein Show", label: "The Ezra Klein Show", publisher: "The New York Times", lang: "en", why: "Slow, serious conversations about ideas and politics.", topics: ["Politics", "Interviews"] },
  { query: "The Rest Is Politics", label: "The Rest Is Politics", publisher: "Goalhanger", lang: "en", why: "Two former insiders from opposite sides, disagreeing agreeably.", topics: ["Politics"] },
  { query: "The Rest Is History", label: "The Rest Is History", publisher: "Goalhanger", lang: "en", why: "Two historians who are very good company.", topics: ["History"] },
  { query: "In Our Time BBC", label: "In Our Time", publisher: "BBC Radio 4", lang: "en", why: "Three academics and Melvyn Bragg on one subject. Nothing else is like it.", topics: ["History", "Science"] },
  { query: "99% Invisible", label: "99% Invisible", publisher: "SiriusXM", lang: "en", why: "Design and the built world, told through things you had never noticed.", topics: ["Design", "Society"] },
  { query: "Radiolab", label: "Radiolab", publisher: "WNYC", lang: "en", why: "Science and story, produced with more care than almost anything else.", topics: ["Science"] },
  { query: "This American Life", label: "This American Life", publisher: "WBEZ", lang: "en", why: "The programme that taught everyone else how to do this.", topics: ["Society", "Stories"] },
  { query: "Hidden Brain", label: "Hidden Brain", publisher: "Hidden Brain Media", lang: "en", why: "Psychology research turned into something you remember.", topics: ["Psychology"] },
  { query: "Huberman Lab", label: "Huberman Lab", publisher: "Scicomm Media", lang: "en", why: "Neuroscience and health, long and detailed.", topics: ["Science", "Health"] },
  { query: "Nature Podcast", label: "Nature Podcast", publisher: "Nature", lang: "en", why: "The week's research, straight from the journal.", topics: ["Science"] },
  { query: "Science Friday", label: "Science Friday", publisher: "WNYC", lang: "en", why: "Science conversation with actual researchers, for a general audience.", topics: ["Science"] },
  { query: "TED Radio Hour", label: "TED Radio Hour", publisher: "NPR", lang: "en", why: "One idea per episode, built out beyond the talk.", topics: ["Ideas"] },
  { query: "Stuff You Should Know", label: "Stuff You Should Know", publisher: "iHeart", lang: "en", why: "Two hosts explaining anything at all, for hundreds of episodes.", topics: ["Explainers"] },
  { query: "More or Less Behind the Stats BBC", label: "More or Less", publisher: "BBC Radio 4", lang: "en", why: "Checking the numbers in the news. Short, sharp, essential.", topics: ["Statistics", "News"] },
  { query: "Business Daily BBC", label: "Business Daily", publisher: "BBC World Service", lang: "en", why: "One business story a day from somewhere in the world.", topics: ["Business"] },
  { query: "Desert Island Discs BBC", label: "Desert Island Discs", publisher: "BBC Radio 4", lang: "en", why: "The interview format that has outlasted everything since 1942.", topics: ["Interviews", "Culture"] },
  { query: "Pivot Kara Swisher Scott Galloway", label: "Pivot", publisher: "Vox Media", lang: "en", why: "Tech and business news with strong opinions, twice a week.", topics: ["Tech", "Business"] },
  { query: "Lex Fridman Podcast", label: "Lex Fridman Podcast", publisher: "Lex Fridman", lang: "en", why: "Very long conversations with researchers, founders and writers.", topics: ["Tech", "Interviews"] },
  { query: "a16z Podcast", label: "a16z Podcast", publisher: "Andreessen Horowitz", lang: "en", why: "Technology and company building from the investor's side of the table.", topics: ["Tech", "Business"] },
  { query: "Search Engine PJ Vogt", label: "Search Engine", publisher: "Search Engine", lang: "en", why: "One question per episode, chased until it gives up an answer.", topics: ["Society", "Stories"] },
  { query: "Revisionist History Malcolm Gladwell", label: "Revisionist History", publisher: "Pushkin", lang: "en", why: "Reinterpreting something everyone thinks they already understand.", topics: ["History", "Society"] },
];

/**
 * News organisations that publish audio.
 *
 * Separate from the podcast lists because the shape is different: these are
 * bulletins and daily programmes rather than shows you subscribe to and binge,
 * and people look for them by outlet.
 */
export const ENGLISH_NEWS: Suggestion[] = [
  { query: "BBC Newshour", label: "BBC Newshour", publisher: "BBC World Service", lang: "en", why: "An hour of world news and interviews, twice daily.", topics: ["News"] },
  { query: "NPR News Now", label: "NPR News Now", publisher: "NPR", lang: "en", why: "A five-minute bulletin, refreshed every hour.", topics: ["News"] },
  { query: "Reuters World News", label: "Reuters World News", publisher: "Reuters", lang: "en", why: "Wire-service reporting, short and unembellished.", topics: ["News"] },
  { query: "AP News Minute", label: "AP Newsroom", publisher: "Associated Press", lang: "en", why: "The wire's own bulletins.", topics: ["News"] },
  { query: "WSJ Minute Briefing", label: "WSJ Minute Briefing", publisher: "The Wall Street Journal", lang: "en", why: "Markets and business headlines in two minutes, three times a day.", topics: ["Finance", "News"] },
  { query: "Bloomberg Daybreak", label: "Bloomberg Daybreak", publisher: "Bloomberg", lang: "en", why: "The trading day ahead, in the language of the desk.", topics: ["Finance", "News"] },
  { query: "CNN 5 Things", label: "CNN 5 Things", publisher: "CNN", lang: "en", why: "Five headlines, several times a day.", topics: ["News"] },
  { query: "PBS NewsHour full episodes", label: "PBS NewsHour", publisher: "PBS", lang: "en", why: "The full evening programme as audio.", topics: ["News"] },
  { query: "Sky News Daily", label: "Sky News Daily", publisher: "Sky News", lang: "en", why: "One UK story a day, examined.", topics: ["News"] },
  { query: "Al Jazeera The Take", label: "The Take", publisher: "Al Jazeera", lang: "en", why: "One story a day from outside the usual western frame.", topics: ["News", "Analysis"] },
  { query: "DW News English", label: "DW News", publisher: "Deutsche Welle", lang: "en", why: "German and European news reported in English.", topics: ["News"] },
  { query: "France 24 English news", label: "France 24", publisher: "France Médias Monde", lang: "en", why: "French and African coverage in English.", topics: ["News"] },
  { query: "The Economist Podcasts", label: "The Economist", publisher: "The Economist", lang: "en", why: "The full range of the paper's shows in one feed.", topics: ["News", "Analysis"] },
  { query: "Financial Times News", label: "FT News", publisher: "Financial Times", lang: "en", why: "Markets, companies and policy from the FT newsroom.", topics: ["Finance", "News"] },
  { query: "New York Times The Headlines", label: "The Headlines", publisher: "The New York Times", lang: "en", why: "The paper's front page read in seven minutes.", topics: ["News"] },
];

export const ALL_SUGGESTIONS: Suggestion[] = (() => {
  const seen = new Set<string>();
  const all: Suggestion[] = [];
  for (const item of [...SUGGESTIONS, ...NEWS_SOURCES, ...NATIVE_SOURCES, ...ENGLISH_SOURCES, ...ENGLISH_NEWS]) {
    const key = `${item.label.toLowerCase()}|${item.lang}`;
    if (seen.has(key)) continue;
    seen.add(key);
    all.push(item);
  }
  return all;
})();

export function byLang(items: Suggestion[], lang: SourceLang | ""): Suggestion[] {
  return lang ? items.filter((item) => item.lang === lang) : items;
}

export function byLevel(items: Suggestion[], level: Cefr | ""): Suggestion[] {
  return level ? items.filter((item) => item.cefr === level) : items;
}

/**
 * What each level sounds like, in terms of listening rather than grammar.
 *
 * A learner choosing a podcast wants to know whether they will be able to
 * follow it, which is a question about pace and register, not about which
 * tenses appear on the syllabus.
 */
export const LEVEL_HINTS: Record<Cefr, string> = {
  A1: "Slow, scripted speech about everyday things. Short sentences.",
  A2: "Clear speech on familiar topics, still noticeably slower than normal.",
  B1: "Normal-paced speech on work, news and opinion.",
  B2: "Native-paced discussion with abstract argument.",
  C1: "Fast, unscripted native speech. Irony and register shifts.",
  C2: "Anything a native audience gets, including regional colour.",
};

export function topicsOf(items: Suggestion[]): string[] {
  return [...new Set(items.flatMap((item) => item.topics))].sort((a, b) => a.localeCompare(b));
}

export function byTopic(items: Suggestion[], topic: string): Suggestion[] {
  return topic ? items.filter((item) => item.topics.includes(topic)) : items;
}

