# Android Termux Worker Setup Guide

## Overview

Traditional cloud hosting platforms (AWS, Vercel Serverless, DigitalOcean, Heroku, Railway) are automatically detected and blocked by Cloudflare WAF and anti-bot systems protecting piracy streaming CDNs.

The **Android Worker** architecture turns a consumer Android smartphone into a micro-server. Because mobile networks utilize Carrier-Grade NAT (CGNAT) where consumer phones share IP pools with thousands of active cellular subscribers, Cloudflare rarely flags or blacklists mobile ISP IPs.

---

## Requirements

1. **Hardware**: Any Android phone running Android 8.0 or newer (2GB+ RAM recommended).
2. **Software**: [Termux](https://github.com/termux/termux-app/releases) installed from F-Droid (do NOT use the outdated Google Play Store version).
3. **Network**: WiFi or mobile cellular connection.
4. **Power**: Keep the device plugged into a charger with battery optimization disabled for Termux.

---

## Step-by-Step Installation

### 1. Install Packages
Open Termux on your phone and run:
```bash
pkg update -y && pkg upgrade -y
pkg install -y nodejs-lts python git tmux cloudflared termux-tools
```

### 2. Acquire Wake Lock
Android OS aggressively kills background processes when the screen turns off. Prevent this by running:
```bash
termux-wake-lock
```
Also go to your phone's Android Settings -> Apps -> Termux -> Battery -> Set to **Unrestricted**.

### 3. Deploy the Code
Clone or copy the EetNet-AniStream repository to your phone:
```bash
cd ~
git clone https://github.com/YOUR_USERNAME/EetNet-AniStream.git
cd EetNet-AniStream
npm install --omit=dev
```

### 4. Configure Environment
```bash
cp .env.example .env
```
Edit `.env` if you need custom ports or CORS rules (default port is `8080`).

### 5. Start the Server inside Tmux
Run the server in a persistent terminal multiplexer so it survives closing the Termux app:
```bash
tmux new -s anistream
node server.js
```
(Detach anytime with `Ctrl+B` then `D`. Re-attach with `tmux attach -t anistream`).

---

## Exposing to the Internet (Cloudflare Tunnel)

To connect your Vercel-hosted frontend to your phone's backend, expose port 8080 using a free Cloudflare Quick Tunnel:

```bash
cloudflared tunnel --url http://localhost:8080
```

Cloudflare will output a public HTTPS URL like:
```
https://random-assigned-name.trycloudflare.com
```

Copy this URL and set it as your `VITE_API_BASE` environment variable in your Vercel deployment settings.

---

## Troubleshooting & Best Practices

- **Thermal Throttling**: Keep the phone out of direct sunlight and remove thick protective cases during prolonged multi-day operation.
- **Dynamic IP Changes**: If the phone switches from WiFi to LTE, the connection to Cloudflare Tunnel will automatically reconnect without needing a server restart.
- **Memory Footprint**: Node.js microservice memory consumption averages 80MB-140MB RAM, allowing it to run smoothly even on entry-level Android devices.
