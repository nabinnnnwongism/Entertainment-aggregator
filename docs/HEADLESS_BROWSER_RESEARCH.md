================================================================================
  ARCHITECTURE & FEASIBILITY BRIEF: HEADLESS BROWSER WORKER PATTERN
  Project: EetNet / Project Anime (MoviePlex Provider Integration)
================================================================================

1. EXECUTIVE SUMMARY
--------------------------------------------------------------------------------
This document outlines the complete architectural design, history of failed 
approaches, technical rationale, and research validation tasks for integrating 
protected third-party video providers (e.g., MoviePlex / LuluStream / tnmr.org) 
into our custom video platform without relying on uncontrolled external ad-heavy 
iframes.

The chosen architecture is a **Decoupled Headless Browser Worker Pattern**
(codenamed "Alex -> Mike -> Machine -> Me").

Entities:
  - Me / Website: User-facing React/Vite frontend (hosted 24/7 on Vercel CDN).
  - Backend: Node.js/Express serverless API layer (hosted 24/7 on Vercel).
  - Mike (The Worker): Dedicated Android phone running Termux + Cloudflare Tunnel 24/7.
  - The Machine (Headless Browser): Real Chromium browser running inside Termux on Mike.
  - Alex: External video provider / host (e.g., bfmovies.online / tnmr.org).
  - Package: The decrypted, signed .m3u8 stream manifest URL + auth tokens.


2. CONTEXT & HISTORY: WHY PREVIOUS APPROACHES FAILED
--------------------------------------------------------------------------------
To understand why we arrived at this architecture, it is essential to review 
the 4 previous implementation attempts and why each hit a dead end:

APPROACH 1: Direct Server HTML Regex Scraping
  - Method: Server fetched the provider embed HTML and parsed stream links using regex.
  - Failure: Modern providers no longer place plain video URLs in HTML. They use 
    obfuscated JavaScript packed with eval(), dynamic token compilation, and math.

APPROACH 2: Server-Side JS Context Emulation (node:vm / vm.createContext)
  - Method: Backend ran packed JS blocks inside Node.js's vm module.
  - Failure: Hostile scripts check for DOM environments (e.g., jQuery '$', 'cRAds', 
    'window.location'). Missing browser APIs caused silent failures. Furthermore, 
    CDN WAFs (like tnmr.org) blocked server requests with 403 Forbidden when 
    certain headers (e.g., 'Accept-Language') were present or when TLS/UA 
    fingerprints differed.

APPROACH 3: Client-Direct HLS Playback (Bypassing Server Proxy)
  - Method: Backend returned raw tnmr.org URLs directly to HLS.js in the browser.
  - Failure: Blocked by Browser CORS Policy (no 'Access-Control-Allow-Origin' header 
    on tnmr.org CDN). Additionally, CDN tokens are bound to specific client IPs/UA.

APPROACH 4: Full Application-Level Reverse Proxy (Rewriting Entire Web Apps)
  - Method: Proxying HTML, CSS, JS, XHR, and WebSockets so the provider app runs 
    under 'mywebsite.com'.
  - Failure: Endless cat-and-mouse nightmare. Hostile JS continuously detects origin 
    mismatches via window.location, anti-tamper scripts, dynamic URL concatenation, 
    and ad-integrity checks. Rewriting dynamic JS in real-time is unsustainable.

ROOT LESSON:
Trying to fake a browser in Node.js or trying to rewrite a hostile provider's web 
application inside our own origin both fail. We must provide a GENUINE browser 
environment for Alex to run natively, and simply observe/capture the output URL.


3. THE SELECTED ARCHITECTURE (ALEX -> MIKE -> MACHINE -> ME)
--------------------------------------------------------------------------------
Instead of running heavy browser automation on expensive cloud servers, we offload 
the extraction task to a dedicated, low-power secondary Android phone ("Mike").

WORKFLOW STEP-BY-STEP:

1. User Interaction:
   User clicks "Play" on a MoviePlex title on our frontend (Vercel).

2. Cache Inspection (Backend):
   Vercel backend checks memory/Redis cache for an active, valid stream token 
   for this title. If found, returns it immediately (0ms phone involvement).

