import { getApiConfig } from "./config";

export type MovieSummary = {
  id: string | number;
  slug?: string;
  title: string;
  poster: string;
  backdrop: string;
  year: string | number;
  rating: number;
  genre: string;
  category?: string;
  synopsis: string;
};

export type MoviesHomeData = {
  featured?: MovieSummary;
  trending: MovieSummary[];
  bollywood: MovieSummary[];
  hollywood: MovieSummary[];
  hindiDubbed: MovieSummary[];
  action: MovieSummary[];
  webSeries: MovieSummary[];
  romance: MovieSummary[];
  thriller: MovieSummary[];
};

export type MovieStreamResult = {
  streamUrl?: string | null;
  thumbnail?: string;
  title?: string;
  source?: string;
  fallbackIframe?: string | null;
  isHls?: boolean;
  directHls?: boolean;
  host?: string;
  error?: string;
};

/**
 * Enhances low-resolution poster URLs from TMDB (e.g. w185 / w342) to crisp high-res w500
 */
export function enhancePosterUrl(url?: string): string {
  if (!url) return "https://placehold.co/300x450/1a1a2e/white?text=No+Poster";
  let clean = url.startsWith("//") ? `https:${url}` : url;
  if (clean.includes("image.tmdb.org/t/p/")) {
    clean = clean.replace(/\/t\/p\/(w185|w342|w92|w154|w45|w200)\//, "/t/p/w500/");
    if (!clean.includes("/w500/") && !clean.includes("/w780/") && !clean.includes("/original/")) {
      clean = clean.replace(/\/t\/p\/[^/]+\//, "/t/p/w500/");
    }
  }
  return clean;
}

/**
 * Enhances low-resolution backdrop URLs to high-res w1280 or original
 */
export function enhanceBackdropUrl(url?: string): string {
  if (!url) return "https://placehold.co/1280x720/1a1a2e/white?text=No+Backdrop";
  let clean = url.startsWith("//") ? `https:${url}` : url;
  if (clean.includes("image.tmdb.org/t/p/")) {
    clean = clean.replace(/\/t\/p\/(w185|w342|w500|w780)\//, "/t/p/w1280/");
  }
  return clean;
}

/**
 * Cleans release tags, dub labels, and audio quality stamps for a clean title display
 */
export function cleanDisplayTitle(raw?: string): string {
  if (!raw) return "Untitled Movie";
  const cleaned = raw
    .replace(/\bWatch\s+Online\b/gi, "")
    .replace(/\bFull\s+Movie\b/gi, "")
    .replace(/\bFull\s+Web\s+Series\b/gi, "")
    .replace(/\bDownload\s+Now\b/gi, "")
    .replace(/\(\d{4}\)/g, "")
    .replace(/\[.*?\]/g, "")
    .replace(/\b(Hindi\s+Dubbed|Hindi\s+Dub|Hindi|Bengali|Malayalam|Tamil|Telugu|Kannada|Marathi|Punjabi|Gujarati|English)\b/gi, "")
    .replace(/\b(HDRip|BluRay|WEB-DL|WEBRip|UNCUT|HDTS|HDTC|HDCam|CAMRip|DVDScr|HD|4K|1080p|720p|480p|360p)\b/gi, "")
    .replace(/\b(Bollywood|Hollywood|South\s+Indian)\b/gi, "")
    .replace(/[-_:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || raw;
}

export function normalizeMovieItem(item: any): MovieSummary {
  if (!item) {
    return {
      id: "unknown",
      title: "Movie",
      poster: "https://placehold.co/300x450/1a1a2e/white?text=No+Poster",
      backdrop: "https://placehold.co/1280x720/1a1a2e/white?text=No+Backdrop",
      genre: "Movie",
      rating: 7.8,
      year: "2026",
      synopsis: "Stream in Full HD with high-speed playback.",
    };
  }

  const rawPoster = item.thumbnail || item.coverImage || item.poster || item.bannerImage;
  const poster = enhancePosterUrl(rawPoster);
  const backdrop = enhanceBackdropUrl(item.bannerImage || item.backdrop || rawPoster);

  const rawRating = item.rating ? parseFloat(String(item.rating)) : 7.8;
  const rating = isNaN(rawRating) || rawRating <= 0 ? 7.8 : Math.min(10, rawRating);

  let genre = "Movie";
  if (Array.isArray(item.categories) && item.categories.length > 0) {
    genre = item.categories.slice(0, 2).join(" · ");
  } else if (item.language) {
    genre = `${item.language} · ${item.type === "series" ? "Web Series" : "Cinema"}`;
  } else if (item.genre) {
    genre = item.genre;
  }

  const slug = item.slug || item.dcSlug || item.movieplexSlug || (typeof item.id === "string" ? item.id.replace(/^dc-|^mp-/, "") : undefined);

  return {
    id: item.id || slug || Math.random().toString(),
    slug,
    title: cleanDisplayTitle(item.title),
    poster,
    backdrop,
    year: item.year || item.releaseDate || "2026",
    rating,
    genre,
    category: item.category || (Array.isArray(item.categories) ? item.categories[0] : undefined),
    synopsis: item.synopsis || item.description || "Stream in Full HD with high-speed playback powered by DesiCinemas.",
  };
}

export async function fetchMoviesHome(): Promise<MoviesHomeData> {
  const config = await getApiConfig();
  try {
    const res = await fetch(`${config.MOVIES_API}/api/movies/home`);
    if (res.ok) {
      const data = await res.json();
      const dc = data.desicinemas || data.movieplex || {};
      return {
        featured: data.featured ? normalizeMovieItem(data.featured) : undefined,
        trending: (data.trending || dc.trending || []).map(normalizeMovieItem),
        bollywood: (data.bollywood || dc.bollywood || []).map(normalizeMovieItem),
        hollywood: (data.hollywood || dc.hollywood || []).map(normalizeMovieItem),
        hindiDubbed: (data.hindiDubbed || dc.hindiDubbed || []).map(normalizeMovieItem),
        action: (data.action || dc.action || []).map(normalizeMovieItem),
        webSeries: (data.webSeries || dc.webSeries || []).map(normalizeMovieItem),
        romance: (data.romance || dc.romance || []).map(normalizeMovieItem),
        thriller: (data.thriller || dc.thriller || []).map(normalizeMovieItem),
      };
    }
  } catch (err) {
    console.warn("Movies home fetch failed:", err);
  }
  return {
    trending: [],
    bollywood: [],
    hollywood: [],
    hindiDubbed: [],
    action: [],
    webSeries: [],
    romance: [],
    thriller: [],
  };
}

export async function fetchMovieCatalog(params: {
  category?: string;
  search?: string;
  page?: number;
  limit?: number;
}): Promise<MovieSummary[]> {
  const config = await getApiConfig();
  const query = new URLSearchParams();
  if (params.category) {
    query.set("category", params.category);
  }
  if (params.search) query.set("search", params.search);
  if (params.page) query.set("page", String(params.page));
  if (params.limit) query.set("limit", String(params.limit));

  try {
    const res = await fetch(`${config.MOVIES_API}/api/desicinemas/catalog?${query.toString()}`);
    if (res.ok) {
      const data = await res.json();
      const rawMovies = Array.isArray(data) ? data : data.movies || data.results || [];
      return rawMovies.map(normalizeMovieItem);
    }
  } catch (err) {
    console.warn("Movie catalog fetch failed:", err);
  }
  return [];
}

export async function resolveMovieStream(params: {
  slug?: string;
  title?: string;
  year?: string | number;
}): Promise<MovieStreamResult> {
  const config = await getApiConfig();

  // A "real" DesiCinemas slug is a word slug (e.g. "fighter-q-k"), never a bare
  // numeric TMDB id. TMDB-sourced catalog items only have a numeric id, so we must
  // NOT send that as a slug — DesiCinemas 302-redirects every unknown slug to one
  // constant catch-all post ("vanvaas-movies-video"), which is why every such movie
  // used to resolve to the SAME title. Only treat a slug as real if it contains a
  // non-numeric segment.
  const isRealSlug = !!params.slug && !/^\d+$/.test(String(params.slug)) && /[a-z]/i.test(String(params.slug));

  // PRIMARY: DesiCinemas. With a real slug it resolves that exact title; otherwise
  // the backend searches DesiCinemas by title and returns the matching post's
  // stream (distinct per title, native HLS when the embed host is extractable —
  // e.g. Morencius/Vidmoly — else a per-title iframe as fallback).
  if (isRealSlug || params.title) {
    try {
      const q = new URLSearchParams();
      if (isRealSlug) q.set("slug", String(params.slug));
      if (params.title) q.set("title", String(params.title));
      if (params.year) q.set("year", String(params.year));
      const res = await fetch(`${config.MOVIES_API}/api/desicinemas/stream?${q.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (data.streamUrl || data.fallbackIframe) {
          return {
            streamUrl: data.streamUrl,
            fallbackIframe: data.fallbackIframe,
            source: data.source || "desicinemas",
            isHls: data.isHls ?? !!data.streamUrl,
            directHls: data.directHls ?? !!data.streamUrl,
            host: data.host,
            title: data.title || params.title,
            thumbnail: enhancePosterUrl(data.thumbnail),
          };
        }
      }
    } catch (e) {
      console.warn("DesiCinemas stream resolve failed:", e);
    }
  }

  throw new Error("Could not resolve movie stream");
}
