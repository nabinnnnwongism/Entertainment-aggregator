import { Play, Plus, RotateCw } from "lucide-react";
import { useEffect, useState } from "react";
import { getFeaturedAnime, type FeaturedAnime } from "../../anime/api/anime-api";
import { Button } from "../../../shared/components/button";

type HeroState =
  | { status: "loading" }
  | { status: "ready"; anime: FeaturedAnime }
  | { status: "unavailable" };

const designReviewAnime: FeaturedAnime = {
  id: -1,
  title: "The Glass Meridian",
  description:
    "A lone courier follows a vanished rail line across a drowned city, carrying the only map that can lead its people home.",
  image: "/mock/hero-review.avif",
  episodes: 12,
};

export function EditorialHero({
  designReview = false,
  onOpen,
}: {
  designReview?: boolean;
  onOpen?: () => void;
}) {
  const [state, setState] = useState<HeroState>({ status: "loading" });

  async function loadFeaturedAnime() {
    setState({ status: "loading" });
    try {
      setState({ status: "ready", anime: await getFeaturedAnime() });
    } catch {
      setState({ status: "unavailable" });
    }
  }

  useEffect(() => {
    if (designReview) {
      setState({ status: "ready", anime: designReviewAnime });
      return;
    }
    void loadFeaturedAnime();
  }, [designReview]);

  if (state.status === "loading") {
    return (
      <section
        className="min-h-[calc(100svh-4rem)] animate-pulse bg-ink-900"
        aria-label="Loading featured anime"
        aria-busy="true"
      >
        <div className="mx-auto flex min-h-[calc(100svh-4rem)] max-w-[1440px] items-end px-4 pb-16 sm:px-8 lg:px-12">
          <div className="w-full max-w-[30rem] space-y-4">
            <div className="h-4 w-24 bg-ink-800" />
            <div className="h-16 w-full bg-ink-800" />
            <div className="h-5 w-3/4 bg-ink-800" />
          </div>
        </div>
      </section>
    );
  }

  if (state.status === "unavailable") {
    return (
      <section className="min-h-[calc(100svh-4rem)] bg-ink-900">
        <div className="mx-auto flex min-h-[calc(100svh-4rem)] max-w-[1440px] items-end px-4 pb-16 sm:px-8 lg:px-12">
          <div className="max-w-[30rem]">
            <p className="font-body text-sm text-fog-500">
              EetNet / editorial selection
            </p>
            <h1 className="mt-4 font-display text-[49px] leading-[51px] tracking-display text-paper-100 sm:text-[61px] sm:leading-[63px]">
              The catalogue is unavailable.
            </h1>
            <p className="mt-6 font-body text-base leading-6 text-fog-500">
              Start the Anime API, then try again.
            </p>
            <Button className="mt-8" onClick={() => void loadFeaturedAnime()}>
              <RotateCw size={17} strokeWidth={1.7} />
              Try again
            </Button>
          </div>
        </div>
      </section>
    );
  }

  const { anime } = state;
  return (
    <section className="relative min-h-[calc(100svh-4rem)] overflow-hidden bg-ink-900">
      <div
        className="absolute inset-0 bg-cover bg-center opacity-70"
        style={anime.image ? { backgroundImage: `url("${anime.image}")` } : undefined}
        aria-hidden
      />
      <div
        className="absolute inset-0 bg-gradient-to-r from-ink-950 via-ink-950/90 to-ink-950/20"
        aria-hidden
      />
      <div className="relative mx-auto flex min-h-[calc(100svh-4rem)] items-end px-4 pb-16 pt-32 sm:px-8 lg:px-12">
        <div className="max-w-[30rem]">
          {designReview ? (
            <p className="font-body text-xs font-medium uppercase tracking-[0.16em] text-gold-500">
              Design review / mock data
            </p>
          ) : (
            <p className="font-body text-sm text-fog-500">
              EetNet / editorial selection
            </p>
          )}
          <h1 className="mt-4 font-display text-[49px] leading-[51px] tracking-display text-paper-100 sm:text-[61px] sm:leading-[63px]">
            {anime.title}
          </h1>
          {anime.episodes && (
            <p className="mt-4 font-body text-sm text-fog-500">
              {anime.episodes} episodes
            </p>
          )}
          {anime.description && (
            <p className="mt-6 line-clamp-3 font-body text-base leading-6 text-paper-100/85">
              {anime.description}
            </p>
          )}
          <div className="mt-8 flex flex-wrap gap-4">
            <Button onClick={onOpen}>
              <Play size={17} strokeWidth={1.7} fill="currentColor" />
              Play now
            </Button>
            <Button variant="secondary" onClick={onOpen}>
              <Plus size={17} strokeWidth={1.7} />
              My list
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
