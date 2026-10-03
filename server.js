import express from 'express';
import cors from 'cors';
import axios from 'axios';
import * as cheerio from 'cheerio';
import https from 'https';
import crypto from 'crypto';
import { ANIME, META, MANGA } from '@consumet/extensions';
import vm from 'node:vm';

const app = express();
app.set('trust proxy', true);
const PORT = process.env.PORT || 8080;
const startedAt = new Date();

const KISSKH_BASE = process.env.KISSKH_BASE || 'https://kisskh.co';
const ENCDEC_BASE = process.env.ENCDEC_BASE || 'https://enc-dec.app';
const HIVETOONS_BASE = process.env.HIVETOONS_BASE || 'https://hivetoons.com';
// Optional egress proxy for DesiCinemas/Morencius embed fetches. Morencius serves
// the REAL `links.hls2` master only to certain client IPs; from others (e.g. some
// mobile ISPs) it returns a decoy-only embed → "Stream Not Found"/iframe. If set,
// all embed + embed-router requests egress through this proxy so the backend can
// reach the good variant. Format: http://[user:pass@]host:port
const EMBED_PROXY_URL = process.env.EMBED_PROXY_URL || '';
function embedProxyConfig() {
  if (!EMBED_PROXY_URL) return undefined;
  try {
    const u = new URL(EMBED_PROXY_URL);
    return {
      protocol: u.protocol.replace(':', '') || 'http',
      host: u.hostname,
      port: u.port ? Number(u.port) : 80,
      auth: u.username ? { username: decodeURIComponent(u.username), password: decodeURIComponent(u.password) } : undefined,
    };
  } catch { return undefined; }
}
const HT_HEADERS = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' };
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());

// Vercel serverless request URL normalizer (/movies/home -> /api/movies/home)
app.use((req, res, next) => {
  if (req.url && !req.url.startsWith('/api/') && req.url !== '/api') {
    req.url = '/api' + req.url;
  }
  next();
});

// Public base URL the browser should use to reach this server.
// Behind ngrok/Cloudflare the real protocol + host arrive via X-Forwarded-*.
function publicHost(req) {
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'http')
    .toString().split(',')[0].trim();
  return `${proto}://${req.get('host')}`;
}

// Old Hindi stream responses may contain a proxy URL that was wrapped again by
// a previous server process. Resolve it back to the provider URL before making
// a new proxy URL so a cached response cannot create localhost -> localhost loops.
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

// StreamIndia's generated master playlists point at proxy.streamindia.co.in.
// That relay currently returns 502 despite valid headers, while its embedded
// as-cdn URL is reachable with the same protected HLS flow. Skip only that
// failed relay; the CDN remains behind our manifest and segment proxies.
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
    // Always send a real browser User-Agent — CDNs like tnmr.org (LuluStream)
    // block Axios's default 'axios/x.x.x' user-agent with 403 Forbidden.
    // Note: Do NOT send 'Accept-Language', as tnmr.org WAF blocks requests containing it with 403!
    'User-Agent': BROWSER_UA,
    'Accept': '*/*',
    ...extraHeaders,
    // StreamIndia needs extra fetch headers
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

  let netmirrorHeaders = {};
  if (targetUrl.includes('net52.cc') || targetUrl.includes('netmirror')) {
    try {
      const token = await getNetmirrorToken();
      netmirrorHeaders = {
        'Cookie': `t_hash_t=${token}; ott=nf; hd=on`,
        'User-Agent': NETMIRROR_UA,
        'X-Requested-With': 'XMLHttpRequest',
      };
    } catch (e) {
      console.warn('[M3U8-PROXY] NetMirror token fetch skipped:', e.message);
    }
  }

  for (const referer of streamProxyReferers(targetUrl, primaryReferer)) {
    try {
      const response = await axios.get(targetUrl, {
        ...axiosOptions,
        headers: {
          ...streamProxyHeaders(targetUrl, referer, extraHeaders),
          ...netmirrorHeaders,
        },
      });
      if (referer !== primaryReferer) {
        console.log(`[M3U8-PROXY] Recovered ${new URL(targetUrl).hostname} with ${new URL(referer).hostname}`);
      }
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

app.use(express.json());

// Image Proxy Routes (Bypasses CORS & hotlink 403 for AniList / ComicK / TMDB images)
const handleImageProxy = async (req, res) => {
  const rawUrl = req.query.url;
  if (!rawUrl) return res.status(400).send('Missing url');

  let targetUrl = decodeURIComponent(rawUrl);
  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    if (targetUrl.startsWith('//')) {
      targetUrl = 'https:' + targetUrl;
    } else {
      targetUrl = 'https://meo.comick.pictures/' + targetUrl.replace(/^\/+/, '');
    }
  }

  try {
    const isComicK = targetUrl.includes('comick') || targetUrl.includes('comickz') || targetUrl.includes('comicknew');
    const referer = isComicK ? 'https://comickz.co.uk/' : (safeOrigin(targetUrl) + '/');

    const response = await axios.get(targetUrl, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Referer': referer
      },
      timeout: 12000
    });

    let contentType = response.headers['content-type'] || 'image/jpeg';
    if (contentType === 'application/octet-stream' || contentType.includes('html')) {
      contentType = 'image/jpeg';
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.send(response.data);
  } catch (err) {
    console.warn(`[IMAGE PROXY WARNING] Failed to fetch "${targetUrl}":`, err.message);
    if (targetUrl.startsWith('http')) {
      return res.redirect(targetUrl);
    }
    return res.status(404).send('Image not found');
  }
};

app.get('/api/img-proxy', handleImageProxy);
app.get('/api/manga/image-proxy', handleImageProxy);

// Disable SSL verification for scraping (needed for anikai.cc)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

function safeOrigin(value) {
  try {
    return new URL(value).origin;
  } catch {
    return value || '';
  }
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
// Providers:
//   PRIMARY:  HiAnime via META.Anilist (AniList ID Ã¢â€ â€™ exact season/episode)
//   SECONDARY: AnimeKai (anikai.cc) Ã¢â‚¬â€ title-search English subs
//   FALLBACK: AnimeUnity (via Consumet) Ã¢â‚¬â€ last resort
// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
const animeUnity = new ANIME.AnimeUnity();
const anilistMeta = new META.Anilist(animeUnity);

// HiAnime provider Ã¢â‚¬â€ maps AniList ID Ã¢â€ â€™ HiAnime ID Ã¢â€ â€™ correct season page
const hianime = new ANIME.Hianime();
const anilistHianime = new META.Anilist(hianime);

// HiAnime episode list cache: anilistId Ã¢â€ â€™ { episodes, timestamp }
const hiAnimeEpCache = new Map();
const HIANIME_TTL = 30 * 60 * 1000; // 30 minutes

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
// Subtitle VTT Proxy Ã¢â‚¬â€ GET /api/subtitle-proxy?url=<url>
// Proxies VTT subtitle files from external CDNs (cdn.anizara.store, etc.)
// so that browser <track> elements can load them without CORS block.
// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
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
    console.error('[SUBTITLE-PROXY] Error:', err.message);
    res.status(502).send(err.message);
  }
});

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
// HLS/M3U8 Referrer Bypass Proxy
// Rewrites both sub-playlists AND .ts segment URLs so
// the browser only ever talks to the backend's public URL.
// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
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
    // A provider playlist can contain another protected relay (for example,
    // extract.streamindia.co.in -> proxy.streamindia.co.in -> CDN). Each hop
    // expects the playlist that referred to it, not the page referer used for
    // the first manifest request.
    const childReferer = new URL(decodedUrl).origin + '/';
    const resolveManifestUrl = (value) => {
      let v = String(value || '').trim();

      // Fix NetMirror malformed triple-slash URIs (e.g. "https:///files/...")
      if (v.startsWith('https:///') || v.startsWith('http:///')) {
        v = new URL(decodedUrl).origin + '/' + v.replace(/^https?:\/\/\//, '');
      } else if (v.startsWith('//')) {
        const hostPart = v.slice(2).split('/')[0];
        if (hostPart.includes('.')) {
          v = 'https:' + v;
        } else {
          v = new URL(decodedUrl).origin + '/' + v.slice(2);
        }
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
        // If audio track URI is a malformed dummy path like "https:///files/...", strip it so HLS.js uses multiplexed audio
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

      // Resolve relative URL
      const abs = resolveManifestUrl(trimmed);
      const isSubPlaylist = isStreamInf || abs.includes('.m3u8');
      isStreamInf = false;

      // Sub-playlists (.m3u8 or variant stream after #EXT-X-STREAM-INF) Ã¢â€ â€™ recurse through this same proxy
      if (isSubPlaylist) {
        return proxyManifestUrl(abs);
      }

      // Video segments (.ts / .aac / .js / .css / .woff / etc.) Ã¢â€ â€™ pipe through ts-proxy
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

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
// TS Segment Proxy Ã¢â‚¬â€ GET /api/ts-proxy?url=<url>&referer=<referer>
// Pipes raw video/audio segments through our server.
// CRITICAL: forwards the Range header so HLS.js byte-range
// requests only fetch the specific bytes needed (not the whole
// file), making startup near-instant.
// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
app.get('/api/ts-proxy', async (req, res) => {
  const { url, referer } = req.query;
  if (!url) return res.status(400).send('Missing url');

  try {
    const decodedUrl = decodeURIComponent(url);
    const decodedRef = referer ? decodeURIComponent(referer) : (new URL(decodedUrl).origin + '/');

    // Forward Range header Ã¢â‚¬â€ HLS.js uses byte-range requests
    // for EXT-X-BYTERANGE manifests. Without this we download
    // the full multi-hundred-MB file for every tiny segment.
    const reqHeaders = streamProxyHeaders(decodedUrl, decodedRef);
    if (req.headers['range']) {
      reqHeaders['Range'] = req.headers['range'];
    }

    const upstream = await fetchStreamProxyTarget(decodedUrl, decodedRef, {
      headers: reqHeaders,
      responseType: 'stream',
      timeout: 30000,
      validateStatus: s => s < 400, // allow 206 Partial Content, retry protected failures
    });

    // Pass through all relevant headers from the CDN
    const proxyHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Accept-Ranges': upstream.headers['accept-ranges'] || 'bytes',
      'Content-Type': upstream.headers['content-type'] || 'video/MP2T',
    };
    if (upstream.headers['content-length'])  proxyHeaders['Content-Length']  = upstream.headers['content-length'];
    if (upstream.headers['content-range'])   proxyHeaders['Content-Range']   = upstream.headers['content-range'];
    if (upstream.headers['content-encoding'])proxyHeaders['Content-Encoding'] = upstream.headers['content-encoding'];

    res.writeHead(upstream.status, proxyHeaders);
    upstream.data.pipe(res);
  } catch (err) {
    console.error('[TS-PROXY] Error:', err.message);
    if (!res.headersSent) res.status(502).send(err.message);
  }
});


// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
// AnimeKai scraper helpers
// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
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

// Cache: title::sN Ã¢â€ â€™ { slug, timestamp }
const animeCache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

// Stream URL cache: "slug::epN" Ã¢â€ â€™ { streamData, timestamp }
const streamCache = new Map();
const STREAM_CACHE_TTL = 20 * 60 * 1000; // 20 minutes

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
// Jikan episode cache: "malId:page" -> { data, timestamp }
// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
const jikanCache = new Map();
const JIKAN_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Given a vivibebe.site embed URL, extracts the direct HLS .m3u8 stream URL
 * and subtitle track. Returns null if extraction fails.
 */
async function extractDirectStream(embedUrl) {
  try {
    console.log(`[EXTRACT] Fetching player page: ${embedUrl}`);
    const { data } = await axios.get(embedUrl, {
      ...AXIOS_OPTS,
      headers: {
        ...AXIOS_OPTS.headers,
        'Referer': ANIMEKAI_BASE + '/'
      }
    });

    // Extract the .m3u8 stream URL from the JS const src = "..."
    const srcMatch = data.match(/const\s+src\s*=\s*["']([^"']+\.m3u8[^"']*)["']/);
    const m3u8Match = data.match(/["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/);
    const streamUrl = srcMatch?.[1] || m3u8Match?.[1];

    if (!streamUrl) {
      console.warn('[EXTRACT] No .m3u8 URL found in player page');
      return null;
    }

    // Extract subtitle track (passed as ?sub= query param)
    const url = new URL(embedUrl);
    const subtitleUrl = url.searchParams.get('sub') || null;

    console.log(`[EXTRACT] Ã¢Å“â€¦ Direct stream: ${streamUrl}`);
    if (subtitleUrl) console.log(`[EXTRACT]    Subtitle: ${subtitleUrl}`);

    return {
      streamUrl,
      subtitleUrl,
      headers: { 'Referer': new URL(embedUrl).origin + '/' }
    };
  } catch (err) {
    console.warn('[EXTRACT] Failed:', err.message);
    return null;
  }
}

/* Ã¢â€â‚¬Ã¢â€â‚¬ Extract clean title without (TV), (Sub), (Dub), etc. Ã¢â€â‚¬Ã¢â€â‚¬ */
function cleanAnimeTitle(t) {
  return t.toLowerCase()
    .replace(/\s*\((tv|sub|dub|uncensored|media)\)/gi, '')
    .replace(/\s*\(season\s*\d+\)/gi, '')
    .trim();
}

/**
 * Score how well a result name matches the target title (0 = no match, higher = better).
 * Prefers: exact match > (TV) suffix match > base title > starts-with.
 * Heavily penalizes sequel keywords (Season 2, 3rd Season, Part 2, etc.) when the target
 * query is a plain base title.
 */
function titleMatchScore(resultName, targetTitle) {
  const r = resultName.toLowerCase().trim();
  const t = targetTitle.toLowerCase().trim();
  const rClean = cleanAnimeTitle(resultName);
  const tClean = cleanAnimeTitle(targetTitle);

  // 1. Exact match (e.g. "jujutsu kaisen" == "jujutsu kaisen")
  if (r === t || rClean === tClean) return 100;

  // 2. Sequel / Season detection in result name
  const isSequel = /\b(season\s*\d|\d+(st|nd|rd|th)\s+season|part\s*\d|cour\s*\d|movie|movie\s*\d)\b/i.test(r) ||
                   /\b(culling game|shibuya|mugen train|entertainment district|swordsmith|hashira)\b/i.test(r);

  // 3. Target query detection: does the search query specify a season/sequel?
  const targetHasSequel = /\b(season\s*\d|\d+(st|nd|rd|th)\s+season|part\s*\d)\b/i.test(t);

  // If result has sequel keywords but target query DOES NOT specify a sequel Ã¢â€ â€™ heavy penalty!
  // (Prevents "Jujutsu Kaisen 3rd Season" from winning when searching "Jujutsu Kaisen")
  let score = 50;
  if (rClean.startsWith(tClean)) {
    score = 80;
  } else if (rClean.includes(tClean)) {
    score = 60;
  }

  if (isSequel && !targetHasSequel) {
    score -= 45; // Drop score so Season 1 / Base title always wins!
  } else if (isSequel && targetHasSequel) {
    score += 20; // Target asked for sequel, reward sequel matches
  }

  return Math.max(0, score);
}

async function animeKaiSearch(title, seasonNum = null) {
  console.log(`[ANIMEKAI] Searching: "${title}"${seasonNum ? ` (Season ${seasonNum})` : ''}`);

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
      console.warn(`[ANIMEKAI] Search failed for query "${query}":`, err.message);
      return [];
    }
  };

  /**
   * Pick the best matching slug from an array of results.
   * When seasonNum is provided, prefer results that mention that season;
   * penalise results that mention a different season number.
   */
  const pickBest = (results, targetTitle) => {
    if (results.length === 0) return null;
    const scored = results.map(r => {
      let score = titleMatchScore(r.name, targetTitle);
      if (seasonNum !== null) {
        const nameLC = r.name.toLowerCase();
        // Boost if the result explicitly names the right season
        const seasonPatterns = [
          new RegExp(`season\\s*${seasonNum}\\b`, 'i'),
          new RegExp(`\\b${seasonNum}(st|nd|rd|th)\\s+season\\b`, 'i'),
          new RegExp(`part\\s*${seasonNum}\\b`, 'i'),
        ];
        if (seasonPatterns.some(p => p.test(nameLC))) score += 30;
        // Penalise if a *different* season number is mentioned
        const otherSeasonMatch = nameLC.match(/season\s*(\d+)/i) || nameLC.match(/(\d+)(?:st|nd|rd|th)\s+season/i);
        if (otherSeasonMatch) {
          const foundSeason = parseInt(otherSeasonMatch[1]);
          if (foundSeason !== seasonNum) score -= 50;
        }
        // Season 1 is rarely labelled, so don't penalise unlabelled results for S1
        if (seasonNum === 1 && !nameLC.match(/season\s*\d/i)) score += 10;
      }
      return { ...r, score };
    });
    scored.sort((a, b) => b.score - a.score);
    console.log(`[ANIMEKAI] Scored results:`, scored.slice(0, 3).map(r => `"${r.name}" (${r.score})`).join(', '));
    return scored[0].slug;
  };

  // Try 1: Season-qualified title (e.g., "Jujutsu Kaisen Season 2") when season > 1
  if (seasonNum && seasonNum > 1) {
    const seasonQuery = `${title} Season ${seasonNum}`;
    console.log(`[ANIMEKAI] Trying season-qualified query: "${seasonQuery}"`);
    let results = await performSearch(seasonQuery);
    const best = pickBest(results, seasonQuery);
    if (best) {
      console.log(`[ANIMEKAI] Best match (season-qualified): slug=${best}`);
      return best;
    }
  }

  // Try 2: Original title Ã¢â‚¬â€ pick best match
  let results = await performSearch(title);
  {
    const best = pickBest(results, title);
    if (best) {
      console.log(`[ANIMEKAI] Best match (original title): slug=${best}`);
      return best;
    }
  }

  // Try 3: Sanitised title (strip trailing punctuation & parentheses)
  const sanitized = title.replace(/[.\-\u2013\u2014:,\s]+$/, '').replace(/\([^)]*\)/g, '').trim();
  if (sanitized && sanitized !== title) {
    console.log(`[ANIMEKAI] Trying sanitised query: "${sanitized}"`);
    results = await performSearch(sanitized);
    const best = pickBest(results, sanitized);
    if (best) {
      console.log(`[ANIMEKAI] Best match (sanitised): slug=${best}`);
      return best;
    }
  }

  // Try 4: Base title (before colon/hyphen)
  const parts = sanitized.split(/[:\-\u2013\u2014]/);
  if (parts.length > 1) {
    const base = parts[0].trim();
    if (base && base !== sanitized) {
      console.log(`[ANIMEKAI] Trying base title: "${base}"`);
      results = await performSearch(base);
      const best = pickBest(results, base);
      if (best) {
        console.log(`[ANIMEKAI] Best match (base): slug=${best}`);
        return best;
      }
    }
  }

  console.log('[ANIMEKAI] No results found.');
  return null;
}

/**
 * Given an AnimeKai slug + episode number Ã¢â€ â€™ returns embed URLs for sub/dub
 */
async function animeKaiGetEpisodeEmbeds(slug, episodeNum) {
  const url = `${ANIMEKAI_BASE}/watch/${slug}/ep-${episodeNum}`;
  console.log(`[ANIMEKAI] Loading episode page: ${url}`);

  const { data } = await axios.get(url, AXIOS_OPTS);
  const $ = cheerio.load(data);

  const servers = { sub: [], dub: [], hsub: [] };

  // Parse all server-video elements grouped by language
  $('.server-items.lang-group').each((_, group) => {
    const langId = $(group).attr('data-id') || 'sub'; // sub, dub, hsub
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

  console.log(`[ANIMEKAI] Episode ${episodeNum} Ã¢â‚¬â€ sub: ${servers.sub?.length || 0}, dub: ${servers.dub?.length || 0}, hsub: ${servers.hsub?.length || 0} servers`);
  return servers;
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
// Jikan (MyAnimeList) Episode Metadata Proxy
// Fetches episode titles, air dates, filler/recap flags
// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
app.get('/api/episodes/mal/:malId', async (req, res) => {
  const { malId } = req.params;
  const page = parseInt(req.query.page) || 1;
  const cacheKey = `${malId}:${page}`;

  console.log(`\n[JIKAN] Episode list for MAL ID ${malId}, page ${page}`);

  // Serve from cache if fresh
  const cached = jikanCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < JIKAN_TTL) {
    console.log(`[JIKAN] Cache hit: ${cacheKey}`);
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
    console.log(`[JIKAN] ${episodes.length} episodes fetched (page ${page}/${data.pagination?.last_visible_page || 1})`);
    res.json(result);
  } catch (err) {
    console.error(`[JIKAN] Failed for MAL ID ${malId}:`, err.message);
    res.status(502).json({ error: 'Could not fetch episode data from Jikan', message: err.message });
  }
});

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
// Health check
// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'eetnet-backend',
    startedAt: startedAt.toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    publicBase: publicHost(req),
    port: Number(PORT),
    corsOrigin: process.env.CORS_ORIGIN || '*',
    providers: {
      anime: ['hianime-consumet (AniList ID primary)', 'animekai-scraper (title fallback)', 'animeunity-consumet (last resort)'],
      drama: 'kisskh',
      manhwa: 'hivetoons'
    },
    config: {
      kisskhBase: safeOrigin(KISSKH_BASE),
      encdecBase: safeOrigin(ENCDEC_BASE),
      manhwaBase: safeOrigin(HIVETOONS_BASE)
    }
  });
});

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
// HiAnime watch Ã¢â‚¬â€ PRIMARY stream provider
// Uses AniList ID for deterministic season-correct lookup.
// No title search = no season ambiguity.
// GET /api/hianime/watch?anilistId=N&episode=N[&dub=eng|hindi]
// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
// AnimeRulz Ã¢â‚¬â€ Hindi/Indian language anime stream provider
// Uses AniList IDs + fallback.streamindia.co.in API + animelok for Indian dubs.
// GET /api/animerulz/watch?anilistId=N&episode=N[&lang=hin|tam|tel|eng|jpn]
// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
const ANIMERULZ_FALLBACK = process.env.ANIMERULZ_FALLBACK || 'https://fallback.streamindia.co.in';
const ANIMERULZ_DATA    = process.env.ANIMERULZ_DATA    || 'https://data.streamindia.co.in';
const ANIMERULZ_ANIMELOK = process.env.ANIMERULZ_ANIMELOK || 'https://animelok.streamindia.co.in';
const ANIMERULZ_EXTRACT = process.env.ANIMERULZ_EXTRACT || 'https://extract.streamindia.co.in';
const ANIMERULZ_HIANIME = process.env.ANIMERULZ_HIANIME || 'https://hianime.streamindia.co.in';
const ANIMERULZ_CACHE_TTL = 30 * 60 * 1000; // 30 min

