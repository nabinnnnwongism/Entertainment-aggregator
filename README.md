# EetNet — AniStream Aggregator

> **WARNING: EDUCATIONAL PURPOSE ONLY — READ BEFORE PROCEEDING**

---

## What This Is

**EetNet / AniStream** was a personal research project to build a Netflix-style streaming aggregator that pulled content from multiple third-party sources across four categories:

| Category | Sources Reverse-Engineered |
|---|---|
| Anime (Hindi Dub) | AnimeRulz / StreamIndia — 477 Hindi dubbed animes indexed |
| Comics and Manhwa | Comick.fun, AsuraToon, TempleScan, HiveToon |
| South Asian Movies | DesiCinemas.pk + 3 Bollywood/Hollywood Hindi dub providers |
| Korean and Asian Dramas | KissKH |

The frontend was a full React + Vite app deployed on Vercel. The backend ran on a **real Android phone via Termux** — acting as a residential-IP relay, because these sources block cloud/datacenter IPs entirely.

**This repository is an archive of that engineering work, preserved as a case study.**

---

## Reproducibility Limitations

This repository does not contain all infrastructure used by the original project. Several upstream sources employed dynamic anti-bot systems, session-dependent behavior, IP-restricted access controls, and obfuscated JavaScript that changed over time. Consequently, cloning this repository does not reproduce the original aggregator.

To even attempt replication you would need:
- A spare Android phone running Termux 24/7 (residential-IP relay)
- A Cloudflare Tunnel or ngrok tunnel configured on that phone
- Your own TMDB and Supabase API keys
- The upstream sources to still be accessible and unchanged

This complexity is intentional. The project exists to document the engineering patterns, not to be a turnkey tool.

**The project should be treated as an engineering case study, not a deployment guide.**

---

## Legal and Ethical Disclaimer

This project was built strictly for personal educational research:

- All content displayed by the original aggregator was hosted on third-party servers. This project never stored, re-encoded, or redistributed any media files.
- The reverse engineering was performed to understand web security, anti-bot systems, and streaming infrastructure — not for commercial gain.
- The project has been discontinued. No live version exists.
- If you are a rights holder and have concerns, please open an Issue. The author will comply with any valid DMCA takedown requests.

---

## System Architecture

