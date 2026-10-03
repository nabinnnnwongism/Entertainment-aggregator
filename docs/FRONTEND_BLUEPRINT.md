# EetNet Frontend — Master Research, Toolkit & Architecture Blueprint

This document contains the complete research, curated open-source GitHub repositories, design systems, free libraries, and architectural toolkits gathered to build a **world-class, non-AI looking, Google/Netflix-standard streaming web application** for EetNet.

---

## 🎨 1. Design Inspirations & Live Visual References

To make the website look handcrafted and premium rather than generic AI:

| Platform | Key Features to Emulate |
|---|---|
| **Apple TV+** | Deep rich cinematic dark backgrounds (`#08090C`), generous whitespace, ultra-high-res hero backdrops with soft radial gradients, typography hierarchy. |
| **Netflix** | Horizontal infinite/spring carousels, instant backdrop trailers on hover, "Continue Watching" progress bars, card hover expansions with quick action buttons. |
| **Crunchyroll / AniList** | Bento grid season spotlights, episode release badges (SUB / DUB / HINDI), air schedules, genre chips with micro-glows. |
| **Dribbble Streaming Concepts** | Glassmorphic floating navigation, ambient backglow behind the active video player matching frame colors, frameless cards with smooth elevation shadows. |

---

## 🛠️ 2. Curated Open-Source GitHub Repositories for Reference

Study these top-rated open-source production streaming architectures:

### 📺 Video Player & Streaming Engines:
1. **[ArtPlayer.js](https://github.com/zhw2590582/Artplayer)** — *The gold standard for anime/streaming players.*
   - Built-in support for HLS.js, multiple subtitle tracks (.vtt / .srt / .ass), custom controls, playback speed menus, quality switchers, picture-in-picture, and screenshot capture.
2. **[Vidstack Player](https://github.com/vidstack/player)** — *Modern, accessible React media player.*
   - Headless architecture with production-ready UI components, custom scrubber bars, keyboard navigation, and zero layout shift.
3. **[AniSkip API](https://github.com/lexesjan/aniskip)** — *Free open-source community intro/outro timestamps.*
   - Allows automatic "Skip Intro" (85s) and "Skip Outro" buttons just like Netflix/Crunchyroll!

### 💻 Production UI Clones & Architectures:
4. **[voidanime](https://github.com/voidbornfr/voidanime)** — Feature-packed modern streaming frontend with ArtPlayer + HLS.js integration, AniList metadata, and responsive grid layouts.
5. **[deepanik/netflix](https://github.com/deepanik/netflix)** — Pixel-perfect React + Tailwind Netflix browsing experience with smooth carousels and detail modals.
6. **[embla-carousel](https://github.com/davidjerleke/embla-carousel)** — Ultra-lightweight, 60fps physics-based touch/mouse draggable carousel (used by top consumer webapps).

---

## 🧩 3. The Modern Free UI & Animation Stack

To ensure a bespoke, ultra-smooth feel with zero AI generic look:

```
┌────────────────────────────────────────────────────────┐
│                      TECH STACK                        │
├───────────────────┬────────────────────────────────────┤
│ Framework         │ React 19 + Vite (Fast HMR & build) │
│ State Store       │ Zustand (1KB ultra-fast state)     │
│ Styling           │ Tailwind CSS + Custom CSS Tokens   │
│ UI Primitives     │ Radix UI / Shadcn UI (Headless)    │
│ Motion & Spring   │ Framer Motion                      │
│ Sliders/Carousels │ Embla Carousel (with Autoplay)     │
│ Video Playback    │ Hls.js + Custom Glass Player /     │
│                   │ ArtPlayer.js                       │
│ Icons             │ Lucide React                       │
│ Persistence       │ LocalStorage + IndexedDB (Dexie)   │
└───────────────────┴────────────────────────────────────┘
```

---

## 🎬 4. The "Pro Custom Streaming Player" Blueprint

Based on your interview choices, the custom player will feature:

```
┌────────────────────────────────────────────────────────┐
│ [◄ Back]  Solo Leveling — Episode 12          [HD 1080p]│
│                                                        │
│                                                        │
│                  ▶ (Center Play/Pause)                 │
│                                                        │
│                                                        │
│                      [⚡ Skip Intro (01:25)]            │
├────────────────────────────────────────────────────────┤
│ ────●────────────────────────────────────── 18:42/23:50│
│ [▶] [⏮ 10s] [⏭ 10s] [🔊 ──●]  [Subtitles ⚙] [1.0x] [⛶]│
└────────────────────────────────────────────────────────┘
```

### Key Player Features:
- **Auto-Resume**: Remembers playback location down to the exact second.
- **Ambient Glow**: Soft, dynamic backdrop glow on the page behind the video player that pulses with the video illumination.
- **Auto-Skip**: Intro & Outro detection with 1-click button or auto-skip setting.
- **Audio & Subtitle Menu**: Switch seamlessly between Japanese Sub, English Dub, and Hindi Dub with customizable VTT font size and subtitle background opacity.
- **Playback Shortcuts**:
  - `Space` / `K`: Play / Pause
  - `F`: Fullscreen
  - `M`: Mute / Unmute
  - `←` / `→`: Seek 5s / 10s
  - `J` / `L`: Seek 10s backward / forward
  - `↑` / `↓`: Volume Up / Down

---

## 📱 5. Local-First User State & Persistence

No mandatory sign-ups. Everything works instantly out of the box:

- **`continueWatching` Store**:
  - Automatically records `{ id, title, episode, timestamp, duration, cover, type }`.
  - Displays a dedicated "Continue Watching" row on the home page with an exact progress bar.
- **`watchlist` Store**: 1-click "Add to My List" with instant local toggle.
- **`mangaHistory` Store**: Remembers last read chapter and scroll position.
- **Optional Cloud Backup**: 1-click "Export JSON Backup" / "Import JSON Backup" or optional Supabase sync.

---

## 🚀 6. Step-by-Step Blueprint for Building the Website

When you start building:
1. **Initialize Vite App**: `npm create vite@latest website -- --template react`
2. **Install Core Libraries**:
   ```bash
   npm install hls.js framer-motion embla-carousel-react lucide-react zustand axios
   ```
3. **Setup Design Tokens**: Configure dark OLED backgrounds (`#090A0F`), subtle card borders (`rgba(255,255,255,0.08)`), and brand accent gradients (indigo-purple or crimson).
4. **Assemble Modular Views**:
   - `HeroBanner.jsx` (Dynamic backdrop with trailer teasers)
   - `MediaRow.jsx` (Smooth Embla carousel sliders)
   - `MediaModal.jsx` (Fluid Framer Motion card expansion on click)
   - `VideoPlayer.jsx` (Custom Hls.js player with full controls)
   - `MangaReader.jsx` (Continuous webtoon scroll + manga page flip)
5. **Connect API Gateway**: Read from `eetnet-config.json` to talk to all 4 microservices.
