# EetNet Comics API (Manga, Manhwa, Webtoons)

Standalone microservice for Manga, Korean Manhwa, Chinese Manhua, and Webtoons powered by ComicKz, AniList GraphQL, and Hivetoons.

## Running Locally / on Termux
```bash
cd services/comics
npm install
node server.js
```
Runs by default on port `8082` (configurable via `PORT` environment variable).

---

## API Endpoints Reference

### 1. Health Check
`GET /api/health`
Returns service status, uptime, and port.

---

### 2. Manga Home Catalog (Bento Grid + Sections)
`GET /api/manga/home`

Returns curated top 10 for Bento grid layout and previews for Japanese Manga, Korean Manhwa, and Chinese Manhua.

**Response Fields:**
- `bentoTop10`: Top 10 items for hero/bento display
- `manhwaPreview`: Korean manhwa spotlight
- `mangaPreview`: Japanese manga spotlight
- `manhuaPreview`: Chinese manhua spotlight
- `trending`, `popular`, `topRated`

---

### 3. Category & Genre Filter
`GET /api/manga/category/:type?genre=action&page=1&perPage=24`

Parameters:
- `:type`: `manga` (Japanese), `manhwa` (Korean), or `manhua` (Chinese)
- `genre`: Genre slug e.g. `action`, `romance`, `fantasy`, `all`
- `page`: Page number (default: 1)
- `perPage`: Items per page (default: 24)

---

### 4. Webtoon Curated Landing (Hybrid Engine)
`GET /api/webtoon/home`

Returns curated AniList Webtoons with release schedule grouped by days of the week (`MON`, `TUE`, `WED`, `THU`, `FRI`, `SAT`, `SUN`, `COMPLETED`).

---

### 5. Search Comics
`GET /api/manga/search?q=solo+leveling`

Returns array of matching manga/manhwa titles with covers and ratings.

---

### 6. Comic Details & Chapter List
`GET /api/manga/info/:id`

Parameters:
- `:id`: Comic slug (e.g. `solo-leveling`, `tower-of-god`) or numeric AniList ID.

**Response Format:**
```json
{
  "id": "solo-leveling",
  "title": "Solo Leveling",
  "cover": "https://.../api/manga/image-proxy?url=...",
  "description": "...",
  "status": "Completed",
  "rating": "8.8",
  "genres": ["Action", "Fantasy", "Adventure"],
  "chapters": [
    {
      "id": "solo-leveling___hid123-chapter-1-en",
      "chapter": "1",
      "title": "Chapter 1"
    }
  ]
}
```

---

### 7. Read Chapter Pages
`GET /api/manga/read/:chapterId`

Example: `GET /api/manga/read/solo-leveling___hid123-chapter-1-en`

**Response Format:**
```json
{
  "chapterId": "solo-leveling___hid123-chapter-1-en",
  "pageCount": 42,
  "pages": [
    {
      "page": 1,
      "url": "https://.../api/manga/image-proxy?url=https%3A%2F%2Fcdn2...",
      "rawUrl": "https://cdn2..."
    }
  ]
}
```

---

### 8. Image Proxy
`GET /api/manga/image-proxy?url=<image_url>`

Proxies images from ComicK / MangaDex CDNs with proper Referer headers, CORS headers, and automatic retry with exponential backoff on HTTP 429 rate limits.
