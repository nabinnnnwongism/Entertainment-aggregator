import express from 'express';
import cors from 'cors';
import axios from 'axios';
import * as cheerio from 'cheerio';
import crypto from 'crypto';
import vm from 'node:vm';
import https from 'https';

const app = express();
app.set('trust proxy', true);
const PORT = process.env.PORT || 8083;
const startedAt = new Date();

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());

// Normalizer: ensure /movies/..., /movieplex/..., /netmirror/... map to /api/...
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

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function streamProxyHeaders(targetUrl, referer, extraHeaders = {}) {
  return {
    'User-Agent': BROWSER_UA,
    'Accept': '*/*',
    ...extraHeaders,
    'Referer': referer,
    'Origin': safeOrigin(referer),
  };
}

// ─────────────────────────────────────────────────────
// NETMIRROR INTEGRATION (net52.cc)
// ─────────────────────────────────────────────────────
const NETMIRROR_BASE = process.env.NETMIRROR_BASE || 'https://net52.cc';
const NETMIRROR_UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Mobile Safari/537.36 /OS.Gatu v3.0';
let netmirrorToken = null;
let netmirrorTokenExpiry = 0;

async function getNetmirrorToken() {
  const now = Date.now();
  if (netmirrorToken && now < netmirrorTokenExpiry) return netmirrorToken;

  const fakeCaptcha = crypto.randomUUID();
  try {
    const res = await axios.post(`${NETMIRROR_BASE}/verify.php`,
      new URLSearchParams({ 'g-recaptcha-response': fakeCaptcha }).toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Origin': NETMIRROR_BASE,
          'Referer': `${NETMIRROR_BASE}/verify2`,
          'User-Agent': NETMIRROR_UA,
        },
        maxRedirects: 0,
        validateStatus: () => true,
        timeout: 10000,
      }
    );

    const setCookies = res.headers['set-cookie'];
    const cookieStr = Array.isArray(setCookies) ? setCookies.join('; ') : (setCookies || '');
    const match = cookieStr.match(/t_hash_t=([^;]+)/);
    if (!match) throw new Error('No t_hash_t in verify response');

    netmirrorToken = decodeURIComponent(match[1]);
    netmirrorTokenExpiry = now + (15 * 60 * 60 * 1000);
    console.log('[NetMirror] Token obtained, valid ~72h');
    return netmirrorToken;
  } catch (err) {
    console.error('[NetMirror] Token fetch failed:', err.message);
    throw err;
  }
}

