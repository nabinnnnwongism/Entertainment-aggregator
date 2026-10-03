import { getApiConfig } from "./config";

export type ComicSummary = {
  id: string | number;
  slug?: string;
  title: string;
  cover: string;
  genre?: string;
  genres?: string[];
  rating?: string | number;
  views?: string | number;
  updated?: boolean;
  type?: "manga" | "manhwa" | "manhua";
  status?: string;
  description?: string;
  latestChapter?: string;
};

export type ComicHomeData = {
  bentoTop10: ComicSummary[];
  manhwaPreview: ComicSummary[];
  mangaPreview: ComicSummary[];
  manhuaPreview: ComicSummary[];
  trending: ComicSummary[];
  popular: ComicSummary[];
  topRated: ComicSummary[];
};

export type ComicChapter = {
  id: string;
  chapter: string | number;
  title?: string;
  updatedAt?: string;
};

export type ComicDetail = {
  id: string;
  slug?: string;
  title: string;
  cover: string;
  description?: string;
  status?: string;
  rating?: string | number;
  genres?: string[];
  chapters: ComicChapter[];
};

export type ComicPageImage = {
  page: number;
  url: string;
  rawUrl?: string;
};

export type ComicChapterPages = {
  chapterId: string;
  pageCount: number;
  pages: ComicPageImage[];
};

export async function fetchComicsHome(): Promise<ComicHomeData> {
  const config = await getApiConfig();
  try {
    const res = await fetch(`${config.COMICS_API}/api/manga/home`);
    if (res.ok) {
      const data = await res.json();
      return {
        bentoTop10: data.bentoTop10 || [],
        manhwaPreview: data.manhwaPreview || [],
        mangaPreview: data.mangaPreview || [],
        manhuaPreview: data.manhuaPreview || [],
        trending: data.trending || data.bentoTop10 || [],
        popular: data.popular || [],
        topRated: data.topRated || [],
      };
    }
  } catch (err) {
    console.warn("Comics home fetch failed:", err);
  }
  return {
    bentoTop10: [],
    manhwaPreview: [],
    mangaPreview: [],
    manhuaPreview: [],
    trending: [],
    popular: [],
    topRated: [],
  };
}

export async function fetchComicsByCategory(
  type: "manga" | "manhwa" | "manhua" | "all",
  genre = "all",
  page = 1,
  perPage = 24
): Promise<ComicSummary[]> {
  const config = await getApiConfig();
  try {
    const categoryPath = type === "all" ? "manga" : type;
    const res = await fetch(
      `${config.COMICS_API}/api/manga/category/${categoryPath}?genre=${encodeURIComponent(
        genre
      )}&page=${page}&perPage=${perPage}`
    );
    if (res.ok) {
      const data = await res.json();
      return Array.isArray(data) ? data : data.items || [];
    }
  } catch (err) {
    console.warn("Comics category fetch failed:", err);
  }
  return [];
}

export async function searchComics(query: string): Promise<ComicSummary[]> {
  if (!query.trim()) return [];
  const config = await getApiConfig();
  try {
    const res = await fetch(`${config.COMICS_API}/api/manga/search?q=${encodeURIComponent(query)}`);
    if (res.ok) {
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    }
  } catch (err) {
    console.warn("Comics search failed:", err);
  }
  return [];
}

export async function fetchComicDetails(comicId: string | number): Promise<ComicDetail> {
  const config = await getApiConfig();
  const res = await fetch(`${config.COMICS_API}/api/manga/info/${comicId}`);
  if (!res.ok) {
    throw new Error(`Failed to load comic info for ${comicId}`);
  }
  return await res.json();
}

export async function fetchChapterPages(chapterId: string): Promise<ComicChapterPages> {
  const config = await getApiConfig();
  const res = await fetch(`${config.COMICS_API}/api/manga/read/${chapterId}`);
  if (!res.ok) {
    throw new Error(`Failed to load chapter pages for ${chapterId}`);
  }
  return await res.json();
}
