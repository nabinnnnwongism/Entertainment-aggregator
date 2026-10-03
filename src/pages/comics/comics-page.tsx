import {
  ChevronRight,
  Flame,
  Loader2,
  Menu,
  Search,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  fetchComicsByCategory,
  fetchComicsHome,
  searchComics,
  type ComicHomeData,
  type ComicSummary,
} from "../../shared/api/comics";

const genres = [
  "All",
  "Action",
  "Adventure",
  "Comedy",
  "Drama",
  "Fantasy",
  "Horror",
  "Mystery",
  "Romance",
  "Sci-fi",
  "Slice of life",
  "Superhero",
];

function ComicCover({
  comic,
  rank,
  compact = false,
  onClick,
}: {
  comic: ComicSummary;
  rank?: number;
  compact?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`comics-card group relative shrink-0 overflow-hidden rounded-[4px] bg-slate-900 text-left shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00D564] focus-visible:ring-offset-2 hover:scale-[1.03] transition-transform ${
        compact ? "w-[9rem]" : "w-full"
      }`}
      aria-label={`Open ${comic.title}`}
      onClick={onClick}
    >
      <div className="relative aspect-[3/4] overflow-hidden">
        <img
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          src={comic.cover}
          alt={comic.title}
          onError={(e) => {
            (e.target as HTMLElement).style.display = "none";
          }}
        />
        <span className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent" />
        {rank && (
          <span className="absolute left-2 top-2 grid h-7 min-w-7 place-items-center rounded-full bg-white px-1 text-sm font-bold text-slate-900 shadow">
            {rank}
          </span>
        )}
        {comic.updated && (
          <span className="absolute right-2 top-2 rounded-sm bg-[#00D564] px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-slate-950">
            UP
          </span>
        )}
      </div>
      <div className="absolute inset-x-0 bottom-0 p-3">
        <p className="truncate text-sm font-bold text-white group-hover:text-[#00D564] transition-colors">
          {comic.title}
        </p>
        <p className="mt-0.5 text-xs text-slate-300">
          {comic.genre || comic.genres?.[0] || "Manga"}
        </p>
      </div>
    </button>
  );
}

