# Entertainment Aggregator (Archive)

> **Status: Discontinued / Archived**  
> This repository is a code archive of a personal full-stack project I built and have since discontinued. It is preserved here as a portfolio project. No media files are hosted here.  
>  
> 🔗 **Live Frontend Preview**: [https://eetnet.ooguy.com](https://eetnet.ooguy.com)  
> *(The frontend UI, animations, and components can be browsed live at the link above, though video streams and backend scrapers are decommissioned).*

---

## Overview

A unified full-stack media aggregator web application designed to bring together Anime, Asian Dramas, Comics/Manga, and Movies into a single clean, ad-free, Netflix-style interface.

![Home Discovery Page](docs/screenshots/home_preview.png)

---

## Content Sections & Sources

### 1. Anime (Subbed & Regional Dubs)
Aggregated from AnimeRulz, AnimedubHindi, Animedekho, Animesalt, and Animeworld India—featuring a curated catalog of 477 Hindi-dubbed anime series mapped to canonical AniList IDs.

![Anime Hindi Dubbed Catalog](docs/screenshots/anime_hindi_preview.png)

### 2. Asian Dramas (K-Drama / C-Drama)
Aggregated from KissKH, featuring Korean, Chinese, and Japanese dramas with multi-language subtitle tracks.

![Asian Drama Interface](docs/screenshots/drama_billboard_preview.png)

### 3. Comics, Manga & Webtoons
Aggregated from ComicK, AsuraToon, TempleScan, and HiveToon with an interactive vertical webtoon/manga reader.

### 4. Movies & Cinema
Aggregated from NetMirror, DesiCinemas, and MoviePlex with official TMDB metadata integration.

![Movies Collection](docs/screenshots/movies_preview.png)

---

## Key Features

- **Ad-Free Custom Video Player**: Custom HLS.js player with episode navigation, subtitle tracks, and quality switching—no third-party popups or redirects.
- **Unified Catalog Search**: Instant search and browsing across all 4 entertainment categories.
- **Smart HLS & Asset Proxying**: Backend proxies for M3U8 playlists, TS video segments, and comic pages to resolve cross-origin (CORS) and referer restrictions.
- **Watch History & Sync**: Integrated with Supabase for user watchlist and watch progress tracking across devices.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19, Vite, Tailwind CSS, Zustand |
| **Video Streaming** | HLS.js |
| **Backend API** | Node.js, Express |
| **Scraping & Extraction** | Cheerio, Axios |
| **Metadata & Covers** | TMDB API, AniList GraphQL |
| **Authentication & DB** | Supabase |

---

## Repository Structure

```
├── docs/                   # Architecture and screenshots
│   └── screenshots/        # UI preview images
├── services/               # Backend microservices
│   ├── anime/              # Anime scrapers & stream resolvers
│   ├── comics/             # Manga & webtoon scrapers + image proxy
│   ├── drama/              # Asian drama API & subtitle converter
│   └── movies/             # Movie scrapers & stream extractors
├── src/                    # React + Vite frontend application
│   ├── components/         # Reusable UI components & custom video player
│   ├── features/           # Category views (anime, drama, manga, movies)
│   └── pages/              # Main route views & layouts
├── research/               # Technical notes and source API documentation
├── server.js               # Root API server aggregating all services
└── package.json
```

---


---

## ⚠️ Security & Architecture Post-Mortem (Known Trade-offs)

This repository was developed as an experimental prototype where rapid functional integration against hostile, uncooperative, and unstandardized third-party platforms was prioritized over enterprise defense-in-depth. 

If you are studying this codebase or adapting this architecture, be aware of the deliberate trade-offs made during development and how they should be engineered differently in a production environment:

### 1. Process-Wide TLS Disabling (`NODE_TLS_REJECT_UNAUTHORIZED = '0'`)
- **The Prototype Hack**: Several upstream mirror hosts and streaming CDNs (e.g. `anikai.cc`) frequently serve expired, self-signed, or broken SSL certificates. Disabling verification process-wide was a quick workaround to prevent Node.js from terminating requests with certificate errors.
- **The Security Risk**: Disabling verification globally means the server stops authenticating remote endpoints by their certificates, exposing all outgoing requests across the process to potential Man-in-the-Middle (MITM) interception.
- **Production Solution**: Verification should never be disabled globally. In production, this exception should be strictly isolated to a custom `https.Agent({ rejectUnauthorized: false })` scoped *only* to the specific broken domain, while keeping the rest of the application's outbound requests strictly verified.

### 2. Unrestricted URL Proxying & SSRF Boundary (`/api/m3u8-proxy`, `/api/img-proxy`)
- **The Prototype Hack**: The proxy endpoints accept a user-supplied `?url=` parameter and fetch it directly using Axios to bypass browser CORS rules and inject required upstream `Referer` headers. Because streaming CDNs rotate domains unpredictably, a rigid domain allowlist was omitted to avoid breaking playback.
- **The Security Risk**: Allowing untrusted clients to specify arbitrary outbound HTTP(S) destinations creates an open-relay / SSRF-style boundary weakness. On a public server, an attacker could attempt to probe internal network services or abuse the server as an outbound bandwidth relay.
- **Production Solution**: The client should not specify arbitrary destinations. Instead, the backend should resolve the legitimate upstream stream internally, issue a short-lived **HMAC-signed stream token** (e.g. `/api/m3u8-proxy?token=...`), and only fetch destinations validated by that cryptographic signature.

### 3. Open Redirect on Image Proxy Failure
- **The Prototype Hack**: In the image proxy error handler, if fetching an upstream cover fails, the server falls back to `res.redirect(targetUrl)`.
- **The Security Risk**: Because `targetUrl` originates from user input, this creates an open redirect vulnerability that could be exploited in phishing contexts.
- **Production Solution**: The server should return a static fallback placeholder image (or HTTP 502 Bad Gateway) rather than redirecting the client to untrusted query URLs.

### 4. Wildcard CORS Combined with an Open Proxy
- **The Prototype Hack**: `Access-Control-Allow-Origin: *` was enabled so that local Vite dev servers, mobile WebViews, and preview deployments could communicate with the backend without domain friction.
- **The Security Risk**: An unauthenticated proxy combined with wildcard CORS allows any third-party website on the internet to execute cross-origin JavaScript that routes arbitrary traffic through your server.
- **Production Solution**: Restrict `Access-Control-Allow-Origin` strictly to your verified frontend domain origins, and require authentication tokens on proxy endpoints.

### 5. Lack of Proxy Rate-Limiting
- **The Prototype Hack**: Rate-limit handling was only implemented for upstream 429 responses (e.g. AniList API backoff), but no client-side rate-limiting middleware (such as `express-rate-limit`) was attached to the proxy endpoints.
- **The Security Risk**: High-resource endpoints like `/api/m3u8-proxy` and `/api/ts-proxy` could be overwhelmed by repetitive automated requests, leading to server CPU and bandwidth exhaustion.
- **Production Solution**: Implement token-bucket or sliding-window rate limiting keyed by client IP or session tokens.

## License & Disclaimer

- **License**: This project is open-source under the [MIT License](LICENSE)—completely free to use, modify, fork, or replicate.
- **Disclaimer**: The software is provided "as is", without warranty of any kind. No media files or copyrighted streams are hosted on this repository. The project is permanently discontinued and no longer maintained.
