import { getApiConfig } from "./config";
import { HINDI_DUBBED_ANILIST_IDS } from "../data/hindi-dubbed-ids";

export type AnimeMedia = {
  id: number;
  title: {
    english?: string | null;
    romaji?: string | null;
    native?: string | null;
  };
  coverImage?: {
    extraLarge?: string | null;
    large?: string | null;
    medium?: string | null;
  };
  bannerImage?: string | null;
  description?: string | null;
  episodes?: number | null;
  status?: string | null;
  averageScore?: number | null;
  genres?: string[];
  seasonYear?: number | null;
  format?: string | null;
};

export type AnimeEpisode = {
  id: string | number;
  number: number;
  title?: string;
  thumbnail?: string;
  isFiller?: boolean;
};

export type AnimeStreamSource = {
  url: string;
  isM3U8?: boolean;
  quality?: string;
};

export type AnimeSubtitle = {
  url: string;
  lang: string;
};

export type AnimeStreamResult = {
  sources: AnimeStreamSource[];
  subtitles?: AnimeSubtitle[];
  intro?: { start: number; end: number };
  outro?: { start: number; end: number };
  provider?: string;
  headers?: Record<string, string>;
};

export async function queryAniList<T = any>(query: string, variables: Record<string, any> = {}): Promise<T> {
  const config = await getApiConfig();
  try {
    const res = await fetch(`${config.ANIME_API}/api/anilist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });
    if (res.ok) {
      const data = await res.json();
      return data?.data ?? data;
    }
  } catch (err) {
    console.warn("AniList proxy request failed, falling back to direct AniList API", err);
  }

  // Fallback directly to AniList public GraphQL endpoint
  const directRes = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const data = await directRes.json();
  return data?.data ?? data;
}

export async function fetchTrendingAnime(page = 1, perPage = 18): Promise<AnimeMedia[]> {
  const query = `
    query ($page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        media(type: ANIME, sort: TRENDING_DESC, isAdult: false) {
          id
          title { english romaji native }
          coverImage { extraLarge large }
          bannerImage
          description
          episodes
          averageScore
          genres
          seasonYear
          format
        }
      }
    }
  `;
  const result = await queryAniList(query, { page, perPage });
  return result?.Page?.media || [];
}

export async function fetchPopularAnime(page = 1, perPage = 18): Promise<AnimeMedia[]> {
  const query = `
    query ($page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        media(type: ANIME, sort: POPULARITY_DESC, isAdult: false) {
          id
          title { english romaji native }
          coverImage { extraLarge large }
          bannerImage
          description
          episodes
          averageScore
          genres
          seasonYear
          format
        }
      }
    }
  `;
  const result = await queryAniList(query, { page, perPage });
  return result?.Page?.media || [];
}

export async function fetchHindiDubbedAnime(page = 1, perPage = 24): Promise<AnimeMedia[]> {
  const start = (page - 1) * perPage;
  const sliceIds = HINDI_DUBBED_ANILIST_IDS.slice(start, start + perPage);
  if (sliceIds.length === 0) return [];

  const query = `
    query ($ids: [Int], $perPage: Int) {
      Page(page: 1, perPage: $perPage) {
        media(id_in: $ids, type: ANIME) {
          id
          title { english romaji native }
          coverImage { extraLarge large }
          bannerImage
          description
          episodes
          averageScore
          genres
          seasonYear
          format
        }
      }
    }
  `;
  const result = await queryAniList(query, { ids: sliceIds, perPage });
  const mediaList: AnimeMedia[] = result?.Page?.media || [];
  const idIndexMap = new Map(sliceIds.map((id, index) => [id, index]));
  return mediaList.sort((a, b) => (idIndexMap.get(a.id) ?? 999) - (idIndexMap.get(b.id) ?? 999));
}

export async function fetchAnimeByGenre(genre: string, page = 1, perPage = 18): Promise<AnimeMedia[]> {
  if (!genre || genre === "All") {
    return fetchTrendingAnime(page, perPage);
  }
  if (genre.toLowerCase() === "hindi") {
    return fetchHindiDubbedAnime(page, perPage);
  }
  const query = `
    query ($genre: String, $page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        media(type: ANIME, genre: $genre, sort: POPULARITY_DESC, isAdult: false) {
          id
          title { english romaji native }
          coverImage { extraLarge large }
          bannerImage
          description
          episodes
          averageScore
          genres
          seasonYear
          format
        }
      }
    }
  `;
  const result = await queryAniList(query, { genre, page, perPage });
  return result?.Page?.media || [];
}

export async function searchAnime(keyword: string, page = 1, perPage = 20): Promise<AnimeMedia[]> {
  const query = `
    query ($search: String, $page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        media(type: ANIME, search: $search, sort: SEARCH_MATCH, isAdult: false) {
          id
          title { english romaji native }
          coverImage { extraLarge large }
          bannerImage
          description
          episodes
          averageScore
          genres
          seasonYear
          format
        }
      }
    }
  `;
  const result = await queryAniList(query, { search: keyword, page, perPage });
  return result?.Page?.media || [];
}

export async function fetchAnimeDetails(anilistId: number): Promise<{
  anime: AnimeMedia;
  episodes: AnimeEpisode[];
}> {
  const config = await getApiConfig();

  // Try API info endpoint first
  try {
    const res = await fetch(`${config.ANIME_API}/api/info/${anilistId}`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.id) {
        const episodes: AnimeEpisode[] = (data.episodes || []).map((ep: any, idx: number) => ({
          id: ep.id || `${anilistId}-ep-${idx + 1}`,
          number: ep.number || idx + 1,
          title: ep.title || `Episode ${ep.number || idx + 1}`,
          thumbnail: ep.image || ep.thumbnail,
          isFiller: ep.isFiller,
        }));
        return {
          anime: {
            id: Number(data.id) || anilistId,
            title: data.title || {},
            coverImage: { large: data.image || data.coverImage?.large },
            bannerImage: data.cover || data.bannerImage,
            description: data.description,
            episodes: data.totalEpisodes || data.episodes?.length || null,
            averageScore: data.rating,
            genres: data.genres || [],
            status: data.status,
          },
          episodes: episodes.length > 0 ? episodes : generateFallbackEpisodes(data.totalEpisodes || 12),
        };
      }
    }
  } catch (err) {
    console.warn("Could not fetch info from Anime API, querying AniList directly", err);
  }

  // Fallback to AniList GraphQL
  const query = `
    query ($id: Int) {
      Media(id: $id, type: ANIME) {
        id
        title { english romaji native }
        coverImage { extraLarge large }
        bannerImage
        description
        episodes
        averageScore
        genres
        status
        seasonYear
      }
    }
  `;
  const result = await queryAniList(query, { id: anilistId });
  const media = result?.Media;
  const count = media?.episodes || 12;
  return {
    anime: media,
    episodes: generateFallbackEpisodes(count),
  };
}

function generateFallbackEpisodes(count: number): AnimeEpisode[] {
  const num = Math.min(Math.max(count || 12, 1), 2000);
  return Array.from({ length: num }, (_, i) => ({
    id: i + 1,
    number: i + 1,
    title: `Episode ${i + 1}`,
  }));
}

export async function fetchAnimeStream(params: {
  anilistId: number;
  episode: number;
  dub?: "sub" | "eng" | "hin";
  title?: string;
}): Promise<AnimeStreamResult> {
  const config = await getApiConfig();
  const { anilistId, episode, dub = "sub", title } = params;

  // 1. If Hindi requested, try AnimeRulz endpoint
  if (dub === "hin") {
    try {
      const res = await fetch(
        `${config.ANIME_API}/api/animerulz/watch?anilistId=${anilistId}&episode=${episode}&lang=hin`
      );
      if (res.ok) {
        const data = await res.json();
        if (data.sources && data.sources.length > 0) {
          return {
            sources: data.sources,
            subtitles: data.subtitles || [],
            intro: data.intro,
            outro: data.outro,
            provider: "AnimeRulz (Hindi)",
          };
        }
      }
    } catch (e) {
      console.warn("AnimeRulz Hindi fetch failed:", e);
    }
  }

  // 2. Primary: Try HiAnime endpoint
  try {
    const res = await fetch(
      `${config.ANIME_API}/api/hianime/watch?anilistId=${anilistId}&episode=${episode}&dub=${dub}`
    );
    if (res.ok) {
      const data = await res.json();
      if (data.sources && data.sources.length > 0) {
        return {
          sources: data.sources,
          subtitles: data.subtitles || [],
          intro: data.intro,
          outro: data.outro,
          provider: "HiAnime",
        };
      }
    }
  } catch (e) {
    console.warn("HiAnime fetch failed:", e);
  }

  // 3. Fallback: Try AnimeKai / Gogoanime endpoint
  if (title) {
    try {
      const res = await fetch(
        `${config.ANIME_API}/api/gogoanime/watch?title=${encodeURIComponent(title)}&episode=${episode}&dub=${dub}`
      );
      if (res.ok) {
        const data = await res.json();
        if (data.sources && data.sources.length > 0) {
          return {
            sources: data.sources,
            subtitles: data.subtitles || [],
            intro: data.intro,
            outro: data.outro,
            provider: "AnimeKai",
          };
        }
      }
    } catch (e) {
      console.warn("AnimeKai fallback failed:", e);
    }
  }

  throw new Error(`No stream sources found for episode ${episode}`);
}
