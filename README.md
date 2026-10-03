# Entertainment Aggregator (Archive)

> **Status: Discontinued / Archived**  
> This repository is a code archive of a personal full-stack project I built and have since discontinued. It is preserved here as a portfolio project. No live services are running, and no media files are hosted here.

---

## Overview

A unified full-stack media aggregator web application designed to bring together Anime, Asian Dramas, Comics/Manga, and Movies into a single clean, ad-free, Netflix-style interface.

### Content Sections & Sources

- **Anime**: Aggregated from AnimeRulz, AnimedubHindi, Animedekho, Animesalt, and Animeworld India (including a curated index of 477 Hindi-dubbed anime series mapped to AniList).
- **Asian Dramas**: Aggregated from KissKH (K-Dramas, C-Dramas, J-Dramas with multi-language subtitles).
- **Comics & Webtoons**: Aggregated from ComicK, AsuraToon, TempleScan, and HiveToon with an interactive vertical webtoon/manga reader.
- **Movies**: Aggregated from NetMirror, DesiCinemas, and MoviePlex with TMDB metadata integration.

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
├── services/               # Backend microservices
│   ├── anime/              # Anime scrapers & stream resolvers
│   ├── comics/             # Manga & webtoon scrapers + image proxy
│   ├── drama/              # Asian drama API & subtitle converter
│   └── movies/             # Movie scrapers & stream extractors
├── src/                    # React + Vite frontend application
│   ├── components/         # Reusable UI components & custom video player
│   ├── features/           # Category views (anime, drama, manga, movies)
│   └── pages/              # Main route views & layouts
├── docs/                   # Architecture and technical design notes
├── research/               # Technical notes and source API documentation
├── server.js               # Root API server aggregating all services
└── package.json
```

---

## License & Disclaimer

This project was built strictly for personal learning and exploration. It is now discontinued and no longer maintained.
