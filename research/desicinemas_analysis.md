# DesiCinemas.pk — Technical Analysis & Reverse-Engineering Report

## 1. Executive Summary
- **Target**: `https://desicinemas.pk/`
- **Platform**: WordPress CMS with customized **Toroflix** video streaming theme + LiteSpeed Cache.
- **Image CDN**: TMDB (`//image.tmdb.org/t/p/...`)
- **Video Storage & Hosting**: Hosted on third-party CDNs primarily via **Morencius** (`morencius.com` / VidHide network) and **Vidmoly** (`vidmoly.org` / `vidmoly.me`).
- **Data Access Status**: Unauthenticated, open server-side HTML rendering. Both catalog scraping and direct `.m3u8` HLS extraction are 100% functional without requiring authentication tokens or bypass proxies.

---

## 2. Platform Architecture & Data Structures

### A. WordPress Post Types & URL Structures
| Type | URL Pattern | Description |
|---|---|---|
| **Movie** | `/movies/{slug}/` | Custom post type `movies` |
| **Series (TV Show)** | `/series/{slug}/` | Custom post type `series` |
| **Season** | `/seasen/{slug}/` | Custom taxonomy `seasons` |
| **Episode** | `/episode/{slug}/` | Custom taxonomy/post `episodes` |
| **Search** | `/?s={query}` | Standard WordPress search archive |
| **Filtered Search** | `/?s=filter&years[]={year}&genre[]={id}` | Multi-parameter taxonomy filter |
| **A-Z Directory** | `/leter/{char}/` | Alphabetical archive (`0-9`, `a` through `z`) |

### B. Categories & Taxonomies
All categories are public on `https://desicinemas.pk/wp-json/wp/v2/categories`. Key genre routes:
- **Movies (Main)**: `/bmovies1/` (Page: `/bmovies1/page/{n}/`)
- **Series**: `/series/` (Page: `/series/page/{n}/`)
- **Hindi Dubbed**: `/hindidubbed/` (ID: 5407)
- **Hollywood Movies**: `/hollywoodmovies/` (ID: 2454)
- **Desi Cinema**: `/1desicinema/` (ID: 1)
- **Action**: `/all-action-movie/` (ID: 112)
- **Comedy**: `/com-edyy/` (ID: 667)
- **Drama**: `/dr-ama/` (ID: 29)
- **Romance**: `/romance3/` (ID: 673)
- **Thriller**: `/thriller-moviez/` (ID: 113)
- **Horror**: `/hor-ror/` (ID: 868)
- **Crime**: `/all-crime/` (ID: 85)
- **Punjabi**: `/bmovies1/1punjabi/` (ID: 7626)
- **Tamil**: `/bmovies1/tamil-cinemaa/` (ID: 8190)
- **Telugu**: `/bmovies1/telu-gu/` (ID: 8133)
- **Bengali**: `/bengali/` (ID: 29690)
- **Gujarati**: `/bmovies1/gujarati/` (ID: 29684)
- **Marathi**: `/bmovies1/marathi2/` (ID: 29899)
- **Malayalam**: `/bmovies1/malayalam/` (ID: 29892)
- **Kannada**: `/bmovies1/kannada/` (ID: 29919)

---

## 3. Streaming Engine & Extraction Mechanism

### A. Embed Router Endpoint
On single Movie or Episode pages, stream sources are managed via the Toroflix internal embed router:
```http
GET https://desicinemas.pk/?trembed={option_key}&trid={post_id}&trtype={type}
```
- `option_key`: Server option index (e.g. `0`, `1`, `2`)
- `post_id`: WordPress Post ID (e.g. `12420`, `12461`)
- `trtype`: `1` for Movies, `2` for TV Episodes

This endpoint returns a clean HTML payload containing the third-party iframe embed:
```html
<div class="Video">
  <IFRAME SRC="https://morencius.com/embed/{hash}" FRAMEBORDER=0 allowfullscreen></IFRAME>
</div>
```

---

### B. Video Host Extractors

#### 1. Morencius (`morencius.com` / VidHide Engine)
- **Host**: `morencius.com` (VidHide white-label)
- **Format**: Evaluated packed JS (`eval(function(p,a,c,k,e,d)...)`).
- **Extraction**:
  - Sandboxed execution in `node:vm` mocking minimal browser globals (`window`, `document`, `jwplayer`).
  - Intercepts `jwplayer().setup(config)`.
  - Resolves `config.sources[0].file` to direct HLS `.m3u8` master playlist.
- **Direct Stream URL Example**:
  `https://yjrnY6VWd3Y1oXUh.acek-cdn.com/hls2/01/08534/8iukc27ipfb6_n/master.m3u8?t=...`

#### 2. Vidmoly (`vidmoly.org` / `vidmoly.me`)
- **Host**: `vidmoly.org`
- **Format**: Plain JS configuration in page body.
- **Extraction**:
  - Regex pattern: `sources:\s*\[\s*\{\s*file:\s*['"](https?://[^\s'"]+\.m3u8[^\s'"]*)['"]`
  - Or `file:\s*['"](https?://[^\s'"]+\.m3u8[^\s'"]*)['"]`
- **Direct Stream URL Example**:
  `https://prx-1317-ant.vmpx.online/hls2/01/02802/rtodjd64fks0_,n,l,.urlset/master.m3u8?t=...`

---

## 4. API Endpoints & Scraping Strategy

### A. Catalog & Search Aggregation
1. **Catalog Browsing**:
   - Request `https://desicinemas.pk/{category_path}/page/{page_number}/`
   - Extract `.MovieList > li` elements containing:
     - `postId` (`id="post-{id}"`)
     - `title` (`.Title`)
     - `slug` (`/movies/{slug}/` or `/series/{slug}/`)
     - `poster` (`img[data-src]` or `img[src]`)
     - `quality` (`.Qlty`)
     - `year` (`.Yr` or `.Date`)
     - `language` (`.Lng`)
2. **Search**:
   - Request `https://desicinemas.pk/?s={query}`
   - Parses same `.MovieList > li` DOM structure.
3. **Series Seasons & Episodes**:
   - Series page: `https://desicinemas.pk/series/{slug}/`
   - Seasons link: `https://desicinemas.pk/seasen/{slug}/`
   - Episode listing table `.SeasonBx table tr` -> contains episode links `/episode/{slug}/` with episode `post_id`.

### B. Stream Resolution Pipeline
```
[User clicks Movie/Episode]
           │
           ▼
[Fetch Single Page HTML]
  Parse .ListOptions li -> { typ, key, id, server }
           │
           ▼
[Fetch Embed Endpoint]
  https://desicinemas.pk/?trembed={key}&trid={id}&trtype={1 or 2}
  Extract <iframe src="...">
           │
           ▼
[Extract Stream based on Host]
  ├─ If morencius.com ──> Unpack packed JS with node:vm ──> Master .m3u8 HLS
  ├─ If vidmoly.org   ──> Regex extract file: '...'    ──> Master .m3u8 HLS
  └─ Fallback         ──> Direct iframe embed URL
```

---

## 5. Security & Rate-Limiting Observations
- **WAF / Cloudflare**: Standard Cloudflare protection; handles plain Node.js `axios` requests with standard `User-Agent` headers without Cloudflare turnstile/captchas on catalog and stream routes.
- **CORS**: HLS streams are served across multi-domain CDNs (`acek-cdn.com`, `vmpx.online`) with open CORS or can be relayed via the backend proxy.
- **REST API Lockdown**: Custom post types are hidden from `/wp-json/wp/v2/`, preventing bulk database dump via REST, but server-rendered HTML is completely open and easily parsed.
