export type AppRoute =
  | { type: "home" }
  | { type: "anime" }
  | { type: "movies" }
  | { type: "drama" }
  | { type: "comics" }
  | {
      type: "anime-detail";
      animeId: number;
      slug: string;
    }
  | {
      type: "anime-watch";
      animeId: number;
      slug: string;
      episode: number;
      dub: "sub" | "eng" | "hin";
    }
  | {
      type: "comic-series";
      comicId: string;
    }
  | {
      type: "comic-reader";
      comicId: string;
      chapterId: string;
      chapterNumber: number;
    };

/**
 * Converts a title to a URL-friendly slug (e.g. "Attack on Titan (Season 2)" -> "attack-on-titan-season-2")
 */
export function slugify(text?: string | null): string {
  if (!text) return "anime";
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "anime";
}

/**
 * Extracts AniList integer ID from slug (e.g. "attack-on-titan-16498" -> 16498)
 */
export function extractIdFromSlug(slug: string): number | null {
  if (!slug) return null;
  // Try pattern: trailing number (slug-12345)
  const endMatch = slug.match(/-(\d+)$/);
  if (endMatch) {
    const id = parseInt(endMatch[1], 10);
    if (!isNaN(id) && id > 0) return id;
  }
  // Try pattern: purely numeric (12345)
  if (/^\d+$/.test(slug)) {
    const id = parseInt(slug, 10);
    if (!isNaN(id) && id > 0) return id;
  }
  // Try leading number (12345-slug)
  const startMatch = slug.match(/^(\d+)-/);
  if (startMatch) {
    const id = parseInt(startMatch[1], 10);
    if (!isNaN(id) && id > 0) return id;
  }
  return null;
}

export function buildAnimeDetailUrl(anime: {
  id: number;
  title?: { english?: string | null; romaji?: string | null; userPreferred?: string | null };
}): string {
  const title = anime.title?.english || anime.title?.romaji || anime.title?.userPreferred || "anime";
  const slug = slugify(title);
  return `/anime/${slug}-${anime.id}`;
}

export function buildAnimeWatchUrl(
  anime: {
    id: number;
    title?: { english?: string | null; romaji?: string | null; userPreferred?: string | null };
  },
  episode: number,
  dub: "sub" | "eng" | "hin" = "sub"
): string {
  const title = anime.title?.english || anime.title?.romaji || anime.title?.userPreferred || "anime";
  const slug = slugify(title);
  const dubParam = dub !== "sub" ? `?dub=${dub}` : "";
  return `/anime/${slug}-${anime.id}/episode/${episode}${dubParam}`;
}

export function buildComicUrl(comicId: string | number): string {
  return `/comics/${encodeURIComponent(comicId)}`;
}

export function buildComicReaderUrl(
  comicId: string | number,
  chapterId: string,
  chapterNumber = 1
): string {
  return `/comics/${encodeURIComponent(comicId)}/read/${encodeURIComponent(chapterId)}?ch=${chapterNumber}`;
}

/**
 * Parses browser pathname & search into structured AppRoute
 */
export function parseLocation(pathname: string, search: string): AppRoute {
  const cleanPath = pathname.replace(/\/+$/, "").toLowerCase() || "/";
  const params = new URLSearchParams(search);

  // Home
  if (cleanPath === "/" || cleanPath === "/home") {
    return { type: "home" };
  }

  // Anime Top-level
  if (cleanPath === "/anime") {
    return { type: "anime" };
  }

  // Movies
  if (cleanPath === "/movies" || cleanPath.startsWith("/movies/")) {
    return { type: "movies" };
  }

  // Drama
  if (cleanPath === "/drama" || cleanPath.startsWith("/drama/")) {
    return { type: "drama" };
  }

  // Comics
  if (cleanPath === "/comics") {
    return { type: "comics" };
  }

  // Anime Episode Watch: /anime/:slug/episode/:ep or /anime/:slug/watch
  const animeWatchMatch = cleanPath.match(/^\/anime\/([^/]+)\/(?:episode\/(\d+)|watch)$/);
  if (animeWatchMatch) {
    const rawSlug = animeWatchMatch[1];
    const animeId = extractIdFromSlug(rawSlug);
    if (animeId) {
      const epNumber = parseInt(animeWatchMatch[2] || params.get("ep") || "1", 10) || 1;
      const rawDub = (params.get("dub") || "sub").toLowerCase();
      const dub: "sub" | "eng" | "hin" = rawDub === "hin" ? "hin" : rawDub === "eng" ? "eng" : "sub";
      return {
        type: "anime-watch",
        animeId,
        slug: rawSlug,
        episode: epNumber,
        dub,
      };
    }
  }

  // Anime Detail: /anime/:slug
  const animeDetailMatch = cleanPath.match(/^\/anime\/([^/]+)$/);
  if (animeDetailMatch) {
    const rawSlug = animeDetailMatch[1];
    const animeId = extractIdFromSlug(rawSlug);
    if (animeId) {
      return {
        type: "anime-detail",
        animeId,
        slug: rawSlug,
      };
    }
    return { type: "anime" };
  }

  // Comic Reader: /comics/:comicId/read/:chapterId
  const comicReaderMatch = cleanPath.match(/^\/comics\/([^/]+)\/read\/([^/]+)$/);
  if (comicReaderMatch) {
    const comicId = comicReaderMatch[1];
    const chapterId = comicReaderMatch[2];
    const chapterNumber = parseInt(params.get("ch") || "1", 10) || 1;
    return {
      type: "comic-reader",
      comicId,
      chapterId,
      chapterNumber,
    };
  }

  // Comic Series Detail: /comics/:comicId
  const comicSeriesMatch = cleanPath.match(/^\/comics\/([^/]+)$/);
  if (comicSeriesMatch) {
    return {
      type: "comic-series",
      comicId: comicSeriesMatch[1],
    };
  }

  return { type: "home" };
}
