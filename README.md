# Entertainment Aggregator (EetNet / AniStream)

> **Note**: This is an archived personal project that I built and discontinued. It is shared here for educational purposes. No live services are hosted, and no media files are stored on this repository.

---

## What It Is

A personal unified media aggregator combining anime, Asian dramas, webtoons/manga, and movies under one clean, ad-free Netflix-style web app. 

### Content Sources:
- **Anime**: Powered from Animerulz, AnimedubHindi, Animedekho, Animesalt and Animeworld India (with special focus on regional Hindi dubbed releases).
- **Asian Dramas**: Powered solely from Kisskh.
- **Comics & Webtoons**: Powered from ComicK, AsuraToon, TempleScan, and HiveToon.
- **Movies**: Powered from Netmirror, DesiCinemas and MoviePlex.

---

## How It Works

The system is split into two layers:

```
[ User's Browser ]
       |
       |  HTTPS API requests
       v
[ Cloudflare Tunnel / ngrok ]
       |
       v
[ Android Phone running Termux ]
  - Node.js API server (port 8080)
  - Content scrapers & stream extractors
  - HLS & image proxy (/api/m3u8-proxy, /api/ts-proxy, /api/img-proxy)
```

1. **Frontend (React 19 + Vite)**: A responsive client built with Tailwind CSS, Zustand, and HLS.js. It talks directly to the backend API to search, browse catalogs, and play streams without iframe popups or redirects.
2. **Backend API Gateway (Node.js + Express)**: Fetches data from the upstream providers, normalizes metadata against TMDB and AniList, and extracts raw video stream URLs (.m3u8 playlists) and comic page images.
3. **Stream & Image Proxy**: Upstream video and image CDNs reject requests that don't come from their own websites (via CORS and `Referer` headers). The backend rewrites M3U8 playlists and proxies image requests on the fly so the frontend player can load them seamlessly.

---

## How to Replicate It (The Phone Setup, Problems & Solutions)

If you want to run or replicate this setup, you cannot just deploy the backend to a standard cloud provider (like AWS, Vercel Serverless, Heroku, or Railway). Here is why, and how to set it up properly.

### The Big Problem: Cloudflare IP Bans
Almost all third-party media sources sit behind Cloudflare. Cloudflare automatically flags and blocks requests coming from commercial datacenters (AWS, DigitalOcean, Google Cloud) with `403 Forbidden`.

### The Solution: A Spare Android Phone as a Residential Relay
By running the backend server on an Android phone connected to your home Wi-Fi or mobile cellular network (4G/5G), your requests come from a **residential IP / mobile CGNAT pool**. Cloudflare does not block these residential IP ranges.

---

### Step-by-Step Replication Guide

#### 1. Setup the Phone (Termux)
1. Install **[Termux](https://github.com/termux/termux-app/releases)** from F-Droid (do not use the Google Play version, it is outdated).
2. Open Termux and install the required tools:
   ```bash
   pkg update -y && pkg upgrade -y
   pkg install -y nodejs-lts git tmux cloudflared termux-tools
   ```

#### 2. Prevent Android from Killing the Process (Wake Lock)
Android's aggressive battery optimizer will kill Termux as soon as you turn the screen off.
- In Termux, run:
  ```bash
  termux-wake-lock
  ```
- On your phone, go to **Settings -> Apps -> Termux -> Battery** and set it to **Unrestricted**.

#### 3. Clone and Start the Server
```bash
git clone https://github.com/nabinnnnwongism/Entertainment-aggregator.git
cd Entertainment-aggregator
npm install --omit=dev
cp .env.example .env
```

Start the server inside a `tmux` session so it keeps running in the background:
```bash
tmux new -s anistream
node server.js
```
*(Detach anytime using `Ctrl + B` then `D`. Re-attach later with `tmux attach -t anistream`)*.

#### 4. Expose the Phone to the Internet
To let your frontend connect to the phone's backend without port-forwarding your home router, use a free Cloudflare Quick Tunnel:
```bash
cloudflared tunnel --url http://localhost:8080
```
Cloudflare will give you a public URL (e.g. `https://your-tunnel-name.trycloudflare.com`).

#### 5. Run the Frontend
On your computer (or deployed on Vercel):
1. In your frontend directory, create a `.env` file:
   ```env
   VITE_API_BASE=https://your-tunnel-name.trycloudflare.com
   ```
2. Run:
   ```bash
   npm install
   npm run dev
   ```

---

### Common Problems & How to Fix Them

| Problem | Cause | Solution |
|---|---|---|
| **Videos won't play / CORS error** | Upstream CDN blocks requests without their origin header | The backend routes all streams through `/api/m3u8-proxy` and `/api/ts-proxy` which injects permissive CORS headers and spoofs the upstream `Referer`. |
| **Images/covers show broken icons** | Image CDNs block hotlinking | The frontend routes comic and cover images through `/api/img-proxy`. |
| **Phone server stops after 10-20 minutes** | Android OS sleep / battery optimization | Run `termux-wake-lock` and keep the phone plugged into a charger. |
| **Tunnel disconnects on Wi-Fi drop** | Network fluctuation | If using mobile data or switching networks, run `cloudflared` inside a loop or systemd/tmux script so it auto-reconnects. |
| **Stream links stop working after a while** | Upstream providers rotate domain names or update tokens | Upstream domains in `server.js` / `services/*` will need occasional updates to match whatever mirror the provider is currently using. |

---

## Project Structure

```
.
├── android-worker/         # Termux setup scripts and helper guides
├── docs/                   # System design and architecture notes
├── research/               # Technical breakdown notes for each provider
├── services/               # Microservices
│   ├── anime/              # Anime scrapers (Animerulz & others)
│   ├── comics/             # ComicK, AsuraToon, TempleScan, HiveToon
│   ├── drama/              # KissKH resolver
│   └── movies/             # Netmirror, DesiCinemas, MoviePlex
├── src/                    # React 19 + Vite frontend
├── server.js               # Main aggregator server
└── package.json
```

---

## Tech Stack

- **Frontend**: React 19, Vite, Tailwind CSS, Zustand, HLS.js
- **Backend**: Node.js, Express, Cheerio, Axios
- **Mobile Runtime**: Android (Termux), Cloudflare Tunnel
- **Metadata**: TMDB API, AniList GraphQL

---

## Disclaimer

This repository is shared strictly for educational purposes and personal portfolio demonstration. No copyrighted video files or media streams are hosted on this repository.
