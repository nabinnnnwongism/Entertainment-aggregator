import express from 'express';
import cors from 'cors';
import axios from 'axios';
import * as cheerio from 'cheerio';

const app = express();
app.set('trust proxy', true);
const PORT = process.env.PORT || 8082;
const startedAt = new Date();

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const COMICKZ_BASE   = process.env.COMICKZ_BASE || 'https://comickz.co.uk';
const HIVETOONS_BASE = process.env.HIVETOONS_BASE || 'https://hivetoons.com';
const HT_HEADERS     = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' };

app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());

// Normalizer: ensure /manga/..., /webtoon/... maps to /api/...
app.use((req, res, next) => {
  if (req.url && !req.url.startsWith('/api/') && req.url !== '/api') {
    req.url = '/api' + req.url;
  }
  next();
});

// Helpers
function publicHost(req) {
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'http')
    .toString().split(',')[0].trim();
  return `${proto}://${req.get('host')}`;
}

function safeOrigin(value) {
  try {
    return new URL(value).origin;
  } catch {
    return value || '';
  }
}

function proxyCoverUrl(host, rawUrl) {
  if (!rawUrl) return null;
  let fullUrl = String(rawUrl).trim();
  if (!fullUrl.startsWith('http://') && !fullUrl.startsWith('https://')) {
    if (fullUrl.startsWith('//')) {
      fullUrl = 'https:' + fullUrl;
    } else {
      fullUrl = 'https://meo.comick.pictures/' + fullUrl.replace(/^\/+/, '');
    }
  }
  return `${host}/api/manga/image-proxy?url=${encodeURIComponent(fullUrl)}`;
}

// ─────────────────────────────────────────────────────
// CACHES & HELPERS
// ─────────────────────────────────────────────────────
const MANGA_GENRE_CACHE_TTL_MS = 15 * 60 * 1000;
const MANGA_GENRE_CACHE_MAX_ITEMS = 240;
const mangaGenreCatalogCache = new Map();
const comickSlugMap = new Map();
const htChapterCache = new Map();

function mapComicKCatalogItem(host, item, countryCode, type) {
  const rawCover = item.default_thumbnail || (item.cover ? `${item.cover}` : (item.md_covers?.[0]?.b2key ? `https://meo.comick.pictures/${item.md_covers[0].b2key}` : null));
  const proxiedCover = proxyCoverUrl(host, rawCover);
  return {
    id: item.slug || String(item.id),
    comickSlug: item.slug,
    hid: item.hid,
    title: item.title || 'Manga',
    cover: proxiedCover,
    banner: proxiedCover,
    coverImage: proxiedCover,
    bannerImage: proxiedCover,
    description: item.desc ? item.desc.replace(/<[^>]*>?/gm, '') : (item.description || ''),
    rating: item.bayesian_rating ? (parseFloat(item.bayesian_rating)).toFixed(1) : '8.7',
    country: item.country || countryCode,
    status: item.status === 2 ? 'Completed' : 'Ongoing',
    type: (type || 'manhwa').toLowerCase()
  };
}

function buildComicKGenreUrl(countryCode, genre) {
  const params = new URLSearchParams({ country: countryCode, genres: genre, limit: '50' });
  return `${COMICKZ_BASE}/api/search?${params.toString()}`;
}

function normalizeComicKPageUrl(candidate) {
  if (!candidate) return null;
  try {
    const url = new URL(candidate, COMICKZ_BASE);
    const trustedHosts = new Set([
      new URL(COMICKZ_BASE).host,
      'api.comick.dev',
      'api.comick.fun',
      'api.comick.io'
    ]);
    if (!trustedHosts.has(url.host) || !url.pathname.includes('search')) return null;
    return url.toString();
  } catch {
    return null;
  }
}

async function fetchComicKGenreBatch(url) {
  const response = await axios.get(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', Referer: `${COMICKZ_BASE}/` },
    timeout: 10000
  });
  return {
    items: response.data?.data || (Array.isArray(response.data) ? response.data : []),
    nextPageUrl: normalizeComicKPageUrl(response.data?.next_page_url)
  };
}

