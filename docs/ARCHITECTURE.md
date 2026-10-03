# Architecture & Engineering History

## Executive Summary

EetNet is a Netflix-style content aggregator built around a key constraint: all major third-party streaming sources block cloud/datacenter IPs via Cloudflare WAF. The solution was to use a spare Android phone running Termux as a residential-IP relay backend, exposed to the internet via a Cloudflare Tunnel.

---

## The Core Problem: Residential IP Requirement

Every source (KissKH, DesiCinemas, AnimeRulz, Comick) uses Cloudflare or similar WAF systems configured to challenge or outright block requests from:
- AWS, GCP, Azure IP ranges
- Railway, Render, Fly.io datacenter IPs
- Any IP flagged in datacenter reputation databases

A mobile phone on a home carrier (residential IP) bypasses all of this entirely because it appears indistinguishable from a normal user browser.

---

## History of Failed Approaches

### Approach 1: Direct Server-Side Regex Scraping
- Fetched provider embed HTML from a cloud server and parsed stream URLs via regex
- Failed: Modern providers no longer put plain video URLs in HTML. They use obfuscated JavaScript packed with eval(), dynamic token compilation, and math obfuscation.

### Approach 2: Node.js vm Context Emulation
- Ran packed JS blocks inside Node.js vm.createContext() to extract stream URLs
- Failed: Scripts check for DOM environments (window.location, jQuery $, cRAds). Missing browser APIs caused silent failures. CDN WAFs also blocked server requests when TLS/UA fingerprints differed from a real browser.

### Approach 3: Client-Direct HLS Playback
- Backend returned raw CDN URLs directly to HLS.js in the browser
- Failed: Blocked by browser CORS policy (no Access-Control-Allow-Origin on video CDNs). CDN tokens were also bound to specific client IPs.

### Approach 4: Full Application-Level Reverse Proxy
- Proxied HTML, CSS, JS, XHR, and WebSockets so the provider app ran under our domain
- Failed: Hostile JS continuously detects origin mismatches via window.location checks, anti-tamper scripts, dynamic URL concatenation, and ad-integrity checks. Rewriting dynamic JS in real-time was not sustainable.

### Root Lesson
Trying to fake a browser in Node.js or trying to rewrite a hostile provider's web application inside our own origin both fail. A genuine browser environment or a residential-IP plain HTTP relay is required.

---

## Final Architecture: Residential Phone Relay

### System Components

**Frontend (Vercel CDN)**
- React 19 + Vite 8 SPA
- Deployed at eetnet.ooguy.com
- Talks to the backend via VITE_API_BASE env var

**Backend (Android Phone, Termux)**
- node server.js on port 8080
- Exposed to internet via Cloudflare Tunnel (permanent HTTPS URL)
- Aggregates all four source categories in one Express server

**Optional KissKH Relay**
- proxy.py on port 9090
- Forwards requests to kisskh.co from the phone residential IP
- Only needed if KissKH starts blocking the phone IP directly

### Request Flow

    User clicks Play on the frontend
           |
           v
    Vercel frontend calls /api/{category}/{action}
           |
           v
    Cloudflare Tunnel routes to phone (port 8080)
           |
           v
    node server.js scrapes / calls upstream source
    from the phone residential IP (not blocked)
           |
           v
    Extracts metadata or stream URL
           |
           v (for video streams)
    Returns proxied HLS URL through /api/m3u8-proxy
           |
           v
    HLS.js in browser plays video natively

---

## The HLS Proxy Layer

Direct CDN URLs from providers cannot be used in the browser because:
1. CDN servers do not send CORS headers
2. Tokens are often IP-bound to the phone that fetched them

Solution: all .m3u8 playlists and .ts segments are rewritten to point at the backend proxy:

    /api/m3u8-proxy?url={encoded_cdn_url}
    /api/ts-proxy?url={encoded_cdn_url}

This means:
- The browser only ever talks to our own backend URL (CORS solved)
- The backend fetches segments from the CDN using the phone IP (IP binding solved)
- The tunnel provides HTTPS (mixed-content solved)

---

## Android Phone Infrastructure

Hardware: Samsung Galaxy (Exynos 7885 / Snapdragon equivalent)
Software: Android 9+, Termux from F-Droid, Node.js 18 via pkg

Key operational details:
- termux-wake-lock prevents Android Doze from killing the Node process
- Cloudflare Tunnel (cloudflared) provides a permanent stable HTTPS hostname
- Screen can remain off 24/7 (Node.js runs headless)
- Daily active work time: approximately 3-5 minutes of actual CPU load for 24h of serving

---

## Headless Browser Worker Pattern (Researched, Not Fully Deployed)

For providers using JavaScript that cannot be run in a vm sandbox (e.g., MoviePlex / LuluStream with Cloudflare Turnstile), a headless Chromium worker was researched:

    Vercel backend dispatches task to phone worker
           |
           v
    Headless Chromium (Puppeteer in Termux) navigates to provider embed
           |
           v
    Provider JS runs natively in real Chromium (undetectable)
           |
           v
    Worker intercepts outbound network requests matching *.m3u8
           |
           v
    Captures signed URL, closes tab, returns URL to backend
           |
           v
    Backend caches URL for ~8 hours, pipes through m3u8-proxy

This pattern was documented but not fully deployed due to Termux ARM64 Chromium stability requirements.
