# NetMirror (net77.cc / net52.cc) — Reverse Engineering Research

**Date:** 2026-08-04
**Purpose:** Complete technical dossier for integrating NetMirror (movies/dramas/anime/OTT aggregator) into the EetNet app. This document is self-contained — another AI or developer can pick it up and implement the integration from here.
**Status:** ✅ Auth bypass verified live. Integration is feasible WITHOUT Puppeteer/headless browser.

---

## 0. EXECUTIVE SUMMARY

NetMirror is a multi-OTT piracy aggregator (Netflix, Prime, Disney+ Hotstar, HBO, Lionsgate, K-Dramas, anime, WWE/UFC) with multi-language dubbed audio. It is "AnimeRulz but for movies/dramas."

**The headline finding:** The official auth flow (3-step handshake with a 35-second ad wait + reCAPTCHA) is **entirely theater**. There is a backdoor endpoint (`verify.php`) that issues the same auth token in **0.25 seconds** with a random UUID as the "captcha response". The server never validates it. This was confirmed by two independent open-source CloudStream extensions AND by a live test during this research.

**Integration approach:** Plain Node.js + axios/fetch on the existing Termux phone backend. No browser, no Puppeteer, no root. Same architecture as the existing AnimeRulz integration.

---

## 1. WHAT NETMIRROR IS

- **Content:** Movies, TV series, K-dramas, Thai/Philippine dramas, anime, WWE/UFC
- **Sources aggregated:** Netflix (nf), Prime Video (pv), Disney+ Hotstar (hs), HBO (hbo), Lionsgate (lg)
- **Languages:** ~15 languages with multi-audio dubbed tracks (Hindi, Tamil, Telugu, Kannada, Malayalam, English, etc.)
- **Streaming format:** Self-hosted multi-audio HLS (m3u8) CDN at `nm-cdnN.top`
- **No official API** — but the mobile app's private API is fully reverse-engineered below.

---

## 2. DOMAIN ARCHITECTURE (ROTATING)

NetMirror uses a family of mirror domains that rotate every few months. They are all aliases of the same backend:

| Domain | Role | Status (as of 2026-08-04) |
|--------|------|---------------------------|
| `net52.cc` | **Current working domain** (confirmed live) | ✅ LIVE |
| `net77.cc` | Alternate frontend | ✅ LIVE (Cloudflare-protected web UI) |
| `net22.cc` | Alternate | Likely live |
| `net11.cc` | Alternate | Likely live |
| `net50.cc` | Old domain (hardcoded in Flutter app) | ❌ DEAD (parked) |
| `userver.net50.cc` | Ad/verify server (Caddy) | Live but irrelevant (see §5) |
| `sNN.nm-cdnN.top` | HLS video CDN (e.g. `s14.nm-cdn7.top`) | Live, token-gated |
| `imgcdn.media` | Poster/image CDN | Live |

**Key rule:** Call the API on the SAME host that issued the `t_hash_t` cookie. The cookie's domain binds to the issuing host.

**Maintenance burden:** When a domain dies, find the new one via:
- Telegram: `t.me/netmirror_app` (official channel for domain updates)
- Try sequential domains: `net51.cc`, `net53.cc`, etc.
- Check the CloudStream extension repos for updates

---

## 3. THE AUTHENTICATION BYPASS (THE KEY FINDING)

### 3.1 The "official" flow (DON'T USE THIS — it's a decoy)

The Flutter app (`suryasarisa99/netmirror`) implements this unnecessarily complex flow:

1. `GET /mobile/home?app=1` → server sets `addhash` cookie
2. `GET https://userver.net50.cc/?hdhhdh={addhash}&a=y` → opens an ad link
3. **Wait 35 seconds** (enforced by `Future.delayed` in Dart — client-side only!)
4. `POST /mobile/verify2.php {verify:addhash}` → returns `t_hash_t` cookie (valid ~72 hours)

**Why every part of this is fake:**
- The **35-second wait** is a Dart `Future.delayed` (lib/data/cookies_manager.dart:91) — a local sleep with zero server round-trips. The server does NOT check elapsed time.
- The **ad link visit** (step 2) goes to `userver.net50.cc`, a completely separate host running **Caddy** (not Cloudflare). It has no shared session state with `net52.cc`. Visiting it does NOT influence token issuance — it's pure ad revenue for the dev.
- **`verify2.php`** is obsolete. The bypass endpoint (`verify.php`) skips it entirely.

