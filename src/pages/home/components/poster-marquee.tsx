import { useEffect, useRef, useState } from "react";
import {
  motion,
  useScroll,
  useTransform,
  useSpring,
} from "framer-motion";

const TMDB_KEY = "16b270fb12149ed56ef0c8ace96a1c9d";
const TMDB_IMG = "https://image.tmdb.org/t/p/w342";

type Poster = {
  id: number;
  title: string;
  poster_path: string | null;
  vote_average: number;
  release_date?: string;
};

async function fetchRow(path: string): Promise<Poster[]> {
  const res = await fetch(
    `https://api.themoviedb.org/3${path}&api_key=${TMDB_KEY}`
  );
  if (!res.ok) throw new Error("TMDB fetch failed");
  const json = await res.json();
  return (json.results ?? []).filter((m: Poster) => m.poster_path);
}

function MarqueeCard({ poster }: { poster: Poster }) {
  const src = `${TMDB_IMG}${poster.poster_path}`;
  const year = poster.release_date?.slice(0, 4) ?? "";
  return (
    <div className="home-marquee-card relative h-[208px] w-[138px] shrink-0 overflow-hidden rounded-xl sm:h-[240px] sm:w-[160px]">
      <img
        src={src}
        alt={poster.title}
        loading="lazy"
        className="h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent pointer-events-none" />
      <div className="home-marquee-label absolute inset-x-0 bottom-0 p-3 translate-y-1 opacity-0 transition-all duration-300">
        <p className="truncate text-[11px] font-bold leading-tight text-white drop-shadow">
          {poster.title}
        </p>
        {year && (
          <p className="mt-0.5 text-[10px] text-white/60 font-medium">{year}</p>
        )}
      </div>
      {poster.vote_average > 0 && (
        <div className="absolute right-2 top-2 flex items-center gap-0.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-amber-400 backdrop-blur-md border border-white/10">
          ★ {poster.vote_average.toFixed(1)}
        </div>
      )}
    </div>
  );
}

type RowProps = {
  posters: Poster[];
  direction: "left" | "right";
  speed: string;
  /** framer-motion x offset driven by scroll (pixels) */
  scrollX: ReturnType<typeof useTransform<number, number>>;
};

function MarqueeRow({ posters, direction, speed, scrollX }: RowProps) {
  if (posters.length === 0) return null;
  const set = [...posters, ...posters, ...posters];
  const animClass =
    direction === "left"
      ? "home-marquee-track-left"
      : "home-marquee-track-right";

  return (
    <div
      className="overflow-hidden"
      style={{ "--marquee-speed": speed } as React.CSSProperties}
    >
      {/* outer motion.div applies the scroll-driven shift on top of CSS animation */}
      <motion.div style={{ x: scrollX }}>
        <div className={`flex gap-3 ${animClass}`}>
          {set.map((p, i) => (
            <MarqueeCard key={`${p.id}-${i}`} poster={p} />
          ))}
        </div>
      </motion.div>
    </div>
  );
}

type HomePosterMarqueeProps = {
  label?: string;
  sublabel?: string;
};

export function HomePosterMarquee({
  label = "Everything. One Place.",
  sublabel = "Movies · Anime · Drama · Comics",
}: HomePosterMarqueeProps) {
  const [row1, setRow1] = useState<Poster[]>([]);
  const [row2, setRow2] = useState<Poster[]>([]);
  const [row3, setRow3] = useState<Poster[]>([]);

  const sectionRef = useRef<HTMLElement>(null);

  /* ── scroll progress through this section ── */
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"],
  });

  /*
   * Map [0→1] scroll progress to pixel offsets.
   * Row 1 & 3 drift left  (negative) as we scroll down.
   * Row 2 drifts right (positive).
   * Spring adds smooth easing so it doesn't feel mechanical.
   */
  const rawLeft = useTransform(scrollYProgress, [0, 1], [60, -60]);
  const rawRight = useTransform(scrollYProgress, [0, 1], [-60, 60]);

  const springCfg = { stiffness: 60, damping: 20, mass: 1 };
  const shiftLeft = useSpring(rawLeft, springCfg);
  const shiftRight = useSpring(rawRight, springCfg);

  /* ── TMDB fetch ── */
  useEffect(() => {
    let active = true;
    Promise.all([
      fetchRow("/trending/movie/week?language=en-US&page=1"),
      fetchRow("/movie/top_rated?language=en-US&page=1"),
      fetchRow("/trending/movie/week?language=en-US&page=2"),
    ])
      .then(([r1, r2, r3]) => {
        if (!active) return;
        setRow1(r1.slice(0, 18));
        setRow2(r2.slice(0, 18));
        setRow3(r3.slice(0, 18));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const ready = row1.length > 0;

  return (
    <section ref={sectionRef} className="relative overflow-hidden bg-ink-950 py-0">
      {/* ── rows ── */}
      <div
        className={`space-y-3 transition-opacity duration-700 ${
          ready ? "opacity-100" : "opacity-0"
        }`}
      >
        <MarqueeRow
          posters={row1}
          direction="left"
          speed="72s"
          scrollX={shiftLeft}
        />
        <MarqueeRow
          posters={row2}
          direction="right"
          speed="80s"
          scrollX={shiftRight}
        />
        <MarqueeRow
          posters={row3}
          direction="left"
          speed="66s"
          scrollX={shiftLeft}
        />
      </div>

      {/* ── cinematic center overlay ── */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_55%_65%_at_50%_50%,rgba(6,6,10,0.72)_0%,rgba(6,6,10,0)_100%)]" />
        <div className="relative z-10 text-center px-4">
          <p className="mb-3 text-[10px] sm:text-xs font-bold uppercase tracking-[0.25em] text-white/50">
            {sublabel}
          </p>
          <h2 className="font-display text-[36px] leading-tight tracking-display text-paper-100 sm:text-[52px] md:text-[64px] drop-shadow-2xl">
            {label}
          </h2>
          <div className="mt-3 mx-auto h-px w-24 bg-gradient-to-r from-transparent via-white/30 to-transparent" />
        </div>
      </div>

      {/* ── top & bottom fade ── */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-ink-950 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-ink-950 to-transparent" />

      {/* skeleton shimmer */}
      {!ready && (
        <div className="absolute inset-0 flex flex-col gap-3 overflow-hidden opacity-30">
          {[72, 80, 66].map((_, rowIdx) => (
            <div key={rowIdx} className="flex gap-3">
              {Array.from({ length: 12 }).map((_, i) => (
                <div
                  key={i}
                  className="h-[208px] w-[138px] shrink-0 rounded-xl bg-ink-800 animate-pulse sm:h-[240px] sm:w-[160px]"
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