3. Task Dispatch (Backend -> Mike):
   If uncached or expired, Vercel dispatches an HTTP task to Mike over a secure, 
   permanent Cloudflare Tunnel (e.g., https://mike-worker.trycloudflare.com).

4. Headless Execution (Mike / The Machine):
   Termux wakes up a headless Chromium instance (The Machine). Chromium navigates 
   to the provider embed URL (e.g., https://bfmovies.online/e/...).

5. Natural Script Execution (Alex):
   Alex's packed JS runs natively in real Chromium. DOM, cookies, storage, and 
   audio/ad logic execute as normal. Alex is unaware it is being observed.

6. Network Interception & Package Extraction:
   Mike's worker script listens to Chromium's outbound network requests. 
   As soon as a request matching "*.m3u8*" or "urlset" is emitted, Mike captures 
   the full signed URL (The Package), closes the browser tab, and returns the URL.

7. Cache & Proxy Pipe:
   Vercel receives the URL, stores it in cache (valid for ~8 hours), and formats 
   it through our existing /api/m3u8-proxy endpoint.

8. Seamless Native Playback:
   User's custom VideoPlayer.jsx receives the proxied URL and streams cleanly 
   via HLS.js with zero ads, custom controls, and full UI integration.


4. HARDWARE SPECIFICATIONS & WORKLOAD PROFILE
--------------------------------------------------------------------------------
Worker Device (Mike):
  - Hardware: Samsung Exynos 7885 Octa-Core (2x 2.2 GHz A73 + 6x 1.6 GHz A53)
  - RAM: 4 GB / 6 GB LPDDR4
  - OS: Android 9.0 (One UI)
  - Environment: Termux (F-Droid) + Node.js + Headless Chromium + cloudflared

Workload Characteristics:
  - Extraction Duration: 3.0 to 5.0 seconds per unique movie request.
  - CPU Load: 15–30% spike for 3 seconds, <1% idle.
  - RAM Load: ~250–400 MB per active tab (freed immediately upon capture).
  - Screen State: Screen OFF 24/7 (runs in RAM only via headless mode).
  - CPU State: termux-wake-lock keeps low-power CPU active with screen locked.
  - Daily Work Time: ~3 to 5 minutes total active work per 24 hours.


5. ESSENTIAL RESEARCH & VALIDATION TASKS (FOR AI RESEARCHER)
--------------------------------------------------------------------------------
An AI research agent assigned to this task must investigate and validate the 
following 5 essentials:

ESSENTIAL 1: Stream Token Lifespan & IP Binding Rules
  - Objective: Test tnmr.org, StreamTape, Filemoon, and DoodStream tokens.
  - Questions:
    * Do extracted .m3u8 URLs expire in minutes or hours (e.g., e=28800 = 8h)?
    * Does fetching .m3u8 through Vercel / User IP reject tokens generated by 
      Mike's home IP?
    * Verify header exclusions (confirm removing 'Accept-Language' prevents 403).

ESSENTIAL 2: Termux Headless Chromium Feasibility on Exynos 7885
  - Objective: Verify Puppeteer/Playwright/Chromium stability inside Termux.
  - Questions:
    * Can Termux (or proot Ubuntu inside Termux) launch headless Chromium 
      without missing shared library errors (.so)?
    * Measure cold-boot + page-nav + URL-sniff time. Is it under 5.0 seconds?

ESSENTIAL 3: Vercel Serverless 10-Second Hobby Limit
  - Objective: Ensure the end-to-end task completion fits Vercel constraints.
  - Questions:
    * Total round-trip: Vercel -> Cloudflare Tunnel -> Phone -> Browser -> Response.
    * If total time > 8 seconds, how do we implement asynchronous polling or 
      worker queueing to prevent 504 Gateway Timeouts?

ESSENTIAL 4: Cloudflare Tunnel (cloudflared) Stability on Termux
  - Objective: Ensure 24/7 connectivity between Vercel and the phone.
  - Questions:
    * Does cloudflared run stably inside Termux ARM64?
    * Does Android's doze mode interfere with tunnel keep-alives when battery 
      optimization is set to "Unrestricted"?

ESSENTIAL 5: Provider Host Inventory & Anti-Bot Escalation Matrix
  - Objective: Categorize provider embed types on MoviePlex.
  - Questions:
    * Category A (Script-based): LuluStream, StreamTape -> Auto-extracted by Mike.
    * Category B (Captcha-based): DoodStream, Cloudflare Turnstile -> Auto-fallback 
      to External Player iframe.
    * Define exact fallback trigger in App.jsx when Mike returns captcha_required.


================================================================================
  END OF ARCHITECTURE BRIEF
================================================================================