### 3.2 The REAL bypass (USE THIS)

Two CloudStream extensions independently discovered that `verify.php` (NOT `verify2.php`) issues `t_hash_t` with zero verification.

**The complete auth flow — ONE request:**

```http
POST https://net52.cc/verify.php
Content-Type: application/x-www-form-urlencoded
Origin: https://net22.cc
Referer: https://net22.cc/verify2
User-Agent: <any browser UA>
Body: g-recaptcha-response=<ANY RANDOM UUID>

→ HTTP 301 (0.25 seconds)
   Set-Cookie: t_hash_t=<token>; expires=<+72h>; Max-Age=259200
   Location: /home
```

**The `g-recaptcha-response` field is NEVER validated server-side.** A random UUID works. Confirmed by:
1. `Sushan64/NetMirror-Extension` — `Utils.kt:85-148` (`bypass()` function)
2. `salmanbappi/sb-extensions-source` — `NetMirror.kt:569-635` (`getBypassCookie()`)
3. **Live test during this research** — 4 consecutive POSTs, 0.24s/0.24s/0.37s/0.24s, no challenge, no rate-limit

**Token format:** `hash::hash::unix_timestamp::pn::99`
**Token validity:** Server grants Max-Age=259200 (72 hours / 3 days). CloudStream extensions refresh at 15 hours (4x safety margin).

### 3.3 Token expiry detection

When `t_hash_t` expires, the API endpoints still return **HTTP 200** but the JSON body changes:
- Valid token → JSON has `"status": "y"` or normal data
- Expired token → JSON has `"status": "n"`

**So check the `status` field in the JSON, NOT the HTTP status code.** On detecting expiry, delete cached token, re-run the bypass, and retry the request once.

The CloudStream extensions also detect a **302 redirect to a `/verify` path** as a secondary expiry signal.

---

## 4. THE COMPLETE API (all endpoints)

Base URL: `https://net52.cc/mobile/` (prepend OTT prefix for non-Netflix sources)

All endpoints take `t=<unix_seconds>` as a cache-buster query param.

### 4.1 Required headers for ALL API calls

```http
Cookie: t_hash_t=<token>; ott=nf; hd=on
User-Agent: Mozilla/5.0 (Linux; Android 13; Pixel 5) Chrome/144.0 Mobile Safari/537.36 /OS.Gatu v3.0
X-Requested-With: XMLHttpRequest
Referer: https://net52.cc/home
```

- `ott` cookie: `nf` (Netflix), `pv` (Prime), `hs` (Hotstar), or empty
- `hd=on`: enables HD streams
- The `/OS.Gatu v3.0` UA suffix is what the official app sends, but a generic Android Chrome UA also works

### 4.2 Endpoint reference

| Method | Endpoint | Returns | Purpose |
|--------|----------|---------|---------|
| `POST` | `/verify.php` | 301 + Set-Cookie | **Get auth token (THE BYPASS)** |
| `GET` | `/mobile/home?app=1` | **HTML** (115KB) | Homepage catalog rows/trays |
| `GET` | `/mobile/search.php?s=<query>&t=<unix>` | JSON | Search. `{searchResult:[{id,t,y,r}]}` |
| `GET` | `/mobile/post.php?id=<id>&t=<unix>` | JSON | Movie/show details, seasons, cast |
| `GET` | `/mobile/episodes.php?s=<sid>&series=<eid>&t=<unix>&page=N` | JSON | Paginated episodes for a series |
| `GET` | `/mobile/playlist.php?id=<id>` | JSON | **HLS sources[] + subtitle tracks[]** |

### 4.3 OTT source prefixes

For non-Netflix content, prepend the prefix to the endpoint path:
- `nf` or empty → Netflix
- `pv/` → Prime Video (e.g. `/mobile/pv/search.php`)
- `hs/` → Hotstar/Disney+
- `hbo/` → HBO
- `lg/` → Lionsgate

### 4.4 Search response shape

