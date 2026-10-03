import express from 'express';
import cors from 'cors';
import axios from 'axios';
import * as cheerio from 'cheerio';
import https from 'https';
import { ANIME, META } from '@consumet/extensions';

const app = express();
app.set('trust proxy', true);
const PORT = process.env.PORT || 8080;
const startedAt = new Date();

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());

// Normalizer
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

function unwrapM3u8ProxyUrl(value, maxDepth = 8) {
  let resolved = value;
  for (let depth = 0; depth < maxDepth; depth += 1) {
    try {
      const parsed = new URL(resolved);
      if (parsed.pathname !== '/api/m3u8-proxy') break;
      const nested = parsed.searchParams.get('url');
      if (!nested) break;
      resolved = nested;
    } catch {
      break;
    }
  }
  return resolved;
}

function unwrapStreamIndiaRelayUrl(value) {
  try {
    const parsed = new URL(value);
    if (parsed.hostname !== 'proxy.streamindia.co.in' || parsed.pathname !== '/proxy') return value;
    const directUrl = parsed.searchParams.get('url');
    return directUrl?.startsWith('http') ? directUrl : value;
  } catch {
    return value;
  }
}

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function streamProxyHeaders(targetUrl, referer, extraHeaders = {}) {
  const isProtectedHls = targetUrl.includes('streamindia.co.in') || /https:\/\/as-cdn\d+\.top\//i.test(targetUrl);
  return {
    'User-Agent': BROWSER_UA,
    'Accept': '*/*',
    ...extraHeaders,
    ...(isProtectedHls ? {
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'cross-site',
    } : {}),
    'Referer': referer,
    'Origin': safeOrigin(referer),
  };
}

function streamProxyReferers(targetUrl, primaryReferer) {
  const candidates = [primaryReferer];
  if (targetUrl.includes('streamindia.co.in')) {
    candidates.push(
      'https://animerulzapp.buzz/',
      'https://animelok.streamindia.co.in/',
      'https://extract.streamindia.co.in/',
      'https://proxy.streamindia.co.in/',
      new URL(targetUrl).origin + '/',
    );
  }
  return [...new Set(candidates.filter(Boolean))];
}

async function fetchStreamProxyTarget(targetUrl, primaryReferer, options = {}) {
  const { headers: extraHeaders = {}, ...axiosOptions } = options;
  let lastError;

  for (const referer of streamProxyReferers(targetUrl, primaryReferer)) {
    try {
      const response = await axios.get(targetUrl, {
        ...axiosOptions,
        headers: {
          ...streamProxyHeaders(targetUrl, referer, extraHeaders),
        },
      });
      return response;
    } catch (err) {
      lastError = err;
      const status = err.response?.status;
      const canRetry = targetUrl.includes('streamindia.co.in') && [401, 403, 429, 502].includes(status);
      if (!canRetry) throw err;
    }
  }

  throw lastError;
}

// ─────────────────────────────────────────────────────
// CONSUMET & SCRAPER PROVIDERS
// ─────────────────────────────────────────────────────
const animeUnity = new ANIME.AnimeUnity();
const anilistMeta = new META.Anilist(animeUnity);

const hianime = new ANIME.Hianime();
const anilistHianime = new META.Anilist(hianime);

const hiAnimeEpCache = new Map();
const HIANIME_TTL = 30 * 60 * 1000;

const ANIMEKAI_BASE = 'https://anikai.cc';
const AXIOS_OPTS = {
  timeout: 12000,
  maxRedirects: 5,
  httpsAgent,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': ANIMEKAI_BASE + '/',
  }
};

const animeCache = new Map();
const CACHE_TTL = 60 * 60 * 1000;

const streamCache = new Map();
const STREAM_CACHE_TTL = 20 * 60 * 1000;

const jikanCache = new Map();
const JIKAN_TTL = 60 * 60 * 1000;

// ─────────────────────────────────────────────────────
// ANIMERULZ (HINDI DUB) CONFIG
// ─────────────────────────────────────────────────────
const ANIMERULZ_FALLBACK = process.env.ANIMERULZ_FALLBACK || 'https://fallback.streamindia.co.in';
const ANIMERULZ_DATA     = process.env.ANIMERULZ_DATA     || 'https://data.streamindia.co.in';
const ANIMERULZ_ANIMELOK = process.env.ANIMERULZ_ANIMELOK || 'https://animelok.streamindia.co.in';
const ANIMERULZ_EXTRACT  = process.env.ANIMERULZ_EXTRACT  || 'https://extract.streamindia.co.in';
const ANIMERULZ_HIANIME  = process.env.ANIMERULZ_HIANIME  || 'https://hianime.streamindia.co.in';
const ANIMERULZ_CACHE_TTL = 30 * 60 * 1000;

