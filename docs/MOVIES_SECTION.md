# Movies Section — Current State (Aug 2026)

## Primary Provider: DesiCinemas (desicinemas.pk)
The movies section has been fully upgraded to **DesiCinemas.pk**, replacing MoviePlex.

## Backend Architecture (`server.js`)

### DesiCinemas Engine
- **Source**: `https://desicinemas.pk` (WordPress CMS with Toroflix Theme)
- **Thumbnails & Posters**: Official TMDB CDN (`//image.tmdb.org/t/p/...`), pre-attached with high clarity directly from catalog HTML.
- **Post Normalization**: `dcParseMovieCard()` creates:
  ```json
  {
    "id": "dc-{postId}",
    "slug": "{slug}",
    "dcSlug": "{slug}",
    "title": "{title}",
    "thumbnail": "{tmdbUrl}",
    "coverImage": "{tmdbUrl}",
    "bannerImage": "{tmdbUrl}",
    "quality": "HD",
    "year": "2026",
    "language": "Hindi",
    "type": "movie|series|episode",
    "source": "desicinemas"
  }
  ```

### Stream Extraction Pipeline
1. `dcGetMovieDetail(slug)` → Fetches movie page, extracts title, backdrop, and server options (`.ListOptions li`).
2. `dcResolveStream({ postId, optionKey, type, slug })` → Calls embed router `https://desicinemas.pk/?trembed={key}&trid={id}&trtype={1_for_movie|2_for_episode}` and extracts `<iframe>`.
3. **Morencius Host (`morencius.com`)**: Unpacks obfuscated JavaScript (`node:vm` sandbox) and extracts direct multi-bitrate HLS master `.m3u8` playlist.
4. **Vidmoly Host (`vidmoly.org` / `vidmoly.me`)**: Extracts direct `.m3u8` master playlist via regex.
5. Direct HLS streams play natively in `VideoPlayer.jsx` without requiring iframe ad popups.

### API Routes
| Route | Purpose |
|---|---|
| `GET /api/movies/home` | Aggregates DesiCinemas catalog categories (Trending, Web Series, Hindi Dubbed, Bollywood, Hollywood, Action, Thriller, Romance) + Featured Billboard |
| `GET /api/desicinemas/catalog` | Paginated catalog browsing by category or search query |
| `GET /api/desicinemas/stream` | Direct master HLS `.m3u8` stream resolution |
| `GET /api/desicinemas/post-info` | Detail metadata scraper (title, backdrop, quality, options) |
| `GET /api/movieplex/*` | Maintained as backwards-compatible aliases pointing to DesiCinemas |

## Frontend Architecture

### `MovieHomeView.jsx`
- Category filter pills: `All`, `Trending`, `Hindi Dubbed`, `Bollywood`, `Hollywood`, `Web Series`, `Action`, `Drama`, `Thriller`, `Romance`, `Horror`, `Tamil`, `Telugu`, `Punjabi`.
- Paginated grid loading for individual categories.
- Featured billboard carousel auto-rotating top titles.
- Curated "Random Picks" powered by Supabase.

### `MoviePlexPlayerView.jsx` (Cinema Player)
- Fetches metadata via `/api/desicinemas/post-info?slug=`.
- Fetches streams via `/api/desicinemas/stream?slug=`.
- Plays master HLS streams natively via `VideoPlayer.jsx` (`hls.js`).
- Includes iframe external player fallback and popup shield controls.

### `MovieWatchView.jsx`
- Routes all DesiCinemas items (`movie.dcSlug || movie.source === 'desicinemas'`) directly to the cinema player.

### `MovieCard.jsx`
- Renders TMDB posters with smooth gradient hover animations and rating badges.
