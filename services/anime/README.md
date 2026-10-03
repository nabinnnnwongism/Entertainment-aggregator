# EetNet Anime API

Standalone microservice for Anime streaming (English Sub/Dub, Japanese Sub, Hindi Dub, Tamil Dub, Telugu Dub) powered by HiAnime, AnimeKai, Consumet, AnimeRulz, and AniList GraphQL.

## Running Locally / on Termux
```bash
cd services/anime
npm install
node server.js
```
Runs by default on port `8080` (configurable via `PORT` environment variable).

---

## API Endpoints Reference

### 1. Health Check & Status
- `GET /api/health` — Service uptime & port check
- `GET /api/status` — Probe upstream providers status

---

### 2. AniList GraphQL Proxy
`POST /api/anilist`
Server-side cached & rate-limit-aware proxy with automatic retry for AniList GraphQL queries.

---

### 3. Anime Info & Episodes
`GET /api/info/:anilistId`

Returns anime metadata and full episode list.

---

### 4. HiAnime Watch (Primary Stream)
`GET /api/hianime/watch?anilistId=21&episode=1&dub=sub`

Parameters:
- `anilistId`: Numeric AniList ID
- `episode`: Episode number
- `dub`: `sub` (Japanese Audio + Subtitles) or `eng` (English Dub)

---

### 5. AnimeKai Watch (English Sub/Dub Fallback)
`GET /api/gogoanime/watch?title=Solo+Leveling&episode=1&season=1&dub=sub`

Parameters:
- `title`: Anime title
- `episode`: Episode number
- `season`: Season number (e.g. `2`)
- `dub`: `sub` or `eng`

---

### 6. AnimeRulz Hindi / Indian Language Dubs
- `GET /api/animerulz/watch?anilistId=21&episode=1&lang=hin` — HLS stream for Hindi (`hin`), Tamil (`tam`), Telugu (`tel`) dubs
- `GET /api/animerulz/episodes?anilistId=21` — List episodes available for this anime
- `GET /api/animerulz/availability?anilistId=21` — Quick check if Hindi dub is available
- `GET /api/animerulz/catalog?language=hindi&page=1&limit=50` — Paginated catalog of all Hindi dubbed anime

---

### 7. Jikan / MyAnimeList Episode Titles
`GET /api/episodes/mal/:malId?page=1`

Fetches episode titles, air dates, filler, and recap status.

---

### 8. Search Anime
`GET /api/search?q=demon+slayer`

Search AnimeKai for matching anime slugs.

---

### 9. HLS & Asset Proxies
- `GET /api/m3u8-proxy?url=<url>&referer=<referer>`
- `GET /api/ts-proxy?url=<url>&referer=<referer>`
- `GET /api/subtitle-proxy?url=<url>`
- `GET /api/img-proxy?url=<url>`
