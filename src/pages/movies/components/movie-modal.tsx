import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Check,
  Film,
  Heart,
  Loader2,
  Play,
  Plus,
  Star,
  ThumbsUp,
  X,
} from "lucide-react";
import {
  fetchSimilarMovies,
  fetchTrailerKey,
  type TmdbMovie,
} from "../api/tmdb";
import {
  resolveMovieStream,
  type MovieStreamResult,
} from "../../../shared/api/movies";
import { VideoPlayer } from "../../../shared/components/video-player";

type MovieModalProps = {
  movie: TmdbMovie | null;
  isOpen: boolean;
  onClose: () => void;
  onPlayMovie: (movie: TmdbMovie) => void;
  onToggleMyList: (movie: TmdbMovie) => void;
  onToggleLiked: (movie: TmdbMovie) => void;
  isListed: boolean;
  isLiked: boolean;
  onSelectSimilar: (movie: TmdbMovie) => void;
};

export const MovieModal = ({
  movie,
  isOpen,
  onClose,
  onPlayMovie,
  onToggleMyList,
  onToggleLiked,
  isListed,
  isLiked,
  onSelectSimilar,
}: MovieModalProps) => {
  const [trailerKey, setTrailerKey] = useState<string | null>(null);
  const [isPlayingTrailer, setIsPlayingTrailer] = useState(false);
  const [similarMovies, setSimilarMovies] = useState<TmdbMovie[]>([]);

  // Movie stream resolver state
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamResult, setStreamResult] = useState<MovieStreamResult | null>(null);
  const [streamLoading, setStreamLoading] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);

  useEffect(() => {
    if (!movie || !isOpen) {
      setIsPlayingTrailer(false);
      setIsStreaming(false);
      setTrailerKey(null);
      setStreamResult(null);
      setSimilarMovies([]);
      return;
    }

    let isMounted = true;

    // If movie has a numeric TMDB ID, fetch trailer & similar
    const numId = typeof movie.id === "number" ? movie.id : parseInt(String(movie.id).replace(/\D/g, ""), 10);
    if (!isNaN(numId) && numId > 0 && !String(movie.id).startsWith("dc-")) {
      Promise.all([fetchTrailerKey(numId), fetchSimilarMovies(numId)])
        .then(([key, similar]) => {
          if (isMounted) {
            setTrailerKey(key);
            setSimilarMovies(similar.slice(0, 6));
          }
        })
        .catch(() => {});
    }

    return () => {
      isMounted = false;
    };
  }, [movie, isOpen]);

  const handleStartStream = async () => {
    if (!movie) return;
    setIsStreaming(true);
    setIsPlayingTrailer(false);
    setStreamLoading(true);
    setStreamError(null);

    try {
      // Only pass a slug when it's a REAL DesiCinemas word-slug — never a bare
      // numeric TMDB id (those hit DesiCinemas' catch-all and resolve to the wrong
      // movie). For TMDB-sourced catalog items we rely on title+year resolution
      // (NetMirror native HLS first, then DesiCinemas title search on the backend).
      const rawSlug =
        (movie as any)?.dcSlug ||
        (movie as any)?.movieplexSlug ||
        (movie as any)?.slug;
      const realSlug =
        rawSlug && !/^\d+$/.test(String(rawSlug)) && /[a-z]/i.test(String(rawSlug))
          ? String(rawSlug)
          : undefined;

      const res = await resolveMovieStream({
        slug: realSlug,
        title: movie.title,
        year: movie.year,
      });
      setStreamResult(res);
    } catch (err: any) {
      console.error("Movie stream resolution error:", err);
      setStreamError("Unable to extract a playable stream. Please try another title.");
    } finally {
      setStreamLoading(false);
    }
  };

  if (!movie) return null;

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm transition-opacity duration-200" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[92vw] max-w-4xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-ink-950 border border-white/15 text-white shadow-2xl focus:outline-none font-apple">
          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute right-4 top-4 z-20 grid h-9 w-9 place-items-center rounded-full bg-black/70 text-white border border-white/20 hover:bg-white hover:text-black transition-colors"
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>

          {/* Media Header */}
          <div className="relative aspect-video w-full overflow-hidden bg-black">
            {isStreaming ? (
              streamLoading ? (
                <div className="h-full w-full grid place-items-center bg-black">
                  <div className="text-center space-y-2">
                    <Loader2 className="mx-auto h-10 w-10 animate-spin text-[#E50914]" />
                    <p className="text-sm">Finding a playable stream…</p>
                  </div>
                </div>
              ) : streamResult?.streamUrl ? (
                <VideoPlayer
                  src={streamResult.streamUrl}
                  title={streamResult.title || movie.title}
                  poster={movie.backdrop || movie.poster}
                />
              ) : streamResult?.fallbackIframe ? (
                <iframe
                  className="h-full w-full"
                  src={streamResult.fallbackIframe}
                  title={`${streamResult.title || movie.title} Stream`}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <div className="h-full w-full grid place-items-center bg-ink-900 p-6 text-center">
                  <div className="space-y-3">
                    <p className="font-bold text-red-400">Stream Not Found</p>
                    <p className="text-xs text-fog-500">{streamError || "No stream available."}</p>
                    {trailerKey && (
                      <button
                        onClick={() => {
                          setIsStreaming(false);
                          setIsPlayingTrailer(true);
                        }}
                        className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-bold text-black"
                      >
                        <Play size={14} fill="currentColor" /> Play Trailer Instead
                      </button>
                    )}
                  </div>
                </div>
              )
            ) : isPlayingTrailer && trailerKey ? (
              <iframe
                className="h-full w-full"
                src={`https://www.youtube.com/embed/${trailerKey}?autoplay=1&rel=0&modestbranding=1`}
                title={`${movie.title} Trailer`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <>
                <img
                  src={movie.backdrop || movie.poster}
                  alt={movie.title}
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/30 to-transparent" />

                <div className="absolute bottom-6 left-6 right-6 flex flex-wrap items-end justify-between gap-4">
                  <div className="max-w-xl">
                    <p className="text-xs font-bold uppercase tracking-widest text-[#E50914]">
                      {movie.genre}
                    </p>
                    <Dialog.Title className="text-2xl sm:text-4xl font-bold tracking-tight text-white drop-shadow-md">
                      {movie.title}
                    </Dialog.Title>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      onClick={handleStartStream}
                      className="inline-flex items-center gap-2 rounded-full bg-[#E50914] px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700 transition-transform active:scale-95 shadow-xl shadow-red-600/40"
                    >
                      <Film size={16} />
                      <span>Stream Movie</span>
                    </button>

                    {trailerKey && (
                      <button
                        onClick={() => setIsPlayingTrailer(true)}
                        className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-black hover:bg-white/90 transition-transform active:scale-95 shadow-xl"
                      >
                        <Play size={16} fill="currentColor" />
                        <span>Trailer</span>
                      </button>
                    )}
                    <button
                      onClick={() => onToggleMyList(movie)}
                      className="grid h-10 w-10 place-items-center rounded-full border border-white/30 bg-black/60 text-white hover:border-white hover:bg-white hover:text-black transition-colors"
                      title={isListed ? "Remove from list" : "Add to list"}
                    >
                      {isListed ? <Check size={18} /> : <Plus size={18} />}
                    </button>
                    <button
                      onClick={() => onToggleLiked(movie)}
                      className="grid h-10 w-10 place-items-center rounded-full border border-white/30 bg-black/60 text-white hover:border-white hover:bg-white hover:text-black transition-colors"
                      title={isLiked ? "Unlike" : "Like"}
                    >
                      {isLiked ? (
                        <Heart size={18} fill="currentColor" className="text-[#E50914]" />
                      ) : (
                        <ThumbsUp size={18} />
                      )}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Details Body */}
          <div className="p-6 sm:p-8 space-y-6">
            <div className="flex flex-wrap items-center gap-3 text-xs sm:text-sm text-fog-500">
              <div className="flex items-center gap-1 font-bold text-white bg-white/10 px-2 py-0.5 rounded">
                <Star size={13} className="text-amber-400" fill="currentColor" />
                <span>{typeof movie.rating === "number" ? movie.rating.toFixed(1) : movie.rating} Rating</span>
              </div>
              <span>•</span>
              <span>{movie.year}</span>
              <span>•</span>
              <span className="border border-white/20 px-1.5 py-0.5 rounded text-[10px] text-white">
                Full HD Cinema
              </span>
              <span className="border border-white/20 px-1.5 py-0.5 rounded text-[10px] text-white">
                Dolby 5.1
              </span>
            </div>

            <Dialog.Description className="text-sm sm:text-base leading-relaxed text-white/85">
              {movie.synopsis}
            </Dialog.Description>

            {similarMovies.length > 0 && (
              <div className="pt-4 border-t border-white/10">
                <h4 className="text-base font-bold text-white mb-4">
                  More Like This
                </h4>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
                  {similarMovies.map((similar) => (
                    <div
                      key={similar.id}
                      onClick={() => onSelectSimilar(similar)}
                      className="group cursor-pointer overflow-hidden rounded-lg bg-ink-900 border border-white/10 hover:border-white/40 transition-all hover:scale-105"
                    >
                      <div className="aspect-[2/3] w-full overflow-hidden bg-ink-800">
                        <img
                          src={similar.poster}
                          alt={similar.title}
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div className="p-2">
                        <p className="text-xs font-semibold text-white truncate">
                          {similar.title}
                        </p>
                        <p className="text-[10px] text-fog-500">
                          ★ {typeof similar.rating === "number" ? similar.rating.toFixed(1) : similar.rating}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