async function netmirrorApi(path, { ott = 'nf', params = {}, expectJson = true } = {}) {
  const token = await getNetmirrorToken();
  const cookie = `t_hash_t=${token}; ott=${ott}; hd=on`;
  const fullParams = { t: Math.floor(Date.now() / 1000), ...params };

  try {
    const res = await axios.get(`${NETMIRROR_BASE}/mobile/${path}`, {
      params: fullParams,
      headers: {
        'Cookie': cookie,
        'User-Agent': NETMIRROR_UA,
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': `${NETMIRROR_BASE}/home`,
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: 15000,
    });

    const data = res.data;
    if (expectJson && data && data.status === 'n') {
      console.log('[NetMirror] Token expired (status:n), refreshing...');
      netmirrorToken = null;
      netmirrorTokenExpiry = 0;
      return netmirrorApi(path, { ott, params, expectJson });
    }
    return data;
  } catch (err) {
    console.error(`[NetMirror] API call failed (${path}):`, err.message);
    throw err;
  }
}

// ─────────────────────────────────────────────────────
// MOVIEPLEX INTEGRATION (movieplex.co.in)
// ─────────────────────────────────────────────────────
const MOVIEPLEX_BASE = 'https://movieplex.co.in';
const MOVIEPLEX_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const MP_CATS = {
  hindi_dubbed: 17, hot: 21, romance: 24, web_series: 33,
  drama: 14, short_film: 26, trending: 29, action: 6,
  bollywood: 10, hollywood: 19, thriller: 28, comedy: 11,
  horror: 20, bengali: 9, south_indian: 27,
};

const mpCache = { posts: [], byCategory: {}, categoryMap: {}, lastBuilt: 0, building: false };
const MP_TTL = 24 * 60 * 60 * 1000;

function mpDecodeTitle(raw) {
  return (raw || '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#8217;/g, "'").replace(/&#8220;/g, '"').replace(/&#8221;/g, '"');
}

async function mpWpApi(path) {
  const res = await axios.get(`${MOVIEPLEX_BASE}/wp-json/wp/v2/${path}`, {
    headers: { 'User-Agent': MOVIEPLEX_UA, 'Accept': 'application/json' },
    timeout: 20000,
  });
  return {
    data: res.data,
    total: parseInt(res.headers['x-wp-total'] || '0'),
    totalPages: parseInt(res.headers['x-wp-totalpages'] || '1'),
  };
}

function mpIs18Plus(p, title) {
  const catIds = Array.isArray(p.categories) ? p.categories : [];
  if (catIds.includes(21)) return true;
  const text = (title || '') + ' ' + (p.slug || '');
  return /\b(18\+|Ullu|Hotshots|Moodx|Kooku|Uncut|PrimeShots|Rabbit|RabbitMovies|Voovi|Chikooflix|Balloons|Besharams|Cinemadosti|Hot Web Series|Adult)\b/i.test(text);
}

function mpNormalizePost(p) {
  const title = mpDecodeTitle(p.title && p.title.rendered ? p.title.rendered : '');
  const is18 = mpIs18Plus(p, title);
  return {
    id: `mp-${p.id}`, movieplexId: p.id, movieplexSlug: p.slug,
    title: title,
    slug: p.slug, date: (p.date || '').substring(0, 10),
    categoryIds: Array.isArray(p.categories) ? p.categories : [],
    is18Plus: is18,
    thumbnail: '', coverImage: '', bannerImage: '', source: 'movieplex',
  };
}

// Poster API Keys
const TMDB_KEY = process.env.TMDB_API_KEY || '4e44d9029b1270a757cddc766a1bcb63';
const OMDB_KEY = process.env.OMDB_API_KEY || 'trilogy';

function mpExtractYear(raw) {
  const m = (raw || '').match(/\b(19[5-9]\d|20[0-2]\d)\b/);
  return m ? parseInt(m[1]) : null;
}

function mpCleanTitle(raw) {
  return (raw || '')
    .replace(/&#\d+;/g, function(m) { try { return String.fromCharCode(parseInt(m.slice(2))); } catch(e) { return ''; } })
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\bWatch\s+Online\b/gi, '')
    .replace(/\bFull\s+Movie\b/gi, '')
    .replace(/\bFull\s+Web\s+Series\b/gi, '')
    .replace(/\bDownload\s+Now\b/gi, '')
    .replace(/\(\d{4}\)/g, '').replace(/\b(19|20)\d{2}\b/g, '')
    .replace(/\[.*?\]/g, '')
    .replace(/E\d+[-T]\d+/gi, '').replace(/\bE\d+\b/gi, '').replace(/\bS\d+\b/gi, '')
    .replace(/\bPart\s*\d+\b/gi, '').replace(/\bVolume\s*\d+\b/gi, '').replace(/\bVol\.?\s*\d+\b/gi, '')
    .replace(/\bEpisode\s*\d+\b/gi, '').replace(/\bSeason\s*\d+\b/gi, '').replace(/\bComplete\b/gi, '')
    .replace(/\b(Hindi Dubbed|Hindi Dub|Hindi|Bengali|Malayalam|Tamil|Telugu|Kannada|Marathi|Punjabi|Gujarati|English|Bangladeshi|South Indian|Korean|Japanese|Chinese|Thai)\b/gi, '')
    .replace(/\b(HDRip|BluRay|WEB-DL|WEBRip|UNCUT|HDTS|HDTC|HDCam|HDCAM|CAMRip|CAM|DVDSCR|DVDScr|SCR|TS|DVDRIP|DVDRip|HD|4K|1080p|720p|480p|360p|Extended|Directors.?Cut)\b/gi, '')
    .replace(/\b(Hollywood|Bollywood|Tollywood|Mollywood|Kollywood|Pollywood)\b/gi, '')
    .replace(/\b(Short Film|App Video|Webseries|Web Series|OTT|Originals|Exclusive)\b/gi, '')
    .replace(/\b(Sigmaseries|Sigma|Cukkuboo|Hulchul|HulChul|Hoichoi|Moodx|Kooku|Ullu|ALTBalaji|PrimeShots|Rabbit|RabbitMovies|Voovi|Chikooflix|Atrangii|NewSensations|LookEnt|Nuefliks|GupChup|Hotshots|Flizmovies|Mastram|DigiMoviePlex|Balloons|Besharams|Cinemadosti|Netflix|Amazon|Hotstar|SonyLiv|ZEE5|Voot|MXPlayer|JioCinema|Aha|Hoichoi|Lionsgate|Disney)\b/gi, '')
    .replace(/\bMovie\b/gi, '').replace(/\bSeries\b/gi, '').replace(/\bFilm\b/gi, '')
    .replace(/[-_:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function _tmdbSearch(type, query, year) {
  const qs = 'api_key=' + TMDB_KEY + '&query=' + encodeURIComponent(query) + (year ? '&year=' + year : '');
  const r = await axios.get('https://api.themoviedb.org/3/search/' + type + '?' + qs, { timeout: 7000 });
  const results = (r.data && r.data.results) ? r.data.results : [];
  return results.find(function(x) { return !!x.poster_path; }) || null;
}

async function _omdbLookup(title, year) {
  const qs = 'apikey=' + OMDB_KEY + '&t=' + encodeURIComponent(title) + (year ? '&y=' + year : '') + '&r=json';
  const r = await axios.get('https://www.omdbapi.com/?' + qs, { timeout: 6000 });
  if (r.data && r.data.Poster && r.data.Poster !== 'N/A') {
    return { poster: r.data.Poster, backdrop: null, rating: r.data.imdbRating && r.data.imdbRating !== 'N/A' ? r.data.imdbRating : null };
  }
  return null;
}

async function _tmdbMultiSearch(query) {
  const r = await axios.get('https://api.themoviedb.org/3/search/multi?api_key=' + TMDB_KEY + '&query=' + encodeURIComponent(query), { timeout: 7000 });
  const results = (r.data && r.data.results) ? r.data.results : [];
  const hit = results.find(function(x) { return (x.media_type === 'movie' || x.media_type === 'tv') && !!x.poster_path; });
  if (!hit) return null;
  return {
    poster: 'https://image.tmdb.org/t/p/w500' + hit.poster_path,
    backdrop: hit.backdrop_path ? 'https://image.tmdb.org/t/p/w1280' + hit.backdrop_path : null,
    rating: hit.vote_average ? parseFloat(hit.vote_average).toFixed(1) : null
  };
}

async function mpTmdbPoster(rawTitle) {
  const clean = typeof rawTitle === 'string' && rawTitle.length < 100 && !rawTitle.includes(' ') ? rawTitle : mpCleanTitle(rawTitle);
  if (!clean || clean.length < 2) return null;
  const year = mpExtractYear(rawTitle);

  function fmt(item) {
    if (!item) return null;
    return {
      poster: 'https://image.tmdb.org/t/p/w500' + item.poster_path,
      backdrop: item.backdrop_path ? 'https://image.tmdb.org/t/p/w1280' + item.backdrop_path : null,
      rating: item.vote_average ? parseFloat(item.vote_average).toFixed(1) : null
    };
  }

  try {
    if (year) {
      const r1 = await _tmdbSearch('movie', clean, year);
      if (r1) return fmt(r1);
    }
    const r2 = await _tmdbSearch('movie', clean, null);
    if (r2) return fmt(r2);

    if (year) {
      const r3 = await _tmdbSearch('tv', clean, year);
      if (r3) return fmt(r3);
    }
    const r4 = await _tmdbSearch('tv', clean, null);
    if (r4) return fmt(r4);

    const shortTitle = clean.split(' ').slice(0, 3).join(' ');
    if (shortTitle !== clean && shortTitle.length > 2) {
      const r5 = await _tmdbSearch('movie', shortTitle, year || null);
      if (r5) return fmt(r5);
    }

    const omdb1 = await _omdbLookup(clean, year).catch(function() { return null; });
    if (omdb1) return omdb1;

    if (year) {
      const omdb2 = await _omdbLookup(clean, null).catch(function() { return null; });
      if (omdb2) return omdb2;
    }

    const multiHit = await _tmdbMultiSearch(shortTitle || clean).catch(function() { return null; });
    if (multiHit) return multiHit;
  } catch (e) {}
  return null;
}

async function buildMpCatalog() {
  if (mpCache.building) return;
  mpCache.building = true;
  console.log('[MoviePlex] Building catalog...');
  try {
    const catsRes = await mpWpApi('categories?per_page=100&_fields=id,name,slug,count');
    if (Array.isArray(catsRes.data)) {
      catsRes.data.forEach(function(c) { mpCache.categoryMap[c.id] = { name: c.name, slug: c.slug, count: c.count }; });
    }
    const first = await mpWpApi('posts?per_page=100&page=1&_fields=id,title,slug,date,categories&orderby=date&order=desc');
    const allPosts = Array.isArray(first.data) ? first.data.slice() : [];
    const totalPages = first.totalPages;
    for (let page = 2; page <= totalPages; page += 5) {
      const batch = [];
      for (let p = page; p < page + 5 && p <= totalPages; p++) {
        batch.push(mpWpApi(`posts?per_page=100&page=${p}&_fields=id,title,slug,date,categories&orderby=date&order=desc`));
      }
      const results = await Promise.allSettled(batch);
      results.forEach(function(r) { if (r.status === 'fulfilled' && Array.isArray(r.value.data)) allPosts.push.apply(allPosts, r.value.data); });
      await new Promise(function(r) { setTimeout(r, 150); });
    }
    const normalized = allPosts.map(mpNormalizePost);
    const byCategory = {};
    normalized.forEach(function(post) {
      post.categoryIds.forEach(function(catId) {
        if (!byCategory[catId]) byCategory[catId] = [];
        byCategory[catId].push(post);
      });
    });
    mpCache.posts = normalized;
    mpCache.byCategory = byCategory;
    mpCache.lastBuilt = Date.now();
    console.log('[MoviePlex] Catalog built: ' + normalized.length + ' posts');
  } catch (err) {
    console.error('[MoviePlex] Catalog build failed:', err.message);
  } finally {
    mpCache.building = false;
  }
}

async function buildMpThumbnails(maxPosts = 500) {
  const posts = mpCache.posts;
  if (!posts.length) return;
  const targetPosts = posts.slice(0, maxPosts);

  const TMDB_BATCH = 8;
  for (let i = 0; i < targetPosts.length; i += TMDB_BATCH) {
    const batch = targetPosts.slice(i, i + TMDB_BATCH);
    await Promise.allSettled(batch.map(async function(post) {
      const clean = mpCleanTitle(post.title);
      if (!clean) return;
      const tmdb = await mpTmdbPoster(clean);
      if (tmdb && tmdb.poster) {
        post.thumbnail = tmdb.poster;
        post.coverImage = tmdb.poster;
        post.bannerImage = tmdb.backdrop || tmdb.poster;
        if (tmdb.rating) post.rating = tmdb.rating;
      }
    }));
    await new Promise(function(r) { setTimeout(r, 120); });
  }

  const missing = targetPosts.filter(function(p) { return !p.thumbnail; });
  if (!missing.length) return;

  const BATCH = 8;
  for (let i = 0; i < missing.length; i += BATCH) {
    const batch = missing.slice(i, i + BATCH);
    await Promise.allSettled(batch.map(async function(post) {
      try {
        const res = await axios.get(MOVIEPLEX_BASE + '/' + post.slug + '/', {
          headers: { 'User-Agent': MOVIEPLEX_UA, 'Accept': 'text/html' },
          timeout: 8000,
        });
        const html = typeof res.data === 'string' ? res.data : '';
        const bfEmbed = html.match(/bfmovies\.online\/e\/([a-z0-9]+)/i);
        const bfDown = !bfEmbed && html.match(/bfmovies\.online\/d\/([a-z0-9]+)/i);
        const tpeadMatch = !bfEmbed && !bfDown && html.match(/tpead\.net\/e\/([a-z0-9]+)/i);
        const vid = bfEmbed ? bfEmbed[1] : bfDown ? bfDown[1] : tpeadMatch ? tpeadMatch[1] : null;
        if (vid) {
          const thumb = 'https://img.lulucdn.com/' + vid + '_xt.jpg';
          post.thumbnail = thumb;
          post.coverImage = thumb;
          post.bannerImage = thumb;
        }
      } catch (e) {}
    }));
    await new Promise(function(r) { setTimeout(r, 150); });
  }
}

setImmediate(function() {
  buildMpCatalog()
    .then(function() { return buildMpThumbnails(300); })
    .catch(function() {});
  setInterval(function() {
    if (Date.now() - mpCache.lastBuilt > MP_TTL) {
      buildMpCatalog().then(function() { return buildMpThumbnails(300); }).catch(function() {});
    }
  }, 60 * 60 * 1000);
});

async function scrapeMoviePlexPost(slug) {
  const res = await axios.get(`${MOVIEPLEX_BASE}/${slug}/`, {
    headers: { 'User-Agent': MOVIEPLEX_UA, 'Accept': 'text/html', 'Referer': MOVIEPLEX_BASE },
    timeout: 20000,
  });
  const $ = cheerio.load(res.data);
  const ogImage = $('meta[property="og:image"]').attr('content') || '';
  const title = $('h1').first().text().trim() || '';
  const iframes = [];
  ['tab1', 'tab2', 'tab3'].forEach(function(tabId) {
    const src = $(`#${tabId} iframe`).attr('data-lazy-src') ||
                $(`#${tabId} iframe`).attr('data-src') ||
                $(`#${tabId} iframe`).attr('src') || '';
    if (src && src.startsWith('http') && src !== 'about:blank') iframes.push(src);
  });
  if (!iframes.length) {
    $('iframe').each(function(_, el) {
      const src = $(el).attr('data-lazy-src') || $(el).attr('data-src') || $(el).attr('src') || '';
      if (src && src.startsWith('http') && !iframes.includes(src)) iframes.push(src);
    });
  }
  let thumbnail = ogImage;
  if (!thumbnail) {
    const luluSrc = iframes.find(function(s) { return s.includes('bfmovies.online') || s.includes('lulustream.com') || s.includes('luluvdo.com'); });
    if (luluSrc) {
      const vid = (luluSrc.split('/e/')[1] || luluSrc.split('/d/')[1] || '').split('?')[0].split('/')[0];
      if (vid) thumbnail = `https://img.lulucdn.com/${vid}_xt.jpg`;
    }
  }
  if (!thumbnail) {
    const htmlStr = $.html();
    const bfMatch = htmlStr.match(/bfmovies\.online\/(?:e|d)\/([a-z0-9]+)/i);
    if (bfMatch) thumbnail = `https://img.lulucdn.com/${bfMatch[1]}_xt.jpg`;
  }
  return { thumbnail: thumbnail, iframes: iframes, title: title };
}

async function extractLuluHLS(embedUrl) {
  const res = await axios.get(embedUrl, {
    headers: { 'User-Agent': MOVIEPLEX_UA, 'Referer': MOVIEPLEX_BASE, 'Accept': 'text/html' },
    timeout: 20000, maxRedirects: 5,
  });
  let html = res.data;

  if (!html.includes('eval(function(p,a,c,k')) {
    const redir = html.match(/window\.location\.href\s*=\s*['"]([^'"]+)['"]/);
    if (redir && redir[1]) {
      const res2 = await axios.get(redir[1], {
        headers: { 'User-Agent': MOVIEPLEX_UA, 'Referer': embedUrl, 'Accept': 'text/html' },
        timeout: 20000, maxRedirects: 5,
      });
      html = res2.data;
    }
  }

  const thumbM = html.match(/<meta[^>]+og:image[^>]+content="([^"]+)"/i);
  const thumbnail = thumbM ? thumbM[1] : '';

  const packedIdx = html.indexOf('eval(function(p,a,c,k,e,d)');
  if (packedIdx === -1) throw new Error('LuluStream: no packed JS found');

  let depth = 0, end = -1;
  for (let i = packedIdx + 4; i < Math.min(packedIdx + 50000, html.length); i++) {
    if (html[i] === '(') depth++;
    else if (html[i] === ')') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  if (end === -1) throw new Error('LuluStream: could not find end of eval()');
  const packedBlock = html.substring(packedIdx, end);

  let captured = null;
  const ctx = vm.createContext({
    jwplayer: function() {
      return {
        setup: function(cfg) { captured = cfg; },
        on: function() { return {}; },
        bitrateSelection: function() { return {}; },
      };
    },
    document: { getElementById: function() { return null; }, querySelector: function() { return null; } },
    window: {}, console: { log: function() {} },
  });

  try { vm.runInContext(packedBlock, ctx, { timeout: 5000 }); } catch (e) {}

  if (!captured || !captured.sources || !captured.sources.length) {
    throw new Error('LuluStream: jwplayer.setup() not captured');
  }
  const m3u8 = (captured.sources.find(function(s) { return s.file && s.file.includes('m3u8'); }) || captured.sources[0] || {}).file;
  if (!m3u8) throw new Error('LuluStream: no m3u8 source');
  return { streamUrl: m3u8, thumbnail: thumbnail, source: 'lulustream' };
}

async function extractStreamTapeUrl(embedUrl) {
  const res = await axios.get(embedUrl, {
    headers: { 'User-Agent': MOVIEPLEX_UA, 'Referer': MOVIEPLEX_BASE },
    timeout: 20000,
  });
  const html = res.data;
  const p1m = html.match(/id="[^"]*"[^>]*>([^<]*\/get_video\?[^<]+)</);
  const p2m = html.match(/<span[^>]*id="[^"]*"[^>]*>([^<]{3,40})<\/span>/);
  if (!p1m || !p2m) throw new Error('StreamTape: split token not found');
  return { streamUrl: `https://streamtape.com${p1m[1].trim()}${p2m[1].trim()}&stream=1`, source: 'streamtape' };
}

async function resolveMoviePlexStream(slug, req) {
  const info = await scrapeMoviePlexPost(slug);
  if (!info.iframes.length) throw new Error('No video sources found');

  const luluSrc = info.iframes.find(function(s) { return s.includes('bfmovies.online') || s.includes('lulustream.com') || s.includes('luluvdo.com'); });
  if (luluSrc) {
    try {
      const r = await extractLuluHLS(luluSrc);
      const host = publicHost(req);
      const proxiedUrl = host + '/api/m3u8-proxy?url=' + encodeURIComponent(r.streamUrl) + '&referer=' + encodeURIComponent(luluSrc);
      return {
        streamUrl: proxiedUrl,
        thumbnail: r.thumbnail || info.thumbnail,
        title: info.title,
        source: 'lulustream',
        fallbackIframe: luluSrc,
      };
    } catch (e) { console.warn('[MP Stream] LuluStream failed (' + slug + '):', e.message); }
  }

  const tapeSrc = info.iframes.find(function(s) { return s.includes('tpead.net') || s.includes('streamtape.com'); });
  if (tapeSrc) {
    try {
      const r = await extractStreamTapeUrl(tapeSrc);
      return { streamUrl: r.streamUrl, thumbnail: info.thumbnail, title: info.title, source: r.source, fallbackIframe: info.iframes[0] };
    } catch (e) { console.warn('[MP Stream] StreamTape failed (' + slug + '):', e.message); }
  }

  return { streamUrl: null, thumbnail: info.thumbnail, title: info.title, fallbackIframe: info.iframes[0] || null, error: 'HLS extraction failed' };
}

// ─────────────────────────────────────────────────────
// MOVIE ROUTES
// ─────────────────────────────────────────────────────

// GET /api/health
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'eetnet-movies-api',
    uptime: Math.floor((Date.now() - startedAt.getTime()) / 1000),
    port: PORT,
  });
});

// GET /api/movies/home
const moviesHomeCache = { data: null, builtAt: 0 };
app.get('/api/movies/home', async function(req, res) {
  if (mpCache.posts.length > 0) {
    const getCatPosts = function(catId, limit, isHotCat = false) {
      limit = limit || 24;
      let posts = mpCache.byCategory[catId] || [];
      if (!isHotCat) {
        posts = posts.filter(function(p) { return !p.is18Plus; });
      }
      return posts.slice(0, limit).map(function(p) {
        return Object.assign({}, p, {
          categories: (p.categoryIds || []).map(function(id) { return mpCache.categoryMap[id] && mpCache.categoryMap[id].name; }).filter(Boolean)
        });
      });
    };

    const trending = getCatPosts(MP_CATS.trending);
    const hot = getCatPosts(MP_CATS.hot, 24, true);
    const webSeries = getCatPosts(MP_CATS.web_series);
    const hindiDubbed = getCatPosts(MP_CATS.hindi_dubbed);
    const bollywood = getCatPosts(MP_CATS.bollywood);
    const hollywood = getCatPosts(MP_CATS.hollywood);
    const action = getCatPosts(MP_CATS.action);
    const shortFilm = getCatPosts(MP_CATS.short_film);
    const thriller = getCatPosts(MP_CATS.thriller);
    const romance = getCatPosts(MP_CATS.romance);

    const topRowItems = [
      ...trending.slice(0, 12),
      ...hindiDubbed.slice(0, 12),
      ...bollywood.slice(0, 12),
      ...hollywood.slice(0, 12),
      ...webSeries.slice(0, 12),
      ...action.slice(0, 12),
    ];
    await Promise.allSettled(topRowItems.map(async function(p) {
      if (!p.thumbnail) {
        const clean = mpCleanTitle(p.title);
        const tmdb = await mpTmdbPoster(clean);
        if (tmdb && tmdb.poster) {
          p.thumbnail = tmdb.poster;
          p.coverImage = tmdb.poster;
          p.bannerImage = tmdb.backdrop || tmdb.poster;
          if (tmdb.rating) p.rating = tmdb.rating;
        }
      }
    }));

    const withThumb = mpCache.posts.filter(function(p) { return !!p.thumbnail && !p.is18Plus; });
    const featured = withThumb[0] || trending[0] || hindiDubbed[0] || bollywood[0] || mpCache.posts.find(function(p) { return !p.is18Plus; }) || null;

    const data = {
      featured: featured, bollywood: bollywood, popular: trending, trending: trending,
      hollywood: hollywood, action: action, classics: [], topRated: [],
      netmirror: { trending: [], netflix: [], prime: [], hotstar: [] },
      movieplex: { trending, hot, webSeries, hindiDubbed, bollywood, hollywood, action, shortFilm, thriller, romance },
    };
    return res.json(data);
  }

  if (moviesHomeCache.data && Date.now() - moviesHomeCache.builtAt < 30 * 60 * 1000) {
    return res.json(moviesHomeCache.data);
  }
  try {
    const fetchCat = async function(catId, limit) {
      limit = limit || 24;
      try {
        const r = await mpWpApi(`posts?categories=${catId}&per_page=${limit}&_fields=id,title,slug,date,categories&orderby=date&order=desc`);
        return (Array.isArray(r.data) ? r.data : []).map(mpNormalizePost);
      } catch(e) { return []; }
    };
    const results = await Promise.all([
      fetchCat(MP_CATS.trending), fetchCat(MP_CATS.hot), fetchCat(MP_CATS.web_series),
      fetchCat(MP_CATS.hindi_dubbed), fetchCat(MP_CATS.bollywood), fetchCat(MP_CATS.hollywood),
      fetchCat(MP_CATS.action), fetchCat(MP_CATS.short_film), fetchCat(MP_CATS.thriller), fetchCat(MP_CATS.romance),
    ]);
    const [trending, hot, webSeries, hindiDubbed, bollywood, hollywood, action, shortFilm, thriller, romance] = results;
    const featured = trending[0] || hindiDubbed[0] || bollywood[0] || null;
    const data = {
      featured: featured, bollywood: bollywood, popular: trending, trending: trending,
      hollywood: hollywood, action: action, classics: [], topRated: [],
      netmirror: { trending: [], netflix: [], prime: [], hotstar: [] },
      movieplex: { trending, hot, webSeries, hindiDubbed, bollywood, hollywood, action, shortFilm, thriller, romance },
    };
    moviesHomeCache.data = data;
    moviesHomeCache.builtAt = Date.now();
    res.json(data);
  } catch (err) {
    console.error('[Movies Home]', err.message);
    res.status(502).json({ error: 'Movies home failed', message: err.message });
  }
});

// GET /api/movieplex/catalog
app.get('/api/movieplex/catalog', async function(req, res) {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '40')));
    const catId = req.query.category ? parseInt(req.query.category) : null;
    const search = (req.query.search || '').toLowerCase().trim();
    if (!mpCache.posts.length) {
      const params = new URLSearchParams({ per_page: limit, page: page, _fields: 'id,title,slug,date,categories', orderby: 'date', order: 'desc' });
      if (catId) params.set('categories', catId);
      if (search) params.set('search', search);
      const r = await mpWpApi('posts?' + params.toString());
      return res.json({ movies: (Array.isArray(r.data) ? r.data : []).map(mpNormalizePost), total: r.total, page: page, totalPages: r.totalPages, cached: false });
    }
    let posts = catId ? (mpCache.byCategory[catId] || []) : mpCache.posts;

    const allow18 = catId === 21 || req.query.is18 === 'true';
    if (!allow18) {
      posts = posts.filter(function(p) { return !p.is18Plus; });
    } else if (req.query.is18 === 'true' && !catId) {
      posts = posts.filter(function(p) { return p.is18Plus; });
    }

    if (catId && posts.length === 0 && !search) {
      try {
        const params2 = new URLSearchParams({ categories: catId, per_page: limit, page: page, _fields: 'id,title,slug,date,categories', orderby: 'date', order: 'desc' });
        const r2 = await mpWpApi('posts?' + params2.toString());
        const movies2 = (Array.isArray(r2.data) ? r2.data : []).map(function(p) {
          return Object.assign(mpNormalizePost(p), { categories: (p.categories || []).map(function(id) { return mpCache.categoryMap[id] && mpCache.categoryMap[id].name; }).filter(Boolean) });
        });
        await Promise.allSettled(movies2.map(async function(p) {
          if (!p.thumbnail) {
            const clean = mpCleanTitle(p.title);
            const tmdb = await mpTmdbPoster(clean);
            if (tmdb && tmdb.poster) {
              p.thumbnail = tmdb.poster;
              p.coverImage = tmdb.poster;
              p.bannerImage = tmdb.backdrop || tmdb.poster;
              if (tmdb.rating) p.rating = tmdb.rating;
            }
          }
        }));
        return res.json({ movies: movies2, total: r2.total, page: page, totalPages: r2.totalPages, cached: false, note: 'live-fallback' });
      } catch(e2) {}
    }

    if (search) posts = posts.filter(function(p) { return p.title.toLowerCase().includes(search); });
    const total = posts.length;
    const paginated = posts.slice((page - 1) * limit, page * limit);

    await Promise.allSettled(paginated.map(async function(p) {
      if (!p.thumbnail) {
        const clean = mpCleanTitle(p.title);
        const tmdb = await mpTmdbPoster(clean);
        if (tmdb && tmdb.poster) {
          p.thumbnail = tmdb.poster;
          p.coverImage = tmdb.poster;
          p.bannerImage = tmdb.backdrop || tmdb.poster;
          if (tmdb.rating) p.rating = tmdb.rating;
        }
      }
    }));

    const withCats = paginated.map(function(p) {
      return Object.assign({}, p, { categories: p.categoryIds.map(function(id) { return mpCache.categoryMap[id] && mpCache.categoryMap[id].name; }).filter(Boolean) });
    });
    res.json({ movies: withCats, total: total, page: page, totalPages: Math.ceil(total / limit), cached: true });
  } catch (err) {
    console.error('[MP Catalog]', err.message);
    res.status(500).json({ error: 'Catalog fetch failed', message: err.message });
  }
});

