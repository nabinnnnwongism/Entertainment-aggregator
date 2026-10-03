import {
  ArrowLeft,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Eye,
  Heart,
  Loader2,
  Menu,
  Play,
  RotateCcw,
  Share2,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  fetchChapterPages,
  fetchComicDetails,
  type ComicChapter,
  type ComicDetail,
  type ComicPageImage,
  type ComicSummary,
} from "../../shared/api/comics";

function ComicSeriesPage({
  comic,
  onBack,
  onRead,
}: {
  comic: ComicSummary;
  onBack: () => void;
  onRead: (chapterId: string, chapterNumber: number, chapters: ComicChapter[]) => void;
}) {
  const [details, setDetails] = useState<ComicDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);

    fetchComicDetails(comic.id || (comic as any).slug || comic.title)
      .then((res) => {
        if (!active) return;
        setDetails(res);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load comic chapters:", err);
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [comic]);

  const chapters = details?.chapters || [];
  const currentTitle = details?.title || comic.title;
  const cover = details?.cover || comic.cover;
  const description = details?.description || comic.description || "Read full manga and webtoon chapters in high resolution.";

  return (
    <section className="comics-shell min-h-screen bg-ink-950 font-body text-paper-100 pb-16">
      <header className="border-b border-ink-700 bg-ink-900">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-4 sm:px-6">
          <button
            className="flex items-center gap-2 text-sm font-bold text-fog-500 transition-colors hover:text-paper-100"
            onClick={onBack}
          >
            <ArrowLeft size={18} />
            All comics
          </button>
          <span className="text-lg font-black tracking-[-0.07em] text-paper-100">
            EetNet <span className="text-[#00C853]">COMICS</span>
          </span>
          <div className="w-9" />
        </div>
      </header>

      {/* Series Header */}
      <section className="relative overflow-hidden border-b border-ink-700">
        <img
          className="absolute inset-0 h-full w-full object-cover object-center opacity-20"
          src={cover}
          alt={currentTitle}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-ink-950 via-ink-950/90 to-ink-950/45" />

        <div className="relative mx-auto max-w-[1200px] px-4 py-14 sm:px-6 sm:py-20">
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#54EE8F]">
            {details?.status || comic.genre || "Series"}
          </p>
          <h1 className="mt-3 max-w-2xl text-3xl font-black tracking-tight sm:text-5xl">
            {currentTitle}
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-fog-500 line-clamp-4">
            {description}
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            {chapters.length > 0 && (
              <button
                className="inline-flex items-center gap-2 rounded-full bg-[#00C853] px-6 py-3 text-sm font-bold text-ink-950 shadow-xl transition-transform hover:-translate-y-px active:translate-y-[2px]"
                onClick={() => onRead(chapters[0].id, 1, chapters)}
              >
                <Play size={16} fill="currentColor" />
                Read Chapter 1
              </button>
            )}
            <button
              className="grid h-11 w-11 place-items-center rounded-full border border-ink-700 bg-ink-900 text-paper-100 hover:border-fog-500 transition-colors"
              aria-label="Add to bookmarks"
            >
              <Bookmark size={18} />
            </button>
          </div>

          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-xs text-fog-500">
            {details?.rating && (
              <span className="text-gold-500 font-bold">★ Rating: {details.rating}</span>
            )}
            <span>{chapters.length} Chapters Available</span>
            <span>HD Page Render</span>
          </div>
        </div>
      </section>

      {/* Chapters Section */}
      <section className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6">
        <div className="flex items-end justify-between border-b border-ink-700 pb-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#54EE8F]">
              Chapters
            </p>
            <h2 className="mt-1 text-2xl font-black text-paper-100">
              Chapter Index ({chapters.length})
            </h2>
          </div>
        </div>

        {loading ? (
          <div className="grid place-items-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-[#00C853]" />
            <p className="mt-3 text-sm text-fog-500">Loading chapters from comic source...</p>
          </div>
        ) : chapters.length === 0 ? (
          <div className="py-12 text-center text-fog-500">
            <p>No chapters found for this title.</p>
          </div>
        ) : (
          <div className="mt-4 divide-y divide-ink-800">
            {chapters.map((ch, idx) => (
              <button
                key={ch.id}
                className="group flex w-full items-center justify-between py-4 text-left transition-colors hover:bg-ink-900/60 px-3 rounded-lg"
                onClick={() => onRead(ch.id, idx + 1, chapters)}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-paper-100 group-hover:text-[#54EE8F] transition-colors">
                    {ch.title || `Chapter ${ch.chapter}`}
                  </p>
                  <p className="mt-0.5 text-xs text-fog-500">
                    Chapter {ch.chapter}
                  </p>
                </div>
                <ChevronRight
                  size={18}
                  className="text-fog-500 transition-transform group-hover:translate-x-1 group-hover:text-[#54EE8F]"
                />
              </button>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}

function ComicReaderPage({
  comic,
  chapterId,
  chapterNumber,
  chapters = [],
  onBack,
  onChangeChapter,
}: {
  comic: ComicSummary;
  chapterId: string;
  chapterNumber: number;
  chapters?: ComicChapter[];
  onBack: () => void;
  onChangeChapter: (nextId: string, nextNumber: number) => void;
}) {
  const [pages, setPages] = useState<ComicPageImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [controls, setControls] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    window.scrollTo(0, 0);

    fetchChapterPages(chapterId)
      .then((res) => {
        if (!active) return;
        setPages(res.pages || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load chapter pages:", err);
        if (!active) return;
        setError("Failed to load chapter pages. Please try another chapter.");
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [chapterId]);

  const currentIndex = chapters.findIndex((c) => c.id === chapterId);
  const prevChapter = currentIndex > 0 ? chapters[currentIndex - 1] : null;
  const nextChapter =
    currentIndex >= 0 && currentIndex < chapters.length - 1
      ? chapters[currentIndex + 1]
      : null;

  return (
    <section className="min-h-screen bg-[#08090A] font-body text-paper-100 select-none">
      {/* Top Header Bar */}
      <header
        className={`sticky top-0 z-40 border-b border-white/10 bg-ink-950/95 backdrop-blur transition-transform duration-300 ${
          controls ? "translate-y-0" : "-translate-y-full"
        }`}
      >
        <div className="mx-auto flex h-14 max-w-[1200px] items-center justify-between px-4">
          <button
            className="inline-flex items-center gap-2 text-sm font-bold text-fog-500 hover:text-paper-100 transition-colors"
            onClick={onBack}
          >
            <ArrowLeft size={18} />
            <span className="truncate max-w-[180px] sm:max-w-xs">{comic.title}</span>
          </button>

          <p className="hidden text-sm font-bold text-paper-100 sm:block">
            Chapter {chapterNumber}
          </p>

          <div className="flex items-center gap-2">
            <button
              className="grid h-8 w-8 place-items-center rounded bg-white/10 hover:bg-white/15 disabled:opacity-30"
              onClick={() => prevChapter && onChangeChapter(prevChapter.id, chapterNumber - 1)}
              disabled={!prevChapter}
              aria-label="Previous chapter"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="text-xs text-fog-500">
              {chapterNumber} / {chapters.length || "?"}
            </span>
            <button
              className="grid h-8 w-8 place-items-center rounded bg-white/10 hover:bg-white/15 disabled:opacity-30"
              onClick={() => nextChapter && onChangeChapter(nextChapter.id, chapterNumber + 1)}
              disabled={!nextChapter}
              aria-label="Next chapter"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </header>

      {/* Reader Panel Images */}
      <main
        className="mx-auto max-w-[800px] py-4"
        onClick={() => setControls((v) => !v)}
      >
        {loading ? (
          <div className="grid place-items-center py-36">
            <Loader2 className="h-12 w-12 animate-spin text-[#00C853]" />
            <p className="mt-4 text-sm text-fog-500">Loading full resolution chapter images...</p>
          </div>
        ) : error ? (
          <div className="py-24 text-center space-y-3">
            <p className="text-red-400 font-bold">{error}</p>
            <button
              onClick={onBack}
              className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-xs font-semibold hover:bg-white/20"
            >
              <ArrowLeft size={14} /> Back to Chapters
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            {pages.map((img) => (
              <img
                key={img.page}
                src={img.url}
                alt={`Page ${img.page}`}
                loading="lazy"
                className="w-full object-contain block"
                onError={(e) => {
                  if (img.rawUrl && (e.target as HTMLImageElement).src !== img.rawUrl) {
                    (e.target as HTMLImageElement).src = img.rawUrl;
                  }
                }}
              />
            ))}
          </div>
        )}

        {/* Bottom Chapter Navigation */}
        {!loading && !error && (
          <div className="flex flex-col items-center gap-4 px-4 py-16 border-t border-ink-800 mt-8">
            <p className="text-sm text-fog-500">
              End of Chapter {chapterNumber} ({pages.length} pages read)
            </p>
            <div className="flex gap-4">
              <button
                className="inline-flex items-center gap-2 rounded-full border border-ink-700 bg-ink-900 px-6 py-3 text-sm font-bold text-paper-100 disabled:opacity-35 hover:bg-ink-800 transition-colors"
                onClick={() => prevChapter && onChangeChapter(prevChapter.id, chapterNumber - 1)}
                disabled={!prevChapter}
              >
                <ChevronLeft size={17} />
                Previous
              </button>
              <button
                className="inline-flex items-center gap-2 rounded-full bg-[#00C853] px-6 py-3 text-sm font-bold text-ink-950 disabled:opacity-35 hover:bg-[#00C853]/90 transition-all"
                onClick={() => nextChapter && onChangeChapter(nextChapter.id, chapterNumber + 1)}
                disabled={!nextChapter}
              >
                Next chapter
                <ChevronRight size={17} />
              </button>
            </div>
          </div>
        )}
      </main>
    </section>
  );
}

export { ComicReaderPage, ComicSeriesPage };