// AnimeRulz APIs require a browser-like Referer/Origin or they return 403.
const ANIMERULZ_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://animerulzapp.buzz/',
  'Origin': 'https://animerulzapp.buzz',
};

const animerulzStreamCache = new Map();
const animerulzDataCache    = new Map();

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

/**
 * Fetch anime metadata from HiAnime detail API.
 * Returns { title, description, coverImage, bannerImage, genres, episodes, ... }
 */
async function fetchAnimerulzAnime(anilistId) {
  const cacheKey = `detail:${anilistId}`;
  const cached = animerulzDataCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < ANIMERULZ_CACHE_TTL) return cached.data;

  try {
    const url = `${ANIMERULZ_HIANIME}/api/v2/hianime/anilist/anime/${anilistId}`;
    const { data } = await axios.get(url, {
      timeout: 10000,
      headers: ANIMERULZ_HEADERS,
    });
    if (data?.data) {
      animerulzDataCache.set(cacheKey, { data: data.data, ts: Date.now() });
      return data.data;
    }
  } catch (err) {
    console.warn(`[ANIMERULZ] Detail fetch failed for ${anilistId}:`, err.message);
  }
  return null;
}

/**
 * Fetch episode list from fallback API.
 * Returns [ { number, title, description, img, hasDub, hasSub }, ... ]
 */
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
  } catch (err) {
    console.warn(`[ANIMERULZ] Episodes fetch failed for ${anilistId}:`, err.message);
  }
  return [];
}

/**
 * Check if an anime has Indian language streams available on AnimeRulz.
 * Returns { animerulz_id, animelok_id, languages: ['hindi','tamil',...] } or null.
 */
async function checkAnimerulzAvailability(anilistId) {
  const cacheKey = `avail:${anilistId}`;
  const cached = animerulzDataCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < ANIMERULZ_CACHE_TTL) return cached.data;

  // The catalogue is the authoritative source. It covers every AnimeRulz dub
  // and avoids false negatives from the individual metadata endpoint.
  try {
    const catalog = await fetchAnimerulzCatalog();
    const catalogItem = catalog.find(item => item.animerulz_id === `anime-${anilistId}`);
    if (catalogItem) {
      animerulzDataCache.set(cacheKey, { data: catalogItem, ts: Date.now() });
      return catalogItem;
    }
  } catch (err) {
    console.warn('[ANIMERULZ] Catalog fetch failed, trying individual lookup:', err.message);
  }

  try {
    const { data } = await axios.get(`${ANIMERULZ_DATA}/api/animerulz-id=anime-${anilistId}`, {
      timeout: 8000,
      headers: ANIMERULZ_HEADERS,
    });
    if (data?.languages) {
      animerulzDataCache.set(cacheKey, { data, ts: Date.now() });
      return data;
    }
  } catch (err) {
    // 404 = anime not on AnimeRulz, not an error
  }
  return null;
}

/**
 * Resolve a stream for a specific episode via AnimeRulz.
 * Strategy:
 *  1. Check if anime has Indian languages Ã¢â€ â€™ use animelok + extract for the requested language
 *  2. Fallback to fallback.streamindia.co.in sources (sub/dub) via kiwi provider
 *
 * Returns { type, streamUrl, sources, subtitles, headers, provider, language, audioMode }
 */
