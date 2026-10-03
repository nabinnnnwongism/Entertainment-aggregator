import { ArrowLeft, Loader2, Play } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../../../shared/components/button";
import {
  fetchAnimeDetails,
  type AnimeEpisode,
  type AnimeMedia,
} from "../../../shared/api/anime";

type AnimeDetailProps = {
  anime: AnimeMedia | null;
  onBack: () => void;
  onPlayEpisode: (
    episode: number,
    dub: "sub" | "eng" | "hin",
    anime: AnimeMedia,
    episodes: AnimeEpisode[]
  ) => void;
};

export function AnimeDetail({ anime, onBack, onPlayEpisode }: AnimeDetailProps) {
  const [details, setDetails] = useState<AnimeMedia | null>(anime);
  const [episodes, setEpisodes] = useState<AnimeEpisode[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDub, setSelectedDub] = useState<"sub" | "eng" | "hin">("sub");

  useEffect(() => {
    if (!anime) return;
    let active = true;
    setLoading(true);

    fetchAnimeDetails(anime.id)
      .then((data) => {
        if (!active) return;
        setDetails(data.anime || anime);
        setEpisodes(data.episodes || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load anime details:", err);
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [anime]);

  if (!anime) {
    return (
      <section className="bg-ink-950 py-20 text-center text-fog-500">
        <p>No anime selected.</p>
        <Button className="mt-4" onClick={onBack}>
          Go back
        </Button>
      </section>
    );
  }

  const currentAnime = details || anime;
  const title = currentAnime.title.english || currentAnime.title.romaji || "Anime Details";
  const banner = currentAnime.bannerImage || currentAnime.coverImage?.extraLarge || currentAnime.coverImage?.large;
  const rawDescription = currentAnime.description?.replace(/<[^>]*>/g, "") || "No description available.";

  return (
    <>
      <section className="relative min-h-[34rem] overflow-hidden bg-ink-900">
        {banner && (
          <img
            className="absolute inset-0 h-full w-full object-cover object-center opacity-40"
            src={banner}
            alt={title}
          />
        )}
        <div
          className="absolute inset-0 bg-gradient-to-r from-ink-950 via-ink-950/90 to-ink-950/20"
          aria-hidden
        />
        <div className="relative mx-auto flex min-h-[34rem] max-w-[1440px] flex-col justify-end px-4 pb-16 pt-24 sm:px-8 lg:px-12">
          <button
            className="mb-auto inline-flex w-fit items-center gap-2 font-body text-sm text-fog-500 transition-[transform,opacity,color] duration-200 hover:-translate-y-0.5 hover:text-paper-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
            onClick={onBack}
          >
            <ArrowLeft size={17} strokeWidth={1.7} />
            Back to catalogue
          </button>
          <div className="max-w-[40rem]">
            <div className="flex flex-wrap gap-2 text-xs font-semibold text-gold-500 uppercase tracking-widest">
              <span>{currentAnime.seasonYear || "Anime"}</span>
              {currentAnime.format && <span>• {currentAnime.format}</span>}
              {currentAnime.averageScore && (
                <span className="text-paper-100 bg-white/10 px-2 py-0.5 rounded">
                  ★ {(currentAnime.averageScore / 10).toFixed(1)}
                </span>
              )}
            </div>
            <h1 className="mt-4 font-display text-[42px] leading-[46px] tracking-display text-paper-100 sm:text-[54px] sm:leading-[58px]">
              {title}
            </h1>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-fog-500">
              {currentAnime.genres?.map((g) => (
                <span key={g} className="rounded-full bg-ink-800 px-3 py-1 text-paper-100/80">
                  {g}
                </span>
              ))}
            </div>
            <p className="mt-5 line-clamp-4 font-body text-sm leading-6 text-paper-100/85 sm:text-base">
              {rawDescription}
            </p>

            {/* Audio selector & Start Watch button */}
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Button onClick={() => onPlayEpisode(1, selectedDub, currentAnime, episodes)}>
                <Play size={17} strokeWidth={1.7} fill="currentColor" />
                Start watching
              </Button>

              {/* Dub selector pills */}
              <div className="flex items-center rounded-full border border-ink-700 bg-ink-800/80 p-1 text-xs font-semibold">
                <button
                  onClick={() => setSelectedDub("sub")}
                  className={`rounded-full px-3 py-1.5 transition-all ${
                    selectedDub === "sub"
                      ? "bg-gold-500 text-black font-bold shadow"
                      : "text-fog-500 hover:text-white"
                  }`}
                >
                  Sub (JP)
                </button>
                <button
                  onClick={() => setSelectedDub("eng")}
                  className={`rounded-full px-3 py-1.5 transition-all ${
                    selectedDub === "eng"
                      ? "bg-gold-500 text-black font-bold shadow"
                      : "text-fog-500 hover:text-white"
                  }`}
                >
                  Dub (EN)
                </button>
                <button
                  onClick={() => setSelectedDub("hin")}
                  className={`rounded-full px-3 py-1.5 transition-all ${
                    selectedDub === "hin"
                      ? "bg-gold-500 text-black font-bold shadow"
                      : "text-fog-500 hover:text-white"
                  }`}
                >
                  Hindi Dub
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-ink-950 py-16 sm:py-24">
        <div className="mx-auto max-w-[1440px] px-4 sm:px-8 lg:px-12">
          <div className="flex flex-wrap items-end justify-between gap-6 border-b border-ink-700 pb-4">
            <div>
              <p className="font-body text-xs font-medium uppercase tracking-[0.16em] text-fog-500">
                Episodes Catalogue
              </p>
              <h2 className="mt-2 font-display text-[31px] leading-[37px] tracking-display text-paper-100">
                Choose an Episode ({episodes.length} total)
              </h2>
            </div>
          </div>

          {loading ? (
            <div className="grid place-items-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-gold-500" />
              <p className="mt-3 text-sm text-fog-500">Loading episodes from stream provider...</p>
            </div>
          ) : episodes.length === 0 ? (
            <div className="py-12 text-center text-fog-500">
              <p>No episodes available for this series.</p>
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {episodes.map((ep) => (
                <button
                  key={ep.id}
                  className="group flex items-center gap-3 rounded-lg border border-ink-800 bg-ink-900/60 p-3 text-left transition-all hover:border-gold-500/50 hover:bg-ink-900 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
                  onClick={() => onPlayEpisode(ep.number, selectedDub, currentAnime, episodes)}
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded bg-ink-800 text-sm font-bold text-gold-500 border border-ink-700 group-hover:border-gold-500">
                    {ep.number}
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="block truncate font-body text-sm font-medium text-paper-100 group-hover:text-gold-500 transition-colors">
                      {ep.title || `Episode ${ep.number}`}
                    </span>
                    <span className="mt-0.5 block font-body text-[11px] text-fog-500">
                      {selectedDub === "hin" ? "Hindi Dub" : selectedDub === "eng" ? "English Dub" : "Japanese Sub"}
                    </span>
                  </div>
                  <Play size={15} className="text-fog-500 opacity-0 transition-opacity group-hover:opacity-100 text-gold-500" />
                </button>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