// GET /api/movieplex/stream
app.get('/api/movieplex/stream', async function(req, res) {
  const slug = req.query.slug;
  if (!slug) return res.status(400).json({ error: 'Missing slug' });
  try {
    const result = await resolveMoviePlexStream(slug, req);
    res.json(result);
  } catch (err) {
    console.error('[MP Stream] ' + slug + ':', err.message);
    res.status(502).json({ error: 'Stream resolution failed', message: err.message });
  }
});

// GET /api/movieplex/post-info
app.get('/api/movieplex/post-info', async function(req, res) {
  const slug = req.query.slug;
  if (!slug) return res.status(400).json({ error: 'Missing slug' });
  try {
    const info = await scrapeMoviePlexPost(slug);
    const luluSrc = info.iframes.find(function(s) { return s.includes('bfmovies.online'); });
    const vid = luluSrc ? (luluSrc.split('/e/')[1] || '').split('?')[0].split('/')[0] : null;
    let thumbnail = (vid ? 'https://img.lulucdn.com/' + vid + '_xt.jpg' : null) || info.thumbnail || null;

    if (!thumbnail && info.title) {
      const clean = mpCleanTitle(info.title);
      const tmdb = await mpTmdbPoster(clean).catch(function() { return null; });
      if (tmdb && tmdb.poster) thumbnail = tmdb.poster;
    }

    res.json({ thumbnail: thumbnail, title: info.title, iframes: info.iframes });
  } catch (err) { res.status(502).json({ error: err.message }); }
});