async function resolveAnimerulzStream(anilistId, episodeNum, lang = 'hin') {
  const cacheKey = `${anilistId}:e${episodeNum}:${lang}`;
  const cached = animerulzStreamCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < ANIMERULZ_CACHE_TTL) return cached.data;

  let result = null;

  // Strategy 1: Indian language streams via animelok + extract
  const avail = await checkAnimerulzAvailability(anilistId);
  const languageNames = { hin: 'hindi', tam: 'tamil', tel: 'telugu', mal: 'malayalam', kan: 'kannada', ben: 'bengali' };
  const langCode = lang.toLowerCase();
  const requestedLanguage = languageNames[langCode];

  // Never relabel a Japanese/English fallback as Hindi. If AnimeRulz does not
  // have the requested Indian-language track, return a clear not-found result.
  if (requestedLanguage && !avail?.languages?.includes(requestedLanguage)) {
    console.warn(`[ANIMERULZ] ${anilistId} has no ${requestedLanguage} track in the catalogue.`);
    return null;
  }

  if (avail?.animelok_id && avail.languages) {

    // Parse animelok_id: can be string ("one-piece-1x1") or array (["naruto-1x1","naruto-2x58",...])
    // Format: "showSlug-<season>x<absoluteStartEp>" Ã¢â‚¬â€ episodes are RELATIVE per season
    const rawIds = Array.isArray(avail.animelok_id) ? avail.animelok_id : [avail.animelok_id];

    // Pick the season slug whose absolute range covers this episode.
    // Sort by startEp descending to find the latest season that starts at or before our ep.
    const seasons = rawIds.map(id => {
      const raw = String(id || '').trim();
      if (!raw) return null;
      const m = raw.match(/^(.+)-(\d+)x(\d+)$/);
      // Movies and specials use a plain slug without a season marker.
      return m
        ? { slug: m[1], season: parseInt(m[2]), startEp: parseInt(m[3]), raw }
        : { slug: raw, season: 1, startEp: 1, raw };
    }).filter(Boolean).sort((a, b) => b.startEp - a.startEp);

    // For single-season anime (startEp=1), just use it directly
    // For multi-season: find the season where startEp <= episodeNum
    let targetSeason = seasons.find(s => s.startEp <= episodeNum) || seasons[seasons.length - 1];
    let relativeEp = targetSeason ? episodeNum - targetSeason.startEp + 1 : episodeNum;

    if (targetSeason && relativeEp >= 1) {
      try {
        // Step 1: Get multi-URL from animelok (relative episode number)
        const alUrl = `${ANIMERULZ_ANIMELOK}/api/anime?id=${encodeURIComponent(targetSeason.raw)}&ep=${relativeEp}`;
        const alRes = await axios.get(alUrl, {
          timeout: 10000,
          headers: ANIMERULZ_HEADERS,
        });

        if (alRes.data?.multi) {
          // Step 2: Extract language tracks
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
            console.log(`[ANIMERULZ] Ã¢Å“â€¦ ${anilistId} E${episodeNum} ${langCode} -> ${m3u8Url.slice(0, 80)}...`);
          }
        }
      } catch (err) {
        console.warn(`[ANIMERULZ] Animelok/extract failed for ${anilistId}:`, err.message);
      }
    }
  }

  // fallback.streamindia only offers sub/English-dub sources. It is valid for
  // those modes, but must never be used to satisfy an Indian dub mode.
  if (!result && !requestedLanguage) {
    try {
      // Get servers to get provider IDs
      const srvRes = await axios.get(`${ANIMERULZ_FALLBACK}/servers?id=${anilistId}&ep=${episodeNum}`, {
        timeout: 10000,
        headers: ANIMERULZ_HEADERS,
      });

      const ids = srvRes.data?.data?.categories?.ids || {};
      // Try providers in order of reliability
      const providers = ['kiwi', 'bonk', 'pewe', 'vidstream'];
      const category = (lang === 'hin' || lang === 'tam' || lang === 'tel') ? 'sub' : (lang === 'eng' ? 'dub' : 'sub');

      for (const provider of providers) {
        const pid = ids[provider];
        if (!pid) continue;

        try {
          const srcUrl = `${ANIMERULZ_FALLBACK}/sources?anilistid=${anilistId}&providerid=${encodeURIComponent(pid)}&ep=${episodeNum}&provider=${provider}&category=${category}`;
          const srcRes = await axios.get(srcUrl, {
            timeout: 12000,
            headers: ANIMERULZ_HEADERS,
          });

          const sources = srcRes.data?.data?.sources || [];
          const headers = srcRes.data?.data?.headers || {};
          const subs = srcRes.data?.data?.subtitles || [];

          if (sources.length > 0) {
            result = {
              type: 'hls',
              sources: sources.map(s => ({
                url: s.url,
                isM3U8: s.url?.includes('.m3u8'),
                quality: s.quality || 'auto',
                language: category === 'dub' ? 'English Dub' : 'Japanese Sub',
                audioMode: 'hindi',
              })),
              subtitles: subs,
              headers,
              provider: 'animerulz',
              language: lang,
              audioMode: 'hindi',
            };
            console.log(`[ANIMERULZ] Ã¢Å“â€¦ Fallback ${anilistId} E${episodeNum} ${provider}/${category} -> ${sources[0].url?.slice(0, 80)}...`);
            break;
          }
        } catch (e) {
          console.warn(`[ANIMERULZ] Source fetch failed for ${provider}:`, e.message);
        }
      }
    } catch (err) {
      console.warn(`[ANIMERULZ] Fallback servers fetch failed for ${anilistId}:`, err.message);
    }
  }

  if (result) {
    animerulzStreamCache.set(cacheKey, { data: result, ts: Date.now() });
  }
  return result;
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
// GET /api/animerulz/watch
// Params: anilistId (required), episode (required), lang (hin|tam|tel|eng|jpn, default=hin)
// Returns: { type, streamUrl, sources, subtitles, headers, provider, audioMode }
// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
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

    // Wrap all m3u8 URLs through the m3u8-proxy so the browser can load them
    // (extract.streamindia.co.in / fallback.streamindia.co.in have no CORS headers)
    const host = publicHost(req);
    const referer = result.headers?.Referer || 'https://animerulzapp.buzz/';
    const proxyHlsUrl = (value) => {
      const rawUrl = unwrapM3u8ProxyUrl(value);
      if (!rawUrl || !rawUrl.includes('.m3u8')) return value;
      return `${host}/api/m3u8-proxy?url=${encodeURIComponent(rawUrl)}&referer=${encodeURIComponent(referer)}`;
    };

    // Do not mutate result: it is cached by resolveAnimerulzStream and must retain
    // the raw provider URLs. Mutating it here caused repeat requests to nest proxy URLs.
    res.json({
      ...result,
      streamUrl: proxyHlsUrl(result.streamUrl),
      sources: (result.sources || []).map(source => ({
        ...source,
        url: proxyHlsUrl(source.url),
      })),
    });
  } catch (err) {
    console.error('[ANIMERULZ] Watch error:', err.message);
    res.status(502).json({ error: 'Stream resolution failed', message: err.message });
  }
});

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
// GET /api/animerulz/episodes
// Params: anilistId (required)
// Returns: { total, episodes: [ { number, title, description, img, hasDub, hasSub }, ... ] }
// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
app.get('/api/animerulz/episodes', async (req, res) => {
  const { anilistId } = req.query;
  if (!anilistId) return res.status(400).json({ error: 'Missing anilistId parameter' });

  try {
    const episodes = await fetchAnimerulzEpisodes(anilistId);
    res.json({ total: episodes.length, episodes });
  } catch (err) {
    console.error('[ANIMERULZ] Episodes error:', err.message);
    res.status(502).json({ error: 'Episode fetch failed', message: err.message });
  }
});

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
// GET /api/animerulz/availability
// Params: anilistId (required)
// Returns: { available, languages, animerulz_id } or { available: false }
// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
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

// GET /api/animerulz/catalog?language=hindi&page=1&limit=500
// Returns the live AnimeRulz language catalogue. AniList IDs are encoded in
// animerulz_id (for example, anime-2657) and can be used for exact matches.
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
    console.error('[ANIMERULZ] Catalog error:', err.message);
    res.status(502).json({ error: 'Hindi catalogue fetch failed', message: err.message });
  }
});

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
// POST /api/anilist
// Server-side cached & rate-limit-aware proxy for AniList GraphQL
// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
const aniListServerCache = new Map();
const ANILIST_CACHE_TTL = 60 * 60 * 1000; // 1 hour

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
          console.warn(`[ANILIST PROXY] Rate limited (429), retrying in ${attempts * 500}ms...`);
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
    console.error('[ANILIST PROXY] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/hianime/watch', async (req, res) => {
  const { anilistId, episode, dub } = req.query;
  const episodeNum = parseInt(episode) || 1;
  // Consumet accepts 'sub' or 'dub'
  const subOrDub = dub === 'eng' ? 'dub' : 'sub';

  if (!anilistId) {
    return res.status(400).json({ error: 'Missing anilistId parameter' });
  }

  console.log(`\n[HIANIME] Request: AniList ID ${anilistId} Ã¢â€ â€™ Episode ${episodeNum} [${subOrDub}]`);

  try {
    // Cache keyed by anilistId+subOrDub so sub/dub episode lists stay separate
    const cacheKey = `${anilistId}:${subOrDub}`;
    let epList = null;
    const cached = hiAnimeEpCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < HIANIME_TTL) {
      epList = cached.episodes;
      console.log(`[HIANIME] Cache hit: ${epList.length} episodes for AniList ID ${anilistId} (${subOrDub})`);
    } else {
      console.log(`[HIANIME] Fetching anime info for AniList ID ${anilistId} (${subOrDub})...`);
      const fetchWithTimeout = Promise.race([
        anilistHianime.fetchAnimeInfo(anilistId, true),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('HiAnime timeout (3s) Ã¢â‚¬â€ falling back to AnimeKai')), 3000)
        )
      ]);
      const info = await fetchWithTimeout;
      if (!info || !info.episodes || info.episodes.length === 0) {
        console.warn(`[HIANIME] No episodes found for AniList ID ${anilistId}`);
        return res.status(404).json({ error: `No episodes found on HiAnime for AniList ID ${anilistId}` });
      }
      epList = info.episodes;
      hiAnimeEpCache.set(cacheKey, { episodes: epList, timestamp: Date.now() });
      console.log(`[HIANIME] Fetched ${epList.length} episodes (${subOrDub}) (cached for 30min)`);
    }

    const ep = epList.find(e => e.number === episodeNum);
    if (!ep) {
      console.warn(`[HIANIME] Episode ${episodeNum} not found. Available: ${epList.map(e => e.number).join(', ')}`);
      return res.status(404).json({ error: `Episode ${episodeNum} not found on HiAnime` });
    }

    console.log(`[HIANIME] Found episode: ID=${ep.id} Title=${ep.title || '?'}`);

    // Pass subOrDub to Consumet so HiAnime serves the correct audio track
    const sources = await hianime.fetchEpisodeSources(ep.id, undefined, subOrDub);
    if (!sources || !sources.sources || sources.sources.length === 0) {
      console.warn(`[HIANIME] No sources for episode ID ${ep.id} (${subOrDub})`);
      return res.status(404).json({ error: `No stream sources found for this episode` });
    }

    console.log(`[HIANIME] Ã¢Å“â€¦ Episode ${episodeNum} (${subOrDub}) Ã¢â‚¬â€ ${sources.sources.length} source(s) found`);
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
    console.error(`[HIANIME] Error for AniList ID ${anilistId}:`, err.message);
    return res.status(500).json({ error: 'HiAnime lookup failed', message: err.message });
  }
});

async function probeProvider(name, url, options = {}) {
  const started = Date.now();
  try {
    const response = await axios.get(url, {
      timeout: options.timeout || 8000,
      headers: options.headers || AXIOS_OPTS.headers,
      validateStatus: status => status < 500,
    });
    return {
      name,
      ok: response.status >= 200 && response.status < 400,
      status: response.status,
      ms: Date.now() - started,
    };
  } catch (err) {
    return {
      name,
      ok: false,
      error: err.code || err.message,
      ms: Date.now() - started,
    };
  }
}

app.get('/api/status', async (req, res) => {
  const deep = req.query.deep === '1' || req.query.deep === 'true';
  const probes = [
    probeProvider('jikan', 'https://api.jikan.moe/v4/anime/1/episodes?page=1', {
      headers: { 'Accept': 'application/json', 'User-Agent': 'EetNet/1.0' },
    }),
    probeProvider('anime-provider', `${ANIMEKAI_BASE}/browser?keyword=naruto`),
    probeProvider('manhwa-provider', `${HIVETOONS_BASE}/`, { headers: HT_HEADERS }),
    probeProvider('drama-key-provider', `${ENCDEC_BASE}/api/enc-kisskh?text=1&type=vid`, {
      headers: { 'Accept': 'application/json' },
    }),
  ];

  if (deep) {
    probes.push(probeProvider('drama-catalog-provider', `${KISSKH_BASE}/api/DramaList/Show`, {
      headers: {
        'User-Agent': AXIOS_OPTS.headers['User-Agent'],
        'Accept': 'application/json, text/plain, */*',
      },
    }));
  }

  const results = await Promise.all(probes);
  const ok = results.every(item => item.ok);

  res.status(ok ? 200 : 207).json({
    status: ok ? 'ok' : 'degraded',
    checkedAt: new Date().toISOString(),
    publicBase: publicHost(req),
    deep,
    results,
  });
});

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
// ANIME INFO + EPISODE LIST
// Uses META.Anilist + AnimeUnity for episode metadata
// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
app.get('/api/info/:anilistId', async (req, res) => {
  const { anilistId } = req.params;
  console.log(`\n[INFO] Fetching info for AniList ID: ${anilistId}`);

  try {
    const info = await anilistMeta.fetchAnimeInfo(anilistId);
    console.log(`[INFO] "${info.title?.english || info.title?.romaji}" Ã¢â‚¬â€ ${info.episodes?.length || 0} episodes`);

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
    console.error(`[INFO] Failed for ID ${anilistId}:`, err.message);
    res.status(502).json({ error: 'Could not fetch episode data', message: err.message });
  }
});

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
// PRIMARY: AnimeKai stream (fast HTTP scraper, English subs)
// Returns embed URLs from third-party players (no domain whitelisting)
// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
app.get('/api/gogoanime/watch', async (req, res) => {
  const { title, episode, season, dub } = req.query;
  const episodeNum = parseInt(episode) || 1;
  const seasonNum = season ? parseInt(season) : null;
  const host = publicHost(req);
  const wantDub = dub === 'eng';

  if (!title) {
    return res.status(400).json({ error: 'Missing title parameter' });
  }

  // Cache key always includes season (defaults to 1 if unspecified)
  const effectiveSeason = seasonNum || 1;
  const cacheKey = `${title.toUpperCase().trim()}::s${effectiveSeason}`;

  try {
    // Check cache
    let cached = animeCache.get(cacheKey);
    const now = Date.now();

    if (!cached || now - cached.timestamp > CACHE_TTL) {
      const slug = await animeKaiSearch(title, seasonNum);
      if (!slug) {
        console.warn(`[ANIMEKAI] No results for "${title}" (season ${seasonNum})`);
        return res.status(404).json({ error: `Anime "${title}" not found on AnimeKai` });
      }
      cached = { slug, timestamp: now };
      animeCache.set(cacheKey, cached);
      console.log(`[ANIMEKAI] Cached [${cacheKey}] Ã¢â€ â€™ ${slug}`);
    } else {
      console.log(`[ANIMEKAI] Cache hit [${cacheKey}] Ã¢â€ â€™ ${cached.slug}`);
    }

    const servers = await animeKaiGetEpisodeEmbeds(cached.slug, episodeNum);

    // Build preference-ordered list of embed URLs to try
    // Priority changes based on requested dub mode:
    // - Default/sub: sub > hsub > dub
    // - ENG Dub: dub > sub > hsub
    const candidates = [];
    if (wantDub) {
      // English Dub mode: prefer dub servers first
      if (servers.dub?.length > 0) {
        servers.dub.forEach(x =>
          candidates.push({ embedUrl: x.embedUrl, language: 'English Dub', server: x.serverName })
        );
      }
      if (servers.sub?.length > 0) {
        servers.sub.forEach(x =>
          candidates.push({ embedUrl: x.embedUrl, language: 'English Sub', server: x.serverName })
        );
      }
      if (servers.hsub?.length > 0) {
        servers.hsub.forEach(x =>
          candidates.push({ embedUrl: x.embedUrl, language: 'English Sub (Hardsub)', server: x.serverName })
        );
      }
    } else {
      // Default: sub first (Japanese audio + English subtitles)
      if (servers.sub?.length > 0) {
        const s = servers.sub.find(x => x.isDefault) || servers.sub[0];
        candidates.push({ embedUrl: s.embedUrl, language: 'English Sub', server: s.serverName });
        servers.sub.filter(x => !x.isDefault).forEach(x =>
          candidates.push({ embedUrl: x.embedUrl, language: 'English Sub', server: x.serverName })
        );
      }
      if (servers.hsub?.length > 0) {
        servers.hsub.forEach(x =>
          candidates.push({ embedUrl: x.embedUrl, language: 'English Sub (Hardsub)', server: x.serverName })
        );
      }
      if (servers.dub?.length > 0) {
        servers.dub.forEach(x =>
          candidates.push({ embedUrl: x.embedUrl, language: 'English Dub', server: x.serverName })
        );
      }
    }

    if (candidates.length === 0) {
      return res.status(404).json({ error: `No streams found for episode ${episodeNum}` });
    }

    // Check stream cache first Ã¢â‚¬â€ avoid re-extracting the HLS URL on repeat clicks
    const streamCacheKey = `${cached.slug}::ep${episodeNum}::${dub || 'sub'}`;
    const cachedStream = streamCache.get(streamCacheKey);
    if (cachedStream && Date.now() - cachedStream.timestamp < STREAM_CACHE_TTL) {
      console.log(`[ANIMEKAI] Ã¢Å¡Â¡ Stream cache hit for ${streamCacheKey}`);
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

    // Try top-3 sub servers in PARALLEL Ã¢â‚¬â€ take whichever resolves first
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
      console.log(`[ANIMEKAI] Ã¢Å¡Â¡ Parallel winner: ${chosenServer}`);
    } catch {
      // All top-3 parallel attempts failed Ã¢â‚¬â€ try remaining candidates sequentially
      console.warn(`[ANIMEKAI] Parallel top-3 failed, trying remaining candidates...`);
      for (const candidate of candidates.slice(3)) {
        console.log(`[ANIMEKAI] Trying fallback server: ${candidate.server}`);
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
      // All extractions failed Ã¢â‚¬â€ return the iframe as last resort (might still work in some browsers)
      const fallback = candidates[0];
      console.warn(`[ANIMEKAI] Direct extraction failed for all servers. Using iframe fallback.`);
      return res.json({
        provider: 'animekai',
        type: 'iframe',
        iframeSrc: fallback.embedUrl,
        episode: episodeNum,
        language: fallback.language,
        allServers: servers
      });
    }

    console.log(`[ANIMEKAI] Ã¢Å“â€¦ Episode ${episodeNum} direct HLS stream ready Ã¢â‚¬â€ ${chosenLanguage} via ${chosenServer}`);

    // Cache the stream URL for 20 minutes so repeat clicks are instant
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
    console.error(`[ANIMEKAI] Error:`, err.message);
    res.status(500).json({ error: 'AnimeKai scraper error', message: err.message });
  }
});

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
// FALLBACK: AnimeUnity stream via Consumet (Italian subs Ã¢â‚¬â€ last resort)
// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
app.get('/api/watch/:episodeId', async (req, res) => {
  const episodeId = req.params.episodeId;
  console.log(`\n[WATCH] Fetching AnimeUnity sources for: ${episodeId}`);

  try {
    const sources = await anilistMeta.fetchEpisodeSources(episodeId);
    if (sources.sources?.length > 0) {
      console.log(`[WATCH] Got ${sources.sources.length} sources via META.Anilist`);
      return res.json({
        provider: 'animeunity',
        type: 'hls',
        sources: sources.sources,
        subtitles: sources.subtitles || [],
        headers: sources.headers || {}
      });
    }
  } catch (err) {
    console.warn(`[WATCH] META.Anilist failed:`, err.message);
  }

  try {
    const sources = await animeUnity.fetchEpisodeSources(episodeId);
    if (sources.sources?.length > 0) {
      console.log(`[WATCH] Got ${sources.sources.length} sources (direct AnimeUnity)`);
      return res.json({
        provider: 'animeunity-direct',
        type: 'hls',
        sources: sources.sources,
        subtitles: sources.subtitles || [],
        headers: sources.headers || {}
      });
    }
  } catch (err) {
    console.warn(`[WATCH] Direct AnimeUnity failed:`, err.message);
  }

  res.status(404).json({ error: 'Could not find streaming sources for this episode' });
});

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
// SEARCH (via AnimeKai directly)
// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).json({ error: 'Missing q parameter' });

  try {
    const slug = await animeKaiSearch(query);
    res.json({ slug, results: slug ? [{ slug }] : [] });
  } catch (error) {
    console.error('[SEARCH] Error:', error.message);
    res.status(500).json({ error: 'Search failed' });
  }
});

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
// KISSKH DRAMA Ã¢â‚¬â€ Config, Headers & Caches
// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
// KISSKH (and enc-dec) reject requests from cloud/datacenter IPs (e.g. Vercel's servers)
// due to Cloudflare. Locally we hit kisskh.co directly; on hosted deployments
// set KISSKH_BASE (and optionally ENCDEC_BASE) to a relay on a trusted IP
// Ã¢â‚¬â€ e.g. a 24/7 phone (Termux) Cloudflare tunnel Ã¢â‚¬â€ so the calls originate
// from an IP KissKH doesn't block.

