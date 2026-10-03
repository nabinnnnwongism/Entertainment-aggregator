import {
  movies as defaultStaticMovies,
  randomMoviesSet1 as defaultRandom1,
  randomMoviesSet2 as defaultRandom2,
} from "../data/movies-data";
import { Button } from "./button";
import {
  useScroll,
  useTransform,
  motion,
  useMotionValueEvent,
} from "framer-motion";
import { useMemo, useRef, useState } from "react";
import { useWindowSize } from "react-use";
import type { TmdbMovie } from "../api/tmdb";
import { Play } from "lucide-react";

type VideoCarouselProps = {
  tmdbMovies?: TmdbMovie[];
  onSelectMovie?: (movie: TmdbMovie) => void;
  onPlayMovie?: (movie: TmdbMovie) => void;
};

export const VideoCarousel = ({
  tmdbMovies = [],
  onSelectMovie,
  onPlayMovie,
}: VideoCarouselProps) => {
  const { width, height } = useWindowSize();
  const carouselWrapperRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: carouselWrapperRef,
    offset: ["start start", "end start"],
  });

  const maximumScale = useMemo(() => {
    const windowYRatio = (height || 800) / (width || 1200);
    const xScale = 1.66667;
    const yScale = xScale * (16 / 9) * windowYRatio;
    return Math.max(xScale, yScale);
  }, [width, height]);

  const scale = useTransform(
    scrollYProgress,
    [0.3, 0.5, 0.66],
    [maximumScale * 1.1, maximumScale, 1]
  );

  const postersOpacity = useTransform(scrollYProgress, [0.64, 0.66], [0, 1]);
  const posterTranslateXLeft = useTransform(
    scrollYProgress,
    [0.64, 0.66],
    [-20, 0]
  );
  const posterTranslateXRight = useTransform(
    scrollYProgress,
    [0.64, 0.66],
    [20, 0]
  );

  const [carouselVariant, setCarouselVariant] = useState<"inactive" | "active">(
    "inactive"
  );
  useMotionValueEvent(scrollYProgress, "change", (progress) => {
    if (progress >= 0.67) {
      setCarouselVariant("active");
    } else {
      setCarouselVariant("inactive");
    }
  });

  const leftMovie = tmdbMovies[1];
  const centerMovie = tmdbMovies[0] || tmdbMovies[2];
  const rightMovie = tmdbMovies[3] || tmdbMovies[4];

  const leftPoster =
    leftMovie?.backdrop || leftMovie?.poster || defaultStaticMovies[0].poster;
  const leftTitle = leftMovie?.title || defaultStaticMovies[0].name;

  const centerPoster =
    centerMovie?.backdrop || centerMovie?.poster || defaultStaticMovies[1].poster;
  const centerTitle = centerMovie?.title || "Featured Premiere";
  const centerGenre = centerMovie?.genre || "Action · Sci-Fi";
  const centerRating = centerMovie?.rating ? centerMovie.rating.toFixed(1) : "8.5";

  const rightPoster =
    rightMovie?.backdrop || rightMovie?.poster || defaultStaticMovies[2].poster;
  const rightTitle = rightMovie?.title || defaultStaticMovies[2].name;

  const marqueeSet1 =
    tmdbMovies.length >= 6
      ? tmdbMovies.slice(0, 10)
      : defaultRandom1.map((m, i) => ({
          id: i,
          title: m.name,
          backdrop: m.poster,
          poster: m.poster,
          year: "2024",
          genre: "Cinema",
          synopsis: "",
          rating: 8,
        }));
  const marqueeSet2 =
    tmdbMovies.length >= 10
      ? tmdbMovies.slice(5, 15)
      : defaultRandom2.map((m, i) => ({
          id: i + 100,
          title: m.name,
          backdrop: m.poster,
          poster: m.poster,
          year: "2024",
          genre: "Cinema",
          synopsis: "",
          rating: 8,
        }));

  return (
    <motion.div animate={carouselVariant} className="bg-background pb-12 font-apple">
      <div
        ref={carouselWrapperRef}
        className="mt-[-100vh] h-[300vh] overflow-clip"
      >
        <div className="sticky top-0 flex h-screen items-center">
          <div className="relative left-1/2 mb-5 flex -translate-x-1/2 gap-5">
            {/* Left Movie Card */}
            <motion.div
              style={{ opacity: postersOpacity, x: posterTranslateXLeft }}
              onClick={() => leftMovie && onSelectMovie?.(leftMovie)}
              className="aspect-[9/16] w-[300px] shrink-0 cursor-pointer overflow-clip rounded-2xl md:aspect-video md:w-[60vw] group bg-ink-900 border border-white/10"
            >
              <img
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                src={leftPoster}
                alt={leftTitle}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-5">
                <p className="text-white font-semibold text-lg drop-shadow">{leftTitle}</p>
              </div>
            </motion.div>

            {/* Center Main Scaling Movie Card */}
            <motion.div
              style={{ scale }}
              className="relative aspect-[9/16] w-[300px] shrink-0 overflow-clip rounded-2xl md:aspect-video md:w-[60vw] bg-ink-900 shadow-2xl border border-white/15"
            >
              <img
                className="h-full w-full object-cover"
                src={centerPoster}
                alt={centerTitle}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent pointer-events-none" />
              <motion.div
                variants={{
                  active: { opacity: 1 },
                  inactive: { opacity: 0 },
                }}
                className="absolute bottom-0 left-0 flex w-full flex-col items-start gap-3 p-6 text-white md:flex-row md:items-end md:justify-between"
              >
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-ember-500">
                    ★ {centerRating} · {centerGenre}
                  </p>
                  <h3 className="text-xl md:text-3xl font-bold tracking-tight text-white drop-shadow">
                    {centerTitle}
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    className="flex items-center gap-2"
                    onClick={() => {
                      if (centerMovie) {
                        onPlayMovie?.(centerMovie);
                      }
                    }}
                  >
                    <Play size={16} fill="currentColor" />
                    <span>Watch now</span>
                  </Button>
                  {centerMovie && (
                    <button
                      onClick={() => onSelectMovie?.(centerMovie)}
                      className="rounded-full border border-white/30 bg-black/50 px-4 py-3 text-sm font-medium text-white backdrop-blur hover:bg-white/20 transition-colors"
                    >
                      Details
                    </button>
                  )}
                </div>
              </motion.div>
            </motion.div>

            {/* Right Movie Card */}
            <motion.div
              style={{ opacity: postersOpacity, x: posterTranslateXRight }}
              onClick={() => rightMovie && onSelectMovie?.(rightMovie)}
              className="aspect-[9/16] w-[300px] shrink-0 cursor-pointer overflow-clip rounded-2xl md:aspect-video md:w-[60vw] group bg-ink-900 border border-white/10"
            >
              <img
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                src={rightPoster}
                alt={rightTitle}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-5">
                <p className="text-white font-semibold text-lg drop-shadow">{rightTitle}</p>
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Dual continuous scrolling small video carousels */}
      <motion.div
        variants={{
          active: { opacity: 1, y: 0 },
          inactive: { opacity: 0, y: 20 },
        }}
        transition={{ duration: 0.4 }}
        className="-mt-[calc((100vh-(300px*(16/9)))/2)] space-y-3 pt-4 md:-mt-[calc((100vh-(60vw*(9/16)))/2)]"
      >
        <SmallVideoCarousel
          movies={marqueeSet1 as any}
          onSelectMovie={onSelectMovie}
        />
        <div className="[--carousel-offset:-32px] [--duration:74s]">
          <SmallVideoCarousel
            movies={marqueeSet2 as any}
            onSelectMovie={onSelectMovie}
          />
        </div>
      </motion.div>
    </motion.div>
  );
};

const SmallVideoCarousel = ({
  movies,
  onSelectMovie,
}: {
  movies: Array<TmdbMovie | { name: string; poster: string }>;
  onSelectMovie?: (movie: TmdbMovie) => void;
}) => {
  return (
    <div className="overflow-clip">
      <div className="animate-carousel-move relative left-[var(--carousel-offset,0px)] flex gap-3">
        {movies.concat(movies).map((movie: any, index) => {
          const title = movie.title || movie.name;
          const img = movie.backdrop || movie.poster;
          return (
            <div
              className="aspect-video w-[40vw] shrink-0 md:w-[23vw] cursor-pointer group relative overflow-hidden rounded-xl bg-ink-900 border border-white/10"
              key={`${title}-${index}`}
              onClick={() => {
                if (movie.id && onSelectMovie) {
                  onSelectMovie(movie as TmdbMovie);
                }
              }}
            >
              <img
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                src={img}
                alt={title}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-3 flex flex-col justify-end">
                <p className="text-white text-xs md:text-sm font-semibold truncate">{title}</p>
                {movie.genre && (
                  <p className="text-[11px] text-fog-500 truncate">{movie.genre}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