async function getComicKGenreCatalog(countryCode, genre, requiredCount) {
  const cacheKey = `${countryCode}:${genre}`;
  const now = Date.now();
  let cache = mangaGenreCatalogCache.get(cacheKey);

  if (!cache || now - cache.updatedAt > MANGA_GENRE_CACHE_TTL_MS) {
    cache = {
      items: [],
      seenIds: new Set(),
      seenPageUrls: new Set(),
      nextPageUrl: buildComicKGenreUrl(countryCode, genre),
      updatedAt: now,
      fetching: null
    };
    mangaGenreCatalogCache.set(cacheKey, cache);
  }

  while (cache.items.length < requiredCount && cache.nextPageUrl && cache.items.length < MANGA_GENRE_CACHE_MAX_ITEMS) {
    if (cache.seenPageUrls.has(cache.nextPageUrl)) {
      cache.nextPageUrl = null;
      break;
    }
    if (!cache.fetching) {
      const nextUrl = cache.nextPageUrl;
      cache.seenPageUrls.add(nextUrl);
      cache.fetching = fetchComicKGenreBatch(nextUrl)
        .then(({ items, nextPageUrl }) => {
          for (const item of items) {
            const id = item.slug || String(item.id || '');
            if (!id || cache.seenIds.has(id)) continue;
            cache.seenIds.add(id);
            cache.items.push(item);
            if (cache.items.length >= MANGA_GENRE_CACHE_MAX_ITEMS) break;
          }
          cache.nextPageUrl = nextPageUrl && !cache.seenPageUrls.has(nextPageUrl) ? nextPageUrl : null;
          cache.updatedAt = Date.now();
        })
        .finally(() => { cache.fetching = null; });
    }
    await cache.fetching;
  }

  return cache;
}

async function fetchAniListWebtoons(host) {
  const query = `
    query {
      trending: Page(page: 1, perPage: 24) {
        media(type: MANGA, countryOfOrigin: "KR", sort: TRENDING_DESC) {
          id
          title { english romaji userPreferred }
          description
          coverImage { extraLarge large medium color }
          bannerImage
          genres
          averageScore
          popularity
          status
        }
      }
      popular: Page(page: 1, perPage: 24) {
        media(type: MANGA, countryOfOrigin: "KR", sort: POPULARITY_DESC) {
          id
          title { english romaji userPreferred }
          description
          coverImage { extraLarge large medium color }
          bannerImage
          genres
          averageScore
          popularity
          status
        }
      }
    }
  `;

  try {
    const r = await axios.post('https://graphql.anilist.co', { query }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    });

    const trendingRaw = r.data?.data?.trending?.media || [];
    const popularRaw = r.data?.data?.popular?.media || [];

    const mapItem = (m) => {
      const titleStr = m.title.english || m.title.romaji || m.title.userPreferred || 'Webtoon';
      const coverUrl = m.coverImage?.extraLarge || m.coverImage?.large || m.bannerImage;
      const bannerUrl = m.bannerImage || m.coverImage?.extraLarge || m.coverImage?.large;

      return {
        id: String(m.id),
        anilistId: m.id,
        title: titleStr,
        description: m.description ? m.description.replace(/<[^>]*>?/gm, '') : '',
        cover: proxyCoverUrl(host, coverUrl),
        banner: proxyCoverUrl(host, bannerUrl),
        coverImage: proxyCoverUrl(host, coverUrl),
        bannerImage: proxyCoverUrl(host, bannerUrl),
        rating: m.averageScore ? (m.averageScore / 10).toFixed(1) : '9.2',
        popularity: m.popularity || 850000,
        genres: m.genres || ['Fantasy', 'Action'],
        status: m.status === 'FINISHED' ? 'Completed' : 'Ongoing',
        country: 'kr',
        type: 'manhwa'
      };
    };

    const trending = trendingRaw.map(mapItem);
    const popular = popularRaw.map(mapItem);

    const days = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
    const schedule = { MON: [], TUE: [], WED: [], THU: [], FRI: [], SAT: [], SUN: [], COMPLETED: [] };

    const allCombined = [...trending, ...popular];
    const seenIds = new Set();
    const uniqueComics = [];

    for (const item of allCombined) {
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id);
        uniqueComics.push(item);
      }
    }

    uniqueComics.forEach((item, index) => {
      if (item.status === 'Completed') {
        schedule.COMPLETED.push(item);
      } else {
        const dayKey = days[index % days.length];
        schedule[dayKey].push(item);
      }
    });

    return {
      trending,
      popular,
      featured: trending.slice(0, 5),
      schedule,
      all: uniqueComics
    };
  } catch (err) {
    console.error('[HYBRID WEBTOON] AniList query failed:', err.message);
    return null;
  }
}

