# Entertainment Aggregator (EetNet / AniStream)

> **Note**: This is an archived post-mortem and educational write-up of a personal project I built and subsequently discontinued. No active services are running, and no copyrighted media is hosted here.

---

## Why I Built This (and Why I Stopped)

A while back, I set out to build a unified Netflix-style media aggregator that brought together anime, webtoons/manga, Asian dramas, and movies under one clean, ad-free interface. Rather than relying on standard third-party embed iframes (which are filled with popups, redirects, and tracking scripts), I wanted to see if I could reverse-engineer the underlying APIs and stream extraction logic directly.

Over the course of several months, I reverse-engineered multiple streaming and reading platforms:
- **Anime**: Reverse-engineered internal REST endpoints to extract direct HLS streams, cataloging 477 Hindi-dubbed anime titles mapped to AniList IDs.
- **Asian Dramas (KissKH)**: Extracted encrypted stream manifests, hooked them into a decryption pipeline, and dynamically converted raw SRT subtitles to WebVTT.
- **Comics & Webtoons**: Aggregated releases from ComicK, AsuraToon, TempleScan, and HiveToon, building an image proxy to handle CDN referer protection and rate limits.
- **Movies**: Unpacked obfuscated JavaScript payloads from WordPress-based streaming platforms (Toroflix themes) using an isolated Node.js VM context to grab raw stream manifests.

### Why I Discontinued It
As the project evolved, maintaining scrapers against constantly changing anti-bot protections became a cat-and-mouse game. More importantly, I decided that I didn't want to run or maintain a piracy-adjacent platform. 

I decided to clean up and archive the codebase here on GitHub as an engineering showcase to document what I learned about network reverse engineering, anti-bot mitigation, HLS stream delivery, and unconventional infrastructure.

---

## The Problem: Cloudflare vs. Datacenter IPs

The biggest technical challenge I faced was that virtually every target platform sits behind Cloudflare WAF or similar bot protection. 

When I initially deployed my backend scrapers to standard cloud providers (Vercel serverless functions, Railway, AWS), every request was immediately flagged and blocked with HTTP 403 Forbidden. Cloudflare maintains a reputation database of all major cloud and hosting provider IP ranges.

### My Workaround: An Android Phone as a Micro-Server

To bypass this without paying for expensive residential proxy networks, I repurposed a spare Android phone:

```
[ User Browser ]
       |
       |  HTTPS (Vite / React Frontend on Vercel)
       v
[ Cloudflare Tunnel / ngrok ]
       |
       v
[ Spare Android Phone running Termux ]
  - Node.js API Gateway (port 8080)
  - Scrapers & HLS segment proxy (/api/m3u8-proxy, /api/ts-proxy)
  - Residential mobile carrier / home ISP IP
```

1. Installed **Termux** on an Android phone.
2. Ran the Node.js scraping services locally on the device.
3. Used `termux-wake-lock` so Android wouldn't kill the background process when the screen turned off.
4. Exposed the local port to the internet using a free Cloudflare Tunnel.

Because the phone connected through a residential broadband connection or 4G/5G mobile carrier (CGNAT), requests appeared completely legitimate to Cloudflare's WAF and passed through without getting challenged.

---

## What I Reverse-Engineered

### 1. Anime & Regional Dub Catalog
Mainstream anime databases (AniList, MyAnimeList) do a great job tracking Japanese and English releases, but have almost zero tracking for regional Indian dubs (Hindi, Tamil, Telugu).
- I analyzed network calls from AnimeRulz / StreamIndia and found their internal REST APIs across subdomains like `data.streamindia.co.in`.
- I built a cataloging pipeline that mapped **477 Hindi-dubbed anime series** directly to their canonical AniList metadata IDs.
- Extracted multi-audio HLS streams and proxied M3U8 playlists through my server to eliminate CORS blocks and hotlink restrictions.

