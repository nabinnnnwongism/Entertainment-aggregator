import { apiUrl } from '../../../../runtimeConfig';

const backendApi = (path) => apiUrl(`/api${path.startsWith('/') ? path : `/${path}`}`);

// In-memory cache for Hindi availability checks (AniList ID → languages[])
const _hindiAvailCache = new Map();
const _HINDI_AVAIL_TTL = 30 * 60 * 1000; // 30 minutes

/**
 * Check if an anime has Hindi/Indian dub available on AnimeRulz.
 * Queries /api/animerulz/availability which hits stream provider APIs.
 */
export async function checkHindiDub(anilistId) {
  if (!anilistId) return [];
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
    console.warn('[HindiAPI] Availability check failed:', err.message);
  }
  _hindiAvailCache.set(cacheKey, { languages: [], ts: Date.now() });
  return [];
}

/**
 * Check Hindi dub availability by AniList ID (async).
 */
export async function hasHindiDub(anilistId) {
  const langs = await checkHindiDub(anilistId);
  return langs.includes('hindi');
}

/**
 * Fetch AnimeRulz Hindi Dub catalog.
 * Streams batches via `onBatch` callback for fast initial render.
 */
export async function getHindiAnimeList(onBatch, fetchAniListFn, mapMediaToDetailFn, MEDIA_FRAGMENT) {
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
            const data = await fetchAniListFn(`
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
                ...mapMediaToDetailFn(media),
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
    console.warn('[HindiAPI] Catalogue fetch failed:', err.message);
  }

  // Fallback: If catalog returned no items, load popular AniList catalog
  if (merged.length === 0) {
    console.log('[HindiAPI] Using popular AniList fallback...');
    try {
      const fallbackData = await fetchAniListFn(`
        query {
          Page(page: 1, perPage: 40) {
            media(type: ANIME, sort: POPULARITY_DESC) { ${MEDIA_FRAGMENT} }
          }
        }
      `);
      if (fallbackData?.Page?.media) {
        merged = fallbackData.Page.media.map(media => ({
          ...mapMediaToDetailFn(media),
          hasHindiDub: true,
          hindiAvailable: true,
          hindiLanguages: ['hindi']
        }));
        if (typeof onBatch === 'function') onBatch(merged);
      }
    } catch (err) {
      console.warn('[HindiAPI] Fallback query failed:', err.message);
    }
  }

  merged.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
  return merged;
}