const DRAMA_LIST_TTL  = 30 * 60 * 1000; // 30 min  Ã¢â‚¬â€ drama catalog changes rarely
const STREAM_TTL      =  2 * 60 * 60 * 1000; // 2 hours Ã¢â‚¬â€ kkey tokens last hours

const dramaListCache   = new Map(); // key: "type:page"  Ã¢â€ â€™ { data, timestamp }
const dramaInfoCache   = new Map(); // key: dramaId      Ã¢â€ â€™ { data, timestamp }
const dramaStreamCache = new Map(); // key: episodeId    Ã¢â€ â€™ { data, timestamp }

// Helper: GET a KissKH URL
async function kissKhGet(url) {
  const res = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    timeout: 15000,
  });

  // If we got HTML back, log it
  const ct = res.headers['content-type'] || '';
  if (ct.includes('text/html') || typeof res.data === 'string') {
    console.warn('[KISSKH] Received HTML response instead of JSON. Reverse proxy might be failing.');
  }
  return res;
}


// Hivetoons helper (manga chapter scraping)
const htChapterCache = new Map();
async function htGet(url) {
  const res = await axios.get(url, { headers: HT_HEADERS, timeout: 15000 });
  return cheerio.load(res.data);
}

app.get('/api/manhwa/chapter/:slug/:chapter', async (req, res) => {
  const { slug, chapter } = req.params;
  try {
    console.log(`\n[MANHWA CHAPTER] Fetching: ${slug}/${chapter}`);
    const $ = await htGet(`${HIVETOONS_BASE}/series/${slug}/${chapter}`);

    // Images are at storage.hivetoon.com/public/upload/series/{slug}/...
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
    console.log(`[MANHWA CHAPTER] âœ… ${slug}/${chapter} â€” ${images.length} pages`);
    res.json(data);
  } catch (err) {
    console.error('[MANHWA CHAPTER] Error:', err.message);
    res.status(502).json({ error: 'Hivetoons chapter fetch failed', message: err.message });
  }
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// MOVIES & NETMIRROR SECTION (ARCHIVED & REMOVED)
// All workloads stored in archive_movies_netmirror/
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
// NETMIRROR API ENDPOINTS (net52.cc Ã¢â‚¬â€ Movies/Dramas OTT Aggregator)
// Auth: POST /verify.php with random UUID Ã¢â€ â€™ t_hash_t cookie (0.25s, no captcha)
// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

const NETMIRROR_BASE = process.env.NETMIRROR_BASE || 'https://net52.cc';
const NETMIRROR_UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Mobile Safari/537.36 /OS.Gatu v3.0';
let netmirrorToken = null;
let netmirrorTokenExpiry = 0;

async function getNetmirrorToken() {
  const now = Date.now();
  if (netmirrorToken && now < netmirrorTokenExpiry) return netmirrorToken;

  // THE BYPASS: random UUID as g-recaptcha-response (server never validates it)
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

    // Extract t_hash_t from Set-Cookie header
    const setCookies = res.headers['set-cookie'];
    const cookieStr = Array.isArray(setCookies) ? setCookies.join('; ') : (setCookies || '');
    const match = cookieStr.match(/t_hash_t=([^;]+)/);
    if (!match) throw new Error('No t_hash_t in verify response');

    netmirrorToken = decodeURIComponent(match[1]);
    // Server grants Max-Age=259200 (72h), we refresh at 15h for safety
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

    // Token expired: JSON has status:"n" or response is HTML challenge page
    if (expectJson && data && data.status === 'n') {
      console.log('[NetMirror] Token expired (status:n), refreshing...');
      netmirrorToken = null;
      netmirrorTokenExpiry = 0;
      return netmirrorApi(path, { ott, params, expectJson }); // retry once
    }

    return data;
  } catch (err) {
    console.error(`[NetMirror] API call failed (${path}):`, err.message);
    throw err;
  }
}

// Search NetMirror for a movie/show by title
// GET /api/netmirror/search?q=<query>
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

// Get details + episodes for a NetMirror title
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

// Get HLS stream sources for a NetMirror title
// GET /api/netmirror/playlist/:id
app.get('/api/netmirror/playlist/:id', async (req, res) => {
  const { id } = req.params;
  const host = publicHost(req);
  try {
    const data = await netmirrorApi('playlist.php', { params: { id } });

    // data is an array Ã¢â‚¬â€ take first entry
    const entry = Array.isArray(data) ? data[0] : data;
    if (!entry || !entry.sources) {
      return res.status(404).json({ error: 'No sources found' });
    }

    // Rewrite HLS URLs through our m3u8-proxy with correct Referer
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

    // Rewrite subtitle tracks
    const tracks = (entry.tracks || []).map(tr => {
      if (!tr.file) return null;
      return {
        ...tr,
        url: `${host}/api/drama/subtitle?url=${encodeURIComponent(tr.file)}`,
      };
    }).filter(Boolean);

    res.json({ sources, tracks });
  } catch (err) {
    res.status(502).json({ error: 'NetMirror playlist fetch failed', message: err.message });
  }
});

// ─────────────────────────────────────────────────────
// KISSKH DRAMA — Handlers & Routes
// ─────────────────────────────────────────────────────
const dramaHomeCache = new Map();

async function kissKhFetch(url) {
  const res = await kissKhGet(url);
  return res.data;
}

// GET /api/drama/home
app.get('/api/drama/home', async (req, res) => {
  console.log('\n[DRAMA HOME] Endpoint hit!');
  const cacheKey = 'home';
  const cached = dramaHomeCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < DRAMA_LIST_TTL) {
    return res.json(cached.data);
  }

  try {
    const [showRes, koreanRes, chineseRes, topRatingRes, lastUpdateRes] = await Promise.all([
      kissKhFetch(`${KISSKH_BASE}/api/DramaList/Show`),
      kissKhFetch(`${KISSKH_BASE}/api/DramaList/MostView?ispc=false&c=2`),
      kissKhFetch(`${KISSKH_BASE}/api/DramaList/MostView?ispc=false&c=1`),
      kissKhFetch(`${KISSKH_BASE}/api/DramaList/TopRating?ispc=false`),
      kissKhFetch(`${KISSKH_BASE}/api/DramaList/LastUpdate?ispc=false`),
    ]);
    const data = {
      show:       Array.isArray(showRes)       ? showRes       : [],
      korean:     Array.isArray(koreanRes)     ? koreanRes     : [],
      chinese:    Array.isArray(chineseRes)    ? chineseRes    : [],
      topRating:  Array.isArray(topRatingRes)  ? topRatingRes  : [],
      lastUpdate: Array.isArray(lastUpdateRes) ? lastUpdateRes : [],
    };
    dramaHomeCache.set(cacheKey, { data, timestamp: Date.now() });
    res.json(data);
  } catch (err) {
    console.error('[DRAMA HOME] Error:', err.message);
    res.status(502).json({ error: 'KissKH home fetch failed', message: err.message });
  }
});

// GET /api/drama/list
app.get('/api/drama/list', async (req, res) => {
  const type = req.query.type || 0;
  const q    = req.query.q    || '';
  const cacheKey = `list:${type}:${q}`;

  const cached = dramaListCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < DRAMA_LIST_TTL) {
    return res.json(cached.data);
  }

  try {
    const data = await kissKhFetch(`${KISSKH_BASE}/api/DramaList/Search?q=${encodeURIComponent(q)}&type=${type}`);
    dramaListCache.set(cacheKey, { data, timestamp: Date.now() });
    res.json(data);
  } catch (err) {
    console.error('[DRAMA LIST] Error:', err.message);
    res.status(502).json({ error: 'KissKH drama list failed', message: err.message });
  }
});

// GET /api/drama/search
app.get('/api/drama/search', async (req, res) => {
  const q = req.query.q;
  if (!q) return res.status(400).json({ error: 'Missing q parameter' });

  try {
    const data = await kissKhFetch(`${KISSKH_BASE}/api/DramaList/Search?q=${encodeURIComponent(q)}&type=0`);
    res.json(data);
  } catch (err) {
    console.error('[DRAMA SEARCH] Error:', err.message);
    res.status(502).json({ error: 'KissKH search failed', message: err.message });
  }
});

// GET /api/drama/info/:dramaId
app.get('/api/drama/info/:dramaId', async (req, res) => {
  const { dramaId } = req.params;

  const cached = dramaInfoCache.get(dramaId);
  if (cached && Date.now() - cached.timestamp < DRAMA_LIST_TTL) {
    return res.json(cached.data);
  }

  try {
    const data = await kissKhFetch(`${KISSKH_BASE}/api/DramaList/Drama/${dramaId}?isq=false`);
    dramaInfoCache.set(dramaId, { data, timestamp: Date.now() });
    res.json(data);
  } catch (err) {
    console.error('[DRAMA INFO] Error:', err.message);
    res.status(502).json({ error: 'KissKH episode list failed', message: err.message });
  }
});

// GET /api/drama/stream/:episodeId
app.get('/api/drama/stream/:episodeId', async (req, res) => {
  const { episodeId } = req.params;
  const host = publicHost(req);

  const cached = dramaStreamCache.get(episodeId);
  if (cached && Date.now() - cached.timestamp < STREAM_TTL) {
    return res.json(cached.data);
  }

  try {
    const vidKeyRes = await axios.get(
      `${ENCDEC_BASE}/api/enc-kisskh?text=${episodeId}&type=vid`,
      { timeout: 10000 }
    );
    const vidKkey = vidKeyRes.data?.result;
    if (!vidKkey) {
      return res.status(502).json({ error: 'enc-dec.app returned no video kkey' });
    }

    const streamResData = await kissKhFetch(
      `${KISSKH_BASE}/api/DramaList/Episode/${episodeId}.png?err=false&ts=&time=&kkey=${vidKkey}`
    );
    const videoUrl = streamResData?.Video;
    if (!videoUrl) {
      return res.status(404).json({ error: 'No stream URL found for this episode' });
    }

    let subtitles = [];
    try {
      const subKeyRes = await axios.get(
        `${ENCDEC_BASE}/api/enc-kisskh?text=${episodeId}&type=sub`,
        { timeout: 8000 }
      );
      const subKkey = subKeyRes.data?.result;
      if (subKkey) {
        const rawSubs = await kissKhFetch(`${KISSKH_BASE}/api/Sub/${episodeId}?kkey=${subKkey}`);
        if (Array.isArray(rawSubs)) {
          subtitles = rawSubs.map(s => ({
            label: s.label || s.language || 'English',
            file: `${host}/api/drama/subtitle?url=${encodeURIComponent(s.src)}`,
            rawFile: s.src,
            default: (s.label || s.language || '').toLowerCase().includes('en'),
          }));
        }
      }
    } catch (subErr) {
      console.warn('[DRAMA STREAM] Subtitle fetch failed (non-fatal):', subErr.message);
    }

    const isM3U8 = videoUrl.includes('.m3u8');
    const proxiedStream = isM3U8
      ? `${host}/api/m3u8-proxy?url=${encodeURIComponent(videoUrl)}&referer=${encodeURIComponent(KISSKH_BASE + '/')}`
      : videoUrl;

    const result = {
      episodeId,
      type: isM3U8 ? 'hls' : 'mp4',
      streamUrl: proxiedStream,
      subtitles,
    };

    dramaStreamCache.set(episodeId, { data: result, timestamp: Date.now() });
    res.json(result);

  } catch (err) {
    console.error('[DRAMA STREAM] Fatal error:', err.message);
    res.status(502).json({ error: 'Drama stream fetch failed', message: err.message });
  }
});

