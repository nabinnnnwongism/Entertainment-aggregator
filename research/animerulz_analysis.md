# AnimeRulz / StreamIndia Reverse Engineering Analysis

## 1. Overview & Context

AnimeRulz (and its underlying infrastructure network, StreamIndia) is one of the premier piracy networks in South Asia specializing in dubbed anime content - specifically Hindi, Tamil, and Telugu dubs. 

A central achievement of the EetNet project was cataloging and indexing **477 Hindi-dubbed anime series and movies**, cross-referencing them against AniList / MyAnimeList metadata databases, and extracting direct HLS video streams without ad redirects or tracking scripts.

---

## 2. Infrastructure Architecture

Traffic inspection of the AnimeRulz web client revealed that rather than serving video directly from a single monolithic server, the platform delegates requests across a multi-subdomain CDN and API matrix:

| Host / Subdomain | Function |
|---|---|
| `data.streamindia.co.in` | Primary REST metadata API (anime catalog, episode lists, dub availability) |
| `fallback.streamindia.co.in` | Fallback API server when the primary encounters heavy load or DNS filtering |
| `animelok.streamindia.co.in` | Secondary catalog endpoint specifically mapped to regional dub indices |
| `extract.streamindia.co.in` | Stream extraction backend responsible for resolving encrypted player iframe tokens |
| `hianime.streamindia.co.in` | English sub/dub integration relay for mainstream global releases |

---

## 3. The 477 Hindi Dub Catalog Indexing

Most mainstream anime APIs (e.g., Jikan, AniList, Kitsu) index Japanese and English releases accurately, but completely lack metadata regarding regional Indian language dubs produced by Cartoon Network India, Hungama TV, Sony YAY!, or scanlation dubbing groups.

### Discovery & Extraction Pattern
1. **Catalog Harvesting**: Automated queries to `/api/animerulz/catalog?language=hindi&page=N` yielded the raw catalog of regional releases.
2. **Metadata Normalization**: Titles were matched using fuzzy Levenshtein distance and romanized Japanese transliterations against AniList GraphQL schemas:
   ```graphql
   query ($search: String) {
     Media (search: $search, type: ANIME) {
       id
       title {
         romaji
         english
         native
       }
       coverImage {
         large
       }
     }
   }
   ```
3. **Persisted Mapping**: 477 confirmed Hindi dub titles were assigned deterministic mappings in `src/shared/data/hindi-dubbed-ids.ts`, allowing instant lookup in the frontend without querying upstream search endpoints on every page load.

---

## 4. API Endpoints & Request Flow

### 4.1 Episode Availability
```http
GET https://data.streamindia.co.in/api/v1/episodes?animeId={animeSlug}
User-Agent: Mozilla/5.0 (Linux; Android 13) ...
Referer: https://animerulz.co/
```
**Response Payload**:
```json
{
  "success": true,
  "data": {
    "title": "Naruto Shippuden (Hindi Dub)",
    "episodes": [
      {
        "id": "naruto-shippuden-ep-1",
        "episodeNumber": 1,
        "languages": ["hin", "eng", "jap"],
        "streamId": "str_89a0f4b2"
      }
    ]
  }
}
```

### 4.2 Stream Resolution
Upstream players do not serve static `.mp4` files. Instead, they produce dynamically signed Master Playlists (`.m3u8`) with multi-bitrate HLS streams (1080p, 720p, 480p, 360p) with separate AAC audio track tags (`#EXT-X-MEDIA:TYPE=AUDIO`).

---

## 5. Security & Anti-Bot Obstacles

### The Cloudflare Datacenter Ban
When making requests to `*.streamindia.co.in` from standard cloud infrastructure (AWS EC2, Google Cloud, Vercel Serverless Functions, or Railway.app), Cloudflare WAF immediately issues an **HTTP 403 Forbidden** challenge with Cloudflare Turnstile bot-detection challenges.

Datacenter ASNs (Autonomous System Numbers) belonging to Amazon, DigitalOcean, Microsoft, and Google are flagged in Cloudflare's IP reputation database.

### The Residential Mobile Relay Solution
Running the microservice on an Android phone connected via 4G/5G mobile data or a standard residential ISP assigned an IP address from consumer ASNs (e.g., Airtel, Jio, Reliance, Comcast). Because mobile carriers utilize CGNAT (Carrier-Grade NAT) where millions of legitimate mobile devices share pool IPs, Cloudflare does not block these IP ranges aggressively.

---

## 6. HLS Stream Proxying (`m3u8-proxy` and `ts-proxy`)

Directly feeding the extracted M3U8 URL to a browser video player (`<video>` or HLS.js) fails due to two security mechanisms:
1. **CORS Restrictions**: Upstream CDNs respond with `Access-Control-Allow-Origin: https://animerulz.co`.
2. **Referer Checking**: Requests lacking the exact `Referer` header return HTTP 403.

### Custom Rewrite Engine
EetNet implemented a bidirectional streaming proxy:
1. `/api/m3u8-proxy?url={encoded_m3u8_url}&referer={encoded_referer}`
2. The proxy fetches the playlist, parses the text lines:
   - Any URI ending in `.m3u8` is rewritten to point through `/api/m3u8-proxy`.
   - Any URI ending in `.ts` or `.m4s` is rewritten to point through `/api/ts-proxy`.
3. The response is returned to the client with `Access-Control-Allow-Origin: *`, enabling seamless playback in native HTML5 video players on desktop and mobile.