The system used a three-layer architecture:

    [User Browser]
    React + Vite frontend hosted on Vercel
           |
           | HTTPS API calls
           v
    [Android Phone running Termux]
    node server.js (port 8080) exposed via Cloudflare Tunnel
      - /api/anime/*    AnimeRulz scraper
      - /api/comics/*   Comick, Asura, Temple scrapers
      - /api/drama/*    KissKH relay and stream decryptor
      - /api/movies/*   DesiCinemas scraper and HLS extractor
    proxy.py (port 9090) optional KissKH residential relay

**Why a phone?** Cloud datacenter IPs are blocked by all major sources via Cloudflare and IP reputation databases. A residential mobile IP bypasses this. The phone runs Termux (a Linux environment for Android) with Node.js installed.

---

## Repository Structure

    EetNet-AniStream/
    |
    +-- README.md                    You are here
    +-- .env.example                 Env variable template (no secrets)
    +-- .gitignore
    |
    +-- docs/                        Architecture and engineering notes
    |   +-- ARCHITECTURE.md          Full system design and history of failed approaches
    |   +-- MOVIES_SECTION.md        DesiCinemas stream extraction deep-dive
    |   +-- FRONTEND_BLUEPRINT.md    UI/UX design research and tech stack notes
    |   +-- ANDROID_WORKER.md        Termux phone relay setup guide
    |
    +-- research/                    Per-source reverse engineering reports
    |   +-- desicinemas_analysis.md  DesiCinemas.pk full technical breakdown
    |   +-- animerulz_analysis.md    AnimeRulz / StreamIndia API mapping
    |   +-- kisskh_analysis.md       KissKH stream extraction and relay design
    |   +-- comics_analysis.md       Comick, AsuraToon, TempleScan, HiveToon
    |
    +-- services/                    Backend microservice source code
    |   +-- anime/server.js          Anime scraper (AnimeRulz)
    |   +-- comics/server.js         Comics aggregator (multi-source)
    |   +-- drama/server.js          Korean drama scraper (KissKH)
    |   +-- movies/server.js         Movies scraper and HLS stream extractor
    |
    +-- src/                         React + Vite frontend
    |   +-- components/              Reusable UI components
    |   +-- pages/                   Route-level pages
    |   +-- utils/                   Helpers (session restore, watch progress)
    |   +-- shared/api/              Frontend API client layer
    |
    +-- android-worker/
        +-- setup.sh                 Termux bootstrap script
        +-- SETUP_GUIDE.md           Step-by-step phone relay guide

---

## What Makes This Technically Interesting

### The Residential-IP Problem
Every major source uses Cloudflare WAF that blocks datacenter IPs by default. The entire architecture was designed around this — the Android phone acts as a residential endpoint that automated cloud blocking cannot easily target.

### Four Completely Different Extraction Strategies

| Source | Method Used |
|---|---|
| AnimeRulz | Undocumented internal REST API discovered via browser network traffic analysis |
| Comick / AsuraToon / TempleScan | DOM scraping with lazy-loaded image chain resolution |
| KissKH | Encrypted video manifest with a reverse-engineered decryption key service |
| DesiCinemas | WordPress Toroflix theme with obfuscated packed JS unpacked in Node.js vm sandbox |

### Custom HLS Stream Proxy
A /api/m3u8-proxy and /api/ts-proxy rewrites all HLS playlist segments so the browser never makes direct CDN requests — solving CORS and mixed-content issues while keeping streams working behind an HTTPS tunnel.

### Android as Production Infrastructure
Running a Node.js API server on a consumer Android phone via Termux demonstrates that powerful infrastructure can run on commodity hardware with zero hosting cost.

### Failed Approaches (Also Documented)
Four previous architectures were tried and failed before arriving at the final design:
1. Direct server-side regex scraping — providers moved to obfuscated JS
2. Node.js vm context emulation — DOM environment checks failed silently
3. Client-direct HLS playback — blocked by CDN CORS policy
4. Full application-level reverse proxying — hostile JS detected origin mismatches

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + Vite 8 |
| Video Playback | HLS.js (custom player, no iframe ads) |
| Styling | Tailwind CSS + custom CSS tokens |
| State Management | Zustand |
| Backend | Node.js 18 + Express 5 |
| Scraping | Axios + Cheerio |
| Android Runtime | Termux + Node.js |
| Tunnel | Cloudflare Tunnel or ngrok |
| Database and Auth | Supabase (optional) |
| Metadata | TMDB API |
| Frontend Deployment | Vercel |
| Mobile App | Capacitor.js to Android APK |

---

## Environment Variables

See .env.example for the full template. You must supply your own keys:
- VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from supabase.com
- TMDB_API_KEY from themoviedb.org
- An ngrok auth token or Cloudflare Tunnel token for the phone backend

The .env file is gitignored and is never committed to this repository.

---

## Partial Local Setup (Frontend Only)

The frontend UI can run locally in a limited demo mode:

    git clone https://github.com/YOUR_USERNAME/EetNet-AniStream.git
    cd EetNet-AniStream
    npm install
    cp .env.example .env
    npm run dev

Most API calls will fail without the phone backend running. The UI structure, components, animations, and design system will still be visible.

---

## Author

Built entirely solo as a personal engineering exploration project, 2026.

Skills demonstrated through this project:
- Web scraping and DOM parsing at scale
- API reverse engineering and network traffic analysis
- Anti-bot and Cloudflare bypass techniques via residential proxy pattern
- Full-stack web development using React, Vite, Node.js, and Express
- Android and Termux infrastructure management
- HLS streaming, M3U8 proxying, and obfuscated JS unpacking via vm sandbox
- Mobile app packaging using Capacitor.js to Android APK

---

This repository is archived. No new features will be added. Built for learning, kept for the portfolio.
