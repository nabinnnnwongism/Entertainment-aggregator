import { DriftHero } from "./components/drift-hero";
import { StaffPick } from "./components/staff-pick";
import { TrendingRail } from "./components/trending-rail";
import { HomePosterMarquee } from "./components/poster-marquee";
import { SiteFooter } from "../../shared/components/site-footer";
import type { AnimeMedia } from "../../shared/api/anime";

export function HomePage({
  onOpen,
  onOpenAnime,
  onNavigateCategory,
}: {
  onOpen: () => void;
  onOpenAnime?: (anime: AnimeMedia) => void;
  onNavigateCategory?: (category: "anime" | "movies" | "drama" | "comics") => void;
}) {
  return (
    <>
      <DriftHero
        onStartWatching={onOpen}
        onOpenAnime={onOpenAnime}
        onNavigateCategory={onNavigateCategory}
      />
      <HomePosterMarquee
        label="Everything. One Place."
        sublabel="Movies · Anime · Drama · Comics"
      />
      <TrendingRail
        onOpen={(anime) => {
          if (onOpenAnime) {
            onOpenAnime(anime);
          } else {
            onOpen();
          }
        }}
      />
      <StaffPick onOpen={onOpen} />
      <SiteFooter />
    </>
  );
}