// GET /api/drama/subtitle?url=<url>
app.get('/api/drama/subtitle', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing url parameter' });

  try {
    const subRes = await axios.get(url, { timeout: 10000, responseType: 'text' });
    let content = subRes.data;

    if (typeof content !== 'string') {
      content = String(content);
    }

    if (!content.trimStart().startsWith('WEBVTT')) {
      content = 'WEBVTT\n\n' + content.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
    }

    res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(content);
  } catch (err) {
    console.error('[DRAMA SUB] Error:', err.message);
    res.status(502).json({ error: 'Subtitle retrieval failed', message: err.message });
  }
});

// Get NetMirror trending/home catalog (HTML parsing with cheerio)
// GET /api/netmirror/trending
app.get('/api/netmirror/trending', async (req, res) => {
  const host = publicHost(req);
  try {
    const html = await netmirrorApi('home?app=1', { expectJson: false });
    const $ = cheerio.load(html);

    const movies = [];
    const seen = new Set();
    // NetMirror home has tray containers with data-post attributes
    $('[data-post]').each((i, element) => {
      const id = $(element).attr('data-post');
      if (!id || seen.has(id)) return;
      seen.add(id);
      const poster = $(element).find('img').attr('data-src') || $(element).find('img').attr('src') || '';
      if (!poster || !poster.startsWith('http')) return;
      const proxiedPoster = `${host}/api/img-proxy?url=${encodeURIComponent(poster)}`;
      movies.push({
        id: String(id),
        title: '',           // will be filled by post.php batch below
        year: '',
        coverImage: proxiedPoster,
        bannerImage: proxiedPoster,
        type: 'movie',
        netmirrorId: true,
      });
    });

    // Batch-fetch real titles for the first 60 items from post.php
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
    // Items beyond 60 get a fallback title
    movies.slice(60).forEach(m => { if (!m.title) m.title = `NetMirror #${m.id}`; });

    const unique = movies.slice(0, 120);
    res.json(unique);
  } catch (err) {
    console.error('[NetMirror] Trending fetch failed:', err.message);
    res.status(502).json({ error: 'NetMirror trending failed', message: err.message });
  }
});


// GET /api/netmirror/stream-resolve?id=<id>&title=<title>&year=<year>&type=<movie|tv>&season=<s>&episode=<e>&ott=<nf|pv|hs>
// Searches NetMirror by ID or title, resolves episode ID for series, returns proxied HLS sources
app.get('/api/netmirror/stream-resolve', async (req, res) => {
  const { id, title, year, type = 'movie', season = 1, episode = 1, ott = 'nf' } = req.query;
  if (!id && !title) return res.status(400).json({ error: 'Missing id or title param' });
  const host = req.protocol + '://' + req.get('host');

  try {
    let targetId = id;
    let targetTitle = title || 'Media';
    let targetYear = year || '';

    // If no direct ID was provided, search NetMirror by title
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

    // Inspect post.php to check if item is a series container and extract episode ID
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

    // CRITICAL: pass t=<title>&tm=<timestamp> to playlist.php so the server generates a
    // real per-session in= hash. Without them the server returns in=unknown::pn which makes
    // the CDN serve files/220884 â€” the 9-min anti-abuse warning video instead of the movie.
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
    const tracks = (entry.tracks || []).map(tr => {
      if (!tr?.file) return null;
      const fullSub = normalizeNmUrl(tr.file);
      return { ...tr, url: host + '/api/drama/subtitle?url=' + encodeURIComponent(fullSub) };
    }).filter(Boolean);
    res.json({ netmirrorId: targetId, title: targetTitle, year: targetYear, sources, tracks });
  } catch (err) {
    console.error('[NetMirror] stream-resolve failed:', err.message);
    res.status(502).json({ error: 'NetMirror stream-resolve failed', message: err.message });
  }
});

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
// MANGA API ENDPOINTS (ComicKz / comickz.co.uk Engine)
// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

const COMICKZ_BASE = 'https://comickz.co.uk';

// Helper: Wrap cover URLs with backend image-proxy to bypass hotlink 403
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

const MANGA_GENRE_CACHE_TTL_MS = 15 * 60 * 1000;
const MANGA_GENRE_CACHE_MAX_ITEMS = 240;
const mangaGenreCatalogCache = new Map();

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

// GET /api/manga/home Ã¢â‚¬â€ Main Manga Landing Data (Bento Top 10 + Category Previews)
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

    // Ensure 10 items for Bento grid
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

// GET /api/manga/category/:type?genre=<genre>
// :type can be 'manga' (jp), 'manhwa' (kr), 'manhua' (cn)
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

    // Split into curated sections for the hub page
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

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
// HYBRID WEBTOON MIDDLEWARE ENGINE
// AniList Curated Metadata + ComicK Chapter Engine
// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
const comickSlugMap = new Map();

async function resolveComicKSlug(title, host) {
  if (!title) return null;
  const cleanTitle = title.trim();
  if (comickSlugMap.has(cleanTitle)) {
    return comickSlugMap.get(cleanTitle);
  }

  try {
    const url = `${COMICKZ_BASE}/api/search?q=${encodeURIComponent(cleanTitle)}&limit=5`;
    const r = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://comickz.co.uk/'
      },
      timeout: 6000
    });
    const items = r.data?.data || (Array.isArray(r.data) ? r.data : []);
    if (items.length > 0) {
      const match = items[0];
      const rawCover = match.default_thumbnail || (match.cover ? `${match.cover}` : null);
      const resObj = {
        id: match.slug || String(match.id),
        slug: match.slug,
        hid: match.hid,
        cover: proxyCoverUrl(host, rawCover),
        banner: proxyCoverUrl(host, rawCover)
      };
      comickSlugMap.set(cleanTitle, resObj);
      return resObj;
    }
  } catch (e) {}
  return null;
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

// GET /api/webtoon/home Ã¢â‚¬â€ Curated Webtoon Landing Data
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

// GET /api/manga/info/:id (id is comic slug e.g. "maxed-out-leveling" or numeric AniList ID)
app.get('/api/manga/info/:id', async (req, res) => {
  const { id } = req.params;
  console.log(`[MANGA INFO] Request for: ${id}`);
  const host = publicHost(req);
  let slug = id;

  // If numeric ID (AniList ID), attempt AniList title lookup first
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
    // 1. Fetch ALL pages of chapters with full pagination
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
      if (page > 30) break; // safety ceiling
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

    // Sort chapters numerically ascending
    chapters.sort((a, b) => parseFloat(a.chapter) - parseFloat(b.chapter));

    // 2. Fetch HTML page to get cover and title details
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
    console.log(`[MANGA INFO] OK Ã¢â‚¬â€ ${chapters.length} unique chapters found across ${page} page(s) for ${slug}`);

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
// chapterId format: "slug___hid-chapter-200.5-en"
app.get('/api/manga/read/:chapterId', async (req, res) => {
  const { chapterId } = req.params;
  console.log(`[MANGA READ] Fetching pages for ComicKz chapter: ${chapterId}`);
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

    // Ã¢Å¡Â Ã¯Â¸Â CRITICAL: Do NOT encodeURIComponent slug/chPath Ã¢â‚¬â€ ComicKz uses plain dashes in URLs
    const chUrl = `${COMICKZ_BASE}/comic/${slug}/${chPath}`;
    console.log(`[MANGA READ] Scraping chapter page: ${chUrl}`);

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
    // Use a non-greedy but robust match for sv-data
    const svMatch = html.match(/<script\s+id="sv-data"\s+type="application\/json">([\s\S]*?)<\/script>/i);

    if (svMatch) {
      let svData;
      try {
        svData = JSON.parse(svMatch[1].trim());
      } catch (parseErr) {
        console.error(`[MANGA READ] JSON parse error for sv-data:`, parseErr.message);
      }

      if (svData) {
        const rawImages = svData.chapter?.images || [];

        if (rawImages.length) {
          const pages = rawImages.map((imgObj, idx) => {
            // Ensure full URL (some may be relative starting with /)
            let rawUrl = imgObj.url || '';
            if (rawUrl.startsWith('/')) rawUrl = 'https://cdn2.comicknew.pictures' + rawUrl;
            return {
              page: idx + 1,
              url: `${host}/api/manga/image-proxy?url=${encodeURIComponent(rawUrl)}`,
              rawUrl
            };
          });

          console.log(`[MANGA READ] Ã¢Å“â€¦ ComicKz OK Ã¢â‚¬â€ ${pages.length} pages for ${chapterId}`);
          return res.json({ chapterId, pageCount: pages.length, pages });
        }
      }
    }

    console.error(`[MANGA READ] sv-data or images missing for ${chapterId} Ã¢â‚¬â€ HTML length: ${html.length}`);
    return res.json({ chapterId, pageCount: 0, pages: [] });

  } catch (err) {
    console.error(`[MANGA READ] Error fetching chapter ${chapterId}:`, err.message);
    return res.json({ chapterId, pageCount: 0, pages: [] });
  }
});

// GET /api/manga/image-proxy?url=<url> Ã¢â‚¬â€ proxy with Referer + exponential backoff retry on 429
app.get('/api/manga/image-proxy', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).send('Missing url parameter');

  const targetUrl = decodeURIComponent(url);
  const maxRetries = 5;

  // Determine correct Referer based on CDN domain
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
        // 403 = wrong/missing referer Ã¢â‚¬â€ retry once just in case
        await new Promise(r => setTimeout(r, 200));
        continue;
      }
      console.error(`[MANGA IMAGE PROXY] Error (attempt ${attempt}/${maxRetries}):`, err.message);
      if (!res.headersSent) {
        return res.status(status || 500).send('Image proxy error');
      }
      return;
    }
  }
});

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
// Start server

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

// ============================================================================
// MOVIEPLEX INTEGRATION
// Source: movieplex.co.in (WordPress + PsyPlay theme)
// WP REST API is fully open (no auth). Streams extracted via LuluStream/StreamTape
// ============================================================================

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
  if (catIds.includes(21)) return true; // Category 21 is 'hot'
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

// ── Poster API Keys ──────────────────────────────────────────────────────────
const TMDB_KEY = process.env.TMDB_API_KEY || '4e44d9029b1270a757cddc766a1bcb63';
const OMDB_KEY = process.env.OMDB_API_KEY || 'trilogy';    // omdbapi.com free key

// ── Title helpers ─────────────────────────────────────────────────────────────

// Extract the 4-digit year embedded in raw title e.g. "Fighter (2024) Hindi" → 2024
function mpExtractYear(raw) {
  const m = (raw || '').match(/\b(19[5-9]\d|20[0-2]\d)\b/);
  return m ? parseInt(m[1]) : null;
}

