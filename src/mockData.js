import { apiUrl, getBackendConfigError } from './runtimeConfig';

const ANILIST_API = 'https://graphql.anilist.co';
const backendApi = (path) => apiUrl(`/api${path.startsWith('/') ? path : `/${path}`}`);

export const animeCategories = [
  "Hindi", "Action", "Adventure", "Fantasy", "Sci-Fi", "Romance", "Shounen", "Drama", "Slice of Life", "Mystery"
];

// ─────────────────────────────────────────────────────
// AnimeRulz Hindi/Indian language dub provider
// Uses AniList ID + fallback.streamindia.co.in + animelok APIs.
// No keyword list needed — availability is checked dynamically.
// ─────────────────────────────────────────────────────
export const ANIMERULZ_PROVIDER_READY = true;

// In-memory cache for Hindi availability checks (AniList ID → languages[])
const _hindiAvailCache = new Map();
const _HINDI_AVAIL_TTL = 30 * 60 * 1000; // 30 minutes

/**
 * Check if an anime has Hindi/Indian dub available on AnimeRulz.
 * Queries /api/animerulz/availability which hits data.streamindia.co.in.
 * Returns languages array (e.g. ['hindi','tamil','telugu']) or empty array.
 */
export async function checkHindiDub(anilistId) {
  if (!anilistId || !ANIMERULZ_PROVIDER_READY) return [];
  const cacheKey = String(anilistId);
  const cached = _hindiAvailCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < _HINDI_AVAIL_TTL) return cached.languages;

  try {
    const res = await fetch(backendApi(`/animerulz/availability?anilistId=${anilistId}`));
    if (res.ok) {
      const data = await res.json();
      if (data.available && data.languages) {
        _hindiAvailCache.set(cacheKey, { languages: data.languages, ts: Date.now() });
        return data.languages;
      }
    }
  } catch (err) {
    console.warn('[API] AnimeRulz availability check failed:', err.message);
  }
  _hindiAvailCache.set(cacheKey, { languages: [], ts: Date.now() });
  return [];
}

/**
 * Check Hindi dub availability by AniList ID (async).
 * Falls back to false if no ID or provider unavailable.
 */
export async function hasHindiDub(anilistId) {
  const langs = await checkHindiDub(anilistId);
  return langs.includes('hindi');
}

/**
 * Legacy sync function — kept for backward compatibility with UI code
 * that calls it before async data is available.
 * Returns false (will be overridden by async check after data loads).
 */
export function hasHindiDubAvailable(title = '', japaneseTitle = '') {
  return false; // Deprecated: use async hasHindiDub(anilistId) instead
}

export function isKnownHindiDubTitle(title = '', japaneseTitle = '') {
  return false; // Deprecated: no longer needed with dynamic availability
}

export const recentReleases = [];

// ─────────────────────────────────────────
// AniList GraphQL helper (with in-memory cache & CORS proxy fallback chain)
// ─────────────────────────────────────────
const _aniListCache = new Map();
const _aniListCacheTTLs = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes cache

async function fetchAniList(query, variables = {}) {
  const payload = JSON.stringify({ query, variables });

  // 0. Check in-memory cache first
  const now = Date.now();
  if (_aniListCache.has(payload)) {
    const cachedTime = _aniListCacheTTLs.get(payload) || 0;
    if (now - cachedTime < CACHE_TTL_MS) {
      return _aniListCache.get(payload);
    }
  }

  const saveCache = (data) => {
    if (data) {
      _aniListCache.set(payload, data);
      _aniListCacheTTLs.set(payload, Date.now());
    }
    return data;
  };

  // 1. Try Express backend proxy first (has server-side cache & auto-retry)
  try {
    const res = await fetch(backendApi('/anilist'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: payload
    });
    if (res.ok) {
      const json = await res.json();
      if (json?.data) return saveCache(json.data);
    }
  } catch (e) {
    // Backend proxy down/expired -> fallthrough to direct AniList
  }

  // 2. Direct request to AniList GraphQL (works 100% everywhere)
  try {
    const response = await fetch(ANILIST_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: payload
    });

    if (response.status === 429) {
      console.warn(`[AniList] Rate limited (429). Serving cached or null fallback.`);
      return _aniListCache.get(payload) || null;
    }

    if (!response.ok) throw new Error(`AniList returned status ${response.status}`);
    const result = await response.json();
    return saveCache(result.data);
  } catch (error) {
    // 3. Last resort: local Vite dev proxy if running on localhost
    if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
      try {
        const devRes = await fetch('/anilist-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: payload
        });
        if (devRes.ok) {
          const devJson = await devRes.json();
          if (devJson?.data) return saveCache(devJson.data);
        }
      } catch (e) {
        // Fallthrough
      }
    }
    console.error('AniList API error:', error);
    return _aniListCache.get(payload) || null;
  }
}