// GET /api/movieplex/catalog/status
app.get('/api/movieplex/catalog/status', function(req, res) {
  res.json({ total: mpCache.posts.length, built: mpCache.lastBuilt > 0, building: mpCache.building, lastRefresh: new Date(mpCache.lastBuilt).toISOString(), categoryCount: Object.keys(mpCache.categoryMap).length });
});

// ─────────────────────────────────────────────────────
// NETMIRROR ROUTES
// ─────────────────────────────────────────────────────

// GET /api/netmirror/search
app.get('/api/netmirror/search', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Missing query param q' });

  try {
    const data = await netmirrorApi('search.php', { params: { s: q } });
    const results = (data?.searchResult || []).slice(0, 10).map(item => ({
      id: item.id,
      title: item.t,
      year: item.y || '',
      rating: item.r || '',
      type: 'movie',
    }));
    res.json(results);
  } catch (err) {
    res.status(502).json({ error: 'NetMirror search failed', message: err.message });
  }
});

// GET /api/netmirror/post/:id
app.get('/api/netmirror/post/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const data = await netmirrorApi('post.php', { params: { id } });
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'NetMirror post fetch failed', message: err.message });
  }
});

// GET /api/netmirror/playlist/:id
app.get('/api/netmirror/playlist/:id', async (req, res) => {
  const { id } = req.params;
  const host = publicHost(req);
  try {
    const data = await netmirrorApi('playlist.php', { params: { id } });
    const entry = Array.isArray(data) ? data[0] : data;
    if (!entry || !entry.sources) {
      return res.status(404).json({ error: 'No sources found' });
    }

    const sources = (entry.sources || []).map(src => {
      if (!src.file) return null;
      const proxied = `${host}/api/m3u8-proxy?url=${encodeURIComponent(src.file)}&referer=${encodeURIComponent(NETMIRROR_BASE)}`;
      return {
        quality: src.label || 'Unknown',
        type: src.type || 'hls',
        url: proxied,
        originalUrl: src.file,
      };
    }).filter(Boolean);

    res.json({ sources, tracks: entry.tracks || [] });
  } catch (err) {
    res.status(502).json({ error: 'NetMirror playlist fetch failed', message: err.message });
  }
});