// Strip junk leaving only the clean movie/show name.
function mpCleanTitle(raw) {
  return (raw || '')
    // Decode common HTML entities
    .replace(/&#\d+;/g, function(m) { try { return String.fromCharCode(parseInt(m.slice(2))); } catch(e) { return ''; } })
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    // Strip "Watch Online" and common trailer phrases FIRST (whole phrase before word-level stripping)
    .replace(/\bWatch\s+Online\b/gi, '')
    .replace(/\bFull\s+Movie\b/gi, '')
    .replace(/\bFull\s+Web\s+Series\b/gi, '')
    .replace(/\bDownload\s+Now\b/gi, '')
    // Strip year in parens or standalone
    .replace(/\(\d{4}\)/g, '').replace(/\b(19|20)\d{2}\b/g, '')
    // Strip brackets content
    .replace(/\[.*?\]/g, '')
    // Strip episode/season/part markers
    .replace(/E\d+[-T]\d+/gi, '').replace(/\bE\d+\b/gi, '').replace(/\bS\d+\b/gi, '')
    .replace(/\bPart\s*\d+\b/gi, '').replace(/\bVolume\s*\d+\b/gi, '').replace(/\bVol\.?\s*\d+\b/gi, '')
    .replace(/\bEpisode\s*\d+\b/gi, '').replace(/\bSeason\s*\d+\b/gi, '').replace(/\bComplete\b/gi, '')
    // Strip language labels
    .replace(/\b(Hindi Dubbed|Hindi Dub|Hindi|Bengali|Malayalam|Tamil|Telugu|Kannada|Marathi|Punjabi|Gujarati|English|Bangladeshi|South Indian|Korean|Japanese|Chinese|Thai)\b/gi, '')
    // Strip quality labels — including the ones that were MISSING before
    .replace(/\b(HDRip|BluRay|WEB-DL|WEBRip|UNCUT|HDTS|HDTC|HDCam|HDCAM|CAMRip|CAM|DVDSCR|DVDScr|SCR|TS|DVDRIP|DVDRip|HD|4K|1080p|720p|480p|360p|Extended|Directors.?Cut)\b/gi, '')
    // Strip geography/origin labels that were MISSING before
    .replace(/\b(Hollywood|Bollywood|Tollywood|Mollywood|Kollywood|Pollywood)\b/gi, '')
    // Strip platform / content-type keywords
    .replace(/\b(Short Film|App Video|Webseries|Web Series|OTT|Originals|Exclusive)\b/gi, '')
    .replace(/\b(Sigmaseries|Sigma|Cukkuboo|Hulchul|HulChul|Hoichoi|Moodx|Kooku|Ullu|ALTBalaji|PrimeShots|Rabbit|RabbitMovies|Voovi|Chikooflix|Atrangii|NewSensations|LookEnt|Nuefliks|GupChup|Hotshots|Flizmovies|Mastram|DigiMoviePlex|Balloons|Besharams|Cinemadosti|Netflix|Amazon|Hotstar|SonyLiv|ZEE5|Voot|MXPlayer|JioCinema|Aha|Hoichoi|Lionsgate|Disney)\b/gi, '')
    // Strip standalone Movie/Series/Film
    .replace(/\bMovie\b/gi, '').replace(/\bSeries\b/gi, '').replace(/\bFilm\b/gi, '')
    // Normalise separators
    .replace(/[-_:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── TMDB: one search pass (movie or tv), returns first result with poster ────
async function _tmdbSearch(type, query, year) {
  const qs = 'api_key=' + TMDB_KEY + '&query=' + encodeURIComponent(query) + (year ? '&year=' + year : '');
  const r = await axios.get('https://api.themoviedb.org/3/search/' + type + '?' + qs, { timeout: 7000 });
  const results = (r.data && r.data.results) ? r.data.results : [];
  return results.find(function(x) { return !!x.poster_path; }) || null;
}

// ── OMDb: lookup by title (uses IMDb data, good for Bollywood) ───────────────
async function _omdbLookup(title, year) {
  const qs = 'apikey=' + OMDB_KEY + '&t=' + encodeURIComponent(title) + (year ? '&y=' + year : '') + '&r=json';
  const r = await axios.get('https://www.omdbapi.com/?' + qs, { timeout: 6000 });
  if (r.data && r.data.Poster && r.data.Poster !== 'N/A') {
    // OMDb posters are direct IMDb CDN JPEGs – no credit required
    return { poster: r.data.Poster, backdrop: null, rating: r.data.imdbRating && r.data.imdbRating !== 'N/A' ? r.data.imdbRating : null };
  }
  return null;
}

// ── TMDB multi-search (searches movies, TV and persons at once) ──────────────
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

// ── Master poster resolver: tries multiple strategies across multiple APIs ────
// Strategies in order:
//   1. TMDB movie search, title + year
//   2. TMDB movie search, title only
//   3. TMDB TV   search, title + year
//   4. TMDB TV   search, title only
//   5. TMDB movie search, first 3 words of title (catches "Fighter" → Bollywood Fighter)
//   6. OMDb title + year (excellent Bollywood coverage via IMDb)
//   7. OMDb title only
//   8. TMDB multi-search on short title
async function mpTmdbPoster(rawTitle) {
  const clean = typeof rawTitle === 'string' && rawTitle.length < 100 && !rawTitle.includes(' ') ? rawTitle : mpCleanTitle(rawTitle);
  if (!clean || clean.length < 2) return null;
  const year = mpExtractYear(rawTitle);

  // helper to build response object from a TMDB item
  function fmt(item) {
    if (!item) return null;
    return {
      poster: 'https://image.tmdb.org/t/p/w500' + item.poster_path,
      backdrop: item.backdrop_path ? 'https://image.tmdb.org/t/p/w1280' + item.backdrop_path : null,
      rating: item.vote_average ? parseFloat(item.vote_average).toFixed(1) : null
    };
  }

  try {
    // 1. TMDB movie + year
    if (year) {
      const r1 = await _tmdbSearch('movie', clean, year);
      if (r1) return fmt(r1);
    }

    // 2. TMDB movie, no year
    const r2 = await _tmdbSearch('movie', clean, null);
    if (r2) return fmt(r2);

    // 3. TMDB TV + year
    if (year) {
      const r3 = await _tmdbSearch('tv', clean, year);
      if (r3) return fmt(r3);
    }

    // 4. TMDB TV, no year
    const r4 = await _tmdbSearch('tv', clean, null);
    if (r4) return fmt(r4);

    // 5. Short title (first 3 significant words) – handles cases where cleaner leaves too many words
    const shortTitle = clean.split(' ').slice(0, 3).join(' ');
    if (shortTitle !== clean && shortTitle.length > 2) {
      const r5 = await _tmdbSearch('movie', shortTitle, year || null);
      if (r5) return fmt(r5);
    }

    // 6. OMDb with year (IMDb data – great Bollywood coverage)
    const omdb1 = await _omdbLookup(clean, year).catch(function() { return null; });
    if (omdb1) return omdb1;

    // 7. OMDb without year
    if (year) {
      const omdb2 = await _omdbLookup(clean, null).catch(function() { return null; });
      if (omdb2) return omdb2;
    }

    // 8. TMDB multi-search on short title as last resort
    const multiHit = await _tmdbMultiSearch(shortTitle || clean).catch(function() { return null; });
    if (multiHit) return multiHit;

  } catch (e) { /* all APIs unreachable */ }
  return null;
}

// Batch poster fetch: Query TMDB API FIRST for official posters & backdrops.
// Only fall back to LuluStream scrape if TMDB finds no result for a title.
async function buildMpThumbnails(maxPosts) {
  maxPosts = maxPosts || 500;
  const posts = mpCache.posts;
  if (!posts.length) return;

  const targetPosts = posts.slice(0, maxPosts);
  console.log('[MoviePlex] Posters: starting TMDB PRIMARY pass for ' + targetPosts.length + ' posts...');

  let tmdbFetched = 0;
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
        tmdbFetched++;
      }
    }));
    await new Promise(function(r) { setTimeout(r, 120); });
  }
  console.log('[MoviePlex] TMDB pass complete — ' + tmdbFetched + '/' + targetPosts.length + ' official TMDB posters attached!');

  // Secondary Fallback: LuluStream scrape only for posts still missing a poster
  const missing = targetPosts.filter(function(p) { return !p.thumbnail; });
  if (!missing.length) return;

  console.log('[MoviePlex] Fallback pass: scraping LuluStream for ' + missing.length + ' remaining posts...');
  let fallbackFetched = 0;
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
          fallbackFetched++;
        }
      } catch (e) { /* skip */ }
    }));
    await new Promise(function(r) { setTimeout(r, 150); });
  }
  console.log('[MoviePlex] Poster enrichment complete! Total with images: ' + (tmdbFetched + fallbackFetched) + '/' + targetPosts.length);
}

// [REPLACED] MoviePlex catalog builder disabled — DesiCinemas is now the active provider.
// setImmediate(function() {
//   buildMpCatalog()
//     .then(function() { return buildMpThumbnails(300); })
//     .catch(function() {});
//   setInterval(function() {
//     if (Date.now() - mpCache.lastBuilt > MP_TTL) {
//       buildMpCatalog().then(function() { return buildMpThumbnails(300); }).catch(function() {});
//     }
//   }, 60 * 60 * 1000);
// });

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
  // Also check for bfmovies /d/ or /e/ links anywhere in the HTML body (not just iframes)
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

  // If page is a tiny JS redirect (e.g. chuckle-tube -> stevenfamilyedge), follow it
  if (!html.includes('eval(function(p,a,c,k')) {
    const redir = html.match(/window\.location\.href\s*=\s*['"]([^'"]+)['"]/);
    if (redir && redir[1]) {
      console.log('[LuluHLS] Following JS redirect to:', redir[1]);
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

  try { vm.runInContext(packedBlock, ctx, { timeout: 5000 }); } catch (e) { /* ignore missing browser APIs */ }

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
      // Proxy the m3u8 through our server so the browser avoids CORS issues.
      // streamProxyHeaders sends BROWSER_UA without Accept-Language, so tnmr.org returns 200 OK.
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

    // 18+ filtering logic
    const allow18 = catId === 21 || req.query.is18 === 'true';
    if (!allow18) {
      posts = posts.filter(function(p) { return !p.is18Plus; });
    } else if (req.query.is18 === 'true' && !catId) {
      posts = posts.filter(function(p) { return p.is18Plus; });
    }

    // If category filter yields 0 from cache (WP REST API sometimes omits catId from post.categories),
    // fall back to a live WP API query for this specific category
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
      } catch(e2) { /* continue with empty */ }
    }

    if (search) posts = posts.filter(function(p) { return p.title.toLowerCase().includes(search); });
    const total = posts.length;
    const paginated = posts.slice((page - 1) * limit, page * limit);

    // On-the-fly TMDB poster enrichment for any post missing a poster in this page batch
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

app.get('/api/movieplex/post-info', async function(req, res) {
  const slug = req.query.slug;
  if (!slug) return res.status(400).json({ error: 'Missing slug' });
  try {
    const info = await scrapeMoviePlexPost(slug);
    const luluSrc = info.iframes.find(function(s) { return s.includes('bfmovies.online'); });
    const vid = luluSrc ? (luluSrc.split('/e/')[1] || '').split('?')[0].split('/')[0] : null;
    let thumbnail = (vid ? 'https://img.lulucdn.com/' + vid + '_xt.jpg' : null) || info.thumbnail || null;

    // If still no thumbnail, try TMDB by cleaned title
    if (!thumbnail && info.title) {
      const clean = mpCleanTitle(info.title);
      const tmdb = await mpTmdbPoster(clean).catch(function() { return null; });
      if (tmdb && tmdb.poster) thumbnail = tmdb.poster;
    }

    res.json({ thumbnail: thumbnail, title: info.title, iframes: info.iframes });
  } catch (err) { res.status(502).json({ error: err.message }); }
});

app.get('/api/movieplex/catalog/status', function(req, res) {
  res.json({ total: mpCache.posts.length, built: mpCache.lastBuilt > 0, building: mpCache.building, lastRefresh: new Date(mpCache.lastBuilt).toISOString(), categoryCount: Object.keys(mpCache.categoryMap).length });
});

// ============================================================================
// DESICINEMAS INTEGRATION (Primary Movies Provider)
// Source: desicinemas.pk (WordPress Toroflix theme + TMDB images)
// Direct master HLS (.m3u8) extraction from Morencius & Vidmoly
// ============================================================================

const DC_BASE = 'https://desicinemas.pk';
const DC_DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Referer': `${DC_BASE}/`,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9'
};

const DC_CATEGORIES = {
  movies: 'bmovies1',
  trending: 'bmovies1',
  hindi_dubbed: 'hindidubbed',
  hollywood: 'hollywoodmovies',
  desi_cinema: '1desicinema',
  bollywood: '1desicinema',
  series: 'series',
  action: 'all-action-movie',
  comedy: 'com-edyy',
  drama: 'dr-ama',
  romance: 'romance3',
  thriller: 'thriller-moviez',
  horror: 'hor-ror',
  crime: 'all-crime',
  punjabi: 'bmovies1/1punjabi',
  tamil: 'bmovies1/tamil-cinemaa',
  telugu: 'bmovies1/telu-gu',
  bengali: 'bengali',
  gujarati: 'bmovies1/gujarati',
  marathi: 'bmovies1/marathi2',
  malayalam: 'bmovies1/malayalam',
  kannada: 'bmovies1/kannada'
};

function dcParseMovieCard($, el) {
  const $el = $(el);
  const idAttr = $el.attr('id') || '';
  const postId = idAttr.replace('post-', '');
  const linkEl = $el.find('a').first();
  const rawHref = linkEl.attr('href') || '';
  const title = $el.find('.Title').first().text().trim() || linkEl.text().trim();

  let slug = '';
  let type = 'movie';
  if (rawHref.includes('/movies/')) {
    slug = rawHref.split('/movies/')[1].replace(/\/$/, '');
    type = 'movie';
  } else if (rawHref.includes('/series/')) {
    slug = rawHref.split('/series/')[1].replace(/\/$/, '');
    type = 'series';
  } else if (rawHref.includes('/episode/')) {
    slug = rawHref.split('/episode/')[1].replace(/\/$/, '');
    type = 'episode';
  }

  const imgEl = $el.find('img');
  let poster = imgEl.attr('data-src') || imgEl.attr('src') || '';
  if (poster.startsWith('//')) poster = 'https:' + poster;

  const quality = $el.find('.Qlty').first().text().trim() || 'HD';
  const year = $el.find('.Yr').first().text().trim() || $el.find('.Date').first().text().trim();
  const language = $el.find('.Lng').first().text().trim();
  const duration = $el.find('.Time').first().text().trim();
  const rating = $el.find('.post-ratings span').text().trim();

  return {
    id: `dc-${postId || slug}`,
    postId,
    slug,
    dcSlug: slug,
    movieplexSlug: slug, // for backwards compatibility
    title,
    type,
    url: rawHref,
    poster,
    thumbnail: poster,
    coverImage: poster,
    bannerImage: poster,
    quality,
    year,
    releaseDate: year,
    language,
    duration,
    rating,
    source: 'desicinemas'
  };
}

async function dcGetCatalog(categoryKey = 'movies', page = 1) {
  const catPath = DC_CATEGORIES[categoryKey] || categoryKey || 'bmovies1';
  const pageUrl = page > 1
    ? `${DC_BASE}/${catPath}/page/${page}/`
    : `${DC_BASE}/${catPath}/`;

  const res = await axios.get(pageUrl, { headers: DC_DEFAULT_HEADERS, timeout: 12000 });
  const $ = cheerio.load(res.data);
  const items = [];

  $('.MovieList > li').each((_, el) => {
    const item = dcParseMovieCard($, el);
    if (item.slug) items.push(item);
  });

  const hasNextPage = $('.wp-pagenavi .nextpostslink, .nav-links .next').length > 0;

  return {
    category: categoryKey,
    page,
    hasNextPage,
    total: items.length,
    totalPages: hasNextPage ? page + 1 : page,
    movies: items,
    results: items
  };
}

async function dcSearch(query, page = 1) {
  const pageUrl = page > 1
    ? `${DC_BASE}/page/${page}/?s=${encodeURIComponent(query)}`
    : `${DC_BASE}/?s=${encodeURIComponent(query)}`;

  const res = await axios.get(pageUrl, { headers: DC_DEFAULT_HEADERS, timeout: 12000 });
  const $ = cheerio.load(res.data);
  const items = [];

  $('.MovieList > li').each((_, el) => {
    const item = dcParseMovieCard($, el);
    if (item.slug) items.push(item);
  });

  return {
    query,
    page,
    total: items.length,
    totalPages: 1,
    movies: items,
    results: items
  };
}

async function dcGetMovieDetail(slug) {
  const movieUrl = `${DC_BASE}/movies/${slug}/`;
  const res = await axios.get(movieUrl, { headers: DC_DEFAULT_HEADERS, timeout: 12000 });
  const $ = cheerio.load(res.data);

  const title = $('article.TPost h1, h1').first().text().trim();
  const description = $('article.TPost .Description p, .Description p').first().text().trim();

  let backdrop = $('img.TPostBg, .TPostBg').first().attr('data-src') || $('img.TPostBg, .TPostBg').first().attr('src') || '';
  if (backdrop.startsWith('//')) backdrop = 'https:' + backdrop;

  const year = $('article.TPost .Date, .Date').first().text().trim();
  const duration = $('article.TPost .Time, .Time').first().text().trim();
  const quality = $('article.TPost .Qlty, .Qlty').first().text().trim();
  const rating = $('.post-ratings span').first().text().trim();

  const genres = [];
  $('.Description .Genre a').each((_, a) => genres.push($(a).text().trim()));

  const options = [];
  $('.ListOptions li').each((_, optEl) => {
    const $opt = $(optEl);
    options.push({
      key: $opt.attr('data-key') || '0',
      id: $opt.attr('data-id') || '',
      typ: $opt.attr('data-typ') || 'movie',
      server: $opt.find('.AAIco-dns').text().trim() || 'Server',
      quality: $opt.find('.AAIco-equalizer').text().trim() || 'HD',
      lang: $opt.find('.AAIco-language').text().trim() || ''
    });
  });

  return {
    id: `dc-${slug}`,
    slug,
    dcSlug: slug,
    title,
    description,
    thumbnail: backdrop,
    banner: backdrop,
    backdrop,
    coverImage: backdrop,
    bannerImage: backdrop,
    year,
    duration,
    quality,
    rating,
    genres,
    options,
    type: 'movie',
    source: 'desicinemas'
  };
}