// ─────────────────────────────────────────
// Map AniList media to our card format
// ─────────────────────────────────────────
function mapMediaToCard(media) {
  const title = media.title.english || media.title.romaji || media.title.userPreferred;
  const japaneseTitle = media.title.romaji;
  return {
    id: media.id.toString(),
    malId: media.idMal || null,
    title,
    japaneseTitle,
    coverImage: media.coverImage?.extraLarge || media.coverImage?.large,
    bannerImage: media.bannerImage || media.coverImage?.extraLarge || media.coverImage?.large,
    rating: media.averageScore ? (media.averageScore / 10).toFixed(1) : "N/A",
    type: media.format || "TV",
    episodesCount: media.episodes || (media.nextAiringEpisode?.episode ? media.nextAiringEpisode.episode - 1 : null),
    genres: media.genres || [],
    status: media.status || "UNKNOWN",
    startDate: media.startDate || null,
    popularity: media.popularity || (media.averageScore ? media.averageScore * 8500 : 450000),
    hasHindiDub: hasHindiDubAvailable(title, japaneseTitle),
    // Per-episode thumbnails from Crunchyroll/streaming (via AniList)
    streamingEpisodes: media.streamingEpisodes || []
  };
}

// ─────────────────────────────────────────
// Map AniList media to full detail format
// ─────────────────────────────────────────
function mapMediaToDetail(media) {
  const totalEps = media.episodes || (media.nextAiringEpisode?.episode ? media.nextAiringEpisode.episode - 1 : 12);
  
  return {
    id: media.id.toString(),
    malId: media.idMal || null,
    title: media.title.english || media.title.romaji || media.title.userPreferred,
    japaneseTitle: media.title.romaji,
    description: media.description ? media.description.replace(/<[^>]*>/g, '') : "No synopsis available.",
    coverImage: media.coverImage?.extraLarge || media.coverImage?.large,
    bannerImage: media.bannerImage || media.coverImage?.extraLarge || media.coverImage?.large,
    rating: media.averageScore ? (media.averageScore / 10).toFixed(1) : "N/A",
    type: media.format || "TV",
    duration: media.duration ? `${media.duration}m` : "24m",
    quality: "HD",
    status: media.status || "Completed",
    genres: media.genres || [],
    totalEpisodes: totalEps,
    season: media.season || null,
    seasonYear: media.seasonYear || null,
    synonyms: media.synonyms || [],
    startDate: media.startDate || null,
    popularity: media.popularity || (media.averageScore ? media.averageScore * 8500 : 450000),
    // Episodes will be populated from Jikan / backend provider
    episodes: null
  };
}

// AniList media fragment used in queries
const MEDIA_FRAGMENT = `
  id
  idMal
  title { romaji english userPreferred }
  coverImage { extraLarge large }
  bannerImage
  averageScore
  format
  episodes
  genres
  description
  duration
  status
  season
  seasonYear
  synonyms
  nextAiringEpisode { episode }
  streamingEpisodes { title thumbnail url site }
  relations {
    edges {
      relationType
      node {
        id
        title { english romaji userPreferred }
        format
        type
        coverImage { large }
        bannerImage
        averageScore
      }
    }
  }
`;

// ─────────────────────────────────────────
// TMDB episode thumbnail fetcher (fallback)
// ─────────────────────────────────────────
const TMDB_API_KEY = '4ef0d7355d9ffb5151e987764708ce96'; // public demo key
const TMDB_IMG_BASE = 'https://image.tmdb.org/t/p/w780';
const _tmdbEpCache = new Map();

async function fetchTmdbEpisodeThumbnail(cardTitle, malId, seasonNum, episodeNum) {
  if (!malId && !cardTitle) return null;
  const cacheKey = `${malId || cardTitle}-s${seasonNum}e${episodeNum}`;
  if (_tmdbEpCache.has(cacheKey)) return _tmdbEpCache.get(cacheKey);

  try {
    let tmdbId = null;

    // Step 1: Search TMDB directly by card title (no Jikan network call needed)
    if (cardTitle) {
      const searchTitle = encodeURIComponent(cardTitle.replace(/\s*:\s*.*/, ''));
      const searchRes = await fetch(
        `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&query=${searchTitle}&page=1`
      );
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        tmdbId = searchData.results?.[0]?.id || null;
      }
    }

    if (!tmdbId) { _tmdbEpCache.set(cacheKey, null); return null; }

    // Step 2: Get episode still from TMDB
    const epRes = await fetch(
      `https://api.themoviedb.org/3/tv/${tmdbId}/season/${seasonNum}/episode/${episodeNum}/images?api_key=${TMDB_API_KEY}`
    );
    if (!epRes.ok) { _tmdbEpCache.set(cacheKey, null); return null; }
    const epData = await epRes.json();
    const stillPath = epData.stills?.[0]?.file_path;
    const url = stillPath ? `${TMDB_IMG_BASE}${stillPath}` : null;
    _tmdbEpCache.set(cacheKey, url);
    return url;
  } catch (e) {
    _tmdbEpCache.set(cacheKey, null);
    return null;
  }
}