// GET /api/netmirror/trending
app.get('/api/netmirror/trending', async (req, res) => {
  const host = publicHost(req);
  try {
    const html = await netmirrorApi('home?app=1', { expectJson: false });
    const $ = cheerio.load(html);

    const movies = [];
    const seen = new Set();
    $('[data-post]').each((i, element) => {
      const id = $(element).attr('data-post');
      if (!id || seen.has(id)) return;
      seen.add(id);
      const poster = $(element).find('img').attr('data-src') || $(element).find('img').attr('src') || '';
      if (!poster || !poster.startsWith('http')) return;
      const proxiedPoster = `${host}/api/img-proxy?url=${encodeURIComponent(poster)}`;
      movies.push({
        id: String(id),
        title: '',
        year: '',
        coverImage: proxiedPoster,
        bannerImage: proxiedPoster,
        type: 'movie',
        netmirrorId: true,
      });
    });

    const token = await getNetmirrorToken();
    const postHeaders = {
      'Cookie': `t_hash_t=${token}; ott=nf; hd=on`,
      'User-Agent': NETMIRROR_UA,
      'X-Requested-With': 'XMLHttpRequest',
      'Referer': `${NETMIRROR_BASE}/home`,
    };
    await Promise.all(movies.slice(0, 60).map(async (m) => {
      try {
        const r = await axios.get(`${NETMIRROR_BASE}/mobile/post.php`, {
          params: { id: m.id },
          headers: postHeaders,
          timeout: 8000,
        });
        const d = r.data;
        if (d && d.title) {
          m.title = d.title;
          m.year  = String(d.year || '');
        } else {
          m.title = `NetMirror #${m.id}`;
        }
      } catch (_) {
        m.title = `NetMirror #${m.id}`;
      }
    }));
    movies.slice(60).forEach(m => { if (!m.title) m.title = `NetMirror #${m.id}`; });

    const unique = movies.slice(0, 120);
    res.json(unique);
  } catch (err) {
    console.error('[NetMirror] Trending fetch failed:', err.message);
    res.status(502).json({ error: 'NetMirror trending failed', message: err.message });
  }
});

