import { NextResponse } from "next/server";

export const runtime = "nodejs";

export interface ChartEntry {
  appleId: string;
  title: string;
  publisher: string;
  artwork: string | null;
  pageUrl: string | null;
}

/**
 * Apple's public podcast chart, which needs no key and no account.
 *
 * This is the "auto-updating" half of the suggestions: the hand-written list
 * is chosen for a learner and never changes, while this reflects what Germany
 * is actually listening to this week. Only the chart entry is fetched here;
 * resolving one to a playable feed is a single lookup that happens on click,
 * rather than fifty lookups nobody asked for.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const country = /^[a-z]{2}$/i.test(searchParams.get("country") ?? "")
    ? (searchParams.get("country") as string).toLowerCase()
    : "de";
  const limit = Math.min(100, Math.max(10, Number(searchParams.get("limit") ?? 30)));

  const url = `https://rss.marketingtools.apple.com/api/v2/${country}/podcasts/top/${limit}/podcasts.json`;

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "Hoerbar/0.1" },
      signal: AbortSignal.timeout(10_000),
      // Charts move slowly; an hour of cache keeps this off the critical path.
      next: { revalidate: 3600 },
    });
    if (!response.ok) {
      return NextResponse.json(
        { entries: [], error: `The chart responded ${response.status}.` },
        { status: 200 },
      );
    }
    const data = (await response.json()) as {
      feed?: {
        results?: Array<{
          id?: string;
          name?: string;
          artistName?: string;
          artworkUrl100?: string;
          url?: string;
        }>;
      };
    };

    const entries: ChartEntry[] = (data.feed?.results ?? [])
      .filter((item) => item.id && item.name)
      .map((item) => ({
        appleId: item.id!,
        title: item.name!,
        publisher: item.artistName ?? "",
        // The chart hands back 100px art; asking for 600 gives a usable image.
        artwork: item.artworkUrl100?.replace(/100x100/, "600x600") ?? null,
        pageUrl: item.url ?? null,
      }));

    return NextResponse.json(
      { entries, country },
      { headers: { "Cache-Control": "public, max-age=1800, stale-while-revalidate=86400" } },
    );
  } catch (error) {
    console.error("[api/charts]", error);
    return NextResponse.json({ entries: [], error: "The chart could not be reached." }, { status: 200 });
  }
}
