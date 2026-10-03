# Android Worker Setup Guide

## Overview

The entire backend runs on an Android phone via Termux. This is by design — residential IPs are required to access most upstream sources without being blocked by Cloudflare.

---

## Prerequisites

- Android phone (any modern phone works, even old ones)
- Termux installed from F-Droid (NOT Google Play — the Play version is outdated)
- A free Cloudflare account (for the tunnel)

---

## Step 1: Install Termux and Dependencies

Open Termux and run:

    pkg update && pkg upgrade -y
    pkg install nodejs python git -y
    termux-wake-lock

The termux-wake-lock command prevents Android from killing the Node.js process when the screen turns off.

---

## Step 2: Clone the Repository

    git clone https://github.com/YOUR_USERNAME/EetNet-AniStream.git
    cd EetNet-AniStream
    npm install
    cp .env.example .env
    nano .env

Fill in your own TMDB_API_KEY, Supabase credentials, and port settings.

---

## Step 3: Start the API Server

    node server.js

The server listens on port 8080 by default. You should see:

    AniStream backend listening on port 8080

---

## Step 4: Optional KissKH Relay

Only needed if KissKH blocks the phone IP directly:

    PROXY_PORT=9090 python proxy.py

This runs on a separate port (9090) and must NOT share port 8080 with the API server.

---

## Step 5: Expose with Cloudflare Tunnel

Install cloudflared:

    pkg install wget -y
    wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64 -O cloudflared
    chmod +x cloudflared
    ./cloudflared tunnel login

Create a named tunnel for a permanent URL:

    ./cloudflared tunnel create eetnet-worker
    ./cloudflared tunnel route dns eetnet-worker your-subdomain.yourdomain.com
    ./cloudflared tunnel run eetnet-worker

Or use a quick temporary tunnel (URL changes on restart):

    ./cloudflared tunnel --url http://localhost:8080

Copy the printed HTTPS URL and set it as VITE_API_BASE in your Vercel environment variables.

---

## Step 6: Keep It Running

Run sessions in the background using Termux multiple windows:
- Window 1: node server.js
- Window 2: cloudflared tunnel run eetnet-worker
- Window 3: python proxy.py (if needed)

For automatic restart after phone reboot, you can add start commands to ~/.bashrc or use a simple shell script.

---

## Troubleshooting

**Node process dies when screen turns off:**
Re-run termux-wake-lock, and go to Android Battery settings and set Termux to Unrestricted battery optimization.

**Cloudflare tunnel disconnects:**
The tunnel auto-reconnects. If it stops completely, restart cloudflared.

**Source returns 403 Forbidden:**
The phone IP may have been temporarily flagged. Wait a few hours or use a different network. Using mobile data (cellular) vs WiFi sometimes helps.

**KissKH drama shows no video:**
Start proxy.py and set KISSKH_BASE=http://localhost:9090 in .env, then restart server.js.