// GET /api/netmirror/stream-resolve
app.get('/api/netmirror/stream-resolve', async (req, res) => {
  const { id, title, year, type = 'movie', season = 1, episode = 1, ott = 'nf' } = req.query;
  if (!id && !title) return res.status(400).json({ error: 'Missing id or title param' });
  const host = publicHost(req);

  try {
    let targetId = id;
    let targetTitle = title || 'Media';
    let targetYear = year || '';

    if (!targetId) {
      let searchData = await netmirrorApi('search.php', { ott, params: { s: title } });
      let results = searchData?.searchResult || [];

      if (!results.length) {
        const words = title.split(/\s+/).filter(w => w.length > 2);
        if (words.length > 0) {
          searchData = await netmirrorApi('search.php', { ott, params: { s: words[words.length - 1] } });
          results = searchData?.searchResult || [];
        }
      }

      if (!results.length) return res.status(404).json({ error: 'No NetMirror results for: ' + title });
      let best = results[0];
      if (year) {
        const exact = results.find(r => r.t && r.t.toLowerCase().includes(title.toLowerCase().slice(0, 12)) && String(r.y) === String(year));
        if (exact) best = exact;
      }
      targetId = best.id;
      targetTitle = best.t;
      targetYear = best.y || year;
    }

    let playlistId = targetId;
    try {
      const postData = await netmirrorApi('post.php', { ott, params: { id: targetId } });
      const episodes = (postData && Array.isArray(postData.episodes)) ? postData.episodes : [];
      if (episodes.length > 0) {
        const epIdx = Math.max(0, parseInt(episode) - 1);
        const selectedEp = episodes[epIdx] || episodes[0];
        if (selectedEp?.id) playlistId = selectedEp.id;
      }
      if (postData && postData.title) targetTitle = postData.title;
      if (postData && postData.year) targetYear = postData.year;
    } catch (e) {
      console.warn('[NetMirror] post info fetch skipped:', e.message);
    }

    const playlistData = await netmirrorApi('playlist.php', {
      ott,
      params: { id: playlistId, t: targetTitle, tm: Math.floor(Date.now() / 1000) },
    });
    const entry = Array.isArray(playlistData) ? playlistData[0] : playlistData;
    if (!entry?.sources?.length) return res.status(404).json({ error: 'No HLS sources for: ' + targetTitle });

    const normalizeNmUrl = (u) => {
      if (!u) return '';
      let s = String(u).trim();
      if (s.startsWith('//')) return 'https:' + s;
      if (s.startsWith('/')) return NETMIRROR_BASE + s;
      return s;
    };
    const sources = (entry.sources || []).map(src => {
      if (!src.file) return null;
      const fullUrl = normalizeNmUrl(src.file);
      return { quality: src.label || 'Unknown', type: src.type || 'hls', url: host + '/api/m3u8-proxy?url=' + encodeURIComponent(fullUrl) + '&referer=' + encodeURIComponent(NETMIRROR_BASE), originalUrl: fullUrl };
    }).filter(Boolean);

    res.json({ netmirrorId: targetId, title: targetTitle, year: targetYear, sources });
  } catch (err) {
    console.error('[NetMirror] stream-resolve failed:', err.message);
    res.status(502).json({ error: 'NetMirror stream-resolve failed', message: err.message });
  }
});

