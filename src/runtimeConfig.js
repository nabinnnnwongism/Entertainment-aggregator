/**
 * Runtime Config — NO localStorage, NO stale URL issues.
 *
 * Priority (highest → lowest):
 *   1. ?apiBase= query param  (emergency override, session only)
 *   2. /api/runtime-config    (Vercel serverless, always fresh, reads API_BASE env var)
 *   3. /eetnet-config.json    (static fallback with CDN-cache-busted URL)
 *   4. VITE_API_BASE          (build-time env, stripped on Vercel prod if it's localhost)
 *   5. localhost:8080         (local dev auto-detect)
 *
 * To update the tunnel URL for ALL users instantly:
 *   → Set API_BASE env var on Vercel dashboard (no redeploy needed after env var is set)
 *   OR → Update public/eetnet-config.json and git push (redeploy needed)
 */

function cleanApiBase(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.replace(/\/+$/, '');
}

function getLocalDevBase() {
  if (typeof window === 'undefined') return '';
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') {
    return `${window.location.protocol}//${host}:8080`;
  }
  return '';
}

function isLocalhostUrl(url) {
  if (!url) return false;
  return url.includes('localhost') || url.includes('127.0.0.1');
}

/** Read ?apiBase= from URL, write to window.__EETNET_CONFIG__ only (no localStorage). */
function readQueryOverride() {
  if (typeof window === 'undefined') return '';
  const url = new URL(window.location.href);
  const value = cleanApiBase(url.searchParams.get('apiBase'));
  if (!value) return '';

  // Strip the query param from the URL bar cleanly
  url.searchParams.delete('apiBase');
  window.history.replaceState({}, '', url.toString());

  console.log('[Config] ?apiBase= override applied:', value);
  return value;
}

const FALLBACK_TUNNEL = 'https://nylon-overhead-sodium-warm.trycloudflare.com';

async function fetchJson(url) {
  const isNativeCapacitor = typeof window !== 'undefined' && Boolean(window.Capacitor?.isNativePlatform?.());
  try {
    let response;
    if (isNativeCapacitor) {
      // In native Android WebView, fetch local files cleanly without cache-busting headers
      response = await fetch(url);
    } else {
      const bustUrl = url.includes('?') ? `${url}&_t=${Date.now()}` : `${url}?_t=${Date.now()}`;
      response = await fetch(bustUrl, { cache: 'no-store' });
    }
    if (!response.ok) return {};
    return await response.json();
  } catch (e) {
    console.warn('[Config] fetchJson failed for', url, e.message);
    return {};
  }
}

function pickApiBase(config) {
  return cleanApiBase(
    config?.API_BASE ||
    config?.apiBase ||
    config?.VITE_API_BASE ||
    ''
  );
}

export async function loadRuntimeConfig() {
  const queryOverride = readQueryOverride();

  // /api/runtime-config is a Vercel serverless function — never CDN-cached, always fresh.
  const runtimeEndpoint = await fetchJson('/api/runtime-config');

  // /eetnet-config.json is a static fallback.
  const staticConfig = await fetchJson('/eetnet-config.json');

  let envBase = cleanApiBase(import.meta.env.VITE_API_BASE);
  // Strip localhost values on Vercel production — they're dev artifacts
  if (typeof window !== 'undefined' && window.location.hostname.includes('vercel.app')) {
    if (isLocalhostUrl(envBase)) envBase = '';
  }

  let configBase =
    pickApiBase(runtimeEndpoint) ||  // /api/runtime-config (reads Vercel env vars)
    envBase ||                       // VITE_API_BASE baked at build time
    pickApiBase(staticConfig);       // /eetnet-config.json (static fallback, lowest priority)

  const isNativeCapacitor = typeof window !== 'undefined' && Boolean(window.Capacitor?.isNativePlatform?.());

  // On localhost dev in PC browser (not Capacitor APK), ignore trycloudflare URLs
  if (typeof window !== 'undefined' && !isNativeCapacitor && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    if (configBase.includes('trycloudflare.com')) {
      configBase = '';
    }
  }

  // Inside Capacitor APK, if configBase is empty, default to fallback tunnel
  if (isNativeCapacitor && !configBase) {
    configBase = FALLBACK_TUNNEL;
  }

  const apiBase =
    queryOverride ||
    configBase ||
    (isNativeCapacitor ? FALLBACK_TUNNEL : getLocalDevBase());

  window.__EETNET_CONFIG__ = { API_BASE: cleanApiBase(apiBase) };

  if (apiBase) {
    console.log('[Config] API_BASE resolved to:', cleanApiBase(apiBase));
  } else {
    console.warn('[Config] No API_BASE found — API calls will use relative paths.');
  }

  return window.__EETNET_CONFIG__;
}

export function getApiBase() {
  // Always read from window.__EETNET_CONFIG__ which is set by loadRuntimeConfig().
  // main.jsx awaits loadRuntimeConfig() before mounting the app, so this is always ready.
  const base = cleanApiBase(window.__EETNET_CONFIG__?.API_BASE);

  // Safety net for synchronous callers before app mounts (shouldn't normally happen)
  if (!base) {
    let envBase = cleanApiBase(import.meta.env.VITE_API_BASE);
    if (typeof window !== 'undefined' && window.location.hostname.includes('vercel.app')) {
      if (isLocalhostUrl(envBase)) envBase = '';
    }
    return envBase || getLocalDevBase();
  }

  return base;
}

export function apiUrl(path) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const base = getApiBase();
  return base ? `${base}${normalizedPath}` : normalizedPath;
}

export function getBackendConfigError() {
  // On Vercel, relative /api paths hit Vercel Serverless Functions — empty API_BASE is fine.
  if (typeof window !== 'undefined' && window.location.hostname.includes('vercel.app')) {
    return '';
  }
  if (getApiBase()) return '';
  return '';
}
