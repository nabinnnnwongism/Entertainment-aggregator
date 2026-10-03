# Comics, Manhwa & Webtoons Reverse Engineering Analysis

## 1. Overview & Multi-Source Architecture

The comics aggregator in EetNet unified four distinct platforms into a single unified catalog with seamless chapter reading:

1. **ComicK** (`comickz.co.uk` / `meo.comick.pictures`): Comprehensive database for Japanese Manga and Korean Manhwa.
2. **AsuraToon** (`asuratoons.com` / `asurascan.com`): High-speed scanlation group specializing in popular Korean action and fantasy manhwa.
3. **TempleScan** (`templescan.net`): Niche scanlation release pipeline.
4. **HiveToon** (`hivetoons.com`): Webtoon-oriented release repository.

---

## 2. Scraping Mechanisms & Challenges

### 2.1 ComicK REST & CDN Extraction
ComicK exposes internal catalog and chapter endpoints:
- Search: `/api/search?q={query}&type=comic`
- Comic Detail: `/comic/{slug}`
- Chapter Pages: `/chapter/{chapter_hid}/get_images`

The chapter images are hosted on high-throughput Cloudflare-backed CDNs (`https://meo.comick.pictures/`). The image paths are encoded as hashed keys (e.g. `b2key`).

### 2.2 AsuraToon & HiveToon DOM Scraping
Unlike ComicK's structured JSON APIs, AsuraToon and HiveToon rely on WordPress-based themes (Madara / MangaStream derivatives).
- **DOM Parsing**: Cheerio was used to traverse HTML trees and locate chapter image containers (`div.reading-content img`).
- **Lazy-Loading Chains**: Images in modern themes use data attributes to prevent upfront bandwidth usage:
  ```html
  <img data-src="https://..." data-lazy-src="https://..." src="data:image/svg+xml..." />
  ```
  The scraper iteratively extracts from `data-src`, `data-lazy-src`, `data-original`, or falls back to `src` to ensure zero broken pages.

---

## 3. Image Hotlink Protection & The Image Proxy

Directly linking CDN images into an external web app results in HTTP 403 Forbidden or broken image placeholders. 

### Why CDNs Block Hotlinking
1. **Referer Verification**: CDNs check the `Referer` HTTP header. If the referer is not their own origin (or is null), the request is rejected.
2. **CORS Origin Filtering**: Cross-origin `<img>` rendering within canvas or reader components is blocked by missing `Access-Control-Allow-Origin`.

### Proxy Architecture (`/api/manga/image-proxy`)
The proxy handles:
- Spoofing `Referer: https://comick.app` or respective provider origins.
- Mimicking Chrome browser User-Agents.
- Handling HTTP 429 (Rate Limit) responses with automated exponential backoff retry logic.
- Setting client-side cache headers (`Cache-Control: public, max-age=86400`) to minimize redundant requests to upstream providers.