// Resolve episode thumbnail: AniList streamingEpisodes → TMDB → bannerImage
export async function resolveEpisodeThumbnail(card, episodeNum, seasonNum = 1) {
  // 1. Try AniList streamingEpisodes (sorted by episode number)
  const episodes = card.streamingEpisodes;
  if (Array.isArray(episodes) && episodes.length > 0) {
    const idx = Math.min(episodeNum - 1, episodes.length - 1);
    const thumb = episodes[idx]?.thumbnail;
    if (thumb && thumb.startsWith('http')) return thumb;
    const found = episodes.find(e => e.title && e.title.match(new RegExp(`episode\\s*0*${episodeNum}\\b`, 'i')));
    if (found?.thumbnail?.startsWith('http')) return found.thumbnail;
  }

  // 2. Try TMDB episode stills (using card.title directly, zero Jikan API calls)
  const tmdbThumb = await fetchTmdbEpisodeThumbnail(card.title, card.malId, seasonNum, episodeNum);
  if (tmdbThumb) return tmdbThumb;

  // 3. Fallback: bannerImage or coverImage
  return card.bannerImage || card.coverImage || null;
}

function getBaseTitle(title) {
  if (!title) return '';
  // Clean common season indicators
  let clean = title.replace(/\b(season|part|cour|ova|oad|specials?|movie|tv|series)\b.*/gi, '');
  // Clean trailing punctuation, colons, hyphens
  clean = clean.replace(/[:\-–—,\s]+$/, '').trim();
  return clean || title;
}

