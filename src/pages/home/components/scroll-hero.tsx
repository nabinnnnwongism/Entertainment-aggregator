import { useRef, useMemo, useState, useEffect } from "react";
import {
  motion,
  useScroll,
  useTransform,
  useMotionValueEvent,
} from "framer-motion";
import { useWindowSize } from "react-use";
import { Film, Tv2, BookOpen, Sword } from "lucide-react";

const TMDB_KEY = "16b270fb12149ed56ef0c8ace96a1c9d";
const TMDB_IMG_BACKDROP = "https://image.tmdb.org/t/p/w1280";

type TmdbItem = {
  id: number;
  title?: string;
  name?: string;
  backdrop_path: string | null;
  poster_path: string | null;
};

const CATEGORIES = [
  {
    key: "movies",
    label: "Movies",
    icon: Film,
    color: "#e25c3f",
    endpoint: "/trending/movie/week?language=en-US",
  },
  {
    key: "anime",
    label: "Anime",
    icon: Sword,
    color: "#7c5cbf",
    endpoint: "/discover/tv?with_genres=16&sort_by=popularity.desc",
  },
  {
    key: "drama",
    label: "Drama",
    icon: Tv2,
    color: "#e86d7b",
    endpoint: "/discover/tv?with_genres=18&sort_by=popularity.desc",
  },
  {
    key: "comics",
    label: "Comics",
    icon: BookOpen,
    color: "#00b94e",
    endpoint: "/trending/tv/week?language=en-US&page=2",
  },
] as const;

import type { LucideIcon } from "lucide-react";

type CategoryCard = {
  key: string;
  label: string;
  icon: LucideIcon;
  color: string;
  backdrop: string;
  title: string;
};

async function fetchOne(endpoint: string): Promise<TmdbItem | null> {
  try {
    const res = await fetch(
      `https://api.themoviedb.org/3${endpoint}&api_key=${TMDB_KEY}`
    );
    const json = await res.json();
    const results: TmdbItem[] = json.results ?? [];
    return results.find((r) => r.backdrop_path) ?? null;
  } catch {
    return null;
  }
}

