import { Play, Sparkles, Sword, Film, Tv2, BookOpen } from "lucide-react";
import { useEffect, useState } from "react";
import { DriftWall, type DriftWallItem } from "./DriftWall";
import { fetchTrendingAnime, type AnimeMedia } from "../../../shared/api/anime";
import { fetchDramaHome } from "../../../shared/api/drama";
import { fetchComicsHome } from "../../../shared/api/comics";

const FALLBACK_POSTERS = [
  "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=600&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1534447677768-be436bb09401?w=600&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1563089145-599997674d42?w=600&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=600&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1618336753974-aae8e04506aa?w=600&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1579783902614-a3fb3927b675?w=600&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1569701813229-33284b643e3c?w=600&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1608889825205-eebdb9fc5806?w=600&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1514539079130-25950c84af65?w=600&auto=format&fit=crop&q=80",
];

export function DriftHero({
  onStartWatching,
  onOpenAnime,
  onNavigateCategory,
}: {
  onStartWatching?: () => void;
  onOpenAnime?: (anime: AnimeMedia) => void;
  onNavigateCategory?: (category: "anime" | "movies" | "drama" | "comics") => void;
}) {
  const [items, setItems] = useState<DriftWallItem[]>(
    FALLBACK_POSTERS.map((img, i) => ({
      image: img,
      title: `Featured Title ${i + 1}`,
    }))
  );

  useEffect(() => {
    let active = true;

    async function loadDynamicPosters() {
      try {
        const [animeList, dramaHome, comicsHome] = await Promise.allSettled([
          fetchTrendingAnime(1, 15),
          fetchDramaHome(),
          fetchComicsHome(),
        ]);

        const wallItems: DriftWallItem[] = [];

        // Add Anime items
        if (animeList.status === "fulfilled" && animeList.value.length > 0) {
          animeList.value.forEach((a) => {
            const img = a.coverImage?.extraLarge || a.coverImage?.large || a.bannerImage;
            if (img) {
              wallItems.push({
                image: img,
                title: a.title?.english || a.title?.romaji || "Anime",
                data: a,
              });
            }
          });
        }

        // Add Drama items
        if (dramaHome.status === "fulfilled" && dramaHome.value?.show?.length) {
          dramaHome.value.show.forEach((d) => {
            if (d.thumbnail) {
              wallItems.push({
                image: d.thumbnail,
                title: d.title,
              });
            }
          });
        }

        // Add Comics items
        if (comicsHome.status === "fulfilled" && comicsHome.value?.trending?.length) {
          comicsHome.value.trending.forEach((c) => {
            if (c.cover) {
              wallItems.push({
                image: c.cover,
                title: c.title,
              });
            }
          });
        }

        if (active && wallItems.length >= 6) {
          // Shuffle slightly for vibrant diversity across columns
          setItems(wallItems.sort(() => 0.5 - Math.random()));
        }
      } catch (err) {
        console.warn("Could not load dynamic drift posters:", err);
      }
    }

    loadDynamicPosters();
    return () => {
      active = false;
    };
  }, []);

  const handleTileClick = (tile: DriftWallItem) => {
    if (tile.data && onOpenAnime) {
      onOpenAnime(tile.data);
    } else if (onStartWatching) {
      onStartWatching();
    }
  };

  return (
    <section className="relative h-[88vh] min-h-[640px] max-h-[920px] w-full overflow-hidden bg-ink-950">
      {/* Background 3D Drift Wall */}
      <div className="absolute inset-0 z-0">
        <DriftWall
          items={items}
          columns={5}
          tileWidth={230}
          tileHeight={150}
          gap={20}
          radius={14}
          tilt={16}
          turn={-14}
          roll={0}
          perspective={1200}
          depth={120}
          speed={36}
          direction="up"
          variance={0.45}
          parallax={0.7}
          pauseOnHover={false}
          lift={68}
          fade={0.65}
          dim={0.48}
          overlayColor="#050608"
          onItemClick={handleTileClick}
          className="h-full w-full"
        />
      </div>

      {/* Dark gradient overlay for text readability */}
      <div
        className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-t from-ink-950 via-ink-950/40 to-ink-950/80"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-r from-ink-950/90 via-ink-950/30 to-transparent"
        aria-hidden
      />

      {/* Floating Center Hero Content */}
      <div className="relative z-20 mx-auto flex h-full max-w-[1440px] flex-col justify-end px-4 pb-16 pt-24 sm:px-8 sm:pb-20 lg:px-12">
        <div className="max-w-3xl">
          {/* Eyebrow badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-gold-500/30 bg-ink-900/80 px-3.5 py-1 text-xs font-semibold text-gold-500 backdrop-blur shadow-xl">
            <Sparkles size={14} className="text-gold-500" />
            <span className="tracking-wide uppercase text-[11px]">Everything. One Place.</span>
          </div>

          {/* Big Headline */}
          <h1 className="mt-4 font-display text-[46px] font-black leading-[0.98] tracking-display text-paper-100 sm:text-[68px] lg:text-[76px]">
            The Universe of{" "}
            <span className="bg-gradient-to-r from-gold-500 via-paper-100 to-fog-500 bg-clip-text text-transparent">
              Unlimited Entertainment
            </span>
          </h1>

          <p className="mt-5 max-w-xl font-body text-base leading-relaxed text-fog-500 sm:text-lg">
            Stream thousands of Japanese Anime, Blockbuster Movies, Korean &amp; Asian Dramas, and read Manga &amp; Webtoons in Ultra HD.
          </p>

          {/* Primary Action Buttons */}
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <button
              onClick={onStartWatching}
              className="inline-flex items-center gap-2.5 rounded-full bg-gold-500 px-7 py-3.5 font-body text-sm font-bold text-ink-950 shadow-[0_8px_24px_rgba(234,179,8,0.35)] transition-all hover:scale-105 hover:bg-gold-400 active:scale-95"
            >
              <Play size={18} fill="currentColor" />
              Start Watching Free
            </button>

            {/* Quick jump category pills */}
            {onNavigateCategory && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => onNavigateCategory("anime")}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-ink-900/80 px-4 py-2 text-xs font-semibold text-paper-100 backdrop-blur transition-all hover:border-gold-500 hover:text-gold-500"
                >
                  <Sword size={14} /> Anime
                </button>
                <button
                  onClick={() => onNavigateCategory("movies")}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-ink-900/80 px-4 py-2 text-xs font-semibold text-paper-100 backdrop-blur transition-all hover:border-ember-500 hover:text-ember-500"
                >
                  <Film size={14} /> Movies
                </button>
                <button
                  onClick={() => onNavigateCategory("drama")}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-ink-900/80 px-4 py-2 text-xs font-semibold text-paper-100 backdrop-blur transition-all hover:border-[#E86D7B] hover:text-[#E86D7B]"
                >
                  <Tv2 size={14} /> Drama
                </button>
                <button
                  onClick={() => onNavigateCategory("comics")}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-ink-900/80 px-4 py-2 text-xs font-semibold text-paper-100 backdrop-blur transition-all hover:border-[#00D564] hover:text-[#00D564]"
                >
                  <BookOpen size={14} /> Comics
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