// ─────────────────────────────────────────────────────
// HLS M3U8 & TS PROXIES + IMAGE PROXY
// ─────────────────────────────────────────────────────
app.get('/api/m3u8-proxy', async (req, res) => {
  const { url, referer } = req.query;
  if (!url) return res.status(400).send('Missing url');

  try {
    const decodedUrl = decodeURIComponent(url);
    const decodedRef = referer ? decodeURIComponent(referer) : (new URL(decodedUrl).origin + '/');

    let netmirrorHeaders = {};
    if (decodedUrl.includes('net52.cc') || decodedUrl.includes('netmirror')) {
      try {
        const token = await getNetmirrorToken();
        netmirrorHeaders = {
          'Cookie': `t_hash_t=${token}; ott=nf; hd=on`,
          'User-Agent': NETMIRROR_UA,
          'X-Requested-With': 'XMLHttpRequest',
        };
      } catch (e) {}
    }

    const { data } = await axios.get(decodedUrl, {
      responseType: 'text',
      headers: {
        ...streamProxyHeaders(decodedUrl, decodedRef),
        ...netmirrorHeaders,
      },
      timeout: 15000,
    });

    const host = publicHost(req);
    const childReferer = new URL(decodedUrl).origin + '/';

    const proxyManifestUrl = (value) =>
      `${host}/api/m3u8-proxy?url=${encodeURIComponent(new URL(value, decodedUrl).toString())}&referer=${encodeURIComponent(childReferer)}`;
    const proxySegmentUrl = (value) =>
      `${host}/api/ts-proxy?url=${encodeURIComponent(new URL(value, decodedUrl).toString())}&referer=${encodeURIComponent(childReferer)}`;

    let isStreamInf = false;

    const rewritten = data.split('\n').map(line => {
      const trimmed = line.trim();
      if (!trimmed) return line;

      if (trimmed.startsWith('#')) {
        if (trimmed.startsWith('#EXT-X-STREAM-INF') || trimmed.startsWith('#EXT-X-I-FRAME-STREAM-INF')) {
          isStreamInf = true;
        }
        if (trimmed.startsWith('#EXT-X-MEDIA:TYPE=AUDIO') && (trimmed.includes('https:///') || trimmed.includes('http:///'))) {
          return '';
        }
        return line.replace(/(URI=)(["'])([^"']+)\2/gi, (match, prefix, quote, uri) => {
          if (!uri || uri.startsWith('data:')) return match;
          const isPlaylist = uri.includes('.m3u8') || trimmed.toUpperCase().startsWith('#EXT-X-MEDIA');
          const proxied = isPlaylist ? proxyManifestUrl(uri) : proxySegmentUrl(uri);
          return `${prefix}${quote}${proxied}${quote}`;
        });
      }

      const abs = new URL(trimmed, decodedUrl).toString();
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
    console.error('[M3U8-PROXY] Error:', err.message);
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

    if (decodedUrl.includes('net52.cc') || decodedUrl.includes('netmirror')) {
      try {
        const token = await getNetmirrorToken();
        reqHeaders['Cookie'] = `t_hash_t=${token}; ott=nf; hd=on`;
        reqHeaders['User-Agent'] = NETMIRROR_UA;
      } catch (e) {}
    }

    const upstream = await axios.get(decodedUrl, {
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
    console.error('[TS-PROXY] Error:', err.message);
    if (!res.headersSent) res.status(502).send(err.message);
  }
});

app.get('/api/img-proxy', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).send('Missing url parameter');

  try {
    const decodedUrl = decodeURIComponent(url);
    const response = await axios.get(decodedUrl, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': BROWSER_UA,
        'Referer': safeOrigin(decodedUrl) + '/',
      },
      timeout: 12000,
    });

    const contentType = response.headers['content-type'] || 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.send(Buffer.from(response.data));
  } catch (err) {
    res.status(502).send('Image proxy failed');
  }
});

// START SERVER
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[EETNET-MOVIES-API] Service listening on port ${PORT}`);
  console.log(`Endpoints available:`);
  console.log(` - GET  /api/health`);
  console.log(` - GET  /api/movies/home`);
  console.log(` - GET  /api/movieplex/catalog?page=1&limit=40&category=&search=`);
  console.log(` - GET  /api/movieplex/stream?slug=`);
  console.log(` - GET  /api/movieplex/post-info?slug=`);
  console.log(` - GET  /api/movieplex/catalog/status`);
  console.log(` - GET  /api/netmirror/trending`);
  console.log(` - GET  /api/netmirror/search?q=`);
  console.log(` - GET  /api/netmirror/post/:id`);
  console.log(` - GET  /api/netmirror/playlist/:id`);
  console.log(` - GET  /api/netmirror/stream-resolve`);
});