export function ComicsPage({
  onExit,
  onOpen,
}: {
  onExit: () => void;
  onOpen: (comic: ComicSummary) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeGenre, setActiveGenre] = useState("All");
  const [homeData, setHomeData] = useState<ComicHomeData | null>(null);
  const [categoryItems, setCategoryItems] = useState<ComicSummary[]>([]);
  const [searchResults, setSearchResults] = useState<ComicSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);

    fetchComicsHome()
      .then((data) => {
        if (!active) return;
        setHomeData(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Comics load error:", err);
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (activeGenre === "All") return;
    let active = true;

    fetchComicsByCategory("all", activeGenre.toLowerCase())
      .then((items) => {
        if (!active) return;
        setCategoryItems(items);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [activeGenre]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await searchComics(query.trim());
      setSearchResults(res);
    } catch (e) {
      console.error("Search failed:", e);
    } finally {
      setSearching(false);
    }
  };

  const trendingList = homeData?.trending || homeData?.bentoTop10 || [];
  const popularList =
    activeGenre === "All"
      ? homeData?.popular || homeData?.manhwaPreview || []
      : categoryItems;

  const heroItem = homeData?.bentoTop10?.[0] || homeData?.trending?.[0] || null;

  return (
    <section className="comics-shell min-h-screen bg-[#f7f8f8] font-body text-slate-900">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-6 px-4 sm:px-6">
          <button
            className="flex items-baseline gap-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00D564]"
            onClick={onExit}
          >
            <span className="text-xl font-black tracking-[-0.08em] text-slate-950">EetNet</span>
            <span className="text-xl font-black tracking-[-0.08em] text-[#00B94E]">COMICS</span>
          </button>
          <nav className="hidden items-center gap-5 text-sm font-semibold text-slate-600 md:flex">
            <button className="text-slate-950 hover:text-[#00B94E]">Manga</button>
            <button className="hover:text-[#00B94E]">Manhwa</button>
            <button className="hover:text-[#00B94E]">Webtoons</button>
            <button className="hover:text-[#00B94E]">Manhua</button>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <form onSubmit={handleSearch} className="flex h-9 w-60 items-center gap-2 rounded-full bg-slate-100 px-3 text-slate-500">
              <Search size={17} strokeWidth={2} />
              <input
                className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search manga/webtoons..."
              />
            </form>
            <button
              className="grid h-9 w-9 place-items-center rounded-full text-slate-700 hover:bg-slate-100 md:hidden"
              aria-label="Toggle menu"
              onClick={() => setMenuOpen((value) => !value)}
            >
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </header>

      <main className="pb-16">
        {/* Search Results Display */}
        {searchResults.length > 0 && (
          <section className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6">
            <h2 className="text-2xl font-black tracking-tight text-slate-950 mb-4">
              Search Results ({searchResults.length})
            </h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {searchResults.map((item) => (
                <ComicCover key={item.id} comic={item} onClick={() => onOpen(item)} />
              ))}
            </div>
          </section>
        )}

        {/* Hero Spotlight */}
        {heroItem && (
          <section className="border-b border-slate-200 bg-white">
            <div className="mx-auto grid max-w-[1200px] gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1.1fr_.9fr] lg:py-14">
              <div className="comics-enter">
                <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#00A944]">
                  Featured Comic / Live Catalogue
                </p>
                <h1 className="mt-4 max-w-xl text-4xl font-black leading-[0.98] tracking-[-0.06em] text-slate-950 sm:text-6xl">
                  {heroItem.title}
                </h1>
                <p className="mt-5 max-w-lg text-base leading-6 text-slate-600 line-clamp-3">
                  {heroItem.description || "Read latest chapters in high resolution. Manga, Korean Manhwa, and Webtoons updated daily."}
                </p>
                <div className="mt-7 flex items-center gap-3">
                  <button
                    onClick={() => onOpen(heroItem)}
                    className="rounded-full bg-[#00C853] px-6 py-3 text-sm font-bold text-slate-950 shadow-[inset_0_1px_0_rgba(255,255,255,.7),0_3px_0_#008C3B] transition-transform hover:-translate-y-px active:translate-y-[2px]"
                  >
                    Start reading
                  </button>
                </div>
              </div>
              <div
                onClick={() => onOpen(heroItem)}
                className="comics-enter relative min-h-[260px] overflow-hidden rounded-xl bg-slate-900 shadow-xl cursor-pointer hover:scale-[1.02] transition-transform"
              >
                <img
                  className="absolute inset-0 h-full w-full object-cover opacity-90"
                  src={heroItem.cover}
                  alt={heroItem.title}
                />
                <div className="absolute inset-0 bg-gradient-to-r from-slate-950/95 via-slate-950/30 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-6 text-white">
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#54EE8F]">
                    {heroItem.genre || "Trending"}
                  </p>
                  <h2 className="mt-2 text-2xl font-black tracking-[-0.045em]">{heroItem.title}</h2>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Trending Rail */}
        <section className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#00A944]">
                Top Rated Reads
              </p>
              <h2 className="mt-2 text-2xl font-black tracking-[-0.05em] text-slate-950">
                Trending Now
              </h2>
            </div>
          </div>
          {loading ? (
            <div className="grid place-items-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-[#00A944]" />
            </div>
          ) : (
            <div className="comics-rail mt-5 flex gap-3 overflow-x-auto px-1 py-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {trendingList.map((comic, index) => (
                <ComicCover
                  key={comic.id}
                  comic={comic}
                  rank={index + 1}
                  compact
                  onClick={() => onOpen(comic)}
                />
              ))}
            </div>
          )}
        </section>

        {/* Category Filter & Grid */}
        <section className="border-y border-slate-200 bg-white">
          <div className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6">
            <div className="flex flex-wrap gap-2">
              {genres.map((genre) => (
                <button
                  key={genre}
                  onClick={() => setActiveGenre(genre)}
                  className={`rounded-full border px-4 py-2 text-sm font-bold transition-transform hover:-translate-y-px ${
                    activeGenre === genre
                      ? "border-[#00B94E] bg-[#00C853] text-slate-950 shadow-[0_2px_0_#008C3B]"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-400 hover:text-slate-950"
                  }`}
                >
                  {genre}
                </button>
              ))}
            </div>
            <div className="mt-9 flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#00A944]">
                  Popular Catalogue
                </p>
                <h2 className="mt-2 text-2xl font-black tracking-[-0.05em] text-slate-950">
                  {activeGenre === "All" ? "All Series" : activeGenre}
                </h2>
              </div>
            </div>
            <div className="comics-grid mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {popularList.map((comic) => (
                <ComicCover key={comic.id} comic={comic} onClick={() => onOpen(comic)} />
              ))}
            </div>
          </div>
        </section>

        {/* Korean Manhwa Spotlight */}
        {homeData?.manhwaPreview && homeData.manhwaPreview.length > 0 && (
          <section className="mx-auto max-w-[1200px] px-4 py-12 sm:px-6">
            <div className="rounded-2xl bg-slate-950 px-5 py-8 text-white sm:px-8">
              <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#54EE8F]">
                    Korean Webtoons &amp; Manhwa
                  </p>
                  <h2 className="mt-2 text-3xl font-black tracking-[-0.055em]">Manhwa Spotlight</h2>
                </div>
              </div>
              <div className="mt-7 grid gap-3 md:grid-cols-2">
                {homeData.manhwaPreview.slice(0, 6).map((comic) => (
                  <button
                    key={comic.id}
                    onClick={() => onOpen(comic)}
                    className="group flex items-center gap-4 rounded-lg bg-white/5 p-3 text-left transition-transform hover:-translate-y-0.5 hover:bg-white/10"
                  >
                    <div className="relative h-16 w-12 shrink-0 overflow-hidden rounded">
                      <img className="h-full w-full object-cover" src={comic.cover} alt={comic.title} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-white group-hover:text-[#54EE8F] transition-colors">
                        {comic.title}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        {comic.genre || "Manhwa"} {comic.rating ? `· ★ ${comic.rating}` : ""}
                      </p>
                    </div>
                    <ChevronRight size={18} className="ml-auto text-slate-500 transition-transform group-hover:translate-x-0.5" />
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-3 px-4 py-7 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>© EetNet Comics · Powered by ComicK &amp; AniList GraphQL</span>
          <span>High-definition Manga &amp; Webtoon Reader</span>
        </div>
      </footer>
    </section>
  );
}
