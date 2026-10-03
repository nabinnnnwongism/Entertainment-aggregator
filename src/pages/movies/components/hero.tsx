import { Button } from "./button";
import { Container } from "./container";
import { useScroll, useTransform, motion } from "framer-motion";
import { useRef } from "react";
import type { TmdbMovie } from "../api/tmdb";
import { Play } from "lucide-react";

type HeroProps = {
  heroMovie?: TmdbMovie | null;
  onStreamNow?: () => void;
  onPlayMovie?: (movie: TmdbMovie) => void;
};

export const Hero = ({ heroMovie, onStreamNow, onPlayMovie }: HeroProps) => {
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: videoContainerRef,
    offset: ["start start", "end end"],
  });
  const opacity = useTransform(scrollYProgress, [0, 0.7, 1], [1, 1, 0]);

  const bgImage = heroMovie?.backdrop || "/img/apple-tv-rebuild/posters/napoleon.webp";

  return (
    <div className="bg-background text-white font-apple">
      <motion.div
        style={{ opacity }}
        ref={videoContainerRef}
        className="absolute -top-[--header-height] left-0 h-[200vh] w-full"
      >
        <img
          className="sticky top-0 h-screen w-full object-cover brightness-[0.82]"
          src={bgImage}
          alt={heroMovie?.title || "Hero Backdrop"}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-black/60 pointer-events-none" />
      </motion.div>
      <Container className="relative z-10 h-[--hero-height] pb-10">
        <motion.div
          className="flex h-full flex-col items-start justify-end"
          variants={{
            hidden: { opacity: 0, y: 15 },
            visible: { opacity: 1, y: 0 },
          }}
          transition={{ duration: 0.6 }}
          whileInView="visible"
          exit="hidden"
          animate="hidden"
          viewport={{ amount: 0.98 }}
        >
          {heroMovie && (
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-ember-500">
              Featured Premiere · {heroMovie.genre}
            </p>
          )}
          <h1 className="mb-4 text-4xl font-bold md:text-6xl tracking-tight text-white drop-shadow-lg">
            {heroMovie ? (
              heroMovie.title
            ) : (
              <>
                All Blockbusters &amp; Originals. <br />
                Only on EetNet Movies.
              </>
            )}
          </h1>
          {heroMovie?.synopsis && (
            <p className="mb-8 max-w-xl text-sm md:text-base text-white/80 line-clamp-2">
              {heroMovie.synopsis}
            </p>
          )}
          <div className="mb-12 flex items-center gap-3">
            <Button
              className="flex items-center gap-2 shadow-2xl"
              size="large"
              onClick={() => {
                if (heroMovie && onPlayMovie) {
                  onPlayMovie(heroMovie);
                } else if (onStreamNow) {
                  onStreamNow();
                }
              }}
            >
              <Play size={18} fill="currentColor" />
              <span>Stream now</span>
            </Button>
            <button
              onClick={onStreamNow}
              className="rounded-full border border-white/25 bg-white/10 px-6 py-4 text-sm md:text-base font-medium text-white backdrop-blur transition-colors hover:bg-white/20"
            >
              Explore Catalog
            </button>
          </div>
          <p className="font-semibold text-white/90 text-sm">
            Watch on any screen. Stream in 4K HDR.
          </p>
        </motion.div>
      </Container>
    </div>
  );
};
