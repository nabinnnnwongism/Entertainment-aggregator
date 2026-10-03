/**
 * DramaPage — Exact Netflix clone visual, data from TMDB API
 * TMDB API Key: ecb37597e45cfeed0586f3cd57233d0b  (from git clone netflix/Netflix-reactjs)
 *
 * PortedComponents:
 *  Banner.jsx  → NetflixBanner
 *  RowPost.jsx → NetflixRowPost (Swiper, hover expand, card actions)
 *  Navbar.jsx  → NetflixNavbar  (transparent→black scroll)
 */

import { useEffect, useState } from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, Pagination } from "swiper/modules";
import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";
import "./NetflixRowPost.css";

import {
  fetchDramaStream,
  type DramaEpisode,
  type DramaStreamResult,
  type DramaSummary,
} from "../../shared/api/drama";
import { VideoPlayer } from "../../shared/components/video-player";

// ─── TMDB constants (from Netflix clone's Constance.js) ─────────────────────
const TMDB_KEY = "ecb37597e45cfeed0586f3cd57233d0b";
const TMDB_BASE = "https://api.themoviedb.org/3";
const IMG_ORIGINAL = "https://image.tmdb.org/t/p/original";
const IMG_W500 = "https://image.tmdb.org/t/p/w500";

interface TmdbShow {
  id: number;
  name?: string;
  title?: string;
  backdrop_path: string | null;
  poster_path: string | null;
  vote_average: number;
  overview: string;
  first_air_date?: string;
  release_date?: string;
  genre_ids?: number[];
  original_language?: string;
  number_of_episodes?: number;
}

interface TmdbEpisode {
  id: number;
  episode_number: number;
  name: string;
  still_path: string | null;
}

// Convert TMDB result → our DramaSummary shape
function tmdbToSummary(show: TmdbShow): DramaSummary {
  return {
    id: show.id,
    title: show.name || show.title || "Unknown",
    thumbnail: show.backdrop_path
      ? `${IMG_ORIGINAL}${show.backdrop_path}`
      : show.poster_path
      ? `${IMG_ORIGINAL}${show.poster_path}`
      : "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=1280&q=80",
    episodesCount: show.number_of_episodes,
    rating: show.vote_average,
    description: show.overview,
  };
}

// TMDB fetch helper
async function tmdbFetch<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set("api_key", TMDB_KEY);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`TMDB ${path} failed: ${res.status}`);
  return res.json();
}

// TMDB endpoint wrappers
const tmdb = {
  // Korean dramas trending
  trendingKorean: () =>
    tmdbFetch<{ results: TmdbShow[] }>("/discover/tv", {
      with_original_language: "ko",
      sort_by: "popularity.desc",
      "vote_count.gte": "100",
    }),
  // Chinese dramas
  trendingChinese: () =>
    tmdbFetch<{ results: TmdbShow[] }>("/discover/tv", {
      with_original_language: "zh",
      sort_by: "popularity.desc",
      "vote_count.gte": "50",
    }),
  // Thai dramas
  trendingThai: () =>
    tmdbFetch<{ results: TmdbShow[] }>("/discover/tv", {
      with_original_language: "th",
      sort_by: "popularity.desc",
      "vote_count.gte": "20",
    }),
  // Japanese live-action (J-Drama)
  trendingJapanese: () =>
    tmdbFetch<{ results: TmdbShow[] }>("/discover/tv", {
      with_original_language: "ja",
      sort_by: "popularity.desc",
      "vote_count.gte": "50",
      with_genres: "18",
    }),
  // Top-rated Asian TV
  topRatedAsian: () =>
    tmdbFetch<{ results: TmdbShow[] }>("/discover/tv", {
      with_original_language: "ko",
      sort_by: "vote_average.desc",
      "vote_count.gte": "300",
    }),
  // Recently airing
  onAir: () =>
    tmdbFetch<{ results: TmdbShow[] }>("/tv/on_the_air", {
      with_original_language: "ko|zh",
    }),
  // Search
  search: (q: string) =>
    tmdbFetch<{ results: TmdbShow[] }>("/search/tv", { query: q }),
  // TV seasons/episodes for a show
  seasonDetail: (id: number, season: number) =>
    tmdbFetch<{ episodes: TmdbEpisode[] }>(`/tv/${id}/season/${season}`),
  // Show detail
  showDetail: (id: number) =>
    tmdbFetch<TmdbShow & { number_of_seasons: number; number_of_episodes: number }>(`/tv/${id}`),
};