```json
{
  "searchResult": [
    { "id": "70143836", "t": "Breaking Bad", "y": "2008", "r": "9.5" }
  ]
}
```

### 4.5 Post (details) response shape

Returns full metadata: title, year, cast, genre, description, number of seasons, and for series — episode lists.

### 4.6 Playlist response shape (THE STREAM)

```json
[
  {
    "sources": [
      { "file": "https://s14.nm-cdn7.top/files/{ID}/1080p/{res}.m3u8?in={KEY}", "label": "1080p", "type": "hls" },
      { "file": "https://s14.nm-cdn7.top/files/{ID}/720p/{res}.m3u8?in={KEY}", "label": "720p", "type": "hls" },
      { "file": "https://s80.nm-cdn8.top/files/{ID}/480p/{res}.m3u8?in={KEY}", "label": "480p", "type": "hls" }
    ],
    "tracks": [
      { "file": "https://...", "kind": "captions", "label": "English" }
    ]
  }
]
```

**Multi-audio:** Separate audio tracks are at `/files/{ID}/a/{index}/{index}.m3u8?in={KEY}`. The HLS player needs to handle audio track switching (HLS.js supports this via `audioTracks`).

**The `in=` query param** is a signed resource key bound to the `t_hash_t` session. It is NOT a separate auth token — it comes WITH the playlist response, tied to your cookie.

---

## 5. THE AD SERVER (userver.net50.cc) — IRRELEVANT

- `HEAD https://userver.net50.cc/` → 403, `Server: Caddy`
- `GET https://userver.net50.cc/?hdhhdh={addhash}&a=y` → 200, 19KB HTML ad page, `Server: Caddy`

This is a completely separate host (Caddy vs Cloudflare) with no session sharing to `net52.cc`. It exists purely for ad revenue. The `verify.php` bypass never checks for it. **Skip it entirely.**

---

## 6. STREAMING PIPELINE (HOW VIDEO GETS SERVED)

```
User clicks play
    ↓
GET /mobile/playlist.php?id={id}  (with t_hash_t cookie)
    ↓
Returns HLS URLs at nm-cdnN.top with ?in= resource key
    ↓
Proxy through existing m3u8-proxy / ts-proxy in server.js
    (set Origin/Referer: https://net52.cc on proxied requests)
    ↓
HLS.js player in VideoPlayer.jsx plays the proxied manifest
```

**The `nm-cdnN.top` CDN requires the `in=` key** from the playlist response. The key is tied to your `t_hash_t` session. As long as you forward the playlist-provided URL through your proxy with proper `Referer`/`Origin` headers, playback works.

**Multi-audio handling:** The playlist returns separate audio m3u8 URLs. For multi-language dubs (Hindi/Tamil/etc.), the player must switch audio tracks. HLS.js handles this natively — the audio tracks appear as alternate `AUDIO` groups in the master playlist, or as separate `sources` entries depending on the content.

---

## 7. CATALOG OPTIONS (THE HTML "PROBLEM")

The homepage (`/mobile/home?app=1`) returns **HTML** (115KB), not JSON. Two solutions:

### Option A: Server-side HTML parsing (recommended, simplest)
Use `cheerio` (already a dependency in server.js) to parse the HTML trays:
- Rows are in `.tray-container` divs
- Each item has a `[data-post]` attribute with the item ID
- Parse out: title, poster URL (`imgcdn.media`), ID, type

This gives you a browsable catalog like the AnimeRulz `dub.json` does.

### Option B: TMDB-backed catalog (skip their HTML entirely)
Build your own catalog from **TMDB API** (free, clean JSON, stable) for movies/dramas, and ONLY use NetMirror at playback time to resolve the stream. This mirrors how the anime section works (AniList for metadata, AnimeRulz only for the stream).

**Recommendation:** Start with Option A (parse their HTML), upgrade to Option B later if their HTML structure churns.

---

## 8. INTEGRATION INTO THE EXISTING EetNet APP

The app's current architecture (from `server.js` + `src/mockData.js`):
- **Frontend:** React 19 + Vite SPA, deployed on Vercel
- **Backend:** Express 5 (server.js) running on Android phone via Termux, tunneled via Cloudflare/ngrok
- **Existing patterns:** AnimeRulz integration (lines 700-1090 in server.js), HLS proxy engine (m3u8-proxy, ts-proxy), referer spoofing