export function ScrollHero({
  onNavigate,
}: {
  onNavigate?: (section: string) => void;
}) {
  const { width, height } = useWindowSize();
  const wrapperRef = useRef<HTMLDivElement>(null);

  const [cards, setCards] = useState<CategoryCard[]>([]);

  /* ── TMDB fetch ── */
  useEffect(() => {
    let active = true;
    Promise.all(CATEGORIES.map((c) => fetchOne(c.endpoint))).then((results) => {
      if (!active) return;
      setCards(
        CATEGORIES.map((cat, i) => ({
          key: cat.key,
          label: cat.label,
          icon: cat.icon,
          color: cat.color,
          backdrop: results[i]?.backdrop_path
            ? `${TMDB_IMG_BACKDROP}${results[i]!.backdrop_path}`
            : "",
          title: results[i]?.title ?? results[i]?.name ?? cat.label,
        }))
      );
    });
    return () => { active = false; };
  }, []);

  /* ── scroll progress through this 280vh wrapper ── */
  const { scrollYProgress } = useScroll({
    target: wrapperRef,
    offset: ["start start", "end start"],
  });

  /* ── scale: zoom-out as we scroll ── */
  const maximumScale = useMemo(() => {
    const ratio = (height || 800) / (width || 1200);
    return Math.max(1.7, 1.7 * (16 / 9) * ratio);
  }, [width, height]);

  const backdropScale = useTransform(
    scrollYProgress,
    [0, 0.3, 0.58],
    [maximumScale * 1.1, maximumScale, 1]
  );

  /* opacity: STARTS at 1, fades away only at the end */
  const backdropOpacity = useTransform(
    scrollYProgress,
    [0, 0.58, 0.70],
    [1, 1, 0]
  );

  /* eyebrow text: visible immediately, fades out before cards appear */
  const eyebrowOpacity = useTransform(
    scrollYProgress,
    [0, 0.1, 0.55, 0.65],
    [1, 1, 1, 0]
  );
  const eyebrowY = useTransform(scrollYProgress, [0, 0.14], [0, 0]);

  /* cards: fly in from corners starting at 60% */
  const cardsOpacity = useTransform(scrollYProgress, [0.60, 0.70], [0, 1]);
  const cardXLeft  = useTransform(scrollYProgress, [0.60, 0.76], [-55, 0]);
  const cardXRight = useTransform(scrollYProgress, [0.60, 0.76], [55, 0]);
  const cardYTop   = useTransform(scrollYProgress, [0.60, 0.76], [-28, 0]);
  const cardYBottom= useTransform(scrollYProgress, [0.60, 0.76], [28, 0]);

  /* card motions: [x, y] per card index */
  const cardMotions = [
    { x: cardXLeft,  y: cardYTop    },  // top-left
    { x: cardXRight, y: cardYTop    },  // top-right
    { x: cardXLeft,  y: cardYBottom },  // bottom-left
    { x: cardXRight, y: cardYBottom },  // bottom-right
  ];

  /* which backdrop to use as the hero — first trending movie */
  const heroBackdrop = cards[0]?.backdrop ?? "";

  return (
    /* 280vh tall so there's plenty of scroll room */
    <div ref={wrapperRef} className="h-[280vh]">
      {/* sticky viewport */}
      <div className="sticky top-0 h-screen overflow-hidden bg-ink-950">

        {/* ── Full-bleed backdrop that zooms out ── */}
        <motion.div
          className="absolute inset-0 origin-center"
          style={{ scale: backdropScale, opacity: backdropOpacity }}
        >
          {heroBackdrop ? (
            <img
              src={heroBackdrop}
              alt="Featured backdrop"
              className="h-full w-full object-cover"
            />
          ) : (
            /* gradient placeholder while TMDB loads */
            <div className="h-full w-full bg-gradient-to-br from-ink-900 via-ink-800 to-ink-950" />
          )}
          {/* cinematic overlay */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/80" />
        </motion.div>

        {/* ── Centre text (visible during zoom phase) ── */}
        <motion.div
          className="absolute inset-0 z-10 flex flex-col items-center justify-center text-center pointer-events-none px-4"
          style={{ opacity: eyebrowOpacity, y: eyebrowY }}
        >
          <p className="font-body text-[10px] sm:text-xs font-bold uppercase tracking-[0.3em] text-white/70">
            One destination
          </p>
          <h2 className="mt-3 font-display text-[40px] leading-tight tracking-display text-white sm:text-[58px] md:text-[72px] drop-shadow-2xl">
            All your favourites
          </h2>
          <div className="mt-4 h-px w-20 bg-gradient-to-r from-transparent via-white/40 to-transparent" />
        </motion.div>

        {/* ── Category cards grid (visible at end of scroll) ── */}
        <motion.div
          className="absolute inset-0 z-20 flex items-center justify-center"
          style={{ opacity: cardsOpacity }}
        >
          <div className="grid grid-cols-2 gap-3 sm:gap-4 px-4 w-full max-w-3xl">
            {(cards.length > 0 ? cards : CATEGORIES).slice(0, 4).map(
              (card, idx) => {
                const motions = cardMotions[idx];
                const Icon = card.icon;
                const backdrop = "backdrop" in card ? card.backdrop : "";
                return (
                  <motion.button
                    key={card.key}
                    style={{ x: motions.x, y: motions.y }}
                    onClick={() => onNavigate?.(card.key)}
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.96 }}
                    transition={{ type: "spring", stiffness: 300, damping: 22 }}
                    className="group relative h-[120px] sm:h-[160px] md:h-[190px] overflow-hidden rounded-2xl border border-white/10 bg-ink-900 shadow-2xl text-left"
                    aria-label={`Go to ${card.label}`}
                  >
                    {backdrop && (
                      <img
                        src={backdrop}
                        alt={card.label}
                        className="absolute inset-0 h-full w-full object-cover opacity-55 transition-opacity duration-500 group-hover:opacity-70"
                      />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-transparent" />
                    {/* color accent top line */}
                    <div
                      className="absolute inset-x-0 top-0 h-[2px]"
                      style={{ backgroundColor: card.color }}
                    />
                    <div className="absolute inset-x-0 bottom-0 p-3 sm:p-4">
                      <div className="flex items-center gap-2">
                        <span
                          className="grid h-7 w-7 shrink-0 place-items-center rounded-full"
                          style={{
                            backgroundColor: card.color + "30",
                            border: `1px solid ${card.color}55`,
                          }}
                        >
                          <Icon size={14} className="text-white" />
                        </span>
                        <span className="font-body text-sm sm:text-base font-bold text-white tracking-tight">
                          {card.label}
                        </span>
                      </div>
                      {"title" in card && card.title !== card.label && (
                        <p className="mt-1 text-[10px] sm:text-xs text-white/45 truncate pl-9">
                          {card.title}
                        </p>
                      )}
                    </div>
                  </motion.button>
                );
              }
            )}
          </div>
        </motion.div>

        {/* bottom gradient bleed into next section */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-ink-950 to-transparent z-30" />
      </div>
    </div>
  );
}
