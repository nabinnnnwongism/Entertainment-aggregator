import { ArrowLeft, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { DiscoveryCard } from "../home/components/discovery-card";
import { Button } from "../../shared/components/button";
import {
  fetchAnimeByGenre,
  fetchTrendingAnime,
  searchAnime,
  type AnimeMedia,
} from "../../shared/api/anime";
import { HINDI_DUBBED_ANILIST_IDS, isHindiDubbed } from "../../shared/data/hindi-dubbed-ids";

const animeGenres = [
  "All",
  "Hindi",
  "Action",
  "Adventure",
  "Comedy",
  "Drama",
  "Fantasy",
  "Horror",
  "Mystery",
  "Romance",
  "Sci-Fi",
  "Slice of Life",
];

const PER_PAGE = 24;

function getPaginationRange(current: number, total: number) {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  if (current <= 4) {
    return [1, 2, 3, 4, 5, "...", total];
  }
  if (current >= total - 3) {
    return [1, "...", total - 4, total - 3, total - 2, total - 1, total];
  }
  return [1, "...", current - 1, current, current + 1, "...", total];
}

type AnimePageProps = {
  onBack: () => void;
  onOpen: (anime: AnimeMedia) => void;
};

export function AnimePage({ onBack, onOpen }: AnimePageProps) {
  const [query, setQuery] = useState("");
  const [selectedGenre, setSelectedGenre] = useState("Hindi");
  const [animeList, setAnimeList] = useState<AnimeMedia[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const catalogueRef = useRef<HTMLDivElement>(null);

  const totalHindiPages = Math.ceil(HINDI_DUBBED_ANILIST_IDS.length / PER_PAGE);
  const totalPages = query.trim()
    ? Math.max(1, Math.ceil(animeList.length / PER_PAGE) || 1)
    : selectedGenre === "Hindi"
    ? totalHindiPages
    : 15;

  useEffect(() => {
    let active = true;
    setLoading(true);

    async function loadData() {
      try {
        let results: AnimeMedia[] = [];
        if (query.trim()) {
          results = await searchAnime(query.trim(), page, PER_PAGE);
        } else if (selectedGenre === "All") {
          results = await fetchTrendingAnime(page, PER_PAGE);
        } else {
          results = await fetchAnimeByGenre(selectedGenre, page, PER_PAGE);
        }
        if (active) {
          setAnimeList(results);
          setLoading(false);
        }
      } catch (err) {
        console.error("Failed to load anime:", err);
        if (active) setLoading(false);
      }
    }

    loadData();
    return () => {
      active = false;
    };
  }, [selectedGenre, query, page]);

  const handleGenreChange = (genre: string) => {
    setSelectedGenre(genre);
    setQuery("");
    setPage(1);
  };

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages || newPage === page) return;
    setPage(newPage);
    catalogueRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPage(1);
  };

  const paginationRange = getPaginationRange(page, totalPages);

  return (
    <section className="bg-ink-950 py-10 sm:py-16 min-h-screen">
      <div className="mx-auto max-w-[1440px] px-4 sm:px-8 lg:px-12">
        <button
          className="inline-flex items-center gap-2 font-body text-sm text-fog-500 transition-[transform,opacity,color] duration-200 hover:-translate-y-0.5 hover:text-paper-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
          onClick={onBack}
        >
          <ArrowLeft size={17} strokeWidth={1.7} />
          Home
        </button>

        <header className="streaming-hero-reveal mt-16">
          <h1 className="max-w-4xl font-body text-[49px] font-medium leading-[51px] tracking-[-0.055em] text-paper-100 sm:text-[61px] sm:leading-[63px]">
            The greatest worlds{" "}
            <span className="bg-gradient-to-r from-paper-100 via-gold-500 to-fog-500 bg-clip-text text-transparent">
              beyond imagination
            </span>
          </h1>
          <p className="mt-2 max-w-4xl font-body text-[25px] font-medium leading-[30px] tracking-[-0.045em] text-fog-500 sm:text-[31px] sm:leading-[37px]">
            Action, romance, and fantasy streaming right to your screen
          </p>
          <form
            className="mt-8 flex w-full max-w-md items-center gap-2 rounded-full bg-ink-800 p-1.5"
            onSubmit={submitSearch}
          >
            <input
              className="min-w-0 flex-1 bg-transparent px-4 font-body text-sm text-paper-100 outline-none placeholder:text-fog-500"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder="Search Anime (e.g. Solo Leveling, Demon Slayer)..."
              aria-label="Search Anime"
            />
            <Button
              className="h-10 rounded-full border border-white bg-white px-6 font-bold text-black shadow-[inset_0_1px_0_#ffffff,0_4px_0_#cbd5e1,0_8px_14px_rgba(0,0,0,0.30)] transition-[transform,box-shadow,background-color] hover:translate-y-px hover:bg-zinc-100 active:translate-y-[3px] active:shadow-[inset_0_1px_0_#ffffff,0_1px_0_#cbd5e1]"
              type="submit"
            >
              Search
            </Button>
          </form>
          <p className="mt-3 font-body text-sm text-fog-500">
            Over 10,000+ Anime Series &amp; Movies streaming in HD
          </p>
        </header>

        <header ref={catalogueRef} className="mt-20 border-b border-ink-700 pb-8 scroll-mt-20">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="font-body text-xs font-medium uppercase tracking-[0.16em] text-gold-500">
                Live Anime Catalogue
              </p>
              <p className="mt-2 font-body text-sm text-fog-500">
                {selectedGenre === "Hindi"
                  ? `Showing 372 Hindi Dubbed Anime from AnimeRulz (Page ${page} of ${totalHindiPages})`
                  : "Japanese animation with English Sub/Dub & Hindi Dub"}
              </p>
            </div>
            {selectedGenre === "Hindi" && (
              <div className="flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-300">
                <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                372 Hindi Titles Available
              </div>
            )}
          </div>

          <div className="mt-6 flex flex-wrap gap-2" aria-label="Anime genres">
            {animeGenres.map((genre) => {
              const active = selectedGenre === genre;
              return (
                <button
                  key={genre}
                  className={`rounded-full border px-4 py-2 font-body text-sm font-semibold transition-[transform,box-shadow,background-color,color] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 ${
                    active
                      ? "border-white bg-white text-black shadow-[inset_0_1px_0_#ffffff,0_4px_0_#cbd5e1,0_8px_14px_rgba(0,0,0,0.30)] hover:translate-y-px hover:bg-zinc-100 active:translate-y-[3px] active:shadow-[inset_0_1px_0_#ffffff,0_1px_0_#cbd5e1]"
                      : "border-[#35414A] bg-ink-800 text-fog-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_3px_0_#0A0C0E,0_6px_10px_rgba(0,0,0,0.26)] hover:-translate-y-px hover:border-fog-500 hover:text-paper-100"
                  }`}
                  onClick={() => handleGenreChange(genre)}
                >
                  {genre === "Hindi" ? "🇮🇳 Hindi Dub" : genre}
                </button>
              );
            })}
          </div>
        </header>

        {loading ? (
          <div className="grid place-items-center py-24">
            <Loader2 className="h-10 w-10 animate-spin text-gold-500" />
            <p className="mt-4 font-body text-sm text-fog-500">Connecting to Anime catalogue...</p>
          </div>
        ) : animeList.length === 0 ? (
          <div className="py-20 text-center text-fog-500">
            <p>No anime found matching your query.</p>
          </div>
        ) : (
          <>
            <div className="anime-gallery streaming-grid-reveal mt-8 grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 sm:gap-x-6 lg:gap-x-6 xl:grid-cols-4 xl:gap-x-8">
              {animeList.map((anime) => {
                const title = anime.title.english || anime.title.romaji || "Anime";
                const cover = anime.coverImage?.extraLarge || anime.coverImage?.large || "";
                const details = [
                  anime.seasonYear,
                  anime.format,
                  anime.episodes ? `${anime.episodes} eps` : null,
                ]
                  .filter(Boolean)
                  .join(" · ");

                return (
                  <DiscoveryCard
                    key={anime.id}
                    className="w-full sm:w-full"
                    visualStyle="gallery"
                    title={title}
                    detail={details || "Japanese Animation"}
                    image={cover}
                    imagePosition="center"
                    isHindiDubbed={isHindiDubbed(anime.id)}
                    onOpen={() => onOpen(anime)}
                  />
                );
              })}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <nav aria-label="Anime catalogue pages" className="mt-16 flex flex-col items-center gap-4 border-t border-ink-800 pt-10">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handlePageChange(page - 1)}
                    disabled={page === 1}
                    aria-label="Previous page"
                    className="flex h-10 items-center gap-1.5 rounded-full border border-ink-700 bg-ink-900 px-4 font-body text-xs font-semibold text-fog-500 shadow-sm transition hover:border-gold-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-ink-700 disabled:hover:text-fog-500"
                  >
                    <ChevronLeft size={16} />
                    Prev
                  </button>

                  <div className="flex items-center gap-1.5 sm:gap-2">
                    {paginationRange.map((item, idx) => {
                      if (item === "...") {
                        return (
                          <span key={`ellipsis-${idx}`} className="px-2 font-body text-sm text-fog-500">
                            …
                          </span>
                        );
                      }

                      const pageNumber = Number(item);
                      const isCurrent = pageNumber === page;

                      return (
                        <button
                          key={pageNumber}
                          onClick={() => handlePageChange(pageNumber)}
                          className={`grid h-10 w-10 place-items-center rounded-full font-body text-xs font-bold transition duration-150 ${
                            isCurrent
                              ? "bg-white text-black shadow-[inset_0_1px_0_#ffffff,0_3px_0_#cbd5e1,0_6px_12px_rgba(0,0,0,0.35)]"
                              : "border border-ink-700 bg-ink-900 text-fog-500 hover:border-fog-500 hover:text-paper-100"
                          }`}
                        >
                          {pageNumber}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    onClick={() => handlePageChange(page + 1)}
                    disabled={page === totalPages}
                    aria-label="Next page"
                    className="flex h-10 items-center gap-1.5 rounded-full border border-ink-700 bg-ink-900 px-4 font-body text-xs font-semibold text-fog-500 shadow-sm transition hover:border-gold-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-ink-700 disabled:hover:text-fog-500"
                  >
                    Next
                    <ChevronRight size={16} />
                  </button>
                </div>

                <p className="font-body text-xs text-fog-500">
                  Showing page <span className="font-bold text-paper-100">{page}</span> of{" "}
                  <span className="font-bold text-paper-100">{totalPages}</span> ({selectedGenre === "Hindi" ? `${HINDI_DUBBED_ANILIST_IDS.length} total titles` : "Anime library"})
                </p>
              </nav>
            )}
          </>
        )}
      </div>
    </section>
  );
}