// ─── Star Rating (visual port of react-star-ratings) ─────────────────────────
function StarRating({ value }: { value: number }) {
  const stars = (value / 2); // TMDB is 0-10, show out of 5
  return (
    <span className="inline-flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => {
        const full = i < Math.floor(stars);
        const half = !full && i < stars;
        return (
          <svg key={i} viewBox="0 0 24 24" className="w-[1.1rem] h-[1.1rem] netflix-star"
            fill={full ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
          </svg>
        );
      })}
    </span>
  );
}

// ─── Netflix Navbar (Navbar.jsx port) ────────────────────────────────────────
function NetflixNavbar({
  onBack,
  onSearch,
  onNavigate,
}: {
  onBack?: () => void;
  onSearch: (q: string) => void;
  onNavigate?: (page: string) => void;
}) {
  const [solid, setSolid] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchVal, setSearchVal] = useState("");

  useEffect(() => {
    const h = () => setSolid(window.scrollY > 80);
    window.addEventListener("scroll", h);
    return () => window.removeEventListener("scroll", h);
  }, []);

  return (
    <header className={`fixed top-0 z-30 w-full transition duration-500 ease-in-out ${solid ? "bg-[#141414]" : ""}`}>
      <nav className="px-4 mx-auto sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Left: back arrow + Netflix logo + genre links */}
          <div className="flex items-center gap-2">
            {onBack && (
              <button onClick={onBack} className="text-white hover:text-red-600 transition" title="Home">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                </svg>
              </button>
            )}

            {/* Brand Logo: Eetnet DRAMA */}
            <div className="flex items-center gap-1.5 cursor-pointer" onClick={onBack}>
              <span className="font-extrabold text-2xl tracking-tight text-white">
                Eetnet
              </span>
              <span className="text-red-600 font-black text-2xl tracking-wider">
                DRAMA
              </span>
            </div>

            {/* Nav links */}
            <div className="hidden md:flex items-center ml-8 gap-1">
              {["Korean", "Chinese", "Thai", "Japanese", "My List"].map((cat) => (
                <span
                  key={cat}
                  className="py-2 px-3 font-medium text-white text-sm cursor-pointer hover:text-red-700 transition ease-in-out delay-150 rounded-md"
                >
                  {cat}
                </span>
              ))}
            </div>
          </div>

          {/* Right: Search + mobile menu */}
          <div className="flex items-center gap-3 ml-auto">
            {searchOpen ? (
              <form
                onSubmit={(e) => { e.preventDefault(); onSearch(searchVal); }}
                className="flex items-center gap-1 border-b border-white"
              >
                <input
                  autoFocus
                  className="bg-transparent text-white text-sm px-2 py-1 outline-none w-40 sm:w-52 placeholder:text-zinc-400"
                  placeholder="Titles, people, genres"
                  value={searchVal}
                  onChange={(e) => setSearchVal(e.target.value)}
                />
                <button type="submit" className="text-white hover:text-red-600">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </button>
                <button type="button" onClick={() => { setSearchOpen(false); setSearchVal(""); onSearch(""); }} className="text-zinc-400 hover:text-white ml-1 text-lg leading-none">✕</button>
              </form>
            ) : (
              <button onClick={() => setSearchOpen(true)} className="text-white hover:text-red-700 p-1" title="Search">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </button>
            )}

            {/* Mobile Hamburger */}
            <button onClick={() => setMobileOpen(!mobileOpen)}
              className="inline-flex items-center justify-center p-2 text-gray-400 bg-gray-900 rounded-md hover:text-white hover:bg-gray-800 md:hidden">
              {mobileOpen
                ? <svg className="w-6 h-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                : <svg className="w-6 h-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>}
            </button>
          </div>
        </div>

        {/* Mobile dropdown */}
        {mobileOpen && (
          <div className="md:hidden px-2 pt-2 pb-3 space-y-1 bg-[#141414]">
            {["Korean", "Chinese", "Thai", "Japanese", "My List"].map((cat) => (
              <a key={cat} className="block px-3 py-2 text-base font-medium text-gray-300 rounded-md hover:bg-red-800 hover:text-white cursor-pointer">{cat}</a>
            ))}
          </div>
        )}
      </nav>
    </header>
  );
}