const ANIMERULZ_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://animerulzapp.buzz/',
  'Origin': 'https://animerulzapp.buzz',
};

const animerulzStreamCache = new Map();
const animerulzDataCache   = new Map();

// ─────────────────────────────────────────────────────
// ANIMEKAI SCRAPER FUNCTIONS
// ─────────────────────────────────────────────────────
async function extractDirectStream(embedUrl) {
  try {
    const { data } = await axios.get(embedUrl, {
      ...AXIOS_OPTS,
      headers: {
        ...AXIOS_OPTS.headers,
        'Referer': ANIMEKAI_BASE + '/'
      }
    });

    const srcMatch = data.match(/const\s+src\s*=\s*["']([^"']+\.m3u8[^"']*)["']/);
    const m3u8Match = data.match(/["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/);
    const streamUrl = srcMatch?.[1] || m3u8Match?.[1];

    if (!streamUrl) return null;

    const url = new URL(embedUrl);
    const subtitleUrl = url.searchParams.get('sub') || null;

    return {
      streamUrl,
      subtitleUrl,
      headers: { 'Referer': new URL(embedUrl).origin + '/' }
    };
  } catch (err) {
    return null;
  }
}

function cleanAnimeTitle(t) {
  return t.toLowerCase()
    .replace(/\s*\((tv|sub|dub|uncensored|media)\)/gi, '')
    .replace(/\s*\(season\s*\d+\)/gi, '')
    .trim();
}

function titleMatchScore(resultName, targetTitle) {
  const r = resultName.toLowerCase().trim();
  const t = targetTitle.toLowerCase().trim();
  const rClean = cleanAnimeTitle(resultName);
  const tClean = cleanAnimeTitle(targetTitle);

  if (r === t || rClean === tClean) return 100;

  const isSequel = /\b(season\s*\d|\d+(st|nd|rd|th)\s+season|part\s*\d|cour\s*\d|movie|movie\s*\d)\b/i.test(r) ||
                   /\b(culling game|shibuya|mugen train|entertainment district|swordsmith|hashira)\b/i.test(r);

  const targetHasSequel = /\b(season\s*\d|\d+(st|nd|rd|th)\s+season|part\s*\d)\b/i.test(t);

  let score = 50;
  if (rClean.startsWith(tClean)) {
    score = 80;
  } else if (rClean.includes(tClean)) {
    score = 60;
  }

  if (isSequel && !targetHasSequel) {
    score -= 45;
  } else if (isSequel && targetHasSequel) {
    score += 20;
  }

  return Math.max(0, score);
}

async function animeKaiSearch(title, seasonNum = null) {
  const performSearch = async (query) => {
    try {
      const url = `${ANIMEKAI_BASE}/browser?keyword=${encodeURIComponent(query)}`;
      const { data } = await axios.get(url, AXIOS_OPTS);
      const $ = cheerio.load(data);
      const results = [];
      $('.aitem').each((_, el) => {
        const poster = $(el).find('a.poster');
        const href = poster.attr('href') || '';
        const slug = href.replace('/watch/', '').trim();
        const name = $(el).find('a.title').text().trim();
        if (slug && name) results.push({ slug, name });
      });
      return results;
    } catch (err) {
      return [];
    }
  };

  const pickBest = (results, targetTitle) => {
    if (results.length === 0) return null;
    const scored = results.map(r => {
      let score = titleMatchScore(r.name, targetTitle);
      if (seasonNum !== null) {
        const nameLC = r.name.toLowerCase();
        const seasonPatterns = [
          new RegExp(`season\\s*${seasonNum}\\b`, 'i'),
          new RegExp(`\\b${seasonNum}(st|nd|rd|th)\\s+season\\b`, 'i'),
          new RegExp(`part\\s*${seasonNum}\\b`, 'i'),
        ];
        if (seasonPatterns.some(p => p.test(nameLC))) score += 30;
        const otherSeasonMatch = nameLC.match(/season\s*(\d+)/i) || nameLC.match(/(\d+)(?:st|nd|rd|th)\s+season/i);
        if (otherSeasonMatch) {
          const foundSeason = parseInt(otherSeasonMatch[1]);
          if (foundSeason !== seasonNum) score -= 50;
        }
        if (seasonNum === 1 && !nameLC.match(/season\s*\d/i)) score += 10;
      }
      return { ...r, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored[0].slug;
  };

  if (seasonNum && seasonNum > 1) {
    const seasonQuery = `${title} Season ${seasonNum}`;
    let results = await performSearch(seasonQuery);
    const best = pickBest(results, seasonQuery);
    if (best) return best;
  }

  let results = await performSearch(title);
  {
    const best = pickBest(results, title);
    if (best) return best;
  }

  const sanitized = title.replace(/[.\-\u2013\u2014:,\s]+$/, '').replace(/\([^)]*\)/g, '').trim();
  if (sanitized && sanitized !== title) {
    results = await performSearch(sanitized);
    const best = pickBest(results, sanitized);
    if (best) return best;
  }

  const parts = sanitized.split(/[:\-\u2013\u2014]/);
  if (parts.length > 1) {
    const base = parts[0].trim();
    if (base && base !== sanitized) {
      results = await performSearch(base);
      const best = pickBest(results, base);
      if (best) return best;
    }
  }

  return null;
}

async function animeKaiGetEpisodeEmbeds(slug, episodeNum) {
  const url = `${ANIMEKAI_BASE}/watch/${slug}/ep-${episodeNum}`;
  const { data } = await axios.get(url, AXIOS_OPTS);
  const $ = cheerio.load(data);
  const servers = { sub: [], dub: [], hsub: [] };

  $('.server-items.lang-group').each((_, group) => {
    const langId = $(group).attr('data-id') || 'sub';
    $(group).find('.server-video').each((_, el) => {
      const embedUrl = $(el).attr('data-video') || '';
      const serverName = $(el).text().trim();
      const isDefault = $(el).hasClass('default');
      if (embedUrl) {
        servers[langId] = servers[langId] || [];
        servers[langId].push({ embedUrl, serverName, isDefault });
      }
    });
  });

  return servers;
}

// ─────────────────────────────────────────────────────
// ANIMERULZ (HINDI DUB) FUNCTIONS
// ─────────────────────────────────────────────────────
function normalizeAnimerulzCatalog(data) {
  const rawItems = Array.isArray(data) ? data : data?.data || data?.results || [];
  return rawItems
    .filter(item => item?.animerulz_id && Array.isArray(item.languages))
    .map(item => ({
      animerulz_id: item.animerulz_id,
      animelok_id: item.animelok_id,
      languages: item.languages.map(language => String(language).toLowerCase()),
    }));
}

async function fetchAnimerulzCatalog() {
  const cacheKey = 'catalog';
  const cached = animerulzDataCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < ANIMERULZ_CACHE_TTL) return cached.data;

  const { data } = await axios.get(`${ANIMERULZ_DATA}/api/dub.json`, {
    timeout: 12000,
    headers: ANIMERULZ_HEADERS,
  });
  const catalog = normalizeAnimerulzCatalog(data);
  animerulzDataCache.set(cacheKey, { data: catalog, ts: Date.now() });
  return catalog;
}

async function fetchAnimerulzEpisodes(anilistId) {
  const cacheKey = `episodes:${anilistId}`;
  const cached = animerulzDataCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < ANIMERULZ_CACHE_TTL) return cached.data;

  try {
    const { data } = await axios.get(`${ANIMERULZ_FALLBACK}/episodes/${anilistId}`, {
      timeout: 10000,
      headers: ANIMERULZ_HEADERS,
    });
    if (data?.data) {
      animerulzDataCache.set(cacheKey, { data: data.data, ts: Date.now() });
      return data.data;
    }
  } catch (err) {}
  return [];
}

async function checkAnimerulzAvailability(anilistId) {
  const cacheKey = `avail:${anilistId}`;
  const cached = animerulzDataCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < ANIMERULZ_CACHE_TTL) return cached.data;

  try {
    const catalog = await fetchAnimerulzCatalog();
    const catalogItem = catalog.find(item => item.animerulz_id === `anime-${anilistId}`);
    if (catalogItem) {
      animerulzDataCache.set(cacheKey, { data: catalogItem, ts: Date.now() });
      return catalogItem;
    }
  } catch (err) {}

  try {
    const { data } = await axios.get(`${ANIMERULZ_DATA}/api/animerulz-id=anime-${anilistId}`, {
      timeout: 8000,
      headers: ANIMERULZ_HEADERS,
    });
    if (data?.languages) {
      animerulzDataCache.set(cacheKey, { data, ts: Date.now() });
      return data;
    }
  } catch (err) {}
  return null;
}

async function resolveAnimerulzStream(anilistId, episodeNum, lang = 'hin') {
  const cacheKey = `${anilistId}:e${episodeNum}:${lang}`;
  const cached = animerulzStreamCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < ANIMERULZ_CACHE_TTL) return cached.data;

  let result = null;
  const avail = await checkAnimerulzAvailability(anilistId);
  const languageNames = { hin: 'hindi', tam: 'tamil', tel: 'telugu', mal: 'malayalam', kan: 'kannada', ben: 'bengali' };
  const langCode = lang.toLowerCase();
  const requestedLanguage = languageNames[langCode];

  if (requestedLanguage && !avail?.languages?.includes(requestedLanguage)) {
    return null;
  }

  if (avail?.animelok_id && avail.languages) {
    const rawIds = Array.isArray(avail.animelok_id) ? avail.animelok_id : [avail.animelok_id];
    const seasons = rawIds.map(id => {
      const raw = String(id || '').trim();
      if (!raw) return null;
      const m = raw.match(/^(.+)-(\d+)x(\d+)$/);
      return m
        ? { slug: m[1], season: parseInt(m[2]), startEp: parseInt(m[3]), raw }
        : { slug: raw, season: 1, startEp: 1, raw };
    }).filter(Boolean).sort((a, b) => b.startEp - a.startEp);

    let targetSeason = seasons.find(s => s.startEp <= episodeNum) || seasons[seasons.length - 1];
    let relativeEp = targetSeason ? episodeNum - targetSeason.startEp + 1 : episodeNum;

    if (targetSeason && relativeEp >= 1) {
      try {
        const alUrl = `${ANIMERULZ_ANIMELOK}/api/anime?id=${encodeURIComponent(targetSeason.raw)}&ep=${relativeEp}`;
        const alRes = await axios.get(alUrl, {
          timeout: 10000,
          headers: ANIMERULZ_HEADERS,
        });

        if (alRes.data?.multi) {
          const extUrl = `${ANIMERULZ_EXTRACT}/api?url=${encodeURIComponent(alRes.data.multi)}`;
          const extRes = await axios.get(extUrl, {
            timeout: 12000,
            headers: ANIMERULZ_HEADERS,
          });

          if (extRes.data?.files?.[langCode]) {
            const m3u8Url = extRes.data.files[langCode];
            result = {
              type: 'hls',
              streamUrl: m3u8Url,
              sources: [{
                url: m3u8Url,
                isM3U8: true,
                quality: 'auto',
                language: langCode.toUpperCase() === 'HIN' ? 'Hindi Dub'
                       : langCode.toUpperCase() === 'TAM' ? 'Tamil Dub'
                       : langCode.toUpperCase() === 'TEL' ? 'Telugu Dub'
                       : langCode.toUpperCase() === 'ENG' ? 'English Dub'
                       : langCode.toUpperCase() === 'JPN' ? 'Japanese Sub'
                       : langCode.toUpperCase(),
                audioMode: 'hindi',
              }],
              subtitles: [],
              headers: {},
              provider: 'animerulz',
              language: langCode,
              audioMode: 'hindi',
              availableLanguages: extRes.data.available_categories || [],
            };
          }
        }
      } catch (err) {}
    }
  }

  if (result) {
    animerulzStreamCache.set(cacheKey, { data: result, ts: Date.now() });
  }
  return result;
}

// ─────────────────────────────────────────────────────
// ANIME ROUTES
// ─────────────────────────────────────────────────────

// GET /api/health
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'eetnet-anime-api',
    uptime: Math.floor((Date.now() - startedAt.getTime()) / 1000),
    port: PORT,
  });
});

