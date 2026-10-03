# EetNet Drama API (KissKH)

Standalone microservice for Asian drama streaming (Korean, Chinese, Japanese, Thai, etc.) powered by KissKH and EncDec resolver.

## Running Locally / on Termux
```bash
cd services/drama
npm install
node server.js
```
Runs by default on port `8081` (configurable via `PORT` environment variable).

---

## API Endpoints Reference

### 1. Health Check
`GET /api/health`
Returns service status, uptime, and port.

---

### 2. Drama Home Catalog
`GET /api/drama/home`

Returns curated home sections from KissKH:
- `show`: Featured/popular ongoing shows
- `korean`: Most viewed Korean dramas
- `chinese`: Most viewed Chinese dramas
- `topRating`: Top rated dramas
- `lastUpdate`: Recently updated dramas

**Response Format:**
```json
{
  "show": [
    {
      "id": 8011,
      "title": "Queen of Tears",
      "thumbnail": "https://...",
      "episodesCount": 16
    }
  ],
  "korean": [...],
  "chinese": [...],
  "topRating": [...],
  "lastUpdate": [...]
}
```

---

### 3. Drama List / Filter
`GET /api/drama/list?type=0&q=`

Query parameters:
- `type`: `0` (All), `1` (Chinese), `2` (Korean), `3` (Japanese), `4` (Thai), etc.
- `q`: Search keyword or title query (optional)

---

### 4. Search Drama
`GET /api/drama/search?q=vincenzo`

Returns an array of search results matching the query string.

---

### 5. Drama Details & Episode List
`GET /api/drama/info/:dramaId`

Example: `GET /api/drama/info/8011`

**Response Format:**
```json
{
  "id": 8011,
  "title": "Queen of Tears",
  "description": "...",
  "thumbnail": "https://...",
  "status": "Completed",
  "episodes": [
    {
      "id": 142100,
      "number": 1,
      "sub": 1
    }
  ]
}
```

---

### 6. Episode Stream & Subtitles
`GET /api/drama/stream/:episodeId`

Example: `GET /api/drama/stream/142100`

**Response Format:**
```json
{
  "episodeId": "142100",
  "type": "hls",
  "streamUrl": "https://.../api/m3u8-proxy?url=...",
  "subtitles": [
    {
      "label": "English",
      "file": "https://.../api/drama/subtitle?url=...",
      "rawFile": "https://...",
      "default": true
    }
  ]
}
```

---

### 7. Subtitle Converter / Proxy
`GET /api/drama/subtitle?url=<vtt_or_srt_url>`

Fetches raw subtitle, converts SRT timestamps to standard WebVTT format, sets CORS headers, and streams to browser `<track>` elements.