// ─── Banner (Banner.jsx port) ─────────────────────────────────────────────────
function NetflixBanner({ movie, onPlay, onMoreInfo }: { movie: DramaSummary | null; onPlay: () => void; onMoreInfo: () => void }) {
  if (!movie) {
    return (
      <div className="h-[50rem] md:h-[55rem] bg-neutral-900 grid items-center">
        <div className="ml-2 sm:ml-12 mt-52">
          <div className="animate-pulse w-72 sm:w-96 py-5 mb-7 bg-neutral-800 rounded-md" />
          <div className="animate-pulse w-80 py-1 mb-3 bg-neutral-800 rounded-md" />
          <div className="animate-pulse w-60 py-1 mb-7 bg-neutral-800 rounded-md" />
          <div className="flex gap-3">
            <div className="animate-pulse bg-neutral-800 px-14 py-6 rounded-md w-36" />
            <div className="animate-pulse bg-neutral-800 px-10 py-6 rounded-md w-36" />
          </div>
        </div>
      </div>
    );
  }

  const rating = typeof movie.rating === "number" ? movie.rating : parseFloat(String(movie.rating ?? "7"));

  return (
    <>
      <div
        className="h-[50rem] md:h-[55rem] bg-cover bg-center grid items-center"
        style={{
          backgroundImage: `linear-gradient(90deg, hsl(0deg 0% 7% / 91%) 0%, hsl(0deg 0% 0% / 0%) 35%, hsl(220deg 26% 44% / 0%) 100%), url(${movie.thumbnail})`,
        }}
      >
        <div className="ml-2 mr-2 sm:mr-0 sm:ml-12 mt-[75%] sm:mt-52">
          <h1 className="text-white text-3xl font-semibold text-center mb-5 py-2 sm:text-left sm:text-5xl sm:border-l-8 pl-4 border-red-700 md:text-6xl lg:w-2/3 xl:w-1/2 sm:font-bold drop-shadow-lg">
            {movie.title}
          </h1>

          <div className="flex items-center gap-3 hidden sm:flex mb-2">
            <StarRating value={rating} />
            <span className="text-white text-base font-bold drop-shadow-lg">
              {movie.episodesCount ? `${movie.episodesCount} Episodes` : "Asian Drama"}
            </span>
            <span className="text-white px-2 bg-[#1e1e1e89] border-2 border-stone-600 rounded">HD</span>
          </div>

          <div className="mt-3 mb-4">
            <p className="text-white text-xl drop-shadow-xl text-center line-clamp-2 sm:line-clamp-3 sm:text-left w-full md:w-4/5 lg:w-8/12 lg:text-xl xl:w-5/12 2xl:text-2xl">
              {movie.description || "An extraordinary Asian drama streaming now. Watch all episodes in Full HD."}
            </p>
          </div>

          <div className="flex justify-center sm:justify-start gap-3">
            <button
              onClick={onPlay}
              className="bg-red-800 hover:bg-red-900 transition duration-500 ease-in-out shadow-2xl flex items-center mb-3 text-base sm:text-xl font-semibold text-white py-2 px-10 sm:px-14 rounded-md"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 mr-2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
              </svg>
              Play
            </button>
            <button
              onClick={onMoreInfo}
              className="bg-[#33333380] flex items-center shadow-2xl mb-3 text-base sm:text-xl font-semibold text-white hover:bg-white hover:text-black transition duration-500 ease-in-out py-2 px-8 rounded-md"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              More Info
            </button>
          </div>
        </div>

        <div
          className="h-80 mt-auto"
          style={{ backgroundImage: "linear-gradient(hsl(0deg 0% 0% / 0%), hsl(0deg 0% 0% / 38%), hsl(0deg 0% 7%))" }}
        />
      </div>
    </>
  );
}

