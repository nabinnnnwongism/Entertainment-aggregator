# KissKH Reverse Engineering Analysis

## 1. Overview

KissKH (`kisskh.co`) is one of the most widely used platforms for streaming East Asian television dramas, including Korean (K-Drama), Chinese (C-Drama), Japanese (J-Drama), and Thai series.

This report outlines the reverse engineering of KissKH's API, the encrypted video manifest delivery pipeline, and the subtitle extraction mechanism.

---

## 2. API Endpoints Map

Unlike many sites that render server-side HTML, KissKH operates as a single-page application (SPA) querying an ASP.NET Core REST API:

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/DramaList/Show` | GET | Featured ongoing spotlight series |
| `/api/DramaList/MostView?ispc=false&c=2` | GET | Most viewed Korean dramas |
| `/api/DramaList/MostView?ispc=false&c=1` | GET | Most viewed Chinese dramas |
| `/api/DramaList/TopRating?ispc=false` | GET | Highest community-rated dramas |
| `/api/DramaList/LastUpdate?ispc=false` | GET | Latest release updates |
| `/api/Drama/Search?q={query}` | GET | Title search |
| `/api/DramaList/Info/{id}` | GET | Series metadata, synopsis, and episode list |
| `/api/DramaList/Episode/{episodeId}` | GET | Encrypted stream manifest token |
| `/api/Sub/{episodeId}` | GET | Subtitle track listings |

---

## 3. Video Manifest Encryption & The Decryption Service

When querying an episode stream via `/api/DramaList/Episode/{episodeId}`, KissKH does not return a plain video URL. Instead, it responds with an obfuscated JSON payload:

```json
{
  "Video": "U2FsdGVkX19v...",
  "type": "embed",
  "name": "K-Vid"
}
```

The `Video` string is an AES-encrypted cipher or custom tokenized payload that the browser-side JavaScript decrypts in memory before initializing the video element.

### Decryption Pipeline (`enc-dec.app`)
The client app integrates with the `enc-dec.app` resolver service:
1. The server receives the raw encrypted string from KissKH.
2. The payload is submitted to the resolver backend along with time-sensitive seed parameters.
3. The decrypted response yields the raw HLS playlist URL (`https://.../master.m3u8`).

---

## 4. Subtitle Synchronization & Format Conversion

KissKH provides multi-language subtitles (English, Spanish, Indonesian, Portuguese, Arabic, etc.), but frequently serves them in raw SubRip (`.srt`) format or non-CORS compliant `.vtt` endpoints.

To ensure native compatibility with standard HTML5 `<track>` elements across Chrome, Safari, and Firefox:
1. The `/api/drama/subtitle` endpoint retrieves the raw subtitle payload.
2. An on-the-fly regex parser transforms SRT timestamps (`00:01:23,456` with commas) into compliant WebVTT format (`00:01:23.456` with dots) and prepends the `WEBVTT` header.
3. The response is cached and returned with proper `Content-Type: text/vtt; charset=utf-8` and permissive CORS headers.

---

## 5. Network Evasion & Residential Proxy Relay (`proxy.py`)

KissKH employs aggressive Cloudflare protection on its API endpoints. When requests originate from known cloud datacenters (DigitalOcean, AWS, Heroku, Railway), Cloudflare serves an interactive challenge.

To mitigate this, EetNet developed a dual-path relay:
1. **Direct Mode (Termux)**: When deployed on an Android phone, Node.js calls KissKH directly; the mobile ISP IP address passes Cloudflare checks transparently.
2. **Relay Mode (`proxy.py`)**: A lightweight Python microservice using `requests` with realistic browser TLS fingerprints and header rotation, designed to run as a daemon on the phone on port `9090` if additional headers or cookies need injection.
