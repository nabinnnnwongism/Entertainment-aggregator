import { motion, type Variants } from "framer-motion";
import { useEffect, useState } from "react";
import { SectionHeader } from "../../../shared/components/section-header";
import { DiscoveryCard } from "./discovery-card";
import { fetchTrendingAnime, type AnimeMedia } from "../../../shared/api/anime";
import { isHindiDubbed } from "../../../shared/data/hindi-dubbed-ids";

const containerVariants: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.05,
    },
  },
};

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 36, scale: 0.97 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.55, ease: "easeOut" },
  },
};

const headerVariants: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: "easeOut" },
  },
};

export function TrendingRail({ onOpen }: { onOpen?: (anime: AnimeMedia) => void }) {
  const [trending, setTrending] = useState<AnimeMedia[]>([]);

  useEffect(() => {
    fetchTrendingAnime(1, 10)
      .then((res) => setTrending(res))
      .catch((err) => console.warn("Failed to load trending anime:", err));
  }, []);

  if (trending.length === 0) return null;

  return (
    <section className="bg-ink-950 py-16 sm:py-24" aria-labelledby="trending-heading">
      <div className="mx-auto max-w-[1440px] px-4 sm:px-8 lg:px-12">
        <motion.div
          variants={headerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
        >
          <SectionHeader
            eyebrow="Trending this season"
            title="Curated Japanese animation"
          />
        </motion.div>

        <motion.div
          className="flex gap-4 overflow-x-auto pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="region"
          aria-label="Trending anime list"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-60px" }}
        >
          {trending.map((anime) => {
            const title = anime.title?.english || anime.title?.romaji || "Anime";
            const cover = anime.coverImage?.extraLarge || anime.coverImage?.large || "";
            const detail = `${anime.episodes ? `${anime.episodes} eps` : "Series"} · ★ ${
              anime.averageScore ? (anime.averageScore / 10).toFixed(1) : "Popular"
            }`;

            return (
              <motion.div key={anime.id} variants={cardVariants} className="shrink-0 w-60 sm:w-64">
                <DiscoveryCard
                  title={title}
                  detail={detail}
                  image={cover}
                  imagePosition="center"
                  isHindiDubbed={isHindiDubbed(anime.id)}
                  onOpen={() => onOpen?.(anime)}
                />
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