async function htGet(url) {
  const res = await axios.get(url, { headers: HT_HEADERS, timeout: 15000 });
  return cheerio.load(res.data);
}

// ─────────────────────────────────────────────────────
// COMICS & MANGA ROUTES
// ─────────────────────────────────────────────────────

// GET /api/health
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'eetnet-comics-api',
    uptime: Math.floor((Date.now() - startedAt.getTime()) / 1000),
    port: PORT,
  });
});

// GET /api/manga/home
app.get('/api/manga/home', async (req, res) => {
  const host = publicHost(req);
  try {
    const fetchComicKzList = async (query = '', country = '', limit = 16) => {
      try {
        let url = `${COMICKZ_BASE}/api/search?limit=${limit}`;
        if (query) url += `&q=${encodeURIComponent(query)}`;
        if (country) url += `&country=${encodeURIComponent(country)}`;

        const r = await axios.get(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', Referer: `${COMICKZ_BASE}/` },
          timeout: 7000
        });
        const rawList = r.data?.data || (Array.isArray(r.data) ? r.data : []);
        return rawList.map(item => {
          const rawCover = item.default_thumbnail || (item.cover ? `${item.cover}` : (item.md_covers?.[0]?.b2key ? `https://meo.comick.pictures/${item.md_covers[0].b2key}` : null));
          const proxiedCover = proxyCoverUrl(host, rawCover);
          return {
            id: item.slug || String(item.id),
            comickSlug: item.slug,
            hid: item.hid,
            title: item.title || 'Manga',
            cover: proxiedCover,
            banner: proxiedCover,
            coverImage: proxiedCover,
            bannerImage: proxiedCover,
            description: item.desc ? item.desc.replace(/<[^>]*>?/gm, '') : (item.description || ''),
            rating: item.bayesian_rating ? (parseFloat(item.bayesian_rating)).toFixed(1) : '8.8',
            country: item.country || country || 'jp',
            status: item.status === 2 ? 'Completed' : 'Ongoing',
            type: item.country === 'kr' ? 'manhwa' : item.country === 'cn' ? 'manhua' : 'manga'
          };
        });
      } catch (e) {
        return [];
      }
    };

    let [bentoRaw, manhwaPreview, mangaPreview, manhuaPreview] = await Promise.all([
      fetchComicKzList('leveling', '', 12),
      fetchComicKzList('', 'kr', 12),
      fetchComicKzList('', 'jp', 12),
      fetchComicKzList('', 'cn', 12)
    ]);

    const bentoTop10 = bentoRaw.slice(0, 10);

    return res.json({
      bentoTop10,
      manhwaPreview,
      mangaPreview,
      manhuaPreview,
      trending: bentoRaw,
      popular: manhwaPreview,
      topRated: mangaPreview,
      featured: bentoTop10[0] || null
    });
  } catch (err) {
    console.error('[MANGA HOME] Error:', err.message);
    res.status(500).json({ error: 'Failed to load manga home', message: err.message });
  }
});

// GET /api/manga/category/:type
app.get('/api/manga/category/:type', async (req, res) => {
  const { type } = req.params;
  const { genre } = req.query;
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const perPage = Math.min(50, Math.max(12, Number.parseInt(req.query.perPage, 10) || 24));
  const host = publicHost(req);

  const countryMap = {
    manga: 'jp',
    manhwa: 'kr',
    manhua: 'cn'
  };

  const countryCode = countryMap[type?.toLowerCase()] || 'jp';

  try {
    if (genre && genre !== 'all') {
      const catalog = await getComicKGenreCatalog(countryCode, genre, page * perPage);
      const start = (page - 1) * perPage;
      const pageItems = catalog.items
        .slice(start, start + perPage)
        .map(item => mapComicKCatalogItem(host, item, countryCode, type));
      const hasCachedItemsAhead = catalog.items.length > start + pageItems.length;
      const canFetchMore = Boolean(catalog.nextPageUrl) && catalog.items.length < MANGA_GENRE_CACHE_MAX_ITEMS;

      return res.json({
        type,
        country: countryCode,
        genre,
        page,
        perPage,
        total: catalog.items.length,
        hasMore: hasCachedItemsAhead || canFetchMore,
        items: pageItems,
        trending: [],
        popular: [],
        topPick: [],
        recent: []
      });
    }

    const limit = 48;
    const searchParams = new URLSearchParams({ country: countryCode, limit: String(limit) });
    const url = `${COMICKZ_BASE}/api/search?${searchParams.toString()}`;

    const r = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', Referer: `${COMICKZ_BASE}/` },
      timeout: 8000
    });

    const rawList = r.data?.data || (Array.isArray(r.data) ? r.data : []);
    const items = rawList.map(item => mapComicKCatalogItem(host, item, countryCode, type));

    const trending = items.slice(0, 12);
    const popular = items.slice(12, 24).length ? items.slice(12, 24) : items.slice(0, 12);
    const topPick = items.slice(24, 36).length ? items.slice(24, 36) : items.slice(0, 12);
    const recent = items.slice(36, 48).length ? items.slice(36, 48) : items.slice(0, 12);

    return res.json({
      type,
      country: countryCode,
      genre: genre || 'all',
      page,
      perPage,
      total: items.length,
      hasMore: false,
      trending,
      popular,
      topPick,
      recent,
      items
    });

  } catch (err) {
    console.error(`[MANGA CATEGORY] Error for ${type}:`, err.message);
    return res.status(500).json({ error: `Failed to load ${type} category`, message: err.message });
  }
});

