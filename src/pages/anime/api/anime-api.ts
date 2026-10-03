export type FeaturedAnime = {
  id: number;
  title: string;
  description: string | null;
  image: string | null;
  episodes: number | null;
};

type ApiConfig = { ANIME_API: string };

type AniListResponse = {
  data?: {
    Page?: {
      media?: Array<{
        id: number;
        title?: { english?: string | null; romaji?: string | null };
        coverImage?: { large?: string | null };
        bannerImage?: string | null;
        description?: string | null;
        episodes?: number | null;
      }>;
    };
  };
};

const featuredQuery = `{ Page(page: 1, perPage: 1) { media(type: ANIME, sort: TRENDING_DESC) { id title { english romaji } coverImage { large } bannerImage description episodes } } }`;

function plainText(value: string | null | undefined) {
  return value?.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim() || null;
}

export async function getFeaturedAnime(): Promise<FeaturedAnime> {
  const configResponse = await fetch("/eetnet-config.json");
  if (!configResponse.ok) throw new Error("Unable to load EetNet configuration.");
  const config = (await configResponse.json()) as ApiConfig;
  const response = await fetch(`${config.ANIME_API}/api/anilist`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: featuredQuery }),
  });
  if (!response.ok) throw new Error("Anime catalogue request failed.");
  const payload = (await response.json()) as AniListResponse;
  const media = payload.data?.Page?.media?.[0];
  const title = media?.title?.english ?? media?.title?.romaji;
  if (!media || !title) throw new Error("No featured anime returned.");
  return {
    id: media.id,
    title,
    description: plainText(media.description),
    image: media.bannerImage ?? media.coverImage?.large ?? null,
    episodes: media.episodes ?? null,
  };
}