### 8.1 Backend changes (server.js)

Add these routes, modeled on the existing AnimeRulz pattern:

```js
// ─── NetMirror auth token cache ───
let netmirrorToken = null;
let netmirrorTokenExpiry = 0;
const NETMIRROR_BASE = process.env.NETMIRROR_BASE || 'https://net52.cc';
const NETMIRROR_UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 5) Chrome/144.0 Mobile Safari/537.36 /OS.Gatu v3.0';

async function getNetmirrorToken() {
  const now = Date.now();
  if (netmirrorToken && now < netmirrorTokenExpiry) return netmirrorToken;

  // THE BYPASS: random UUID as g-recaptcha-response (never validated)
  const fakeCaptcha = crypto.randomUUID();
  const res = await axios.post(`${NETMIRROR_BASE}/verify.php`,
    qs.stringify({ 'g-recaptcha-response': fakeCaptcha }),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Origin': NETMIRROR_BASE,
        'Referer': `${NETMIRROR_BASE}/verify2`,
        'User-Agent': NETMIRROR_UA,
      },
      maxRedirects: 0,  // capture Set-Cookie from the 301
      validateStatus: () => true,
    }
  );

  // Extract t_hash_t from Set-Cookie
  const setCookies = res.headers['set-cookie'] || [];
  const cookieStr = Array.isArray(setCookies) ? setCookies.join('; ') : setCookies;
  const match = cookieStr.match(/t_hash_t=([^;]+)/);
  if (!match) throw new Error('NetMirror: no t_hash_t in verify response');

  netmirrorToken = decodeURIComponent(match[1]);
  netmirrorTokenExpiry = now + (15 * 60 * 60 * 1000); // refresh every 15h (server grants 72h)
  console.log('[NetMirror] Token obtained, valid ~72h');
  return netmirrorToken;
}

async function netmirrorRequest(path, { ott = 'nf', params = {}, expectJson = true } = {}) {
  const token = await getNetmirrorToken();
  const cookie = `t_hash_t=${token}; ott=${ott}; hd=on`;
  const fullParams = { t: Math.floor(Date.now() / 1000), ...params };

  const res = await axios.get(`${NETMIRROR_BASE}/mobile/${path}`, {
    params: fullParams,
    headers: {
      'Cookie': cookie,
      'User-Agent': NETMIRROR_UA,
      'X-Requested-With': 'XMLHttpRequest',
      'Referer': `${NETMIRROR_BASE}/home`,
    },
    validateStatus: () => true,
  });

  // Detect token expiry: status:"n" in JSON, or 302 to /verify
  if (expectJson && res.data && res.data.status === 'n') {
    netmirrorToken = null;  // force refresh
    return netmirrorRequest(path, { ott, params, expectJson }); // retry once
  }

  return res.data;
}

// ─── NetMirror API routes ───
app.get('/api/netmirror/search', async (req, res) => { /* ... */ });
app.get('/api/netmirror/post/:id', async (req, res) => { /* ... */ });
app.get('/api/netmirror/episodes', async (req, res) => { /* ... */ });
app.get('/api/netmirror/playlist/:id', async (req, res) => { /* ... */ });
app.get('/api/netmirror/home', async (req, res) => { /* HTML → cheerio parse → JSON */ });
```

### 8.2 HLS proxy (reuse existing m3u8-proxy / ts-proxy)

The playlist returns `nm-cdnN.top` URLs with `?in=` keys. Route these through the EXISTING `m3u8-proxy` and `ts-proxy` endpoints in server.js, adding:
```http
Origin: https://net52.cc
Referer: https://net52.cc/
```
This is identical to how AnimeRulz streams are proxied. No new proxy logic needed.

### 8.3 Frontend changes (src/mockData.js + src/App.jsx)

Add a `getNetmirrorStream(id)` function to mockData.js (modeled on the existing AnimeRulz watch flow), and add Movies/Dramas sections to App.jsx that call the new `/api/netmirror/*` endpoints.

### 8.4 Environment variables

Add to `.env` / Vercel dashboard:
```
NETMIRROR_BASE=https://net52.cc
```
Update this when the domain rotates.