// GET /api/webtoon/home
app.get('/api/webtoon/home', async (req, res) => {
  const host = publicHost(req);
  try {
    const data = await fetchAniListWebtoons(host);
    if (data) {
      return res.json(data);
    }
  } catch (e) {
    console.warn('[WEBTOON HOME] Hybrid fetch failed:', e.message);
  }
  return res.redirect(`${host}/api/manga/home`);
});

// GET /api/webtoon/category/:type
app.get('/api/webtoon/category/:type', async (req, res) => {
  const { type } = req.params;
  const { genre } = req.query;
  const host = publicHost(req);

  try {
    const data = await fetchAniListWebtoons(host);
    if (data && data.all) {
      let filtered = data.all;
      if (genre && genre !== 'all') {
        const gLC = genre.toLowerCase();
        filtered = data.all.filter(item =>
          item.genres.some(g => g.toLowerCase().includes(gLC) || gLC.includes(g.toLowerCase()))
        );
      }
      return res.json({
        type,
        genre: genre || 'all',
        trending: filtered.slice(0, 12),
        popular: filtered.slice(0, 12),
        items: filtered,
        recent: filtered.slice(0, 12)
      });
    }
  } catch (e) {}

  return res.redirect(`${host}/api/manga/category/${type}?genre=${encodeURIComponent(genre || 'all')}`);
});

// GET /api/manga/search?q=<query>
app.get('/api/manga/search', async (req, res) => {
  const q = req.query.q;
  if (!q) return res.json([]);
  const host = publicHost(req);

  try {
    const searchRes = await axios.get(`${COMICKZ_BASE}/api/search?q=${encodeURIComponent(q)}&limit=20`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': `${COMICKZ_BASE}/`
      },
      timeout: 8000
    });

    const rawList = searchRes.data?.data || searchRes.data || [];
    const results = (Array.isArray(rawList) ? rawList : []).map(m => ({
      id: m.slug || String(m.id),
      comickSlug: m.slug,
      hid: m.hid,
      title: m.title || 'Unknown Manga',
      cover: proxyCoverUrl(host, m.default_thumbnail),
      description: m.desc ? m.desc.replace(/<[^>]*>?/gm, '') : '',
      rating: '8.5',
      status: m.status === 2 ? 'Completed' : 'Ongoing',
      genres: [],
      type: 'manga'
    }));

    return res.json(results);
  } catch (e) {
    console.error('[MANGA SEARCH] ComicKz search failed:', e.message);
    return res.json([]);
  }
});