// POST /api/anilist
const aniListServerCache = new Map();
const ANILIST_CACHE_TTL = 60 * 60 * 1000;

app.post('/api/anilist', async (req, res) => {
  try {
    const payload = JSON.stringify(req.body);
    const cached = aniListServerCache.get(payload);
    if (cached && Date.now() - cached.ts < ANILIST_CACHE_TTL) {
      return res.json({ data: cached.data });
    }

    let attempts = 0;
    let response = null;

    while (attempts < 3) {
      attempts++;
      try {
        response = await axios.post('https://graphql.anilist.co', req.body, {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) EetNet/1.0'
          },
          timeout: 12000
        });
        if (response.status === 200 && response.data?.data) {
          aniListServerCache.set(payload, { data: response.data.data, ts: Date.now() });
          return res.json({ data: response.data.data });
        }
      } catch (e) {
        const status = e.response?.status;
        if (status === 429 && attempts < 3) {
          await new Promise(r => setTimeout(r, attempts * 500));
        } else {
          if (cached) return res.json({ data: cached.data });
          throw e;
        }
      }
    }

    if (cached) return res.json({ data: cached.data });
    res.status(502).json({ error: 'AniList GraphQL proxy failed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/info/:anilistId
app.get('/api/info/:anilistId', async (req, res) => {
  const { anilistId } = req.params;
  try {
    const info = await anilistMeta.fetchAnimeInfo(anilistId);
    res.json({
      id: info.id,
      title: info.title,
      description: info.description,
      image: info.image,
      cover: info.cover,
      rating: info.rating,
      type: info.type,
      status: info.status,
      totalEpisodes: info.totalEpisodes,
      currentEpisode: info.currentEpisode,
      duration: info.duration,
      genres: info.genres,
      subOrDub: info.subOrDub,
      episodes: (info.episodes || []).map(ep => ({
        id: ep.id,
        number: ep.number,
        title: ep.title || null,
        image: ep.image || null,
        url: ep.url || null
      }))
    });
  } catch (err) {
    res.status(502).json({ error: 'Could not fetch episode data', message: err.message });
  }
});

// GET /api/gogoanime/watch (AnimeKai stream)
app.get('/api/gogoanime/watch', async (req, res) => {
  const { title, episode, season, dub } = req.query;
  const episodeNum = parseInt(episode) || 1;
  const seasonNum = season ? parseInt(season) : null;
  const host = publicHost(req);
  const wantDub = dub === 'eng';

  if (!title) return res.status(400).json({ error: 'Missing title parameter' });

  const effectiveSeason = seasonNum || 1;
  const cacheKey = `${title.toUpperCase().trim()}::s${effectiveSeason}`;

  try {
    let cached = animeCache.get(cacheKey);
    const now = Date.now();

    if (!cached || now - cached.timestamp > CACHE_TTL) {
      const slug = await animeKaiSearch(title, seasonNum);
      if (!slug) {
        return res.status(404).json({ error: `Anime "${title}" not found on AnimeKai` });
      }
      cached = { slug, timestamp: now };
      animeCache.set(cacheKey, cached);
    }

    const servers = await animeKaiGetEpisodeEmbeds(cached.slug, episodeNum);
    const candidates = [];
    if (wantDub) {
      if (servers.dub?.length > 0) servers.dub.forEach(x => candidates.push({ embedUrl: x.embedUrl, language: 'English Dub', server: x.serverName }));
      if (servers.sub?.length > 0) servers.sub.forEach(x => candidates.push({ embedUrl: x.embedUrl, language: 'English Sub', server: x.serverName }));
    } else {
      if (servers.sub?.length > 0) {
        const s = servers.sub.find(x => x.isDefault) || servers.sub[0];
        candidates.push({ embedUrl: s.embedUrl, language: 'English Sub', server: s.serverName });
        servers.sub.filter(x => !x.isDefault).forEach(x => candidates.push({ embedUrl: x.embedUrl, language: 'English Sub', server: x.serverName }));
      }
      if (servers.hsub?.length > 0) servers.hsub.forEach(x => candidates.push({ embedUrl: x.embedUrl, language: 'English Sub (Hardsub)', server: x.serverName }));
      if (servers.dub?.length > 0) servers.dub.forEach(x => candidates.push({ embedUrl: x.embedUrl, language: 'English Dub', server: x.serverName }));
    }

    if (candidates.length === 0) return res.status(404).json({ error: `No streams found for episode ${episodeNum}` });

    const streamCacheKey = `${cached.slug}::ep${episodeNum}::${dub || 'sub'}`;
    const cachedStream = streamCache.get(streamCacheKey);
    if (cachedStream && Date.now() - cachedStream.timestamp < STREAM_CACHE_TTL) {
      const s = cachedStream.data;
      return res.json({
        provider: 'animekai',
        type: 'hls',
        streamUrl: `${host}/api/m3u8-proxy?url=${encodeURIComponent(s.streamUrl)}&referer=${encodeURIComponent(s.headers.Referer)}`,
        subtitleUrl: s.subtitleUrl,
        headers: s.headers,
        episode: episodeNum,
        language: s.language,
        server: s.server,
        cached: true
      });
    }

    let directStream = null;
    let chosenLanguage = 'English Sub';
    let chosenServer = 'unknown';

    const top3 = candidates.slice(0, 3);
    try {
      const result = await Promise.any(
        top3.map(async (candidate) => {
          const extracted = await extractDirectStream(candidate.embedUrl);
          if (!extracted) throw new Error(`${candidate.server} failed`);
          return { extracted, language: candidate.language, server: candidate.server };
        })
      );
      directStream = result.extracted;
      chosenLanguage = result.language;
      chosenServer = result.server;
    } catch {
      for (const candidate of candidates.slice(3)) {
        const extracted = await extractDirectStream(candidate.embedUrl);
        if (extracted) {
          directStream = extracted;
          chosenLanguage = candidate.language;
          chosenServer = candidate.server;
          break;
        }
      }
    }

    if (!directStream) {
      const fallback = candidates[0];
      return res.json({
        provider: 'animekai',
        type: 'iframe',
        iframeSrc: fallback.embedUrl,
        episode: episodeNum,
        language: fallback.language,
        allServers: servers
      });
    }

    streamCache.set(streamCacheKey, {
      data: {
        streamUrl: directStream.streamUrl,
        subtitleUrl: directStream.subtitleUrl,
        headers: directStream.headers,
        language: chosenLanguage,
        server: chosenServer
      },
      timestamp: Date.now()
    });

    res.json({
      provider: 'animekai',
      type: 'hls',
      streamUrl: `${host}/api/m3u8-proxy?url=${encodeURIComponent(directStream.streamUrl)}&referer=${encodeURIComponent(directStream.headers.Referer)}`,
      subtitleUrl: directStream.subtitleUrl,
      headers: directStream.headers,
      episode: episodeNum,
      language: chosenLanguage,
      server: chosenServer,
      allServers: servers
    });
  } catch (err) {
    res.status(500).json({ error: 'AnimeKai scraper error', message: err.message });
  }
});

// GET /api/hianime/watch (HiAnime stream)
app.get('/api/hianime/watch', async (req, res) => {
  const { anilistId, episode, dub } = req.query;
  const episodeNum = parseInt(episode) || 1;
  const subOrDub = dub === 'eng' ? 'dub' : 'sub';

  if (!anilistId) return res.status(400).json({ error: 'Missing anilistId parameter' });

  try {
    const cacheKey = `${anilistId}:${subOrDub}`;
    let epList = null;
    const cached = hiAnimeEpCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < HIANIME_TTL) {
      epList = cached.episodes;
    } else {
      const info = await anilistHianime.fetchAnimeInfo(anilistId, true);
      if (!info?.episodes?.length) {
        return res.status(404).json({ error: `No episodes found on HiAnime for AniList ID ${anilistId}` });
      }
      epList = info.episodes;
      hiAnimeEpCache.set(cacheKey, { episodes: epList, timestamp: Date.now() });
    }

    const ep = epList.find(e => e.number === episodeNum);
    if (!ep) return res.status(404).json({ error: `Episode ${episodeNum} not found on HiAnime` });

    const sources = await hianime.fetchEpisodeSources(ep.id, undefined, subOrDub);
    if (!sources?.sources?.length) {
      return res.status(404).json({ error: `No stream sources found for this episode` });
    }

    return res.json({
      provider: 'hianime',
      type: 'hls',
      sources: sources.sources,
      subtitles: sources.subtitles || [],
      episode: episodeNum,
      episodeTitle: ep.title || null,
      audioMode: subOrDub
    });
  } catch (err) {
    return res.status(500).json({ error: 'HiAnime lookup failed', message: err.message });
  }
});

// GET /api/watch/:episodeId (AnimeUnity fallback stream)
app.get('/api/watch/:episodeId', async (req, res) => {
  const episodeId = req.params.episodeId;
  try {
    const sources = await anilistMeta.fetchEpisodeSources(episodeId);
    if (sources.sources?.length > 0) {
      return res.json({
        provider: 'animeunity',
        type: 'hls',
        sources: sources.sources,
        subtitles: sources.subtitles || [],
        headers: sources.headers || {}
      });
    }
  } catch (err) {}

  try {
    const sources = await animeUnity.fetchEpisodeSources(episodeId);
    if (sources.sources?.length > 0) {
      return res.json({
        provider: 'animeunity-direct',
        type: 'hls',
        sources: sources.sources,
        subtitles: sources.subtitles || [],
        headers: sources.headers || {}
      });
    }
  } catch (err) {}

  res.status(404).json({ error: 'Could not find streaming sources for this episode' });
});

// GET /api/search
app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).json({ error: 'Missing q parameter' });
  try {
    const slug = await animeKaiSearch(query);
    res.json({ slug, results: slug ? [{ slug }] : [] });
  } catch (error) {
    res.status(500).json({ error: 'Search failed' });
  }
});

