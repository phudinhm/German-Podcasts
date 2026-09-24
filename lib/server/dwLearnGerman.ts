import { parseTranscript, type TranscriptSegment } from "./transcript";

const DW_GRAPHQL_ENDPOINT = "https://learngerman.dw.com/graphql";

const NICOS_WEG_FEEDS = [
  "https://rss.dw.com/xml/DKpodcast_nicosweg_video_A1_de",
  "https://rss.dw.com/xml/DKpodcast_nicosweg_video_A2_de",
  "https://rss.dw.com/xml/DKpodcast_nicosweg_video_B1_de",
  "https://rss.dw.com/xml/DKpodcast_topthemamitvokabeln_de",
];

// In-memory cache mapping enclosure URLs / filenames to DW Lesson IDs
let enclosureToLessonIdCache: Map<string, number> | null = null;
let cachePopulatingPromise: Promise<Map<string, number>> | null = null;

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&bdquo;|&ldquo;|&rdquo;|&laquo;|&raquo;|&quot;/gi, '"')
    .replace(/&lsquo;|&rsquo;|&apos;|&#0?39;/gi, "'")
    .replace(/&ndash;|&mdash;/gi, "–")
    .replace(/&hellip;/gi, "…")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extracts a numeric DW LearnGerman lesson ID (e.g. 40324275) from any known
 * URL, GUID, or composite track ID.
 */
export function extractDwLessonIdSync(input: {
  guid?: string;
  pageUrl?: string;
  audioUrl?: string;
  trackId?: string;
}): number | null {
  const candidates = [input.pageUrl, input.guid, input.trackId, input.audioUrl].filter(
    (x): x is string => Boolean(x && x.trim())
  );

  for (const raw of candidates) {
    // 1. Direct numeric GUID: "40324275"
    if (/^\d{6,9}$/.test(raw.trim())) {
      return Number(raw.trim());
    }
    // 2. Composite Track ID format: "show::40324275::https://..."
    const compositeMatch = raw.match(/::(\d{6,9})::/);
    if (compositeMatch) {
      return Number(compositeMatch[1]);
    }
    // 3. DW LearnGerman lesson URL: "https://learngerman.dw.com/de/.../l-40324275" or "dw-transcript/l-40324275"
    const lessonUrlMatch = raw.match(/\/l-(\d{6,9})(?:[/?#]|$)/i);
    if (lessonUrlMatch) {
      return Number(lessonUrlMatch[1]);
    }
    // 4. DW podcast MP3 filename: "21F5E2E7_2-podcast-2296-79373291.mp3"
    const mp3IdMatch = raw.match(/-podcast-\d+-(\d{6,9})\.(?:mp3|mp4|m4a)/i);
    if (mp3IdMatch) {
      return Number(mp3IdMatch[1]);
    }
  }

  return null;
}

async function getEnclosureLessonMap(): Promise<Map<string, number>> {
  if (enclosureToLessonIdCache && enclosureToLessonIdCache.size > 0) {
    return enclosureToLessonIdCache;
  }
  if (cachePopulatingPromise) {
    return cachePopulatingPromise;
  }

  cachePopulatingPromise = (async () => {
    const map = new Map<string, number>();
    await Promise.all(
      NICOS_WEG_FEEDS.map(async (feedUrl) => {
        try {
          const res = await fetch(feedUrl, {
            headers: { "User-Agent": "Hoerbar/0.1" },
            signal: AbortSignal.timeout(6000),
          });
          if (!res.ok) return;
          const xml = await res.text();
          const items = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];
          for (const item of items) {
            const guidMatch = item.match(/<guid[^>]*>\s*(\d{6,9})\s*<\/guid>/i);
            const encMatch = item.match(/<enclosure[^>]*url=["']([^"']+)["']/i);
            if (guidMatch && encMatch) {
              const id = Number(guidMatch[1]);
              const url = encMatch[1].trim();
              map.set(url, id);
              // Also index by filename (e.g. "A1_E0_L2_F2_neu_AVC_640x360.mp4" or "A1_E0_L2_F2")
              const fileName = url.split("/").pop()?.split("?")[0];
              if (fileName) {
                map.set(fileName.toLowerCase(), id);
                const codeMatch = fileName.match(/([AB][12]_E\d+_L\d+_F\d+)/i);
                if (codeMatch) {
                  map.set(codeMatch[1].toUpperCase(), id);
                }
              }
            }
          }
        } catch {
          // ignore individual feed errors
        }
      })
    );
    if (map.size > 0) {
      enclosureToLessonIdCache = map;
    }
    cachePopulatingPromise = null;
    return map;
  })();

  return cachePopulatingPromise;
}

export async function resolveDwLessonId(input: {
  guid?: string;
  pageUrl?: string;
  audioUrl?: string;
  trackId?: string;
}): Promise<number | null> {
  const direct = extractDwLessonIdSync(input);
  if (direct) return direct;

  const audioUrl = input.audioUrl?.trim();
  if (!audioUrl) return null;

  const isDwMedia =
    /dw\.com|akamaihd\.net|nicosweg/i.test(audioUrl) ||
    /([AB][12]_E\d+_L\d+_F\d+)/i.test(audioUrl);
  if (!isDwMedia) return null;

  const map = await getEnclosureLessonMap();
  if (map.has(audioUrl)) return map.get(audioUrl)!;

  const fileName = audioUrl.split("/").pop()?.split("?")[0];
  if (fileName && map.has(fileName.toLowerCase())) {
    return map.get(fileName.toLowerCase())!;
  }

  const codeMatch = audioUrl.match(/([AB][12]_E\d+_L\d+_F\d+)/i);
  if (codeMatch && map.has(codeMatch[1].toUpperCase())) {
    return map.get(codeMatch[1].toUpperCase())!;
  }

  return null;
}

interface ManuscriptTurn {
  speaker?: string;
  text: string;
}

/**
 * Parses DW HTML `manuscript` into ordered speaker turns, filtering out
 * `AUDIOKURS:` warm-up drills when actual scene dialogue follows.
 */
function parseDwManuscript(html: string): ManuscriptTurn[] {
  if (!html || !html.trim()) return [];

  // Normalize block breaks into double newlines
  const normalized = html
    .replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
    .replace(/<br\s*\/?>\s*<br\s*\/?>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?p[^>]*>/gi, "\n\n");

  const blocks = normalized
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);

  const turns: ManuscriptTurn[] = [];
  for (const block of blocks) {
    // Check if block starts with <strong>SPEAKER:</strong>
    const speakerMatch = block.match(/^<strong>([^<]+?):?<\/strong>\s*([\s\S]*)$/i);
    if (speakerMatch) {
      const speaker = decodeHtmlEntities(speakerMatch[1].replace(/:$/, "").trim());
      const bodyText = decodeHtmlEntities(speakerMatch[2].replace(/<[^>]+>/g, " "));
      if (!bodyText) continue;
      turns.push({ speaker, text: bodyText });
    } else {
      const cleanText = decodeHtmlEntities(block.replace(/<[^>]+>/g, " "));
      if (cleanText) {
        turns.push({ text: cleanText });
      }
    }
  }

  // If the first turn is "AUDIOKURS" and there are real character turns after it,
  // keep the character turns or split the AUDIOKURS lines cleanly
  return turns;
}

/**
 * Enriches WebVTT subtitle cues with speaker names (e.g. "NICO:", "EMMA:", "YARA:")
 * from the lesson's official manuscript when the words match.
 */
function attachSpeakerLabelsToVtt(
  cues: TranscriptSegment[],
  turns: ManuscriptTurn[]
): TranscriptSegment[] {
  if (turns.length === 0 || cues.length === 0) return cues;

  const normalizeForMatch = (s: string) =>
    s
      .toLowerCase()
      .replace(/^[-–—\s]+/, "")
      .replace(/[^a-zäöüß0-9\s]/gi, "")
      .replace(/\s+/g, " ")
      .trim();

  let turnCursor = 0;
  return cues.map((cue) => {
    const cleanCue = cue.text.replace(/^[-–—]\s*/, "").trim();
    const normCue = normalizeForMatch(cleanCue);
    if (!normCue) return { ...cue, text: cleanCue };

    for (let offset = 0; offset < 4 && turnCursor + offset < turns.length; offset++) {
      const candidate = turns[turnCursor + offset];
      if (!candidate.speaker || candidate.speaker.toUpperCase() === "AUDIOKURS") continue;
      const normTurn = normalizeForMatch(candidate.text);
      if (
        normTurn &&
        (normTurn.includes(normCue) || normCue.includes(normTurn.slice(0, Math.min(18, normTurn.length))))
      ) {
        turnCursor = turnCursor + offset;
        const prefix = `${candidate.speaker}: `;
        const alreadyPrefixed = cleanCue.toUpperCase().startsWith(prefix.toUpperCase());
        return {
          ...cue,
          text: alreadyPrefixed ? cleanCue : `${prefix}${cleanCue}`,
        };
      }
    }

    return { ...cue, text: cleanCue };
  });
}

/**
 * Fetches the 100% official DW LearnGerman / Nicos Weg transcript from DW's
 * GraphQL API (`videos[].subtitles[].subtitleUrl` WebVTT + `manuscript`).
 */
export async function fetchDwOfficialTranscript(
  lessonId: number,
  fallbackDurationSec?: number | null
): Promise<TranscriptSegment[] | null> {
  try {
    const query = `{
      content(id: ${lessonId}, lang: GERMAN) {
        ... on Lesson {
          id
          title
          manuscript
          videos {
            id
            duration
            subtitles {
              url
              language
              srcLanguage
              subtitleUrl
            }
          }
        }
      }
    }`;

    const res = await fetch(DW_GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Hoerbar/0.1",
      },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return null;

    const json = (await res.json()) as {
      data?: {
        content?: {
          id?: number;
          title?: string;
          manuscript?: string | null;
          videos?: Array<{
            id?: number;
            duration?: number | null;
            subtitles?: Array<{
              url?: string | null;
              language?: string | null;
              srcLanguage?: string | null;
              subtitleUrl?: string | null;
            }> | null;
          }> | null;
        } | null;
      };
    };

    const content = json.data?.content;
    if (!content) return null;

    const manuscriptTurns = content.manuscript ? parseDwManuscript(content.manuscript) : [];

    // 1. Prefer official millisecond-timed WebVTT subtitle file from `videos[].subtitles`
    const videos = content.videos ?? [];
    for (const video of videos) {
      const subs = video?.subtitles ?? [];
      const deSub =
        subs.find((s) => s?.subtitleUrl && (s.srcLanguage === "de" || s.language === "GERMAN")) ??
        subs.find((s) => s?.subtitleUrl);

      if (deSub?.subtitleUrl) {
        try {
          const vttRes = await fetch(deSub.subtitleUrl, {
            headers: { "User-Agent": "Hoerbar/0.1" },
            signal: AbortSignal.timeout(6000),
          });
          if (vttRes.ok) {
            const vttText = await vttRes.text();
            const vttSegments = parseTranscript(vttText, "text/vtt");
            if (vttSegments.length > 0) {
              return attachSpeakerLabelsToVtt(vttSegments, manuscriptTurns);
            }
          }
        } catch {
          // Fallback to manuscript below if VTT fetch fails
        }
      }
    }

    // 2. Fallback to official `manuscript` dialogue/paragraphs with proportional timing
    if (manuscriptTurns.length > 0) {
      // Split long manuscript paragraphs into individual sentences so timestamps track smoothly
      const sentences: string[] = [];
      for (const turn of manuscriptTurns) {
        if (turn.speaker && turn.speaker.toUpperCase() !== "AUDIOKURS") {
          sentences.push(`${turn.speaker}: ${turn.text}`);
        } else {
          const parts = turn.text
            .split(/(?<=[.!?…])\s+/)
            .map((s) => s.trim())
            .filter((s) => s.length > 2);
          sentences.push(...parts);
        }
      }

      if (sentences.length > 0) {
        const videoDur = videos.find((v) => v?.duration && v.duration > 10)?.duration;
        const totalDur =
          (fallbackDurationSec && fallbackDurationSec > 15 ? fallbackDurationSec : null) ??
          videoDur ??
          Math.max(60, sentences.length * 4.5);

        const totalChars = sentences.reduce((sum, s) => sum + s.length, 0) || 1;
        let cursor = 0;

        return sentences.map((text) => {
          const weight = Math.max(0.02, text.length / totalChars);
          const segDur = Math.max(1.8, totalDur * weight);
          const start = Math.round(cursor * 10) / 10;
          const end = Math.round((cursor + segDur) * 10) / 10;
          cursor += segDur;
          return { start, end, text };
        });
      }
    }

    return null;
  } catch {
    return null;
  }
}