// GET /api/manga/info/:id
app.get('/api/manga/info/:id', async (req, res) => {
  const { id } = req.params;
  console.log(`[MANGA INFO] Request for: ${id}`);
  const host = publicHost(req);
  let slug = id;

  if (/^\d+$/.test(id)) {
    try {
      const aniQuery = `query ($id: Int) { Media(id: $id, type: MANGA) { title { english romaji native } } }`;
      const aniRes = await axios.post('https://graphql.anilist.co', { query: aniQuery, variables: { id: parseInt(id) } }, { timeout: 5000 });
      const t = aniRes.data?.data?.Media?.title;
      const searchTitle = t?.english || t?.romaji || t?.native;
      if (searchTitle) {
        const sRes = await axios.get(`${COMICKZ_BASE}/api/search?q=${encodeURIComponent(searchTitle)}&limit=3`, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', Referer: `${COMICKZ_BASE}/` },
          timeout: 5000
        });
        const first = sRes.data?.data?.[0];
        if (first?.slug) slug = first.slug;
      }
    } catch (e) {
      console.warn('[MANGA INFO] AniList resolution error:', e.message);
    }
  }

  try {
    let allRawChs = [];
    let page = 1;
    while (true) {
      const chRes = await axios.get(`${COMICKZ_BASE}/api/comics/${encodeURIComponent(slug)}/chapter-list?lang=en&page=${page}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', Referer: `${COMICKZ_BASE}/` },
        timeout: 10000
      });
      const list = chRes.data?.data || (Array.isArray(chRes.data) ? chRes.data : []);
      if (!Array.isArray(list) || list.length === 0) break;
      allRawChs = allRawChs.concat(list);

      const lastPage = chRes.data?.pagination?.last_page || 1;
      if (page >= lastPage) break;
      page++;
      if (page > 30) break;
    }

    const seenCh = new Set();
    const chapters = [];

    for (const c of allRawChs) {
      const chNum = c.chap || '1';
      if (seenCh.has(chNum)) continue;
      seenCh.add(chNum);

      const chPath = `${c.hid}-chapter-${c.chap}-${c.lang || 'en'}`;
      chapters.push({
        id: `${slug}___${chPath}`,
        chapter: chNum,
        title: c.title || `Chapter ${chNum}`,
        volume: c.vol || null,
        pages: 0,
        publishAt: c.publish_at || c.created_at
      });
    }

    chapters.sort((a, b) => parseFloat(a.chapter) - parseFloat(b.chapter));

    let title = slug.replace(/^[0-9]+-/, '').replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    let rawCover = null;
    let description = '';

    try {
      const pageRes = await axios.get(`${COMICKZ_BASE}/comic/${encodeURIComponent(slug)}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', Referer: `${COMICKZ_BASE}/` },
        timeout: 6000
      });
      const html = pageRes.data || '';
      const cMatch = html.match(/<script type="application\/json" id="comic-data">([\s\S]*?)<\/script>/i);
      if (cMatch) {
        const cData = JSON.parse(cMatch[1]);
        if (cData.title) title = cData.title;
        if (cData.default_thumbnail) rawCover = cData.default_thumbnail;
        if (cData.desc) description = cData.desc.replace(/<[^>]*>?/gm, '');
      }
    } catch (e) {
      console.warn('[MANGA INFO] Comic page scrape failed, using defaults:', e.message);
    }

    const cover = proxyCoverUrl(host, rawCover);

    return res.json({
      id: slug,
      comickSlug: slug,
      title,
      cover,
      banner: cover,
      description,
      status: 'Ongoing',
      rating: '8.8',
      genres: ['Action', 'Fantasy', 'Adventure'],
      chapters
    });

  } catch (err) {
    console.error(`[MANGA INFO] Failed for ${slug}:`, err.message);
    return res.status(500).json({ error: 'Failed to fetch manga info', message: err.message });
  }
});

// GET /api/manga/read/:chapterId
app.get('/api/manga/read/:chapterId', async (req, res) => {
  const { chapterId } = req.params;
  console.log(`[MANGA READ] Fetching pages for chapter: ${chapterId}`);
  const host = publicHost(req);

  try {
    let slug, chPath;
    if (chapterId.includes('___')) {
      const sepIdx = chapterId.indexOf('___');
      slug = chapterId.substring(0, sepIdx);
      chPath = chapterId.substring(sepIdx + 3);
    } else {
      slug = 'manga';
      chPath = chapterId;
    }

    const chUrl = `${COMICKZ_BASE}/comic/${slug}/${chPath}`;

    const pageRes = await axios.get(chUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': `${COMICKZ_BASE}/comic/${slug}`,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache'
      },
      timeout: 15000,
      maxRedirects: 5
    });

    const html = pageRes.data || '';
    const svMatch = html.match(/<script\s+id="sv-data"\s+type="application\/json">([\s\S]*?)<\/script>/i);

    if (svMatch) {
      let svData;
      try {
        svData = JSON.parse(svMatch[1].trim());
      } catch (parseErr) {
        console.error(`[MANGA READ] JSON parse error:`, parseErr.message);
      }

      if (svData) {
        const rawImages = svData.chapter?.images || [];
        if (rawImages.length) {
          const pages = rawImages.map((imgObj, idx) => {
            let rawUrl = imgObj.url || '';
            if (rawUrl.startsWith('/')) rawUrl = 'https://cdn2.comicknew.pictures' + rawUrl;
            return {
              page: idx + 1,
              url: `${host}/api/manga/image-proxy?url=${encodeURIComponent(rawUrl)}`,
              rawUrl
            };
          });

          return res.json({ chapterId, pageCount: pages.length, pages });
        }
      }
    }

    return res.json({ chapterId, pageCount: 0, pages: [] });
  } catch (err) {
    console.error(`[MANGA READ] Error fetching chapter ${chapterId}:`, err.message);
    return res.json({ chapterId, pageCount: 0, pages: [] });
  }
});