// GET /api/animerulz/watch (Hindi Dub stream)
app.get('/api/animerulz/watch', async (req, res) => {
  const { anilistId, episode, lang } = req.query;
  const ep = parseInt(episode) || 1;
  const language = lang || 'hin';

  if (!anilistId) return res.status(400).json({ error: 'Missing anilistId parameter' });

  try {
    const result = await resolveAnimerulzStream(anilistId, ep, language);
    if (!result) {
      return res.status(404).json({
        error: 'Stream not found',
        message: `No stream found for anime ${anilistId} episode ${ep} language ${language}.`,
        anilistId, episode: ep, language,
      });
    }

    const host = publicHost(req);
    const referer = result.headers?.Referer || 'https://animerulzapp.buzz/';
    const proxyHlsUrl = (value) => {
      const rawUrl = unwrapM3u8ProxyUrl(value);
      if (!rawUrl || !rawUrl.includes('.m3u8')) return value;
      return `${host}/api/m3u8-proxy?url=${encodeURIComponent(rawUrl)}&referer=${encodeURIComponent(referer)}`;
    };

    res.json({
      ...result,
      streamUrl: proxyHlsUrl(result.streamUrl),
      sources: (result.sources || []).map(source => ({
        ...source,
        url: proxyHlsUrl(source.url),
      })),
    });
  } catch (err) {
    res.status(502).json({ error: 'Stream resolution failed', message: err.message });
  }
});

