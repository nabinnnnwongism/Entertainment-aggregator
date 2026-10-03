import express from 'express';
import cors from 'cors';
import axios from 'axios';
import https from 'https';

const app = express();
app.set('trust proxy', true);
const PORT = process.env.PORT || 8081;
const startedAt = new Date();

const KISSKH_BASE = process.env.KISSKH_BASE || 'https://kisskh.co';
const ENCDEC_BASE = process.env.ENCDEC_BASE || 'https://enc-dec.app';
const BROWSER_UA  = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());

// Normalizer: ensure /drama/... maps to /api/drama/...
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
// CACHES & TTLs
// ─────────────────────────────────────────────────────
const DRAMA_LIST_TTL  = 30 * 60 * 1000; // 30 min
const STREAM_TTL      =  2 * 60 * 60 * 1000; // 2 hours

const dramaHomeCache   = new Map();
const dramaListCache   = new Map();
const dramaInfoCache   = new Map();
const dramaStreamCache = new Map();

async function kissKhGet(url) {
  const res = await axios.get(url, {
    headers: {
      'User-Agent': BROWSER_UA,
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    timeout: 15000,
  });
  return res;
}

async function kissKhFetch(url) {
  const res = await kissKhGet(url);
  return res.data;
}

// ─────────────────────────────────────────────────────
// DRAMA ROUTES
// ─────────────────────────────────────────────────────

// GET /api/health
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'eetnet-drama-api',
    uptime: Math.floor((Date.now() - startedAt.getTime()) / 1000),
    port: PORT,
  });
});

// GET /api/drama/home
app.get('/api/drama/home', async (req, res) => {
  console.log('[DRAMA HOME] Fetching home catalog...');
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
  res.setHeader('Access-Control-Allow-Origin', '*');
  let { episodeId } = req.params;
  const { title, episode } = req.query;
  const host = publicHost(req);

  // If episodeId is not a numeric KissKH ID, try resolving via title search
  if (!/^\d+$/.test(String(episodeId)) && (title || episodeId.includes('-'))) {
    const searchTitle = title || episodeId.replace(/-ep-\d+.*$/i, '').replace(/-\d+.*$/, '');
    const targetEpNum = parseInt(episode) || parseInt((episodeId.match(/ep-(\d+)/i) || [])[1]) || 1;
    try {
      const searchData = await kissKhFetch(`${KISSKH_BASE}/api/DramaList/Search?q=${encodeURIComponent(searchTitle)}&type=0`);
      const results = searchData?.data || (Array.isArray(searchData) ? searchData : []);
      if (results.length > 0) {
        const dramaDetail = await kissKhFetch(`${KISSKH_BASE}/api/DramaList/Drama/${results[0].id}?isq=false`);
        const epList = dramaDetail?.episodes || [];
        const found = epList.find(e => Number(e.number) === targetEpNum) || epList[0];
        if (found && found.id) {
          episodeId = String(found.id);
        }
      }
    } catch (resolveErr) {
      console.warn('[DRAMA STREAM] Title resolution warning:', resolveErr.message);
    }
  }

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

// ─────────────────────────────────────────────────────
// HLS M3U8 & TS PROXY
// ─────────────────────────────────────────────────────
app.get('/api/m3u8-proxy', async (req, res) => {
  const { url, referer } = req.query;
  if (!url) return res.status(400).send('Missing url');

  try {
    const decodedUrl  = decodeURIComponent(url);
    const decodedRef  = referer ? decodeURIComponent(referer) : (new URL(decodedUrl).origin + '/');

    const { data } = await axios.get(decodedUrl, {
      responseType: 'text',
      headers: streamProxyHeaders(decodedUrl, decodedRef),
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

// START SERVER
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[EETNET-DRAMA-API] Service listening on port ${PORT}`);
  console.log(`Endpoints available:`);
  console.log(` - GET  /api/health`);
  console.log(` - GET  /api/drama/home`);
  console.log(` - GET  /api/drama/list?type=0&q=`);
  console.log(` - GET  /api/drama/search?q=query`);
  console.log(` - GET  /api/drama/info/:dramaId`);
  console.log(` - GET  /api/drama/stream/:episodeId`);
  console.log(` - GET  /api/drama/subtitle?url=`);
});