// GET /api/manhwa/chapter/:slug/:chapter (Hivetoons)
app.get('/api/manhwa/chapter/:slug/:chapter', async (req, res) => {
  const { slug, chapter } = req.params;
  const cacheKey = `${slug}:${chapter}`;
  const cached = htChapterCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < 3600000) {
    return res.json(cached.data);
  }

  try {
    console.log(`[MANHWA CHAPTER] Fetching: ${slug}/${chapter}`);
    const $ = await htGet(`${HIVETOONS_BASE}/series/${slug}/${chapter}`);

    const seen = new Set();
    const images = [];
    $('img[src*="storage.hivetoon"]').each((_, el) => {
      const src = $(el).attr('src');
      if (src && src.includes('/series/') && !seen.has(src)) {
        seen.add(src);
        images.push(src);
      }
    });

    const data = { slug, chapter, images };
    htChapterCache.set(cacheKey, { data, timestamp: Date.now() });
    res.json(data);
  } catch (err) {
    console.error('[MANHWA CHAPTER] Error:', err.message);
    res.status(502).json({ error: 'Hivetoons chapter fetch failed', message: err.message });
  }
});

// GET /api/manga/image-proxy & GET /api/img-proxy
const handleImageProxy = async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).send('Missing url parameter');

  const targetUrl = decodeURIComponent(url);
  const maxRetries = 5;

  const referer = targetUrl.includes('comicknew.pictures') ? 'https://comickz.co.uk/' :
    targetUrl.includes('comick.pictures') ? 'https://comick.io/' :
    'https://comickz.co.uk/';

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await axios.get(targetUrl, {
        responseType: 'arraybuffer',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Referer': referer,
          'Accept': 'image/webp,image/avif,image/*,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Origin': 'https://comickz.co.uk'
        },
        timeout: 12000
      });

      const contentType = response.headers['content-type'] || 'image/webp';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.send(Buffer.from(response.data));

    } catch (err) {
      const status = err.response?.status;
      if (status === 429 && attempt < maxRetries) {
        const backoff = attempt * 350 + Math.floor(Math.random() * 200);
        await new Promise(r => setTimeout(r, backoff));
        continue;
      }
      if (status === 403 && attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 200));
        continue;
      }
      console.error(`[MANGA IMAGE PROXY] Error (attempt ${attempt}/${maxRetries}):`, err.message);
      if (attempt === maxRetries && !res.headersSent) {
        // Fallback: Redirect directly to the source URL so browser loads it directly
        return res.redirect(302, targetUrl);
      }
    }
  }
  if (!res.headersSent) {
    return res.redirect(302, targetUrl);
  }
};

app.get('/api/manga/image-proxy', handleImageProxy);
app.get('/api/img-proxy', handleImageProxy);

// START SERVER
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[EETNET-COMICS-API] Service listening on port ${PORT}`);
  console.log(`Endpoints available:`);
  console.log(` - GET  /api/health`);
  console.log(` - GET  /api/manga/home`);
  console.log(` - GET  /api/manga/category/:type (manga, manhwa, manhua)`);
  console.log(` - GET  /api/webtoon/home`);
  console.log(` - GET  /api/webtoon/category/:type`);
  console.log(` - GET  /api/manga/search?q=`);
  console.log(` - GET  /api/manga/info/:id`);
  console.log(` - GET  /api/manga/read/:chapterId`);
  console.log(` - GET  /api/manga/image-proxy?url=`);
  console.log(` - GET  /api/manhwa/chapter/:slug/:chapter`);
});
