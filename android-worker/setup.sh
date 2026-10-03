#!/usr/bin/env bash
# ==============================================================================
# EetNet / AniStream - Termux Android Worker Setup Script
# ==============================================================================
# Turns an Android device into a 24/7 residential relay node.
# ==============================================================================

set -e

echo "=== [1/5] Updating Termux packages ==="
pkg update -y && pkg upgrade -y

echo "=== [2/5] Installing core dependencies (Node.js, Python, Git, Tmux) ==="
pkg install -y nodejs-lts python git tmux cloudflared

echo "=== [3/5] Setting up wake lock to prevent battery saver sleep ==="
termux-wake-lock
echo "Wake lock acquired. Termux will continue running with screen off."

echo "=== [4/5] Installing Node dependencies ==="
cd ~/EetNet-AniStream
npm install --omit=dev

echo "=== [5/5] Launching background daemon in Tmux ==="
tmux new-session -d -s anistream 'node server.js'

echo "=============================================================================="
echo "EetNet Server is now running on http://localhost:8080"
echo "To attach to the session: tmux attach -t anistream"
echo "To expose to the public internet via Cloudflare Tunnel:"
echo "    cloudflared tunnel --url http://localhost:8080"
echo "=============================================================================="
