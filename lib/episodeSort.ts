import type { FeedEpisode } from "./server/feed";
import type { RecentEpisode } from "./library";

export type SortKey = "newest" | "oldest" | "longest" | "shortest" | "unplayed";

export const SORT_KEYS: SortKey[] = ["newest", "oldest", "longest", "shortest", "unplayed"];

function published(episode: FeedEpisode): number {
  if (!episode.publishedAt) return 0;
  const time = new Date(episode.publishedAt).getTime();
  return Number.isNaN(time) ? 0 : time;
}

/**
 * Orders an episode list without disturbing the feed's own array.
 *
 * "Newest first" is the identity case only in theory: plenty of feeds publish
 * out of order, or carry no dates at all, so it is sorted rather than assumed.
 * Every comparison falls back to the feed's own order, so episodes the sort
 * cannot separate keep their positions instead of being reshuffled arbitrarily,
 * which looks like a bug even when it is only indifference.
 *
 * "Unplayed first" reads the library rather than the feed, because whether you
 * have heard something is not a property of the episode.
 */
export function sortEpisodes(
  episodes: FeedEpisode[],
  key: SortKey,
  recents: RecentEpisode[] = [],
): FeedEpisode[] {
  const list = episodes.map((episode, index) => ({ episode, index }));
  const heard = new Map(recents.map((entry) => [entry.id, entry]));
  const stable = (a: { index: number }, b: { index: number }) => a.index - b.index;

  list.sort((a, b) => {
    switch (key) {
      case "oldest":
        return published(a.episode) - published(b.episode) || stable(a, b);
      case "longest":
        return (b.episode.durationSec ?? 0) - (a.episode.durationSec ?? 0) || stable(a, b);
      case "shortest": {
        // Unknown durations sort last rather than first: a feed that omits them
        // would otherwise fill the top of "shortest" with episodes of no known
        // length, which is the opposite of what was asked for.
        const left = a.episode.durationSec ?? Number.POSITIVE_INFINITY;
        const right = b.episode.durationSec ?? Number.POSITIVE_INFINITY;
        return left - right || stable(a, b);
      }
      case "unplayed": {
        const rank = (episode: FeedEpisode) => {
          const entry = heard.get(episode.guid || episode.url);
          if (!entry) return 0;
          return entry.finished ? 2 : 1;
        };
        return (
          rank(a.episode) - rank(b.episode) ||
          published(b.episode) - published(a.episode) ||
          stable(a, b)
        );
      }
      case "newest":
      default:
        return published(b.episode) - published(a.episode) || stable(a, b);
    }
  });

  return list.map((item) => item.episode);
}