// GET /api/animerulz/episodes
app.get('/api/animerulz/episodes', async (req, res) => {
  const { anilistId } = req.query;
  if (!anilistId) return res.status(400).json({ error: 'Missing anilistId parameter' });

  try {
    const episodes = await fetchAnimerulzEpisodes(anilistId);
    res.json({ total: episodes.length, episodes });
  } catch (err) {
    res.status(502).json({ error: 'Episode fetch failed', message: err.message });
  }
});

// GET /api/animerulz/availability
app.get('/api/animerulz/availability', async (req, res) => {
  const { anilistId } = req.query;
  if (!anilistId) return res.status(400).json({ error: 'Missing anilistId parameter' });

  try {
    const avail = await checkAnimerulzAvailability(anilistId);
    if (avail) {
      res.json({ available: true, languages: avail.languages, animerulz_id: avail.animerulz_id });
    } else {
      res.json({ available: false });
    }
  } catch (err) {
    res.status(502).json({ error: 'Availability check failed', message: err.message });
  }
});

// GET /api/animerulz/catalog
app.get('/api/animerulz/catalog', async (req, res) => {
  const language = String(req.query.language || req.query.lang || 'hindi').toLowerCase();
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 50));

  try {
    const items = (await fetchAnimerulzCatalog())
      .filter(item => item.languages.includes(language));
    const total = items.length;
    const start = (page - 1) * limit;

    res.json({
      language,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      items: items.slice(start, start + limit),
    });
  } catch (err) {
    res.status(502).json({ error: 'Hindi catalogue fetch failed', message: err.message });
  }
});

