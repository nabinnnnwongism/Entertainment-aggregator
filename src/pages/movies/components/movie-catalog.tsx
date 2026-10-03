import React from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Film,
  Flame,
  Heart,
  Info,
  Play,
  Plus,
  Search,
  Sparkles,
  Star,
  ThumbsUp,
  Tv,
  X,
  Zap,
} from "lucide-react";
import type { TmdbMovie } from "../api/tmdb";
import { Container } from "./container";

type MovieCatalogProps = {
  trendingMovies: TmdbMovie[];
  topRatedMovies: TmdbMovie[];
  actionMovies: TmdbMovie[];
  sciFiMovies: TmdbMovie[];
  catalogMovies: TmdbMovie[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSelectMovie: (movie: TmdbMovie) => void;
  onPlayMovie: (movie: TmdbMovie) => void;
  onToggleMyList: (movie: TmdbMovie) => void;
  onToggleLiked: (movie: TmdbMovie) => void;
  myList: TmdbMovie[];
  likedList: TmdbMovie[];
  activeGenre: string;
  onGenreChange: (genre: string) => void;
  genreList: string[];
  catalogRef?: React.RefObject<HTMLDivElement>;
};

export const MovieCatalog = ({
  trendingMovies,
  topRatedMovies,
  actionMovies,
  sciFiMovies,
  catalogMovies,
  searchQuery,
  onSearchChange,
  onSelectMovie,
  onPlayMovie,
  onToggleMyList,
  onToggleLiked,
  myList,
  likedList,
  activeGenre,
  onGenreChange,
  genreList,
  catalogRef,
}: MovieCatalogProps) => {
  const isMyList = (movie: TmdbMovie) => myList.some((m) => String(m.id) === String(movie.id));
  const isLiked = (movie: TmdbMovie) => likedList.some((m) => String(m.id) === String(movie.id));

  return (
    <section
      ref={catalogRef}
      id="movie-catalog"
      className="relative z-20 bg-background py-16 text-white font-apple"
    >
      <Container>
        {/* Section Header & Search */}
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between border-b border-white/10 pb-8">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[#E50914]">
              <Sparkles size={14} />
              <span>Full EetNet Cinema Catalog</span>
            </div>
            <h2 className="mt-2 text-3xl font-bold tracking-tight md:text-5xl text-white">
              Explore All Movies
            </h2>
            <p className="mt-2 text-sm text-fog-500 max-w-lg">
              Stream award-winning cinema, Indian blockbusters, Hollywood hits, and curated web series with official HD TMDB posters.
            </p>
          </div>

          {/* Search Box */}
          <div className="relative w-full md:w-80">
            <Search
              size={18}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-fog-500"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search by title, genre..."
              className="w-full rounded-full border border-white/15 bg-ink-900 py-2.5 pl-10 pr-10 text-sm text-white placeholder-fog-500 outline-none transition-colors focus:border-[#E50914] focus:ring-1 focus:ring-[#E50914]"
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange("")}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-fog-500 hover:text-white"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Genre Selector Pills */}
        <div className="mt-6 flex gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {genreList.map((genre) => {
            const isActive = activeGenre === genre;
            return (
              <button
                key={genre}
                onClick={() => onGenreChange(genre)}
                className={`shrink-0 rounded-full px-5 py-2 text-xs md:text-sm font-semibold transition-all duration-200 ${
                  isActive
                    ? "bg-[#E50914] text-white shadow-lg shadow-red-600/30 scale-105 font-bold"
                    : "bg-ink-800 text-fog-500 hover:bg-ink-700 hover:text-white border border-white/10"
                }`}
              >
                {genre}
              </button>
            );
          })}
        </div>

        {/* If Search Query Active */}
        {searchQuery && (
          <div className="mt-10">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold">
                Search Results for &ldquo;{searchQuery}&rdquo;
              </h3>
              <span className="text-xs text-fog-500">
                {catalogMovies.length} movies found
              </span>
            </div>
            {catalogMovies.length === 0 ? (
              <div className="py-16 text-center text-fog-500">
                <p className="text-lg">No movies found matching &ldquo;{searchQuery}&rdquo;</p>
                <p className="text-xs mt-1">Try searching for another Bollywood, Hollywood, or regional title.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {catalogMovies.map((movie, idx) => (
                  <CatalogCard
                    key={(movie.id || movie.slug || idx) + "-search"}
                    movie={movie}
                    onSelect={() => onSelectMovie(movie)}
                    onPlay={() => onPlayMovie(movie)}
                    onToggleList={() => onToggleMyList(movie)}
                    onToggleLiked={() => onToggleLiked(movie)}
                    isListed={isMyList(movie)}
                    isLiked={isLiked(movie)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* If Not Searching: Render Curated Rails & Full Grid */}
        {!searchQuery && (
          <>
            {/* Trending Rail */}
            {trendingMovies.length > 0 && (
              <MovieRail
                title="Trending This Week"
                badge={<Flame size={16} className="text-[#E50914]" />}
                movies={trendingMovies}
                onSelectMovie={onSelectMovie}
                onPlayMovie={onPlayMovie}
                onToggleMyList={onToggleMyList}
                onToggleLiked={onToggleLiked}
                isMyList={isMyList}
                isLiked={isLiked}
              />
            )}

            {/* Bollywood & Desi Cinema Rail */}
            {topRatedMovies.length > 0 && (
              <MovieRail
                title="Bollywood & Desi Cinema"
                badge={<Star size={16} className="text-amber-400" />}
                movies={topRatedMovies}
                onSelectMovie={onSelectMovie}
                onPlayMovie={onPlayMovie}
                onToggleMyList={onToggleMyList}
                onToggleLiked={onToggleLiked}
                isMyList={isMyList}
                isLiked={isLiked}
              />
            )}

            {/* Hindi Dubbed Hits Rail */}
            {actionMovies.length > 0 && (
              <MovieRail
                title="Hindi Dubbed Blockbusters"
                badge={<Zap size={16} className="text-emerald-400" />}
                movies={actionMovies}
                onSelectMovie={onSelectMovie}
                onPlayMovie={onPlayMovie}
                onToggleMyList={onToggleMyList}
                onToggleLiked={onToggleLiked}
                isMyList={isMyList}
                isLiked={isLiked}
              />
            )}

            {/* Web Series Rail */}
            {sciFiMovies.length > 0 && (
              <MovieRail
                title="Top Web Series & Shows"
                badge={<Tv size={16} className="text-purple-400" />}
                movies={sciFiMovies}
                onSelectMovie={onSelectMovie}
                onPlayMovie={onPlayMovie}
                onToggleMyList={onToggleMyList}
                onToggleLiked={onToggleLiked}
                isMyList={isMyList}
                isLiked={isLiked}
              />
            )}

            {/* Full Movie Catalog Grid */}
            <div className="mt-16">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-2xl font-bold tracking-tight text-white">
                    {activeGenre === "All" ? "Complete Collection" : `${activeGenre} Movies`}
                  </h3>
                  <p className="text-xs text-fog-500 mt-0.5">
                    Showing {catalogMovies.length} curated titles
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {catalogMovies.map((movie, idx) => (
                  <CatalogCard
                    key={(movie.id || movie.slug || idx) + "-cat"}
                    movie={movie}
                    onSelect={() => onSelectMovie(movie)}
                    onPlay={() => onPlayMovie(movie)}
                    onToggleList={() => onToggleMyList(movie)}
                    onToggleLiked={() => onToggleLiked(movie)}
                    isListed={isMyList(movie)}
                    isLiked={isLiked(movie)}
                  />
                ))}
              </div>
            </div>
          </>
        )}
      </Container>
    </section>
  );
};

const MovieRail = ({
  title,
  badge,
  movies,
  onSelectMovie,
  onPlayMovie,
  onToggleMyList,
  onToggleLiked,
  isMyList,
  isLiked,
}: {
  title: string;
  badge?: React.ReactNode;
  movies: TmdbMovie[];
  onSelectMovie: (movie: TmdbMovie) => void;
  onPlayMovie: (movie: TmdbMovie) => void;
  onToggleMyList: (movie: TmdbMovie) => void;
  onToggleLiked: (movie: TmdbMovie) => void;
  isMyList: (movie: TmdbMovie) => boolean;
  isLiked: (movie: TmdbMovie) => boolean;
}) => {
  const scrollRef = (dir: -1 | 1) => {
    const el = document.getElementById(`rail-${title.replace(/\s+/g, "-")}`);
    if (el) {
      el.scrollBy({ left: dir * 650, behavior: "smooth" });
    }
  };

  return (
    <div className="mt-14">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {badge}
          <h3 className="text-xl font-bold text-white tracking-tight">{title}</h3>
        </div>
        <div className="hidden sm:flex items-center gap-2">
          <button
            onClick={() => scrollRef(-1)}
            className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-ink-900 text-fog-500 hover:bg-white hover:text-black transition-colors"
            aria-label="Scroll left"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={() => scrollRef(1)}
            className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-ink-900 text-fog-500 hover:bg-white hover:text-black transition-colors"
            aria-label="Scroll right"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <div
        id={`rail-${title.replace(/\s+/g, "-")}`}
        className="flex gap-4 overflow-x-auto pb-4 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden scroll-smooth"
      >
        {movies.map((movie, idx) => (
          <div key={(movie.id || movie.slug || idx) + "-rail"} className="w-[155px] sm:w-[195px] shrink-0">
            <CatalogCard
              movie={movie}
              onSelect={() => onSelectMovie(movie)}
              onPlay={() => onPlayMovie(movie)}
              onToggleList={() => onToggleMyList(movie)}
              onToggleLiked={() => onToggleLiked(movie)}
              isListed={isMyList(movie)}
              isLiked={isLiked(movie)}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

const CatalogCard = ({
  movie,
  onSelect,
  onPlay,
  onToggleList,
  onToggleLiked,
  isListed,
  isLiked,
}: {
  movie: TmdbMovie;
  onSelect: () => void;
  onPlay: () => void;
  onToggleList: () => void;
  onToggleLiked: () => void;
  isListed: boolean;
  isLiked: boolean;
}) => {
  const stopProp = (e: React.MouseEvent, fn: () => void) => {
    e.stopPropagation();
    fn();
  };

  const ratingNum = typeof movie.rating === "number" ? movie.rating : parseFloat(String(movie.rating || 7.8));
  const displayRating = isNaN(ratingNum) || ratingNum <= 0 ? "7.8" : ratingNum.toFixed(1);

  return (
    <div
      onClick={onSelect}
      className="group relative cursor-pointer overflow-hidden rounded-xl bg-ink-900 border border-white/10 transition-all duration-300 hover:scale-[1.03] hover:border-white/30 hover:shadow-2xl"
    >
      <div className="aspect-[2/3] w-full overflow-hidden bg-ink-800">
        <img
          src={movie.poster}
          alt={movie.title}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          loading="lazy"
          onError={(e) => {
            const target = e.currentTarget;
            if (!target.src.includes("unsplash.com")) {
              target.src = "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=500&auto=format&fit=crop&q=80";
            }
          }}
        />
      </div>

      {/* Floating Rating Badge */}
      <div className="absolute left-2.5 top-2.5 flex items-center gap-1 rounded-full bg-black/75 px-2 py-0.5 text-[11px] font-bold text-white backdrop-blur-md border border-white/15">
        <Star size={11} className="text-amber-400" fill="currentColor" />
        <span>{displayRating}</span>
      </div>

      {/* Hover Overlay with Quick Actions */}
      <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black via-black/50 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100 p-3">
        <div className="flex items-center gap-2 mb-2">
          <button
            onClick={(e) => stopProp(e, onPlay)}
            className="grid h-9 w-9 place-items-center rounded-full bg-[#E50914] text-white transition-transform hover:scale-110 shadow-lg shadow-red-600/40"
            title={`Play ${movie.title}`}
          >
            <Play size={16} fill="currentColor" />
          </button>
          <button
            onClick={(e) => stopProp(e, onToggleList)}
            className="grid h-8 w-8 place-items-center rounded-full border border-white/50 bg-black/60 text-white hover:border-white hover:bg-white hover:text-black transition-colors"
            title={isListed ? "Remove from My List" : "Add to My List"}
          >
            {isListed ? <Check size={15} /> : <Plus size={15} />}
          </button>
          <button
            onClick={(e) => stopProp(e, onToggleLiked)}
            className="grid h-8 w-8 place-items-center rounded-full border border-white/50 bg-black/60 text-white hover:border-white hover:bg-white hover:text-black transition-colors"
            title={isLiked ? "Unlike" : "Like"}
          >
            {isLiked ? (
              <Heart size={15} fill="currentColor" className="text-[#E50914]" />
            ) : (
              <ThumbsUp size={15} />
            )}
          </button>
          <button
            onClick={(e) => stopProp(e, onSelect)}
            className="ml-auto grid h-8 w-8 place-items-center rounded-full border border-white/50 bg-black/60 text-white hover:border-white hover:bg-white hover:text-black transition-colors"
            title="More Info"
          >
            <Info size={15} />
          </button>
        </div>

        <p className="font-bold text-sm text-white truncate drop-shadow">{movie.title}</p>
        <p className="text-[11px] text-fog-500 truncate">
          {movie.year} · {movie.genre}
        </p>
      </div>

      <div className="p-2.5 sm:hidden">
        <p className="font-bold text-xs text-white truncate">{movie.title}</p>
        <p className="text-[10px] text-fog-500">{movie.year} · {movie.genre}</p>
      </div>
    </div>
  );
};