### 2. Korean & Asian Dramas (KissKH)
KissKH operates as a single-page app talking to an ASP.NET Core backend.
- The stream endpoint (`/api/DramaList/Episode/{id}`) didn't return direct video links; it returned an encrypted payload string.
- I routed these payloads through an AES decryption resolver to retrieve the underlying master `.m3u8` playlist.
- Wrote an on-the-fly subtitle transformer that fetches raw `.srt` files, converts commas to periods in timestamps, formats them as standard WebVTT, and injects permissive CORS headers so browser `<track>` tags render them cleanly.

### 3. Comics, Manhwa & Webtoons
Combining four different sources (ComicK, AsuraToon, TempleScan, HiveToon) required handling two different architectures:
- **API-based (ComicK)**: Extracted chapter hashes and loaded high-res images from their B2-backed CDN.
- **HTML-based (AsuraToon, HiveToon)**: Scraped chapter viewer DOMs with Cheerio, recursively resolving lazy-loaded image attributes (`data-src`, `data-lazy-src`).
- Built an image proxy (`/api/manga/image-proxy`) with spoofed `Referer` headers to bypass hotlink blocking and exponential backoff retry logic to handle rate-limiting.

### 4. Movies & Obfuscated JS Unpacking
The movie sources used custom WordPress themes that packed video player URLs into heavily obfuscated `eval(function(p,a,c,k,e,d)...)` scripts to hide iframe destinations.
- Rather than running a heavy headless browser like Puppeteer (which was too slow and memory-intensive for an Android phone), I built a lightweight unpacker using Node's built-in `vm` module.
- It evaluates the deobfuscated payload in a secure, sandboxed context in ~10 milliseconds to extract the real stream URLs.

---

## Project Structure

```
.
├── android-worker/         # Termux startup script, guide, and Python proxy relay
├── docs/                   # Architecture notes, headless browser benchmarks
├── research/               # Technical breakdown notes for each reversed platform
│   ├── animerulz_analysis.md
│   ├── comics_analysis.md
│   ├── desicinemas_analysis.md
│   ├── kisskh_analysis.md
│   └── netmirror_analysis.md
├── services/               # Microservice backends (Node.js + Express)
│   ├── anime/              # AnimeRulz & HiAnime stream resolver
│   ├── comics/             # Manga & webtoon scrapers + image proxy
│   ├── drama/              # KissKH API client + stream decryptor
│   └── movies/             # Movie scraper + JS unpacker
├── src/                    # React 19 + Vite frontend
│   ├── components/         # Reusable UI components & custom video player
│   ├── features/           # Modular view logic (anime, drama, manga, movies)
│   └── pages/              # Main route layouts
├── server.js               # Root API server aggregating all services
└── package.json
```

---

## Important: Why Cloning This Won't Give You a Working Site

If you clone this repo expecting a plug-and-play streaming site, it will not work out of the box:
1. **Dynamic Upstream Targets**: Scraped endpoints and CDNs change their domain names, obfuscation routines, and security tokens regularly.
2. **Missing Infrastructure**: This repo contains the application code, but not the physical Android relay or active Cloudflare Tunnels that were required to bypass IP blocks.
3. **No Secrets Included**: All API keys, tokens, and database credentials have been stripped.

This repository is published as a technical reference and portfolio project showcasing full-stack JavaScript, web scraping, API design, and network reverse engineering.

---

## Tech Stack

- **Frontend**: React 19, Vite, Tailwind CSS, Zustand, HLS.js
- **Backend**: Node.js, Express, Cheerio, Axios
- **Mobile Infrastructure**: Android (Termux), Cloudflare Tunnel
- **Authentication & Database**: Supabase (history and watchlist sync)
- **Metadata**: TMDB API, AniList GraphQL

---

## Legal & Compliance

This repository is shared strictly for educational and portfolio demonstration purposes:
- No media files, video streams, or copyrighted assets are hosted in this repository.
- The project has been permanently discontinued.
- If you are a copyright owner with inquiries or concerns, please open an issue and I will promptly comply with any takedown requests.