// GET /api/episodes/mal/:malId (Jikan MAL Episode Metadata)
app.get('/api/episodes/mal/:malId', async (req, res) => {
  const { malId } = req.params;
  const page = parseInt(req.query.page) || 1;
  const cacheKey = `${malId}:${page}`;

  const cached = jikanCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < JIKAN_TTL) {
    return res.json(cached.data);
  }

  try {
    const jikanUrl = `https://api.jikan.moe/v4/anime/${malId}/episodes?page=${page}`;
    const { data } = await axios.get(jikanUrl, {
      timeout: 10000,
      headers: { 'Accept': 'application/json', 'User-Agent': 'EetNet/1.0' }
    });

    const episodes = (data.data || []).map(ep => ({
      number: ep.mal_id,
      title: ep.title || `Episode ${ep.mal_id}`,
      titleJapanese: ep.title_japanese || null,
      aired: ep.aired ? ep.aired.split('T')[0] : null,
      score: ep.score || null,
      filler: ep.filler || false,
      recap: ep.recap || false,
    }));

    const result = {
      episodes,
      pagination: {
        currentPage: page,
        lastPage: data.pagination?.last_visible_page || 1,
        hasNextPage: data.pagination?.has_next_page || false,
        total: (data.pagination?.last_visible_page || 1) * 100
      }
    };

    jikanCache.set(cacheKey, { data: result, timestamp: Date.now() });
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: 'Could not fetch episode data from Jikan', message: err.message });
  }
});

