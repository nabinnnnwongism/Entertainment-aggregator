type TmdbResponse = {
  results: Array<{
    id: number;
    title?: string;
    name?: string;
    overview?: string;
    release_date?: string;
    first_air_date?: string;
    backdrop_path?: string | null;
    poster_path?: string | null;
    genre_ids?: number[];
    vote_average?: number;
  }>;
};

export type TmdbMovie = {
  id: number | string;
  slug?: string;
  title: string;
  year: string;
  genre: string;
  synopsis: string;
  backdrop: string;
  poster: string;
  rating: number;
};

const genreNames: Record<number, string> = {
  12: "Adventure",
  14: "Fantasy",
  16: "Animation",
  18: "Drama",
  27: "Horror",
  28: "Action",
  35: "Comedy",
  36: "History",
  53: "Thriller",
  80: "Crime",
  878: "Science Fiction",
  9648: "Mystery",
  10749: "Romance",
};

const imageBase = "https://image.tmdb.org/t/p";

function asMovie(movie: TmdbResponse["results"][number]): TmdbMovie | null {
  const imagePath = movie.backdrop_path ?? movie.poster_path;
  if (!imagePath) return null;
  const genres =
    (movie.genre_ids ?? [])
      .map((id) => genreNames[id])
      .filter(Boolean)
      .slice(0, 2)
      .join(" · ") || "Movie";
  return {
    id: movie.id,
    title: movie.title ?? movie.name ?? "Untitled",
    year: (movie.release_date ?? movie.first_air_date ?? "").slice(0, 4) || "—",
    genre: genres,
    synopsis: movie.overview || "No synopsis is available for this title.",
    backdrop: `${imageBase}/w1280${imagePath}`,
    poster: `${imageBase}/w500${movie.poster_path ?? imagePath}`,
    rating: movie.vote_average ?? 0,
  };
}

async function requestTmdb<T>(path: string): Promise<T> {
  const apiKey = import.meta.env.VITE_TMDB_API_KEY || "ecb37597e45cfeed0586f3cd57233d0b";
  const separator = path.includes("?") ? "&" : "?";
  const response = await fetch(
    `https://api.themoviedb.org/3${path}${separator}api_key=${encodeURIComponent(
      apiKey
    )}&language=en-US`
  );
  if (!response.ok) throw new Error("TMDB could not load movies.");
  return response.json() as Promise<T>;
}

export async function fetchTmdbMovies(path: string): Promise<TmdbMovie[]> {
  const data = await requestTmdb<TmdbResponse>(path);
  return data.results.map(asMovie).filter((movie): movie is TmdbMovie => movie !== null);
}

export async function searchTmdbMovies(query: string): Promise<TmdbMovie[]> {
  return fetchTmdbMovies(
    `/search/movie?query=${encodeURIComponent(query)}&include_adult=false`
  );
}

export async function fetchSimilarMovies(id: number): Promise<TmdbMovie[]> {
  return fetchTmdbMovies(`/movie/${id}/recommendations`);
}

export async function fetchTrailerKey(id: number): Promise<string | null> {
  const data = await requestTmdb<{
    results: Array<{ key?: string; site?: string; type?: string }>;
  }>(`/movie/${id}/videos`);
  const trailer = data.results.find(
    (video) =>
      video.site === "YouTube" &&
      (video.type === "Trailer" || video.type === "Teaser")
  );
  return trailer?.key ?? null;
}

// ─── Genre → TMDB discover/trending query ────────────────────────────────────
type CatalogQuery =
  | { type: "trending" }
  | { type: "movie" | "tv"; params: Record<string, string> };

const GENRE_QUERY: Record<string, CatalogQuery> = {
  All:            { type: "trending" },
  Bollywood:      { type: "movie", params: { with_original_language: "hi", sort_by: "popularity.desc" } },
  "Hindi Dubbed": { type: "movie", params: { with_original_language: "hi", sort_by: "release_date.desc", "vote_count.gte": "5" } },
  Hollywood:      { type: "movie", params: { with_original_language: "en", sort_by: "popularity.desc", "vote_count.gte": "200" } },
  "Web Series":   { type: "tv",    params: { with_original_language: "hi", sort_by: "popularity.desc" } },
  Action:         { type: "movie", params: { with_genres: "28",    sort_by: "popularity.desc", "vote_count.gte": "100" } },
  Drama:          { type: "movie", params: { with_genres: "18",    sort_by: "popularity.desc", "vote_count.gte": "100" } },
  Romance:        { type: "movie", params: { with_genres: "10749", sort_by: "popularity.desc", "vote_count.gte": "100" } },
  Thriller:       { type: "movie", params: { with_genres: "53",    sort_by: "popularity.desc", "vote_count.gte": "100" } },
  Comedy:         { type: "movie", params: { with_genres: "35",    sort_by: "popularity.desc", "vote_count.gte": "100" } },
  Horror:         { type: "movie", params: { with_genres: "27",    sort_by: "popularity.desc", "vote_count.gte": "100" } },
  Punjabi:        { type: "movie", params: { with_original_language: "pa", sort_by: "popularity.desc" } },
  Tamil:          { type: "movie", params: { with_original_language: "ta", sort_by: "popularity.desc" } },
  Telugu:         { type: "movie", params: { with_original_language: "te", sort_by: "popularity.desc" } },
};

/**
 * Fetches movies/shows from TMDB based on genre label.
 * Returns up to `limit` results with HD posters, real titles, and ratings.
 */
export async function fetchTmdbCatalog(
  genre: string,
  page = 1,
  limit = 36
): Promise<TmdbMovie[]> {
  const query = GENRE_QUERY[genre] ?? GENRE_QUERY["All"];

  let basePath: string;
  if (query.type === "trending") {
    basePath = `/trending/movie/week`;
  } else {
    const qs = new URLSearchParams(query.params).toString();
    basePath = `/discover/${query.type}?${qs}`;
  }

  // Fetch multiple pages if needed (TMDB returns 20 per page)
  const pages = Math.ceil(limit / 20);
  const requests = Array.from({ length: pages }, (_, i) => {
    const pageNum = page + i;
    const sep = basePath.includes("?") ? "&" : "?";
    return requestTmdb<TmdbResponse>(`${basePath}${sep}page=${pageNum}`);
  });

  const responses = await Promise.all(requests);
  const allResults = responses.flatMap((r) => r.results || []);
  return allResults
    .filter((m) => m.poster_path)
    .map(asMovie)
    .filter((m): m is TmdbMovie => m !== null)
    .slice(0, limit);
}

/**
 * Searches TMDB by text query (movies and shows).
 */
export async function searchTmdbCatalog(query: string, limit = 40): Promise<TmdbMovie[]> {
  const data = await requestTmdb<TmdbResponse>(
    `/search/multi?query=${encodeURIComponent(query)}&include_adult=false&page=1`
  );
  return (data.results || [])
    .filter((m) => m.poster_path)
    .map(asMovie)
    .filter((m): m is TmdbMovie => m !== null)
    .slice(0, limit);
}

// Keep for backwards compatibility
export async function enrichMovieWithTmdb(movie: any): Promise<TmdbMovie> {
  return movie as TmdbMovie;
}
export async function enrichMoviesList(movies: any[]): Promise<TmdbMovie[]> {
  return movies as TmdbMovie[];
}