// ─── RowPost (RowPost.jsx Swiper carousel port) ──────────────────────────────
function NetflixRowPost({
  title,
  items,
  isLarge = false,
  first = false,
  onSelect,
}: {
  title: string;
  items: DramaSummary[];
  isLarge?: boolean;
  first?: boolean;
  onSelect: (item: DramaSummary) => void;
}) {
  const [shouldPop, setShouldPop] = useState(true);

  if (!items?.length) {
    return (
      <div className="ml-2 lg:ml-11 mb-11 animate-pulse" style={{ marginTop: first ? "-8rem" : "" }}>
        <div className="w-72 py-5 mb-5 bg-neutral-900 rounded-md" />
        <div className="w-full py-24 bg-neutral-900 rounded-md" />
      </div>
    );
  }

  return (
    <div className="ml-2 lg:ml-11 mb-11" style={{ marginTop: first ? "-8rem" : "" }}>
      <h1 className="text-white pb-4 xl:pb-0 font-normal text-base sm:text-2xl md:text-4xl">{title}</h1>
      <Swiper
        modules={[Navigation, Pagination]}
        spaceBetween={8}
        slidesPerView={6.1}
        navigation
        pagination={{ clickable: true }}
        className="netflix-swiper SwiperStyle"
        breakpoints={{
          1800: { slidesPerView: 6.1, slidesPerGroup: 5 },
          1690: { slidesPerView: 5.5, slidesPerGroup: 5 },
          1536: { slidesPerView: 5,   slidesPerGroup: 5 },
          1280: { slidesPerView: 4.3, slidesPerGroup: 4 },
          768:  { slidesPerView: 3.3, slidesPerGroup: 3 },
          625:  { slidesPerView: 3.1, slidesPerGroup: 3 },
          330:  { slidesPerView: 2.1, slidesPerGroup: 2 },
          0:    { slidesPerView: 2,   slidesPerGroup: 2 },
        }}
      >
        {items.map((item) => {
          const posterSrc = isLarge
            ? (item.thumbnail.includes("original") ? item.thumbnail.replace("original", "w500") : item.thumbnail)
            : item.thumbnail;
          const rating = typeof item.rating === "number" ? item.rating : parseFloat(String(item.rating ?? "7"));

          return (
            <SwiperSlide
              key={item.id}
              className={isLarge ? "large" : "bg-cover"}
              onClick={() => shouldPop && onSelect(item)}
            >
              <img
                loading="lazy"
                className="rounded-sm w-full"
                src={posterSrc}
                alt={item.title}
                onError={(e) => { (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=600&q=80"; }}
              />

              {/* Hover content overlay — ported from RowPost.jsx .content */}
              <div className="netflix-card-content pt-16">
                <div className="flex ml-3 gap-1">
                  {/* Play */}
                  <div onClick={(e) => { e.stopPropagation(); onSelect(item); }}
                    onMouseEnter={() => setShouldPop(false)} onMouseLeave={() => setShouldPop(true)}
                    className="text-white w-9 h-9 border-[2px] rounded-full p-2 mr-1 backdrop-blur-[2px] shadow-md ease-linear transition-all duration-150 hover:text-black hover:bg-white cursor-pointer">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                    </svg>
                  </div>
                  {/* Add to list */}
                  <div onMouseEnter={() => setShouldPop(false)} onMouseLeave={() => setShouldPop(true)}
                    className="text-white w-9 h-9 border-[2px] rounded-full p-2 mr-1 backdrop-blur-[1px] shadow-md ease-linear transition-all duration-150 hover:text-black hover:bg-white cursor-pointer">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                  </div>
                  {/* Like */}
                  <div onMouseEnter={() => setShouldPop(false)} onMouseLeave={() => setShouldPop(true)}
                    className="text-white w-9 h-9 border-[2px] rounded-full p-2 mr-1 backdrop-blur-[1px] shadow-md ease-linear transition-all duration-150 hover:text-black hover:bg-white cursor-pointer">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6.633 10.5c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 012.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 00.322-1.672V3a.75.75 0 01.75-.75A2.25 2.25 0 0116.5 4.5c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 01-2.649 7.521c-.388.482-.987.729-1.605.729H13.48c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 00-1.423-.23H5.904M14.25 9h2.25M5.904 18.75c.083.205.173.405.27.602.197.4-.078.898-.523.898h-.908c-.889 0-1.713-.518-1.972-1.368a12 12 0 01-.521-3.507c0-1.553.295-3.036.831-4.398C3.387 10.203 4.167 9.75 5 9.75h1.053c.472 0 .745.556.5.96a8.958 8.958 0 00-1.302 4.665c0 1.194.232 2.333.654 3.375z" />
                    </svg>
                  </div>
                  {/* More info chevron */}
                  <div onClick={(e) => { e.stopPropagation(); onSelect(item); }}
                    className="text-white w-9 h-9 border-[2px] rounded-full p-2 mr-1 backdrop-blur-[1px] shadow-md ease-linear transition-all duration-150 hover:text-black hover:bg-white cursor-pointer">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                  </div>
                </div>
                <h1 className="text-white ml-4 font-medium w-4/5 xl:line-clamp-1 mt-1">{item.title}</h1>
                <h1 className="text-white text-xs font-semibold ml-4">{item.episodesCount ? `${item.episodesCount} Ep` : "Drama"}</h1>
                <div className="ml-4 mt-0.5"><StarRating value={rating} /></div>
              </div>
            </SwiperSlide>
          );
        })}
      </Swiper>
    </div>
  );
}

// ─── Popup Modal (RowPost.jsx inline modal port) ──────────────────────────────
function NetflixPopup({
  drama,
  episodes,
  episodesLoading,
  streamResult,
  streamLoading,
  streamError,
  activeEpisode,
  onClose,
  onPlayEpisode,
}: {
  drama: DramaSummary;
  episodes: TmdbEpisode[];
  episodesLoading: boolean;
  streamResult: DramaStreamResult | null;
  streamLoading: boolean;
  streamError: string | null;
  activeEpisode: DramaEpisode | null;
  onClose: () => void;
  onPlayEpisode: (ep: DramaEpisode) => void;
}) {
  const rating = typeof drama.rating === "number" ? drama.rating : parseFloat(String(drama.rating ?? "7"));

  return (
    <>
      <div className="justify-center items-center flex overflow-x-hidden overflow-y-auto fixed inset-0 z-50 outline-none focus:outline-none">
        <div className="relative w-auto mt-24 sm:my-6 mx-4 max-w-3xl w-full">
          <div className="border-0 rounded-lg shadow-lg relative flex flex-col w-full bg-neutral-800 outline-none focus:outline-none">

            {/* Close button — exact style from RowPost.jsx */}
            <button
              className="group p-1 ml-2 mt-2 backdrop-blur-[20px] bg-transparent border-2 border-white hover:bg-white hover:text-black fixed right-4 rounded-full cursor-pointer font-semibold outline-none ease-linear transition-all duration-150"
              onClick={onClose}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="text-white w-6 h-6 group-hover:text-black ease-linear transition-all duration-150">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Video / backdrop */}
            <div className="aspect-video w-full bg-black rounded-t-lg overflow-hidden">
              {activeEpisode ? (
                streamLoading ? (
                  <div className="h-full w-full flex items-center justify-center bg-black">
                    <div className="text-center">
                      <svg className="animate-spin h-12 w-12 text-red-600 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      <p className="text-white mt-3 text-sm">Loading Episode {activeEpisode.number}…</p>
                    </div>
                  </div>
                ) : streamError || !streamResult?.streamUrl ? (
                  <div className="h-full flex items-center justify-center bg-neutral-900 text-center p-6">
                    <div>
                      <p className="text-red-400 font-bold">Stream unavailable</p>
                      <p className="text-zinc-400 text-xs mt-1">{streamError || "Could not resolve a playable stream."}</p>
                    </div>
                  </div>
                ) : (
                  <VideoPlayer
                    src={streamResult.streamUrl}
                    title={`${drama.title} — Ep ${activeEpisode.number}`}
                    subtitles={streamResult.subtitles}
                  />
                )
              ) : (
                <img src={drama.thumbnail} alt={drama.title} className="w-full h-full object-cover" />
              )}
            </div>

            {/* Action row beneath video */}
            <div className="flex ml-4 items-center -mt-14 z-10 relative gap-2">
              <button
                onClick={() => episodes[0] && onPlayEpisode({ id: `${drama.id}-ep-1`, number: 1 })}
                className="flex items-center justify-center bg-red-800 text-white font-bold text-xs px-4 sm:px-6 md:text-sm py-2 rounded shadow hover:shadow-lg ease-linear transition-all duration-150"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-1" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                </svg>
                Play
              </button>
              <div className="text-white w-10 h-10 border-[2px] rounded-full p-2 backdrop-blur-[1px] hover:bg-white hover:text-black shadow-md cursor-pointer ease-linear transition-all duration-150">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              </div>
              <div className="text-white w-10 h-10 border-[2px] rounded-full p-2 backdrop-blur-[1px] hover:bg-white hover:text-black shadow-md cursor-pointer ease-linear transition-all duration-150">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6.633 10.5c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 012.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 00.322-1.672V3a.75.75 0 01.75-.75A2.25 2.25 0 0116.5 4.5c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 01-2.649 7.521c-.388.482-.987.729-1.605.729H13.48c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 00-1.423-.23H5.904M14.25 9h2.25M5.904 18.75c.083.205.173.405.27.602.197.4-.078.898-.523.898h-.908c-.889 0-1.713-.518-1.972-1.368a12 12 0 01-.521-3.507c0-1.553.295-3.036.831-4.398C3.387 10.203 4.167 9.75 5 9.75h1.053c.472 0 .745.556.5.96a8.958 8.958 0 00-1.302 4.665c0 1.194.232 2.333.654 3.375z" /></svg>
              </div>
            </div>

            {/* Title */}
            <div className="p-5 py-4 sm:py-6 sm:pt-6">
              <h3 className="text-3xl font-semibold text-white">{drama.title}</h3>
              <h1 className="text-green-600 font-bold mt-2">{drama.episodesCount ? `${drama.episodesCount} Episodes` : "Asian Drama"}</h1>
            </div>

            {/* Overview */}
            <div className="relative p-4 sm:p-6 flex-auto">
              <div className="bg-neutral-700 h-[0.15rem]" />
              <p className="my-4 sm:my-7 text-neutral-400 text-xs md:text-lg leading-relaxed line-clamp-4 sm:line-clamp-none">
                {drama.description || "Watch all episodes in Full HD with multi-language subtitles."}
              </p>
              <div className="bg-neutral-700 h-[0.15rem]" />
            </div>

            {/* Footer — meta + episode grid */}
            <div className="sm:flex items-start justify-between p-2">
              <div className="p-2 py-5 sm:p-6 flex-auto">
                <p className="flex items-center gap-2 -mt-4 text-neutral-400 text-sm">Rating: <StarRating value={rating} /></p>
                <p className="text-neutral-400 text-sm mt-1">Episodes: <span className="text-white font-medium">{drama.episodesCount ?? "?"}</span></p>
                <p className="text-neutral-400 text-sm mt-1">Language: <span className="text-white font-medium">Korean / Chinese / Japanese</span></p>
                <p className="text-neutral-400 text-sm mt-1">Genre: <span className="text-white font-medium">Romance · Thriller · Fantasy</span></p>
              </div>

              {/* Episode picker */}
              <div className="p-4 sm:p-6 max-w-xs">
                <p className="text-neutral-400 text-xs font-semibold mb-2 uppercase tracking-wider">Episodes</p>
                {episodesLoading ? (
                  <div className="flex flex-wrap gap-1.5">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div key={i} className="animate-pulse bg-neutral-700 rounded w-14 h-7" />
                    ))}
                  </div>
                ) : episodes.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                    {episodes.map((ep) => {
                      const epObj: DramaEpisode = { id: `${drama.id}-ep-${ep.episode_number}`, number: ep.episode_number };
                      const isActive = activeEpisode?.number === ep.episode_number;
                      return (
                        <button
                          key={ep.id}
                          onClick={() => onPlayEpisode(epObj)}
                          className={`text-xs font-bold px-2.5 py-1.5 rounded transition-all ${isActive ? "bg-red-700 text-white" : "bg-neutral-700 text-white hover:bg-red-800"}`}
                        >
                          Ep {ep.episode_number}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-zinc-500 text-xs">No episodes found.</p>
                )}
              </div>
            </div>

            {/* Footer buttons */}
            <div className="flex justify-between p-2 pt-0">
              <button
                onClick={onClose}
                className="group flex items-center justify-center border-[0.7px] border-white text-white font-bold text-xs px-4 sm:px-6 md:text-sm py-3 rounded shadow hover:shadow-lg hover:bg-white hover:text-red-700 ease-linear transition-all duration-150 mb-1"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1 group-hover:text-red-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Add to My List
              </button>
              <button
                onClick={onClose}
                className="flex items-center text-red-500 font-bold uppercase px-2 py-2 text-sm ease-linear transition-all duration-150 mr-1 mb-1"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 mr-1">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="opacity-40 fixed inset-0 z-40 bg-black" onClick={onClose} />
    </>
  );
}

// ─── Main DramaPage ───────────────────────────────────────────────────────────
export function DramaPage({ onBack }: { onBack?: () => void; onOpen?: () => void }) {
  const [rows, setRows] = useState<{
    korean: DramaSummary[];
    chinese: DramaSummary[];
    thai: DramaSummary[];
    japanese: DramaSummary[];
    topRated: DramaSummary[];
    onAir: DramaSummary[];
  }>({ korean: [], chinese: [], thai: [], japanese: [], topRated: [], onAir: [] });

  const [banner, setBanner] = useState<DramaSummary | null>(null);
  const [searchResults, setSearchResults] = useState<DramaSummary[]>([]);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [popupDrama, setPopupDrama] = useState<DramaSummary | null>(null);
  const [modalEpisodes, setModalEpisodes] = useState<TmdbEpisode[]>([]);
  const [epLoading, setEpLoading] = useState(false);
  const [activeEpisode, setActiveEpisode] = useState<DramaEpisode | null>(null);
  const [streamResult, setStreamResult] = useState<DramaStreamResult | null>(null);
  const [streamLoading, setStreamLoading] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);

  // Load all rows from TMDB on mount
  useEffect(() => {
    let active = true;

    Promise.allSettled([
      tmdb.trendingKorean(),
      tmdb.trendingChinese(),
      tmdb.trendingThai(),
      tmdb.trendingJapanese(),
      tmdb.topRatedAsian(),
      tmdb.onAir(),
    ]).then(([ko, zh, th, ja, top, air]) => {
      if (!active) return;

      const korean = ko.status === "fulfilled" ? ko.value.results.map(tmdbToSummary) : [];
      const chinese = zh.status === "fulfilled" ? zh.value.results.map(tmdbToSummary) : [];
      const thai = th.status === "fulfilled" ? th.value.results.map(tmdbToSummary) : [];
      const japanese = ja.status === "fulfilled" ? ja.value.results.map(tmdbToSummary) : [];
      const topRated = top.status === "fulfilled" ? top.value.results.map(tmdbToSummary) : [];
      const onAir = air.status === "fulfilled" ? air.value.results.map(tmdbToSummary) : [];

      setRows({ korean, chinese, thai, japanese, topRated, onAir });

      // Pick a random high-quality Korean drama as the banner
      const bannerPool = korean.filter((k) => k.thumbnail && k.description);
      if (bannerPool.length > 0) {
        setBanner(bannerPool[Math.floor(Math.random() * bannerPool.length)]);
      }
    });

    return () => { active = false; };
  }, []);

  const handleSearch = async (q: string) => {
    if (!q.trim()) { setSearchResults([]); return; }
    try {
      const data = await tmdb.search(q);
      setSearchResults(data.results.map(tmdbToSummary).filter((d) => d.thumbnail));
    } catch {
      setSearchResults([]);
    }
  };

  const openModal = async (drama: DramaSummary) => {
    setPopupDrama(drama);
    setShowModal(true);
    setModalEpisodes([]);
    setEpLoading(true);
    setActiveEpisode(null);
    setStreamResult(null);
    setStreamError(null);

    try {
      // Fetch season 1 episodes from TMDB
      const season = await tmdb.seasonDetail(Number(drama.id), 1);
      setModalEpisodes(season.episodes ?? []);
    } catch {
      setModalEpisodes([]);
    } finally {
      setEpLoading(false);
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setPopupDrama(null);
    setActiveEpisode(null);
    setStreamResult(null);
    setStreamError(null);
  };

  const playEpisode = async (ep: DramaEpisode) => {
    setActiveEpisode(ep);
    setStreamLoading(true);
    setStreamError(null);
    setStreamResult(null);
    try {
      const stream = await fetchDramaStream(ep.id);
      setStreamResult(stream);
    } catch (err: any) {
      setStreamError(err.message || "Stream unavailable.");
    } finally {
      setStreamLoading(false);
    }
  };

  // Determine which rows have data for the "first" margin trick from RowPost
  const allKorean = rows.korean.length > 0 ? rows.korean : [];

  return (
    <div className="bg-[#141414] min-h-screen text-white">
      <NetflixNavbar onBack={onBack} onSearch={handleSearch} />

      <NetflixBanner
        movie={banner}
        onPlay={() => banner && openModal(banner)}
        onMoreInfo={() => banner && openModal(banner)}
      />

      {/* Search results */}
      {searchResults.length > 0 && (
        <div className="ml-2 lg:ml-11 mb-8 mt-4">
          <h1 className="text-white text-2xl font-bold mb-4">Search Results ({searchResults.length})</h1>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {searchResults.map((item) => (
              <div key={item.id} onClick={() => openModal(item)} className="cursor-pointer rounded overflow-hidden hover:scale-105 transition-transform">
                <img
                  src={item.thumbnail}
                  alt={item.title}
                  className="w-full aspect-video object-cover rounded-sm"
                  onError={(e) => { (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=600&q=80"; }}
                />
                <p className="text-white text-xs font-semibold mt-1 truncate">{item.title}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* RowPost rows — all 6 TMDB-powered categories */}
      <NetflixRowPost title="🇰🇷 Trending Korean Dramas" items={allKorean} first onSelect={openModal} />
      <NetflixRowPost title="🇨🇳 Popular Chinese Dramas" items={rows.chinese} onSelect={openModal} />
      <NetflixRowPost title="🇹🇭 Thai Dramas" items={rows.thai} onSelect={openModal} />
      <NetflixRowPost title="🇯🇵 Japanese Dramas" items={rows.japanese} onSelect={openModal} />
      <NetflixRowPost title="⭐ Top Rated Asian Series" items={rows.topRated} isLarge onSelect={openModal} />
      <NetflixRowPost title="🔴 Currently On Air" items={rows.onAir} onSelect={openModal} />

      {/* Modal */}
      {showModal && popupDrama && (
        <NetflixPopup
          drama={popupDrama}
          episodes={modalEpisodes}
          episodesLoading={epLoading}
          streamResult={streamResult}
          streamLoading={streamLoading}
          streamError={streamError}
          activeEpisode={activeEpisode}
          onClose={closeModal}
          onPlayEpisode={playEpisode}
        />
      )}
    </div>
  );
}