// GET /api/status
app.get('/api/status', async (req, res) => {
  res.json({
    status: 'ok',
    service: 'eetnet-anime-api',
    uptime: Math.floor((Date.now() - startedAt.getTime()) / 1000),
    checkedAt: new Date().toISOString(),
  });
});

// ─────────────────────────────────────────────────────
// HLS & ASSET PROXIES
// ─────────────────────────────────────────────────────
app.get('/api/m3u8-proxy', async (req, res) => {
  const { url, referer } = req.query;
  if (!url) return res.status(400).send('Missing url');

  try {
    const decodedUrl  = unwrapM3u8ProxyUrl(decodeURIComponent(url));
    const decodedRef  = referer ? decodeURIComponent(referer) : (new URL(decodedUrl).origin + '/');

    const { data } = await fetchStreamProxyTarget(decodedUrl, decodedRef, {
      responseType: 'text',
    });

    const host = publicHost(req);
    const childReferer = new URL(decodedUrl).origin + '/';
    const resolveManifestUrl = (value) => {
      let v = String(value || '').trim();
      if (v.startsWith('//')) {
        v = 'https:' + v;
      }
      return unwrapStreamIndiaRelayUrl(new URL(v, decodedUrl).toString());
    };
    const proxyManifestUrl = (value) =>
      `${host}/api/m3u8-proxy?url=${encodeURIComponent(resolveManifestUrl(value))}&referer=${encodeURIComponent(childReferer)}`;
    const proxySegmentUrl = (value) =>
      `${host}/api/ts-proxy?url=${encodeURIComponent(resolveManifestUrl(value))}&referer=${encodeURIComponent(childReferer)}`;

    let isStreamInf = false;

    const rewritten = data.split('\n').map(line => {
      const trimmed = line.trim();
      if (!trimmed) return line;

      if (trimmed.startsWith('#')) {
        if (trimmed.startsWith('#EXT-X-STREAM-INF') || trimmed.startsWith('#EXT-X-I-FRAME-STREAM-INF')) {
          isStreamInf = true;
        }
        return line.replace(/(URI=)(["'])([^"']+)\2/gi, (match, prefix, quote, uri) => {
          if (!uri || uri.startsWith('data:')) return match;
          const isPlaylist = uri.includes('.m3u8') || trimmed.toUpperCase().startsWith('#EXT-X-MEDIA');
          const proxied = isPlaylist ? proxyManifestUrl(uri) : proxySegmentUrl(uri);
          return `${prefix}${quote}${proxied}${quote}`;
        });
      }

      const abs = resolveManifestUrl(trimmed);
      const isSubPlaylist = isStreamInf || abs.includes('.m3u8');
      isStreamInf = false;

      if (isSubPlaylist) {
        return proxyManifestUrl(abs);
      }
      return proxySegmentUrl(abs);
    }).join('\n');

    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(rewritten);
  } catch (err) {
    res.status(502).send(err.message);
  }
});

app.get('/api/ts-proxy', async (req, res) => {
  const { url, referer } = req.query;
  if (!url) return res.status(400).send('Missing url');

  try {
    const decodedUrl = decodeURIComponent(url);
    const decodedRef = referer ? decodeURIComponent(referer) : (new URL(decodedUrl).origin + '/');

    const reqHeaders = streamProxyHeaders(decodedUrl, decodedRef);
    if (req.headers['range']) {
      reqHeaders['Range'] = req.headers['range'];
    }

    const upstream = await fetchStreamProxyTarget(decodedUrl, decodedRef, {
      headers: reqHeaders,
      responseType: 'stream',
      timeout: 30000,
      validateStatus: s => s < 400,
    });

    const proxyHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Accept-Ranges': upstream.headers['accept-ranges'] || 'bytes',
      'Content-Type': upstream.headers['content-type'] || 'video/MP2T',
    };
    if (upstream.headers['content-length'])   proxyHeaders['Content-Length']   = upstream.headers['content-length'];
    if (upstream.headers['content-range'])    proxyHeaders['Content-Range']    = upstream.headers['content-range'];
    if (upstream.headers['content-encoding']) proxyHeaders['Content-Encoding'] = upstream.headers['content-encoding'];

    res.writeHead(upstream.status, proxyHeaders);
    upstream.data.pipe(res);
  } catch (err) {
    if (!res.headersSent) res.status(502).send(err.message);
  }
});