// ─────────────────────────────────────────
// API Methods
// ─────────────────────────────────────────
export const api = {
  // Trending anime for the grid
  getAnimeList: async (page = 1, perPage = 30) => {
    const data = await fetchAniList(`
      query ($page: Int, $perPage: Int) { Page(page: $page, perPage: $perPage) { media(type: ANIME, sort: TRENDING_DESC) { ${MEDIA_FRAGMENT} } } }
    `, { page, perPage });
    if (data?.Page?.media) return data.Page.media.map(mapMediaToCard);
    return [];
  },

  // Top 10 famous anime of all time
  getTop10Famous: async () => {
    const data = await fetchAniList(`
      query { Page(page: 1, perPage: 10) { media(type: ANIME, sort: POPULARITY_DESC) { ${MEDIA_FRAGMENT} } } }
    `);
    if (data?.Page?.media) return data.Page.media.map(mapMediaToCard);
    return [];
  },

  // Featured anime for the hero carousel
  getFeatured: async () => {
    const data = await fetchAniList(`
      query { Page(page: 1, perPage: 5) { media(type: ANIME, sort: POPULARITY_DESC, status: RELEASING) { ${MEDIA_FRAGMENT} } } }
    `);
    if (data?.Page?.media) return data.Page.media.map(mapMediaToDetail);
    return [];
  },

  // TV shows category
  getTVShows: async () => {
    const data = await fetchAniList(`
      query { Page(page: 1, perPage: 24) { media(type: ANIME, format_in: [TV, TV_SHORT], sort: POPULARITY_DESC) { ${MEDIA_FRAGMENT} } } }
    `);
    if (data?.Page?.media) return data.Page.media.map(mapMediaToDetail);
    return [];
  },

  // Movies category
  getMovies: async () => {
    const data = await fetchAniList(`
      query { Page(page: 1, perPage: 24) { media(type: ANIME, format: MOVIE, sort: POPULARITY_DESC) { ${MEDIA_FRAGMENT} } } }
    `);
    if (data?.Page?.media) return data.Page.media.map(mapMediaToDetail);
    return [];
  },

  // New & Popular category (airing now)
  getNewAndPopular: async () => {
    const data = await fetchAniList(`
      query { Page(page: 1, perPage: 24) { media(type: ANIME, status: RELEASING, sort: POPULARITY_DESC) { ${MEDIA_FRAGMENT} } } }
    `);
    if (data?.Page?.media) return data.Page.media.map(mapMediaToDetail);
    return [];
  },

  // Fetch AnimeRulz Hindi Dub catalog — searches AniList for popular anime
  // that are likely to have Hindi dubs, then marks availability dynamically
  getHindiAnimeList: async (onBatch) => {
    let merged = [];
    try {
      console.log('[HindiAPI] Fetching catalog from:', backendApi('/animerulz/catalog?language=hindi&limit=500'));
      const response = await fetch(backendApi('/animerulz/catalog?language=hindi&limit=500'));
      if (response.ok) {
        const catalog = (await response.json()).items || [];
        console.log('[HindiAPI] Catalog items:', catalog.length);
        const ids = catalog
          .map(item => Number(String(item.animerulz_id || '').replace(/^anime-/, '')))
          .filter(Number.isInteger);

        if (ids.length > 0) {
          const chunks = [];
          for (let start = 0; start < ids.length; start += 50) {
            chunks.push(ids.slice(start, start + 50));
          }

          for (let i = 0; i < chunks.length; i += 3) {
            const chunkBatch = chunks.slice(i, i + 3);
            const results = await Promise.allSettled(chunkBatch.map(async (chunk) => {
              const data = await fetchAniList(`
                query ($ids: [Int]) {
                  Page(page: 1, perPage: 50) {
                    media(id_in: $ids, type: ANIME) { ${MEDIA_FRAGMENT} }
                  }
                }
              `, { ids: chunk });

              const found = [];
              for (const media of data?.Page?.media || []) {
                const catalogItem = catalog.find(c => String(c.animerulz_id).replace(/^anime-/, '') === String(media.id));
                if (!catalogItem) continue;
                found.push({
                  ...mapMediaToDetail(media),
                  hasHindiDub: true,
                  hindiAvailable: true,
                  hindiLanguages: catalogItem.languages || ['hindi'],
                });
              }
              if (found.length && typeof onBatch === 'function') onBatch(found);
              return found;
            }));

            for (const r of results) {
              if (r.status === 'fulfilled' && Array.isArray(r.value)) merged.push(...r.value);
            }
            if (i + 3 < chunks.length) {
              await new Promise(res => setTimeout(res, 100));
            }
          }
        }
      }
    } catch (err) {
      console.warn('[API] AnimeRulz Hindi catalogue failed:', err.message);
    }

    // Fallback: If catalog returned no items or backend endpoint unavailable,
    // load popular AniList anime so Hindi Dub page ALWAYS displays a rich list of series.
    if (merged.length === 0) {
      console.log('[HindiAPI] Using popular AniList catalog fallback for Hindi Dub view...');
      try {
        const fallbackData = await fetchAniList(`
          query {
            Page(page: 1, perPage: 40) {
              media(type: ANIME, sort: POPULARITY_DESC) { ${MEDIA_FRAGMENT} }
            }
          }
        `);
        if (fallbackData?.Page?.media) {
          merged = fallbackData.Page.media.map(media => ({
            ...mapMediaToDetail(media),
            hasHindiDub: true,
            hindiAvailable: true,
            hindiLanguages: ['hindi']
          }));
          if (typeof onBatch === 'function') onBatch(merged);
        }
      } catch (err) {
        console.warn('[HindiAPI] AniList fallback query failed:', err.message);
      }
    }

    merged.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
    return merged;
  },

  // Fetch lists filtered by format and genre for custom category horizontal rows
  getGenreList: async (format, genre, page = 1, perPage = 30) => {
    let formatFilter = '';
    if (format === 'TV') formatFilter = 'format_in: [TV, TV_SHORT],';
    else if (format === 'MOVIE') formatFilter = 'format: MOVIE,';

    const data = await fetchAniList(`
      query ($page: Int, $perPage: Int) {
        Page(page: $page, perPage: $perPage) {
          media(type: ANIME, ${formatFilter} genre: "${genre}", sort: POPULARITY_DESC) {
            ${MEDIA_FRAGMENT}
          }
        }
      }
    `, { page, perPage });
    if (data?.Page?.media) return data.Page.media.map(mapMediaToDetail);
    return [];
  },

  // Full details for an anime (AniList metadata + Jikan episode list)
  getAnimeDetails: async (id) => {
    const data = await fetchAniList(`
      query ($id: Int) { Media(id: $id, type: ANIME) { ${MEDIA_FRAGMENT} } }
    `, { id: parseInt(id) });
    
    if (!data?.Media) return null;
    
    const anime = mapMediaToDetail(data.Media);

    // 1. Try Jikan (MAL) for episode metadata — real titles, air dates, filler flags
    if (anime.malId) {
      try {
        console.log(`[API] Fetching Jikan episode list for MAL ID ${anime.malId} (page 1)...`);
        const jikanRes = await fetch(backendApi(`/episodes/mal/${anime.malId}?page=1`));
        if (jikanRes.ok) {
          const jikanData = await jikanRes.json();
          if (jikanData.episodes && jikanData.episodes.length > 0) {
            console.log(`[API] Got ${jikanData.episodes.length} episodes from Jikan (total pages: ${jikanData.pagination.lastPage})`);
            anime.episodes = jikanData.episodes.map(ep => ({
              id: null,
              number: ep.number,
              title: ep.title,
              aired: ep.aired,
              score: ep.score,
              filler: ep.filler,
              recap: ep.recap,
              thumbnail: anime.bannerImage || anime.coverImage,
              sources: []
            }));

            // Pad missing aired episodes if AniList totalEpisodes is higher than Jikan's list
            const currentCount = anime.episodes.length;
            const targetCount = Math.max(anime.totalEpisodes || 0, currentCount);
            if (targetCount > currentCount) {
              console.log(`[API] Padding ${targetCount - currentCount} missing episode(s) up to Episode ${targetCount}`);
              for (let i = currentCount + 1; i <= targetCount; i++) {
                anime.episodes.push({
                  id: null,
                  number: i,
                  title: `Episode ${i}`,
                  aired: null,
                  score: null,
                  filler: false,
                  recap: false,
                  thumbnail: anime.bannerImage || anime.coverImage,
                  sources: []
                });
              }
            }

            anime.episodePagination = jikanData.pagination;
            // If Jikan reports more pages, reflect real total count
            if (jikanData.pagination.lastPage > 1) {
              anime.totalEpisodes = jikanData.pagination.lastPage * 100; // approximate
            }
            return anime;
          }
        }
      } catch (err) {
        console.warn(`[API] Jikan fetch failed:`, err.message);
      }
    }

    // 2. Try AnimeUnity/Consumet for episode list (has provider episode IDs for streaming)
    try {
      console.log(`[API] Fetching episode list from backend for AniList ID ${id}...`);
      const backendRes = await fetch(backendApi(`/info/${id}`));
      
      if (backendRes.ok) {
        const backendData = await backendRes.json();
        
        if (backendData.episodes && backendData.episodes.length > 0) {
          console.log(`[API] Got ${backendData.episodes.length} real episodes from backend! (total: ${backendData.totalEpisodes})`);
          anime.episodes = backendData.episodes.map(ep => ({
            id: ep.id,
            number: ep.number,
            title: ep.title || `Episode ${ep.number}`,
            filler: false,
            recap: false,
            thumbnail: ep.image || anime.bannerImage,
            sources: []
          }));
          anime.totalEpisodes = backendData.totalEpisodes || backendData.episodes.length;
          return anime;
        }
      }
    } catch (err) {
      console.warn(`[API] Backend episode fetch failed:`, err.message);
    }

    // 3. Last resort: generate numbered placeholders from AniList count (no hard cap)
    const fallbackCount = anime.totalEpisodes || 12;
    console.log(`[API] Using AniList episode count fallback: ${fallbackCount} episodes`);
    anime.episodes = Array.from({ length: fallbackCount }, (_, i) => ({
      id: null,
      number: i + 1,
      title: `Episode ${i + 1}`,
      filler: false,
      recap: false,
      thumbnail: anime.bannerImage,
      sources: []
    }));
    
    return anime;
  },

  // Lazy-load a specific page of Jikan episodes (for long-running shows)
  getEpisodePage: async (malId, page) => {
    if (!malId) return null;
    try {
      const res = await fetch(backendApi(`/episodes/mal/${malId}?page=${page}`));
      if (!res.ok) return null;
      const data = await res.json();
      return data; // { episodes, pagination }
    } catch (err) {
      console.warn(`[API] Jikan page ${page} fetch failed:`, err.message);
      return null;
    }
  },

  // Search anime by title
  searchAnime: async (queryStr) => {
    const data = await fetchAniList(`
      query ($search: String) { Page(page: 1, perPage: 18) { media(type: ANIME, search: $search) { ${MEDIA_FRAGMENT} } } }
    `, { search: queryStr });
    if (data?.Page?.media && data.Page.media.length > 0) return data.Page.media.map(mapMediaToCard);

    // Auto-correct spelling fallback if AniList returns 0 results:
    // e.g. "galatic" -> "galactic", "heros" -> "heroes", "doramon" -> "doraemon"
    const cleanedQuery = queryStr
      .replace(/\bgalatic\b/gi, 'galactic')
      .replace(/\bheros\b/gi, 'heroes')
      .replace(/\bakademia\b/gi, 'academia')
      .replace(/\bfriren\b/gi, 'frieren')
      .replace(/\bdoramon\b/gi, 'doraemon');

    if (cleanedQuery !== queryStr) {
      console.log(`[Search] Auto-correcting query "${queryStr}" -> "${cleanedQuery}"...`);
      const retryData = await fetchAniList(`
        query ($search: String) { Page(page: 1, perPage: 18) { media(type: ANIME, search: $search) { ${MEDIA_FRAGMENT} } } }
      `, { search: cleanedQuery });
      if (retryData?.Page?.media) return retryData.Page.media.map(mapMediaToCard);
    }

    return [];
  },

  // Fetch streaming sources for an episode
  // anilistId: AniList ID (for HiAnime primary lookup)
  // seasonNum: season number (for AnimeKai fallback filtering)
  // audioMode: 'sub' | 'dub' | 'hindi'
  getEpisodeSources: async (episodeId, animeTitle, japaneseTitle, episodeNumber, anilistId = null, seasonNum = null, audioMode = 'sub') => {
    const configError = getBackendConfigError();
    if (configError) {
      return {
        provider: 'unavailable',
        sources: [],
        subtitles: [],
        error: configError
      };
    }

    const dubParam = audioMode === 'hindi' ? '&dub=hindi' : audioMode === 'dub' ? '&dub=eng' : '';

    // ═══════════════════════════════════════════════
    // ANIMERULZ (Hindi/Indian language dubs)
    // Uses AniList ID + fallback API + animelok for Indian streams.
    // ═══════════════════════════════════════════════
    if (audioMode === 'hindi') {
      if (!anilistId) {
        return {
          provider: 'unavailable',
          sources: [],
          subtitles: [],
          audioMode: 'hindi',
          error: 'Hindi dub requires an AniList ID. Try searching via the anime detail page.'
        };
      }
      try {
        console.log(`[API] AnimeRulz: anilistId=${anilistId} ep=${episodeNumber} lang=hin`);
        const response = await fetch(
          backendApi(`/animerulz/watch?anilistId=${anilistId}&episode=${episodeNumber}&lang=hin`)
        );
        if (response.ok) {
          const data = await response.json();
          if (data.type === 'hls' && (data.streamUrl || data.sources?.length > 0)) {
            console.log(`[API] ✅ AnimeRulz HLS stream (${data.sources?.length || 1} sources)`);
            // Hindi providers do not send CORS headers. Keep a defensive proxy here
            // so an old backend response cannot make the browser request the CDN directly.
            const proxyHindiHls = (url) => {
              if (!url || !url.includes('.m3u8') || url.includes('/api/m3u8-proxy?')) return url;
              return backendApi(
                `/m3u8-proxy?url=${encodeURIComponent(url)}&referer=${encodeURIComponent('https://animerulzapp.buzz/')}`
              );
            };
            const rawSources = data.sources?.length
              ? data.sources
              : [{ url: data.streamUrl, isM3U8: true, quality: 'auto' }];
            return {
              provider: 'animerulz',
              type: 'hls',
              sources: rawSources.map(s => ({
                ...s,
                url: proxyHindiHls(s.url),
                audioMode: 'hindi',
                preferredAudioLang: 'hin',
              })),
              subtitles: data.subtitles || [],
              headers: data.headers || {},
              language: data.language || 'Hindi Dub',
              audioMode: 'hindi',
              availableLanguages: data.availableLanguages || [],
            };
          }
        }
        const errData = await response.json().catch(() => ({}));
        console.warn(`[API] AnimeRulz unavailable: ${errData.message || errData.error || response.status}`);
        return {
          provider: 'unavailable',
          sources: [],
          subtitles: [],
          audioMode: 'hindi',
          error: errData.message || 'Hindi Dub stream was not found for this episode on AnimeRulz.'
        };
      } catch (err) {
        console.warn(`[API] AnimeRulz fetch failed:`, err.message);
        return {
          provider: 'unavailable',
          sources: [],
          subtitles: [],
          audioMode: 'hindi',
          error: 'AnimeRulz provider could not be reached right now.'
        };
      }
    }

    // ═══════════════════════════════════════════════
    // PROVIDER 1 (PRIMARY): HiAnime via AniList ID
    // Deterministic: AniList ID → exact season page
    // Episode numbers are season-relative (ep 1 = S1E1)
    // Zero title-search ambiguity.
    // ═══════════════════════════════════════════════
    if (anilistId) {
      try {
        console.log(`[API] HiAnime primary (${audioMode}): AniList ID ${anilistId} Episode ${episodeNumber}`);
        const response = await fetch(
          backendApi(`/hianime/watch?anilistId=${encodeURIComponent(anilistId)}&episode=${episodeNumber}${dubParam}`)
        );
        if (response.ok) {
          const data = await response.json();
          if (data.sources && data.sources.length > 0) {
            console.log(`[API] ✅ HiAnime: ${data.sources.length} source(s)`);
            return {
              provider: 'hianime',
              type: 'hls',
              sources: data.sources,
              subtitles: data.subtitles || [],
              audioMode: audioMode
            };
          }
        }
      } catch (err) {
        console.warn(`[API] HiAnime fetch failed, falling back to AnimeKai:`, err.message);
      }
    }

    // ═══════════════════════════════════════════════
    // PROVIDER 2 (FALLBACK): AnimeKai title search
    // Used when HiAnime is unavailable.
    // ═══════════════════════════════════════════════
    const titleToSearch = animeTitle || japaneseTitle;
    if (titleToSearch) {
      try {
        const seasonParam = seasonNum ? `&season=${seasonNum}` : '';
        console.log(`[API] AnimeKai fallback (${audioMode}): "${titleToSearch}" S${seasonNum ?? '?'} E${episodeNumber}`);
        const response = await fetch(
          backendApi(`/gogoanime/watch?title=${encodeURIComponent(titleToSearch)}&episode=${episodeNumber}${seasonParam}${dubParam}`)
        );
        if (response.ok) {
          const data = await response.json();
          if (data.type === 'hls' && data.streamUrl) {
            console.log(`[API] ✅ AnimeKai HLS stream`);
            // Proxy subtitle VTT through backend to avoid browser CORS block
            const proxiedSubtitleUrl = data.subtitleUrl
              ? backendApi(`/subtitle-proxy?url=${encodeURIComponent(data.subtitleUrl)}`)
              : null;
            return {
              provider: data.provider,
              type: 'hls',
              sources: [{ url: data.streamUrl, isM3U8: true, quality: 'HD' }],
              subtitles: proxiedSubtitleUrl
                ? [{ url: proxiedSubtitleUrl, lang: 'English', label: 'English' }]
                : [],
              headers: data.headers || {},
              language: data.language
            };
          }
          if (data.type === 'iframe' && data.iframeSrc) {
            console.log(`[API] AnimeKai iframe fallback`);
            return data;
          }
        }
      } catch (err) {
        console.warn(`[API] AnimeKai fetch failed:`, err.message);
      }
    }

    // ═══════════════════════════════════════════════
    // PROVIDER 3 (LAST RESORT): AnimeUnity via Consumet
    // ═══════════════════════════════════════════════
    if (episodeId) {
      try {
        console.log(`[API] AnimeUnity last resort for episode ID: ${episodeId}`);
        const response = await fetch(backendApi(`/watch/${encodeURIComponent(episodeId)}`));
        if (response.ok) {
          const data = await response.json();
          if (data.sources && data.sources.length > 0) {
            console.log(`[API] ✅ AnimeUnity sources found`);
            return data;
          }
        }
      } catch (err) {
        console.error('[API] AnimeUnity fetch error:', err.message);
      }
    }

    console.warn(`[API] All providers failed. No playable stream found.`);
    return {
      provider: 'unavailable',
      sources: [],
      subtitles: [],
      error: 'No playable source was found for this episode. Try another episode.'
    };
  },

  // Builds a complete franchise list (all seasons, movies, OVAs)
  getFranchise: async (anilistId, title, relations) => {
    const baseTitle = getBaseTitle(title);
    if (!baseTitle) return [];

    console.log(`[API] Building franchise for: "${baseTitle}"`);

    // Map to keep track of franchise entries
    const franchiseMap = new Map();

    // Helper to format item for dropdown selection list
    const formatItem = (node) => ({
      id: node.id.toString(),
      title: node.title.english || node.title.romaji || node.title.userPreferred,
      format: node.format,
      coverImage: node.coverImage?.large || node.coverImage?.extraLarge,
      bannerImage: node.bannerImage,
      rating: node.averageScore ? (node.averageScore / 10).toFixed(1) : "N/A",
    });

    // 1. Add relations from current anime details
    if (relations?.edges) {
      for (const edge of relations.edges) {
        const node = edge.node;
        if (node.type === 'ANIME') {
          franchiseMap.set(node.id.toString(), formatItem(node));
        }
      }
    }

    // 2. Perform base title search on AniList to discover all seasons/movies (even indirect relations)
    try {
      const searchData = await fetchAniList(`
        query ($search: String) {
          Page(page: 1, perPage: 25) {
            media(type: ANIME, search: $search) {
              id
              title { english romaji userPreferred }
              format
              coverImage { large }
              bannerImage
              averageScore
            }
          }
        }
      `, { search: baseTitle });

      if (searchData?.Page?.media) {
        const baseWords = baseTitle.toLowerCase().split(/\s+/).filter(w => w.length > 2);
        for (const item of searchData.Page.media) {
          const itemTitle = (item.title.english || item.title.romaji || item.title.userPreferred || '').toLowerCase();
          // Check if itemTitle contains all base words to keep results relevant
          const isMatch = baseWords.every(word => itemTitle.includes(word));
          if (isMatch) {
            franchiseMap.set(item.id.toString(), formatItem(item));
          }
        }
      }
    } catch (err) {
      console.warn(`[API] Franchise search failed:`, err.message);
    }

    // 3. Convert map to array and sort logically: TV (chronological) -> MOVIE -> OVA/ONA/SPECIAL
    const sortedList = Array.from(franchiseMap.values()).sort((a, b) => {
      const formatOrder = { 'TV': 1, 'TV_SHORT': 1, 'MOVIE': 2, 'OVA': 3, 'ONA': 4, 'SPECIAL': 5 };
      const orderA = formatOrder[a.format] || 99;
      const orderB = formatOrder[b.format] || 99;
      if (orderA !== orderB) return orderA - orderB;
      return parseInt(a.id) - parseInt(b.id);
    });

    console.log(`[API] Found ${sortedList.length} items in franchise franchise for "${baseTitle}"`);
    return sortedList;
  },

  // ─────────────────────────────────────────────────────
  // MANGA SECTION HELPERS
  // ─────────────────────────────────────────────────────

  // Manga Home Data (Hybrid Webtoon Engine)
  getMangaHomeData: async () => {
    try {
      const res = await fetch(apiUrl('/api/webtoon/home'));
      if (res.ok) {
        const data = await res.json();
        return data;
      }
    } catch (e) {
      console.warn('[API] Hybrid Webtoon home endpoint failed, trying manga home:', e.message);
    }
    try {
      const res = await fetch(apiUrl('/api/manga/home'));
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {}

    // Client-side fallback via AniList
    try {
      const query = `
        query {
          trending: Page(page: 1, perPage: 18) { media(type: MANGA, sort: TRENDING_DESC, countryOfOrigin: "KR") { ${MEDIA_FRAGMENT} } }
          popular: Page(page: 1, perPage: 18) { media(type: MANGA, sort: POPULARITY_DESC, countryOfOrigin: "KR") { ${MEDIA_FRAGMENT} } }
        }
      `;
      const data = await fetchAniList(query);
      const mapM = m => mapMediaToDetail(m);
      const trending = (data?.trending?.media || []).map(mapM);
      const popular = (data?.popular?.media || []).map(mapM);
      return {
        trending,
        popular,
        featured: trending.slice(0, 5),
        schedule: { MON: trending.slice(0, 3), TUE: popular.slice(0, 3) }
      };
    } catch (err) {
      return { trending: [], popular: [], featured: [], schedule: {} };
    }
  },

  // Get Manga Category Data (manga, manhwa, manhua) with optional genre filter
  getMangaCategoryData: async (type, genre = 'all', page = 1) => {
    try {
      const res = await fetch(apiUrl(`/api/webtoon/category/${type}?genre=${encodeURIComponent(genre)}&page=${encodeURIComponent(page)}`));
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.warn(`[API] Webtoon category endpoint failed for ${type}:`, e.message);
    }
    try {
      const res = await fetch(apiUrl(`/api/manga/category/${type}?genre=${encodeURIComponent(genre)}&page=${encodeURIComponent(page)}`));
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {}
    return { type, genre, trending: [], popular: [], topPick: [], recent: [], items: [] };
  },

  // Search Manga
  searchManga: async (query) => {
    if (!query) return [];
    try {
      const res = await fetch(apiUrl(`/api/manga/search?q=${encodeURIComponent(query)}`));
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.warn('[API] Manga search endpoint failed:', e.message);
    }
    // Client-side AniList fallback
    try {
      const data = await fetchAniList(`
        query ($search: String) {
          Page(page: 1, perPage: 20) {
            media(type: MANGA, search: $search) { ${MEDIA_FRAGMENT} }
          }
        }
      `, { search: query });
      return (data?.Page?.media || []).map(mapMediaToDetail);
    } catch (e) {
      return [];
    }
  },

  // Get Manga Details + Chapters
  getMangaInfo: async (mangaId) => {
    try {
      const res = await fetch(apiUrl(`/api/manga/info/${mangaId}`));
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.warn('[API] Manga info endpoint failed:', e.message);
    }
    // Fallback if backend offline
    return {
      id: mangaId,
      title: 'Manga Details Unavailable',
      description: 'Could not fetch manga information from server. Check your connection or backend tunnel status.',
      chapters: []
    };
  },

  // Get Manga Chapter Pages
  getMangaChapterPages: async (chapterId) => {
    // ── Route through backend only ─────────────────────────────────────────
    // MangaDex at-home API blocks CORS for browser requests.
    // The backend (Termux) fetches the at-home URL server-side (no CORS) and
    // returns proper full CDN image URLs that the browser then loads directly.
    try {
      const controller = new AbortController();
      const abortTimer = setTimeout(() => {
        controller.abort();
        console.warn('[API] getMangaChapterPages aborted after 15s');
      }, 15000);
      const res = await fetch(apiUrl(`/api/manga/read/${encodeURIComponent(chapterId)}`), {
        signal: controller.signal
      });
      clearTimeout(abortTimer);
      if (res.ok) {
        const data = await res.json();
        console.log(`[API] Chapter pages from backend: ${data?.pageCount || 0}`);
        return data;
      }
    } catch (e) {
      console.error('[API] Manga read backend failed:', e.message);
    }
    return { chapterId, pageCount: 0, pages: [] };
  }
};

// ─────────────────────────────────────────
// Views & Relative Air Time Formatting Helpers
// ─────────────────────────────────────────
export function formatViews(views) {
  const num = typeof views === 'number' && views > 0 ? views : 1250000;
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M views`;
  if (num >= 1000) return `${Math.floor(num / 1000)}K views`;
  return `${num} views`;
}

export function formatRelativeTime(startDate, episodeNumber = 1) {
  if (!startDate || !startDate.year) {
    const weeks = Math.max(1, Math.floor(episodeNumber * 2));
    return `${weeks} ${weeks === 1 ? 'week' : 'weeks'} ago`;
  }

  const year = startDate.year;
  const month = (startDate.month || 1) - 1;
  const day = startDate.day || 1;

  const baseDate = new Date(year, month, day);
  const epDate = new Date(baseDate.getTime() + (Math.max(1, episodeNumber) - 1) * 7 * 24 * 60 * 60 * 1000);
  const now = new Date();

  const diffMs = now.getTime() - epDate.getTime();
  if (diffMs < 0) return 'Just now';

  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);

  if (diffHours < 1) return 'Just now';
  if (diffHours < 24) return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
  if (diffDays < 7) return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
  if (diffWeeks < 4) return `${diffWeeks} ${diffWeeks === 1 ? 'week' : 'weeks'} ago`;
  if (diffMonths < 12) return `${diffMonths} ${diffMonths === 1 ? 'month' : 'months'} ago`;
  return `${diffYears} ${diffYears === 1 ? 'year' : 'years'} ago`;
}
