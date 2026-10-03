import { ChevronLeft, Loader2, Play, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import {
  fetchAnimeStream,
  type AnimeEpisode,
  type AnimeMedia,
  type AnimeStreamResult,
} from "../../../shared/api/anime";
import {
  VideoPlayer,
  type SubtitleTrack,
} from "../../../shared/components/video-player";

type PlayerScreenProps = {
  anime: AnimeMedia | null;
  episode: number;
  dub?: "sub" | "eng" | "hin";
  episodes?: AnimeEpisode[];
  onBack: () => void;
  onSelectEpisode: (episode: number) => void;
};

export function PlayerScreen({
  anime,
  episode,
  dub = "sub",
  episodes = [],
  onBack,
  onSelectEpisode,
}: PlayerScreenProps) {
  const [streamData, setStreamData] = useState<AnimeStreamResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [theatreMode, setTheatreMode] = useState(false);
  const [currentDub, setCurrentDub] = useState<"sub" | "eng" | "hin">(dub);

  const animeTitle = anime?.title?.english || anime?.title?.romaji || "Anime Stream";
  const currentEpInfo = episodes.find((e) => e.number === episode);
  const episodeTitle = currentEpInfo?.title || `Episode ${episode}`;

  useEffect(() => {
    if (!anime) return;
    let active = true;
    setLoading(true);
    setError(null);

    fetchAnimeStream({
      anilistId: anime.id,
      episode,
      dub: currentDub,
      title: anime.title?.english || anime.title?.romaji || undefined,
    })
      .then((res) => {
        if (!active) return;
        setStreamData(res);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Stream fetch error:", err);
        if (!active) return;
        setError(err.message || "Failed to load stream source.");
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [anime, episode, currentDub]);

  if (!anime) {
    return (
      <section className="bg-ink-950 py-20 text-center text-fog-500">
        <p>No anime selected for playback.</p>
        <button onClick={onBack} className="mt-4 text-gold-500 hover:underline">
          Return to catalogue
        </button>
      </section>
    );
  }

  const primarySource = streamData?.sources?.[0]?.url || "";
  const convertedSubtitles: SubtitleTrack[] = (streamData?.subtitles || []).map((s) => ({
    label: s.lang || "English",
    file: s.url,
    default: s.lang?.toLowerCase().includes("eng") || s.lang?.toLowerCase().includes("sub"),
  }));

  return (
    <section className="bg-ink-950 py-6 sm:py-10 min-h-screen">
      <div
        className={
          theatreMode
            ? "max-w-none px-0"
            : "mx-auto max-w-[1440px] px-4 sm:px-8 lg:px-12"
        }
      >
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <button
            className="inline-flex items-center gap-2 font-body text-sm text-fog-500 transition-colors hover:text-paper-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
            onClick={onBack}
          >
            <ChevronLeft size={17} strokeWidth={1.7} />
            Back to {animeTitle}
          </button>

          {/* Audio selection buttons */}
          <div className="flex items-center rounded-full border border-ink-700 bg-ink-800 p-1 text-xs font-semibold">
            <button
              onClick={() => setCurrentDub("sub")}
              className={`rounded-full px-3 py-1 transition-all ${
                currentDub === "sub"
                  ? "bg-gold-500 text-black font-bold"
                  : "text-fog-500 hover:text-white"
              }`}
            >
              Sub (JP)
            </button>
            <button
              onClick={() => setCurrentDub("eng")}
              className={`rounded-full px-3 py-1 transition-all ${
                currentDub === "eng"
                  ? "bg-gold-500 text-black font-bold"
                  : "text-fog-500 hover:text-white"
              }`}
            >
              Dub (EN)
            </button>
            <button
              onClick={() => setCurrentDub("hin")}
              className={`rounded-full px-3 py-1 transition-all ${
                currentDub === "hin"
                  ? "bg-gold-500 text-black font-bold"
                  : "text-fog-500 hover:text-white"
              }`}
            >
              Hindi Dub
            </button>
          </div>
        </div>

        <div
          className={
            theatreMode ? "" : "grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]"
          }
        >
          <div>
            {loading ? (
              <div className="relative aspect-video w-full grid place-items-center rounded-xl border border-white/10 bg-black">
                <div className="text-center space-y-3">
                  <Loader2 className="mx-auto h-12 w-12 animate-spin text-gold-500" />
                  <p className="text-sm font-medium text-white">Resolving live stream...</p>
                  <p className="text-xs text-fog-500">Connecting to {currentDub === "hin" ? "AnimeRulz" : "HiAnime / AnimeKai"}</p>
                </div>
              </div>
            ) : error || !primarySource ? (
              <div className="relative aspect-video w-full grid place-items-center rounded-xl border border-white/10 bg-ink-950 p-6 text-center">
                <div className="max-w-md space-y-3">
                  <p className="text-lg font-bold text-red-400">Stream Not Available</p>
                  <p className="text-sm text-fog-500">{error || "Unable to extract playable HLS stream for this episode."}</p>
                  <div className="flex justify-center gap-3 pt-2">
                    <button
                      onClick={() => {
                        setLoading(true);
                        setError(null);
                        setCurrentDub(currentDub === "sub" ? "eng" : "sub");
                      }}
                      className="inline-flex items-center gap-2 rounded-full bg-gold-500 px-4 py-2 text-xs font-semibold text-black hover:bg-gold-400"
                    >
                      <RotateCcw size={14} />
                      Try {currentDub === "sub" ? "English Dub" : "Japanese Sub"}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <VideoPlayer
                src={primarySource}
                poster={anime.bannerImage || anime.coverImage?.extraLarge || undefined}
                title={`${animeTitle} — Ep ${episode}`}
                subtitle={episodeTitle}
                subtitles={convertedSubtitles}
                intro={streamData?.intro}
                outro={streamData?.outro}
                theatreMode={theatreMode}
                onToggleTheatre={() => setTheatreMode((v) => !v)}
                onEnded={() => {
                  if (episodes.length > episode) {
                    onSelectEpisode(episode + 1);
                  }
                }}
              />
            )}

            <div className="mt-6">
              <p className="font-body text-xs font-medium uppercase tracking-[0.16em] text-gold-500">
                {streamData?.provider ? `Source: ${streamData.provider}` : "Now playing"}
              </p>
              <h1 className="mt-2 font-display text-[28px] leading-[34px] tracking-display text-paper-100 sm:text-[34px] sm:leading-[40px]">
                {episodeTitle}
              </h1>
              <p className="mt-2 font-body text-sm text-fog-500">
                {animeTitle} · Episode {String(episode).padStart(2, "0")} · {currentDub === "hin" ? "Hindi Dub" : currentDub === "eng" ? "English Dub" : "Japanese Sub"}
              </p>
            </div>
          </div>

          {/* Episode Tray Sidebar */}
          {!theatreMode && (
            <aside className="border border-ink-800 bg-ink-900/70 p-5 rounded-xl max-h-[680px] flex flex-col">
              <div className="flex items-center justify-between pb-3 border-b border-ink-800">
                <h2 className="font-display text-lg font-bold text-paper-100">
                  Episodes ({episodes.length})
                </h2>
                <span className="text-xs text-gold-500 font-semibold uppercase">
                  {currentDub}
                </span>
              </div>
              <div className="mt-3 flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                {episodes.map((ep) => {
                  const isCurrent = ep.number === episode;
                  return (
                    <button
                      key={ep.id}
                      className={`flex w-full items-center gap-3 p-2.5 rounded-lg text-left text-sm transition-colors ${
                        isCurrent
                          ? "bg-gold-500/20 text-gold-500 border border-gold-500/40"
                          : "hover:bg-ink-800 text-fog-500 hover:text-white"
                      }`}
                      onClick={() => onSelectEpisode(ep.number)}
                    >
                      <span
                        className={`grid h-7 w-7 shrink-0 place-items-center rounded text-xs font-bold ${
                          isCurrent
                            ? "bg-gold-500 text-black"
                            : "bg-ink-800 text-fog-500 border border-ink-700"
                        }`}
                      >
                        {ep.number}
                      </span>
                      <span className="truncate flex-1 font-medium">
                        {ep.title || `Episode ${ep.number}`}
                      </span>
                      {isCurrent && <Play size={14} fill="currentColor" />}
                    </button>
                  );
                })}
              </div>
            </aside>
          )}
        </div>
      </div>
    </section>
  );
}