app.get('/api/subtitle-proxy', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).send('Missing url');
  try {
    const decodedUrl = decodeURIComponent(url);
    const { data } = await axios.get(decodedUrl, {
      ...AXIOS_OPTS,
      responseType: 'text',
      headers: {
        ...AXIOS_OPTS.headers,
        'Referer': safeOrigin(decodedUrl) + '/',
      }
    });
    res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(data);
  } catch (err) {
    res.status(502).send('Failed to fetch subtitle');
  }
});

app.get('/api/img-proxy', async (req, res) => {
  const rawUrl = req.query.url;
  if (!rawUrl) return res.status(400).send('Missing url');

  const targetUrl = decodeURIComponent(rawUrl);
  try {
    const response = await axios.get(targetUrl, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': BROWSER_UA,
        'Referer': safeOrigin(targetUrl) + '/'
      },
      timeout: 12000
    });

    const contentType = response.headers['content-type'] || 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.send(response.data);
  } catch (err) {
    return res.status(404).send('Image not found');
  }
});

// START SERVER
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[EETNET-ANIME-API] Service listening on port ${PORT}`);
  console.log(`Endpoints available:`);
  console.log(` - GET  /api/health`);
  console.log(` - POST /api/anilist`);
  console.log(` - GET  /api/info/:anilistId`);
  console.log(` - GET  /api/gogoanime/watch?title=&episode=&season=&dub=`);
  console.log(` - GET  /api/hianime/watch?anilistId=&episode=&dub=`);
  console.log(` - GET  /api/animerulz/watch?anilistId=&episode=&lang=hin`);
  console.log(` - GET  /api/animerulz/episodes?anilistId=`);
  console.log(` - GET  /api/animerulz/availability?anilistId=`);
  console.log(` - GET  /api/animerulz/catalog?language=hindi`);
  console.log(` - GET  /api/episodes/mal/:malId?page=1`);
  console.log(` - GET  /api/search?q=`);
  console.log(` - GET  /api/status`);
});