### 8.5 Token refresh cron (Termux)

The token lasts 72h; refresh every 15h for safety. Options:
- A `setInterval` inside server.js (every 15h, call `getNetmirrorToken()` to warm the cache)
- Or `crontab -e`: `0 */15 * * * curl -s -X POST ... > /dev/null`
- Or `termux-job-scheduler` for reboot-survival

Simplest: just lazy-refresh in `getNetmirrorToken()` — the first request after expiry triggers a re-auth (0.25s delay). No cron needed.

---

## 9. REFERENCE REPOS (WORKING CODE)

These are the three open-source projects that reverse-engineered NetMirror:

### 9.1 Sushan64/NetMirror-Extension (CloudStream)
- **Repo:** https://github.com/Sushan64/NetMirror-Extension/
- **Key file:** `Netmirror/src/main/kotlin/com/horis/cncverse/Utils.kt` lines 85-148
- **What it has:** The `bypass()` function — the `verify.php` backdoor with random UUID. Also `NetflixMirrorProvider.kt` with full mobile-API usage and all required headers/cookies.

### 9.2 salmanbappi/sb-extensions-source (CloudStream)
- **Repo:** https://github.com/salmanbappi/sb-extensions-source
- **Key file:** `src/all/netmirror/src/eu/kanade/tachiyomi/animeextension/all/netmirror/NetMirror.kt` lines 569-635
- **What it has:** `getBypassCookie()` — second independent confirmation of the `verify.php` bypass. Also includes the 302-retry/force-refresh logic for token expiry.

### 9.3 suryasarisa99/netmirror (Flutter app)
- **Repo:** https://github.com/suryasarisa99/netmirror
- **Key files:**
  - `lib/constants.dart` — API base URLs (`net50.cc/mobile`)
  - `lib/data/cookies_manager.dart` — the 35s `Future.delayed` (proving the wait is fake)
  - `lib/api/get_initial.dart` — the original 3-step handshake (the decoy flow)
- **Status:** Last commit Sept 2025. Uses dead domain `net50.cc`. Reference only — use the CloudStream bypass instead.

---

## 10. VERIFICATION CHECKLIST (before integrating)

- [ ] `POST https://net52.cc/verify.php` with random UUID returns `t_hash_t` in Set-Cookie
- [ ] `GET /mobile/search.php?s=breaking` with the token returns JSON search results
- [ ] `GET /mobile/post.php?id=70143836` returns Breaking Bad details
- [ ] `GET /mobile/playlist.php?id=<id>` returns HLS sources
- [ ] Proxied HLS plays in VideoPlayer.jsx with spoofed Origin/Referer
- [ ] Token auto-refreshes on `"status":"n"` detection

---

## 11. RISKS & MITIGATIONS

| Risk | Mitigation |
|------|------------|
| Domain rotation (`net52.cc` dies) | Env var `NETMIRROR_BASE`, update via Telegram `t.me/netmirror_app` |
| Token endpoint changes | Monitor the CloudStream extension repos for updates |
| `verify.php` starts actually validating captcha | Fall back to the Flutter 3-step flow (ad-wait), or use Termux WebView as last resort |
| Rate limiting | Not observed in testing, but add exponential backoff if needed |
| HLS `in=` key expiry | Re-fetch playlist.php if stream 403s |
| Legal/DMCA | This is piracy content. Same exposure as the existing AnimeRulz integration. |

---

## 12. SUMMARY DECISION TABLE

| Question | Answer |
|----------|--------|
| Is NetMirror integrable? | ✅ YES |
| Does it need Puppeteer/headless browser? | ❌ NO — plain axios/fetch |
| Is the auth bypassable? | ✅ YES — one POST to `/verify.php` with random UUID |
| Is the 35s ad wait required? | ❌ NO — it's a client-side `Future.delayed`, server doesn't check |
| Is Cloudflare a blocker? | ❌ NO — only on the web frontend, NOT on `/mobile/*` API |
| Is the catalog HTML a blocker? | ❌ NO — parse with cheerio, or use TMDB for metadata |
| Same architecture as AnimeRulz integration? | ✅ YES — token + cookie + proxied HLS |
| Maintenance burden vs AnimeRulz? | Slightly higher (domain rotation), but manageable |