async function dcExtractMorenciusStream(embedUrl) {
  try {
    const res = await axios.get(embedUrl, {
      headers: {
        'User-Agent': DC_DEFAULT_HEADERS['User-Agent'],
        'Referer': `${DC_BASE}/`
      },
      proxy: embedProxyConfig(),
      timeout: 10000
    });

    const html = res.data;
    const evalMatch = html.match(/eval\s*\(\s*function\s*\(\s*p\s*,\s*a\s*,\s*c\s*,\s*k\s*,\s*e\s*,\s*d\s*\)[\s\S]*?\.split\('\|'\)\)\s*\)/i);
    if (!evalMatch) return null;

    // Unpack once and reuse it for BOTH the jwplayer sources AND the genuine
    // `links.hls2` master (which is a packed-string token until unpacked). We
    // unpack in the same sandboxed DOM/window mock the jwplayer run uses, so the
    // packed code can execute (it touches window/document/jQuery at load).
    const mockEl = () => ({
      style: {},
      setAttribute: () => {},
      getAttribute: () => '',
      appendChild: () => {},
      removeChild: () => {},
      parentNode: { removeChild: () => {} },
      classList: { add: () => {}, remove: () => {} }
    });
    const mock$ = () => ({
      insertAfter: () => {}, detach: () => {}, remove: () => {},
      hide: () => {}, show: () => {}, on: () => {}, ready: () => {},
      addClass: () => {}, removeClass: () => {}, toggleClass: () => {},
      attr: () => '', html: () => '', text: () => ''
    });
    mock$.ajaxSetup = () => {}; mock$.cookie = () => {}; mock$.post = () => {}; mock$.get = () => {};

    let unpacked = '';
    const _mockEl = () => ({
      style: {}, setAttribute: () => {}, getAttribute: () => '',
      appendChild: () => {}, removeChild: () => {},
      parentNode: { removeChild: () => {} }, classList: { add: () => {}, remove: () => {} }
    });
    const _mock$ = () => ({
      insertAfter: () => {}, detach: () => {}, remove: () => {}, hide: () => {}, show: () => {},
      on: () => {}, ready: () => {}, addClass: () => {}, removeClass: () => {}, toggleClass: () => {},
      attr: () => '', html: () => '', text: () => ''
    });
    _mock$.ajaxSetup = () => {}; _mock$.cookie = () => {}; _mock$.post = () => {}; _mock$.get = () => {};
    const _sb = {
      window: { location: { protocol: 'https:', host: 'morencius.com', href: embedUrl } },
      document: { getElementById: _mockEl, createElement: _mockEl, querySelector: _mockEl, body: { appendChild: () => {} } },
      $: _mock$, jQuery: _mock$,
      localStorage: { getItem: () => null, setItem: () => {} },
      console: { log: () => {} }
    };
    try {
      const ctx = vm.createContext(_sb);
      unpacked = String(vm.runInContext(evalMatch[0].replace('eval(', '('), ctx) || '');
    } catch (e) { unpacked = ''; }

    let capturedSources = [];
    const sandbox = {
      window: { location: { protocol: 'https:', host: 'morencius.com', href: embedUrl } },
      document: { getElementById: mockEl, createElement: mockEl, querySelector: mockEl, body: { appendChild: () => {} } },
      $: mock$,
      jQuery: mock$,
      localStorage: { getItem: () => null, setItem: () => {} },
      jwplayer: () => ({
        setup: (cfg) => {
          capturedSources = cfg.sources || [];
          return { on: () => {}, addButton: () => {}, getAudioTracks: () => [], getPosition: () => 0, seek: () => {}, play: () => {}, pause: () => {}, stop: () => {}, load: () => {}, once: () => {} };
        },
        key: '', on: () => {}, addButton: () => {}
      }),
      console: { log: () => {} }
    };

    vm.createContext(sandbox);
    vm.runInContext(evalMatch[0], sandbox);

    // Capture the GENUINE HLS master. Morencius embeds the real playable master
    // inside a `links` object: var links={"hls2":"https://<host>.acek-cdn.com/.../master.m3u8?..."}.
    // Its jwplayer().setup() sources, by contrast, point at the `morencius.com/stream/...`
    // decoy master (segments are tiktokcdn ad images -> infinite spinner). Prefer
    // the acek-cdn `links` master; only fall back to the jwplayer source if absent.
    const linksMatch = unpacked.match(/["']hls2["']\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i);
    const realMaster = linksMatch ? linksMatch[1] : null;
    if (realMaster) return realMaster;

    if (capturedSources.length > 0 && capturedSources[0].file) {
      // Prefer the REAL HLS master over the ad-decoy. Morencius' jwplayer.setup()
      // lists sources in an order that is NOT reliably "best first": the first
      // source is frequently the `morencius.com/stream/...` decoy master (its
      // "segments" are tiktokcdn ad images → infinite spinner), while a later
      // source points at `*.acek-cdn.com/.../master.m3u8`, which is the genuine
      // playable video. So scan for the acek-cdn master first; fall back to the
      // first .m3u8 only if no acek-cdn source exists.
      const files = capturedSources.map(s => s.file).filter(Boolean);
      let file = files.find(f => /acek-cdn\.com/i.test(f))
        || files.find(f => /\.m3u8/i.test(f))
        || files[0];
      if (file.startsWith('/')) file = 'https://morencius.com' + file;
      return file;
    }
    return null;
  } catch (e) {
    console.error('[EXTRACTOR] Morencius unpack error:', e.message);
    return null;
  }
}

async function dcExtractVidmolyStream(embedUrl) {
  try {
    const res = await axios.get(embedUrl, {
      headers: {
        'User-Agent': DC_DEFAULT_HEADERS['User-Agent'],
        'Referer': `${DC_BASE}/`
      },
      timeout: 10000
    });

    const html = res.data;
    const fileMatch = html.match(/file\s*:\s*['"](https?:\/\/[^'"]+\.m3u8[^'"]*)['"]/i) ||
                      html.match(/sources\s*:\s*\[\s*\{\s*file\s*:\s*['"](https?:\/\/[^'"]+)['"]/i);

    if (fileMatch) {
      return fileMatch[1];
    }
    return null;
  } catch (e) {
    console.error('[EXTRACTOR] Vidmoly extraction error:', e.message);
    return null;
  }
}

// ── Series/episode support ────────────────────────────────────────────────────
// DesiCinemas serves 3 different page types and the embed router needs the right
// trtype: movies at /movies/{slug}/ (trtype=1) and episodes at /episode/{slug}/
// (trtype=2). A series slug (/series/{slug}/) has NO .ListOptions of its own —
// you must walk series → /seasen/{season}/ → /episode/{ep}/ to reach a player.
async function dcFetchPage(url) {
  const res = await axios.get(url, { headers: DC_DEFAULT_HEADERS, timeout: 12000 });
  const finalUrl = res.request?.res?.responseUrl || res.request?.responseURL || url;
  return { res, finalUrl, $: cheerio.load(res.data) };
}

function dcSlugOf(url) {
  const m = String(url || '').match(/\/(?:movies|series|episode|seasen)\/([^/?#]+)/);
  return m ? m[1] : null;
}

function dcReadOptions($) {
  const opts = [];
  $('.ListOptions li').each((_, el) => {
    const $o = $(el);
    const id = $o.attr('data-id');
    if (id) {
      opts.push({
        key: $o.attr('data-key') || '0',
        id,
        typ: $o.attr('data-typ') || 'movie',
        server: $o.find('.AAIco-dns').text().trim() || 'Server',
      });
    }
  });
  return opts;
}

/** Series → seasons → episodes. Returns { title, thumbnail, episodes:[{slug,url,number}] } */
async function dcGetSeriesInfo(slug) {
  const { $, finalUrl } = await dcFetchPage(`${DC_BASE}/series/${slug}/`);
  if (dcSlugOf(finalUrl) !== slug) {
    const err = new Error(`No DesiCinemas series for slug "${slug}"`);
    err.code = 'DC_CATCHALL_REDIRECT';
    err.finalSlug = dcSlugOf(finalUrl);
    throw err;
  }

  const title = $('article.TPost h1, h1').first().text().trim();
  let thumbnail = $('img.TPostBg, .TPostBg').first().attr('data-src') || $('img.TPostBg, .TPostBg').first().attr('src') || '';
  if (thumbnail.startsWith('//')) thumbnail = 'https:' + thumbnail;

  // Episodes may be linked straight from the series page, otherwise via season pages.
  const epUrls = [];
  const pushEp = (u) => { if (u && u.includes('/episode/') && !epUrls.includes(u)) epUrls.push(u); };
  $('a[href*="/episode/"]').each((_, a) => pushEp($(a).attr('href')));

  const seasonUrls = [];
  $('a[href*="/seasen/"]').each((_, a) => {
    const h = $(a).attr('href');
    if (h && !seasonUrls.includes(h)) seasonUrls.push(h);
  });

  for (const seasonUrl of seasonUrls.slice(0, 6)) {
    try {
      const s = await dcFetchPage(seasonUrl);
      s.$('a[href*="/episode/"]').each((_, a) => pushEp(s.$(a).attr('href')));
    } catch (e) { /* skip unreachable season */ }
  }

  const episodes = epUrls.map((url, i) => {
    const epSlug = dcSlugOf(url);
    const numMatch = String(epSlug || '').match(/episode-(\d+)/i);
    return { slug: epSlug, url, number: numMatch ? parseInt(numMatch[1]) : i + 1 };
  }).filter(e => e.slug);
  episodes.sort((a, b) => a.number - b.number);

  return { slug, title, thumbnail, type: 'series', seasons: seasonUrls, episodes, source: 'desicinemas' };
}

/**
 * Resolve a slug to a playable page: {options, type, title, thumbnail, pageSlug}.
 * Tries /movies (trtype 1), then /episode (trtype 2), then /series → first episode.
 */
async function dcResolvePlayablePage(slug, { episode = null, preferType = null } = {}) {
  const attempts = preferType === 'series'
    ? ['series', 'movies', 'episode']
    : ['movies', 'episode', 'series'];
  let lastCatchAll = null;

  for (const kind of attempts) {
    try {
      if (kind === 'series') {
        const info = await dcGetSeriesInfo(slug);
        if (!info.episodes.length) continue;
        const wanted = episode
          ? (info.episodes.find(e => String(e.number) === String(episode)) || info.episodes[0])
          : info.episodes[0];
        const ep = await dcFetchPage(wanted.url);
        const opts = dcReadOptions(ep.$);
        if (!opts.length) continue;
        return {
          options: opts, trtype: '2', title: info.title, thumbnail: info.thumbnail,
          pageSlug: wanted.slug, kind: 'episode', seriesSlug: slug,
          episodeNumber: wanted.number, episodeCount: info.episodes.length,
        };
      }

      const url = kind === 'movies' ? `${DC_BASE}/movies/${slug}/` : `${DC_BASE}/episode/${slug}/`;
      const { $, finalUrl } = await dcFetchPage(url);
      if (dcSlugOf(finalUrl) !== slug) { lastCatchAll = dcSlugOf(finalUrl); continue; }
      const opts = dcReadOptions($);
      if (!opts.length) continue;
      const title = $('article.TPost h1, h1').first().text().trim();
      let thumbnail = $('img.TPostBg, .TPostBg').first().attr('data-src') || $('img.TPostBg, .TPostBg').first().attr('src') || '';
      if (thumbnail.startsWith('//')) thumbnail = 'https:' + thumbnail;
      // data-typ tells us which router type the page expects.
      const isEpisode = kind === 'episode' || opts.some(o => /episode/i.test(o.typ));
      return { options: opts, trtype: isEpisode ? '2' : '1', title, thumbnail, pageSlug: slug, kind };
    } catch (e) {
      if (e.code === 'DC_CATCHALL_REDIRECT') lastCatchAll = e.finalSlug;
    }
  }

  const err = new Error(
    lastCatchAll
      ? `DesiCinemas has no matching title for slug "${slug}" (redirected to catch-all "${lastCatchAll}")`
      : `No playable DesiCinemas page found for slug "${slug}"`
  );
  err.code = lastCatchAll ? 'DC_CATCHALL_REDIRECT' : 'DC_NO_PAGE';
  err.finalSlug = lastCatchAll;
  throw err;
}

// ── Decoy / ad-playlist detection ────────────────────────────────────────────
// Some Morencius `/stream/...` masters return a child playlist whose "segments"
// are ad IMAGES on tiktokcdn (…~tplv-…image). They download fine (HTTP 200) but
// contain no video, so hls.js buffers forever => the UI spins on "infinite
// loading". Detect and reject those so we fall back to a working iframe instead.
const DC_AD_SEGMENT_HOSTS = /(tiktokcdn\.com|ad-site-sign|byteoversea|pstatp\.com|doubleclick|googlesyndication)/i;

async function dcValidateHlsStream(masterUrl, referer) {
  try {
    const master = await axios.get(masterUrl, {
      headers: { 'User-Agent': DC_DEFAULT_HEADERS['User-Agent'], Referer: referer },
      responseType: 'text', timeout: 12000,
    });
    const masterBody = String(master.data || '');
    if (!masterBody.trim().startsWith('#EXTM3U')) return { ok: false, reason: 'master-not-hls' };

    const firstChild = masterBody.split('\n').map(l => l.trim())
      .find(l => l && !l.startsWith('#'));
    if (!firstChild) return { ok: true, reason: 'no-variant-assume-media-playlist' };

    const childUrl = new URL(firstChild, masterUrl).toString();
    const childRef = new URL(masterUrl).origin + '/';
    const child = await axios.get(childUrl, {
      headers: { 'User-Agent': DC_DEFAULT_HEADERS['User-Agent'], Referer: childRef },
      responseType: 'text', timeout: 12000,
    });
    const childBody = String(child.data || '');
    const segs = childBody.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    if (!segs.length) return { ok: false, reason: 'no-segments' };

    const adSegs = segs.filter(s => DC_AD_SEGMENT_HOSTS.test(s)).length;
    if (adSegs / segs.length > 0.5) return { ok: false, reason: `ad-decoy-playlist (${adSegs}/${segs.length})` };

    // Sniff the first segment's real content type — images mean a decoy.
    const segUrl = new URL(segs[0], childUrl).toString();
    try {
      const probe = await axios.get(segUrl, {
        headers: { 'User-Agent': DC_DEFAULT_HEADERS['User-Agent'], Referer: childRef, Range: 'bytes=0-1023' },
        responseType: 'arraybuffer', timeout: 12000, validateStatus: () => true,
      });
      const ct = String(probe.headers['content-type'] || '');
      if (probe.status >= 400) return { ok: false, reason: `segment-http-${probe.status}` };
      if (/^image\//i.test(ct)) return { ok: false, reason: `segment-is-image (${ct})` };
    } catch (e) {
      return { ok: false, reason: 'segment-unreachable' };
    }
    return { ok: true, reason: 'validated' };
  } catch (e) {
    return { ok: false, reason: 'validate-error: ' + e.message };
  }
}

async function dcResolveStream({ postId, optionKey = '0', type = '1', slug = null, episode = null, preferType = null }) {
  let targetId = postId;
  let targetType = type;
  let detailInfo = null;
  let pageOptions = [];
  let seriesMeta = null;

  if (!targetId && slug) {
    const page = await dcResolvePlayablePage(slug, { episode, preferType });
    pageOptions = page.options;
    targetType = page.trtype;
    targetId = pageOptions[0]?.id;
    detailInfo = { title: page.title, thumbnail: page.thumbnail };
    if (page.kind === 'episode' && page.seriesSlug) {
      seriesMeta = {
        seriesSlug: page.seriesSlug,
        episodeSlug: page.pageSlug,
        episodeNumber: page.episodeNumber,
        episodeCount: page.episodeCount,
      };
    }
  }

  if (!targetId) {
    throw new Error('Unable to resolve post ID for stream');
  }

  // Candidate (key,id) pairs to try. Prefer the options discovered on the page;
  // otherwise fall back to the single (optionKey,targetId) pair passed in.
  const candidates = pageOptions.length
    ? pageOptions.map(o => ({ key: o.key, id: o.id }))
    : [{ key: optionKey, id: targetId }];

  let streamUrl = null;
  let host = 'iframe';
  let chosenIframe = '';
  let firstIframe = '';
  const rejected = [];

  for (const cand of candidates) {
    let iframeSrc = '';
    try {
      const routerUrl = `${DC_BASE}/?trembed=${cand.key}&trid=${cand.id}&trtype=${targetType}`;
      const embedRes = await axios.get(routerUrl, { headers: DC_DEFAULT_HEADERS, proxy: embedProxyConfig(), timeout: 12000 });
      const $emb = cheerio.load(embedRes.data);
      iframeSrc = $emb('iframe').attr('src') || $emb('IFRAME').attr('SRC') || '';
    } catch (e) { continue; }
    if (!iframeSrc) continue;
    if (!firstIframe) firstIframe = iframeSrc;

    let candidateUrl = null;
    let candidateHost = null;
    if (iframeSrc.includes('morencius.com')) {
      candidateUrl = await dcExtractMorenciusStream(iframeSrc);
      candidateHost = 'morencius';
    } else if (iframeSrc.includes('vidmoly.org') || iframeSrc.includes('vidmoly.me')) {
      candidateUrl = await dcExtractVidmolyStream(iframeSrc);
      candidateHost = 'vidmoly';
    }

    if (candidateUrl) {
      // Reject ad-decoy playlists so the player never spins forever.
      const referer = candidateHost === 'vidmoly' ? 'https://vidmoly.org/' : 'https://morencius.com/';
      const check = await dcValidateHlsStream(candidateUrl, referer);
      if (check.ok) {
        streamUrl = candidateUrl; host = candidateHost; chosenIframe = iframeSrc;
        break;
      }
      rejected.push({ host: candidateHost, reason: check.reason });
      console.warn(`[DC Stream] rejected ${candidateHost} stream for ${slug || targetId}: ${check.reason}`);
    }
    // Non-extractable host (vidsrc, movieshub, ok.ru, …): keep as iframe fallback
    // but keep trying other options for a directly-playable one.
  }

  const iframeUrl = chosenIframe || firstIframe;
  if (!iframeUrl && !streamUrl) {
    throw new Error('No iframe found in embed response');
  }

  return {
    targetId,
    optionKey,
    type: targetType,
    embedRouterUrl: `${DC_BASE}/?trembed=${optionKey}&trid=${targetId}&trtype=${targetType}`,
    iframeUrl,
    fallbackIframe: iframeUrl,
    streamUrl: streamUrl || null,
    isHls: !!streamUrl,
    directHls: !!streamUrl,
    source: 'desicinemas',
    host,
    title: detailInfo?.title || '',
    thumbnail: detailInfo?.thumbnail || '',
    ...(seriesMeta || {}),
    ...(rejected.length ? { rejectedStreams: rejected } : {}),
  };
}

// DesiCinemas API Routes
app.get('/api/desicinemas/catalog', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1'));
    const category = req.query.category || 'movies';
    const search = (req.query.search || '').trim();

    if (search) {
      const results = await dcSearch(search, page);
      return res.json(results);
    }

    const catalog = await dcGetCatalog(category, page);
    return res.json(catalog);
  } catch (err) {
    console.error('[DC Catalog] Error:', err.message);
    return res.status(500).json({ error: 'Catalog fetch failed', message: err.message, movies: [] });
  }
});

app.get('/api/desicinemas/stream', async (req, res) => {
  const slug = req.query.slug;
  const postId = req.query.postId;
  const option = req.query.option || req.query.optionKey || '0';
  const type = req.query.type || '1';
  const title = req.query.title;
  const episode = req.query.episode || req.query.ep || null;
  const preferType = req.query.contentType === 'series' ? 'series' : null;

  // Wrap a raw extracted HLS URL through our own m3u8-proxy so the browser can
  // play it: the CDN URLs are token/referer/IP-bound and CORS-locked, so a raw
  // URL handed straight to the browser's player fails. Referer must match the
  // extractor host (Morencius/Vidmoly) for the CDN to serve the manifest.
  const proxifyStream = (result) => {
    if (result && result.streamUrl && /^https?:\/\//i.test(result.streamUrl)) {
      const refererHost =
        result.host === 'vidmoly' ? 'https://vidmoly.org/' : 'https://morencius.com/';
      const proxied = `${publicHost(req)}/api/m3u8-proxy?url=${encodeURIComponent(result.streamUrl)}&referer=${encodeURIComponent(refererHost)}`;
      return { ...result, rawStreamUrl: result.streamUrl, streamUrl: proxied };
    }
    return result;
  };

  if (!slug && !postId && !title) return res.status(400).json({ error: 'Missing slug, postId or title' });
  try {
    const result = await dcResolveStream({ slug, postId, optionKey: option, type, episode, preferType });
    return res.json(proxifyStream(result));
  } catch (err) {
    // If the slug didn't match a real DesiCinemas title (catch-all redirect) or
    // failed, try to recover by searching DesiCinemas by title and retrying with
    // the first real slug we find. This is what makes clicking an arbitrary
    // (e.g. TMDB-sourced) title actually resolve its own stream.
    const searchTitle = title || slug;
    if (searchTitle) {
      try {
        const cleaned = String(searchTitle).replace(/-/g, ' ').replace(/\b(19|20)\d{2}\b/g, '').trim();
        const found = await dcSearch(cleaned, 1);
        const candidates = (found.movies || []).filter(m => m.slug && m.slug !== err.finalSlug && m.slug !== slug);
        // Try up to 3 search hits — the first may itself be unplayable.
        for (const cand of candidates.slice(0, 3)) {
          try {
            const recovered = await dcResolveStream({
              slug: cand.slug,
              optionKey: '0',
              type: cand.type === 'series' || cand.type === 'episode' ? '2' : '1',
              episode,
              preferType: cand.type === 'series' ? 'series' : null,
            });
            return res.json({ ...proxifyStream(recovered), recoveredVia: 'title-search', requestedSlug: slug || null });
          } catch (e3) { /* try next candidate */ }
        }
      } catch (e2) {
        console.warn('[DC Stream] Title-search recovery failed:', e2.message);
      }
    }
    console.error(`[DC Stream] Failed for ${slug || postId || title}:`, err.message);
    return res.status(502).json({ error: 'Stream resolution failed', message: err.message, code: err.code || null });
  }
});

// Series info: seasons + full episode list (for a series slug)
app.get('/api/desicinemas/series/:slug', async (req, res) => {
  try {
    const info = await dcGetSeriesInfo(req.params.slug);
    return res.json(info);
  } catch (err) {
    console.error(`[DC Series] Failed for ${req.params.slug}:`, err.message);
    return res.status(502).json({ error: 'Series lookup failed', message: err.message, code: err.code || null });
  }
});

app.get('/api/desicinemas/post-info', async (req, res) => {
  const slug = req.query.slug;
  if (!slug) return res.status(400).json({ error: 'Missing slug' });
  try {
    const detail = await dcGetMovieDetail(slug);
    return res.json({
      thumbnail: detail.thumbnail || detail.backdrop,
      title: detail.title,
      description: detail.description,
      quality: detail.quality,
      year: detail.year,
      options: detail.options
    });
  } catch (err) {
    console.error(`[DC Post-Info] Failed for ${slug}:`, err.message);
    return res.status(502).json({ error: err.message });
  }
});

// Backwards-compatible /api/movieplex aliases (pointing directly to DesiCinemas)
app.get('/api/movieplex/catalog', async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page || '1'));
  const category = req.query.category || 'movies';
  const search = (req.query.search || '').trim();
  try {
    if (search) {
      const r = await dcSearch(search, page);
      return res.json(r);
    }
    const r = await dcGetCatalog(category, page);
    return res.json(r);
  } catch (err) {
    return res.status(500).json({ error: 'Catalog fetch failed', movies: [] });
  }
});

app.get('/api/movieplex/stream', async (req, res) => {
  const slug = req.query.slug;
  if (!slug) return res.status(400).json({ error: 'Missing slug' });
  try {
    const r = await dcResolveStream({ slug, optionKey: '0', type: '1' });
    return res.json(r);
  } catch (err) {
    return res.status(502).json({ error: 'Stream resolution failed', message: err.message });
  }
});

app.get('/api/movieplex/post-info', async (req, res) => {
  const slug = req.query.slug;
  if (!slug) return res.status(400).json({ error: 'Missing slug' });
  try {
    const d = await dcGetMovieDetail(slug);
    return res.json({ thumbnail: d.thumbnail, title: d.title });
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
});

// Primary Movies Home Endpoint powered by DesiCinemas
const dcMoviesHomeCache = { data: null, builtAt: 0 };
app.get('/api/movies/home', async (req, res) => {
  if (dcMoviesHomeCache.data && Date.now() - dcMoviesHomeCache.builtAt < 15 * 60 * 1000) {
    return res.json(dcMoviesHomeCache.data);
  }
  try {
    const [trendingRes, seriesRes, hindiDubRes, bollywoodRes, hollywoodRes, actionRes, thrillerRes, romanceRes] = await Promise.allSettled([
      dcGetCatalog('movies', 1),
      dcGetCatalog('series', 1),
      dcGetCatalog('hindi_dubbed', 1),
      dcGetCatalog('desi_cinema', 1),
      dcGetCatalog('hollywood', 1),
      dcGetCatalog('action', 1),
      dcGetCatalog('thriller', 1),
      dcGetCatalog('romance', 1)
    ]);

    const trending = trendingRes.status === 'fulfilled' ? trendingRes.value.movies : [];
    const webSeries = seriesRes.status === 'fulfilled' ? seriesRes.value.movies : [];
    const hindiDubbed = hindiDubRes.status === 'fulfilled' ? hindiDubRes.value.movies : [];
    const bollywood = bollywoodRes.status === 'fulfilled' ? bollywoodRes.value.movies : [];
    const hollywood = hollywoodRes.status === 'fulfilled' ? hollywoodRes.value.movies : [];
    const action = actionRes.status === 'fulfilled' ? actionRes.value.movies : [];
    const thriller = thrillerRes.status === 'fulfilled' ? thrillerRes.value.movies : [];
    const romance = romanceRes.status === 'fulfilled' ? romanceRes.value.movies : [];

    const featured = trending[0] || hindiDubbed[0] || bollywood[0] || null;

    const data = {
      featured,
      bollywood,
      popular: trending,
      trending,
      hollywood,
      action,
      classics: [],
      topRated: [],
      netmirror: { trending: [], netflix: [], prime: [], hotstar: [] },
      movieplex: {
        trending,
        hot: [],
        webSeries,
        hindiDubbed,
        bollywood,
        hollywood,
        action,
        shortFilm: [],
        thriller,
        romance
      },
      desicinemas: {
        trending,
        webSeries,
        hindiDubbed,
        bollywood,
        hollywood,
        action,
        thriller,
        romance
      }
    };

    dcMoviesHomeCache.data = data;
    dcMoviesHomeCache.builtAt = Date.now();
    return res.json(data);
  } catch (err) {
    console.error('[DC Movies Home] Error:', err.message);
    return res.status(502).json({ error: 'Movies home failed', message: err.message });
  }
});

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`\nÃ°Å¸Å¡â‚¬ EetNet backend running on http://localhost:${PORT}`);
    console.log(`   PRIMARY:  AnimeKai (HTTP scraper Ã¢â‚¬â€ English subs) Ã¢Å¡Â¡`);
    console.log(`   FALLBACK: AnimeUnity (Consumet Ã¢â‚¬â€ Italian subs)`);
    console.log(`   DRAMA:    KissKH via enc-dec.app (English subs) Ã°Å¸Å½Â¬`);
    console.log(`   Endpoints:`);
    console.log(`     GET /api/info/:anilistId                     Ã¢â‚¬â€ anime details + episode list`);
    console.log(`     GET /api/gogoanime/watch?title=X&episode=N   Ã¢â‚¬â€ AnimeKai English sub stream Ã¢Å¡Â¡`);
    console.log(`     GET /api/watch/:episodeId                    Ã¢â‚¬â€ AnimeUnity fallback stream`);
    console.log(`     GET /api/search?q=<query>                    Ã¢â‚¬â€ AnimeKai search`);
    console.log(`     GET /api/drama/list?type=1&page=1            Ã¢â‚¬â€ KissKH drama catalog Ã°Å¸Å½Â¬`);
    console.log(`     GET /api/drama/search?q=<query>              Ã¢â‚¬â€ KissKH drama search`);
    console.log(`     GET /api/drama/info/:dramaId                 Ã¢â‚¬â€ episode list for a drama`);
    console.log(`     GET /api/drama/stream/:episodeId             Ã¢â‚¬â€ stream URL + subtitles`);
    console.log(`     GET /api/drama/subtitle?url=<url>            Ã¢â‚¬â€ decode KissKH subtitle`);
    console.log(`     GET /api/m3u8-proxy?url=<url>                Ã¢â‚¬â€ HLS manifest proxy`);
    console.log(`     GET /api/ts-proxy?url=<url>                  Ã¢â‚¬â€ HLS segment proxy\n`);
  });
}

export default app;
