# EetNet Movies API (MoviePlex & NetMirror)

Standalone microservice for Bollywood, Hollywood, South Indian, Hindi Dubbed Movies and Web Series powered by MoviePlex, NetMirror, TMDB, and OMDb.

## Running Locally / on Termux
```bash
cd services/movies
npm install
node server.js
```
Runs by default on port `8083` (configurable via `PORT` environment variable).

---

## API Endpoints Reference

### 1. Health Check
`GET /api/health`
Returns service status, uptime, and port.

---

### 2. Movies Home Catalog
`GET /api/movies/home`

Returns curated movie rows with TMDB poster enrichment:
- `featured`: Spotlight movie/banner
- `movieplex.trending`: Trending movies
- `movieplex.hindiDubbed`: Hindi dubbed releases
- `movieplex.bollywood`: Bollywood films
- `movieplex.hollywood`: Hollywood films
- `movieplex.webSeries`: OTT Web Series
- `movieplex.action`, `movieplex.shortFilm`, `movieplex.thriller`, `movieplex.romance`

---

### 3. MoviePlex Paginated Catalog & Search
`GET /api/movieplex/catalog?page=1&limit=40&category=17&search=fighter`

Query Parameters:
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 40)
- `category`: Category ID (e.g., `17` = Hindi Dubbed, `10` = Bollywood, `19` = Hollywood, `33` = Web Series, `21` = Hot)
- `search`: Search query string
- `is18`: `true` to show 18+ content (default: filtered out)

---

### 4. Movie Stream Resolver (LuluStream & StreamTape)
`GET /api/movieplex/stream?slug=fighter-2024`

Extracts raw HLS or stream URLs from the post.

**Response Format (HLS extraction success):**
```json
{
  "streamUrl": "https://.../api/m3u8-proxy?url=https%3A%2F%2Ftnmr.org...",
  "thumbnail": "https://image.tmdb.org/t/p/w500/...",
  "title": "Fighter (2024)",
  "source": "lulustream",
  "fallbackIframe": "https://bfmovies.online/e/..."
}
```

**Response Format (Fallback when host obfuscates stream):**
```json
{
  "streamUrl": null,
  "thumbnail": "https://image.tmdb.org/t/p/w500/...",
  "title": "Movie Title",
  "fallbackIframe": "https://streamtape.com/e/...",
  "error": "HLS extraction failed"
}
```

---

### 5. NetMirror OTT Streaming
- `GET /api/netmirror/trending`: Trending OTT movies/series
- `GET /api/netmirror/search?q=stranger+things`: Search Netflix/Prime content
- `GET /api/netmirror/post/:id`: Title details and episodes
- `GET /api/netmirror/playlist/:id`: Stream playlist
- `GET /api/netmirror/stream-resolve?title=movie+name&year=2024`: Auto-resolves HLS stream

---

### 6. HLS Stream Proxy
- `GET /api/m3u8-proxy?url=<m3u8_url>&referer=<referer>`: Rewrites HLS playlists to route segments through backend proxy
- `GET /api/ts-proxy?url=<ts_url>&referer=<referer>`: Pipes video segments with HTTP Range request support
