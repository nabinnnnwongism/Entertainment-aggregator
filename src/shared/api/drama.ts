import { getApiConfig } from "./config";

export type DramaSummary = {
  id: number | string;
  title: string;
  thumbnail: string;
  episodesCount?: number;
  rating?: number | string;
  status?: string;
  description?: string;
};

export type DramaHomeData = {
  show: DramaSummary[];
  korean: DramaSummary[];
  chinese: DramaSummary[];
  topRating: DramaSummary[];
  lastUpdate: DramaSummary[];
};

export type DramaEpisode = {
  id: number | string;
  number: number;
  sub?: number;
};

export type DramaDetail = {
  id: number | string;
  title: string;
  description?: string;
  thumbnail: string;
  status?: string;
  episodes: DramaEpisode[];
};

export type DramaSubtitle = {
  label: string;
  file: string;
  rawFile?: string;
  default?: boolean;
};

export type DramaStreamResult = {
  episodeId: string | number;
  type: string;
  streamUrl: string;
  subtitles: DramaSubtitle[];
};

export async function fetchDramaHome(): Promise<DramaHomeData> {
  const config = await getApiConfig();
  try {
    const res = await fetch(`${config.DRAMA_API}/api/drama/home`);
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn("Drama home fetch failed:", err);
  }
  return {
    show: [],
    korean: [],
    chinese: [],
    topRating: [],
    lastUpdate: [],
  };
}

export async function searchDramas(query: string): Promise<DramaSummary[]> {
  if (!query.trim()) return [];
  const config = await getApiConfig();
  try {
    const res = await fetch(`${config.DRAMA_API}/api/drama/search?q=${encodeURIComponent(query)}`);
    if (res.ok) {
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    }
  } catch (err) {
    console.warn("Drama search failed:", err);
  }
  return [];
}

export async function fetchDramaInfo(dramaId: number | string): Promise<DramaDetail> {
  const config = await getApiConfig();
  const res = await fetch(`${config.DRAMA_API}/api/drama/info/${dramaId}`);
  if (!res.ok) {
    throw new Error(`Failed to load drama details for ID ${dramaId}`);
  }
  return await res.json();
}

export async function fetchDramaStream(episodeId: number | string): Promise<DramaStreamResult> {
  const config = await getApiConfig();
  const res = await fetch(`${config.DRAMA_API}/api/drama/stream/${episodeId}`);
  if (!res.ok) {
    throw new Error(`Failed to load drama stream for episode ${episodeId}`);
  }
  return await res.json();
}
