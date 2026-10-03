import { useEffect, useState, useCallback } from "react";
import { SiteNav, type NavigationPage } from "./shared/components/site-nav";
import { HomePage } from "./pages/home/home-page";
import { AnimePage } from "./pages/anime/anime-page";
import { AnimeDetail } from "./pages/anime/detail/anime-detail";
import { PlayerScreen } from "./pages/anime/player/player-screen";
import { MoviesPage } from "./pages/movies/movies-page";
import { DramaPage } from "./pages/drama/drama-page";
import { ComicsPage } from "./pages/comics/comics-page";
import {
  ComicReaderPage,
  ComicSeriesPage,
} from "./pages/comics/comic-reading-flow";
import {
  fetchAnimeDetails,
  type AnimeEpisode,
  type AnimeMedia,
} from "./shared/api/anime";
import {
  fetchComicDetails,
  type ComicChapter,
  type ComicSummary,
} from "./shared/api/comics";
import {
  parseLocation,
  buildAnimeDetailUrl,
  buildAnimeWatchUrl,
  buildComicUrl,
  buildComicReaderUrl,
  slugify,
  type AppRoute,
} from "./shared/utils/router";

export default function App() {
  const [route, setRoute] = useState<AppRoute>(() =>
    parseLocation(window.location.pathname, window.location.search)
  );

  // Anime state
  const [selectedAnime, setSelectedAnime] = useState<AnimeMedia | null>(null);
  const [animeEpisodes, setAnimeEpisodes] = useState<AnimeEpisode[]>([]);
  const [episode, setEpisode] = useState(1);
  const [dub, setDub] = useState<"sub" | "eng" | "hin">("sub");

  // Comic state
  const [comic, setComic] = useState<ComicSummary | null>(null);
  const [comicChapters, setComicChapters] = useState<ComicChapter[]>([]);
  const [chapterId, setChapterId] = useState<string>("");
  const [chapterNumber, setChapterNumber] = useState(1);

  // Listen to browser popstate (Back/Forward buttons)
  useEffect(() => {
    const handlePopState = () => {
      const parsed = parseLocation(window.location.pathname, window.location.search);
      setRoute(parsed);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // Smooth scroll to top on route change
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route.type]);

  // Handle direct visits / deep links / page refresh for Anime
  useEffect(() => {
    if (route.type === "anime-detail" || route.type === "anime-watch") {
      const targetId = route.animeId;
      if (!selectedAnime || selectedAnime.id !== targetId) {
        fetchAnimeDetails(targetId)
          .then((data) => {
            if (data.anime) {
              setSelectedAnime(data.anime);
              setAnimeEpisodes(data.episodes || []);
            }
          })
          .catch((err) => console.error("Could not fetch deep-linked anime:", err));
      }
      if (route.type === "anime-watch") {
        setEpisode(route.episode);
        setDub(route.dub);
      }
    }
  }, [route]);

  // Handle direct visits / deep links for Comics
  useEffect(() => {
    if (route.type === "comic-series" || route.type === "comic-reader") {
      if (!comic || String(comic.id) !== route.comicId) {
        fetchComicDetails(route.comicId)
          .then((data) => {
            if (data) {
              setComic(data);
              setComicChapters(data.chapters || []);
            }
          })
          .catch((err) => console.error("Could not fetch deep-linked comic:", err));
      }
      if (route.type === "comic-reader") {
        setChapterId(route.chapterId);
        setChapterNumber(route.chapterNumber);
      }
    }
  }, [route]);

  const navigateTo = useCallback(
    (newRoute: AppRoute, url: string, replace = false) => {
      if (replace) {
        window.history.replaceState({}, "", url);
      } else {
        window.history.pushState({}, "", url);
      }
      setRoute(newRoute);
      window.scrollTo(0, 0);
    },
    []
  );

  const navigate = (page: NavigationPage) => {
    const url = page === "home" ? "/" : `/${page}`;
    navigateTo({ type: page }, url);
  };

  const openAnimeDetail = (anime: AnimeMedia) => {
    setSelectedAnime(anime);
    const url = buildAnimeDetailUrl(anime);
    navigateTo(
      {
        type: "anime-detail",
        animeId: anime.id,
        slug: slugify(anime.title?.english || anime.title?.romaji),
      },
      url
    );
  };

  const openPlayer = (
    selectedEpisode: number,
    selectedDub: "sub" | "eng" | "hin" = "sub",
    anime?: AnimeMedia,
    episodes?: AnimeEpisode[]
  ) => {
    const targetAnime = anime || selectedAnime;
    if (targetAnime) {
      setSelectedAnime(targetAnime);
      if (episodes) setAnimeEpisodes(episodes);
      setEpisode(selectedEpisode);
      setDub(selectedDub);
      const url = buildAnimeWatchUrl(targetAnime, selectedEpisode, selectedDub);
      navigateTo(
        {
          type: "anime-watch",
          animeId: targetAnime.id,
          slug: slugify(targetAnime.title?.english || targetAnime.title?.romaji),
          episode: selectedEpisode,
          dub: selectedDub,
        },
        url
      );
    }
  };

  const openComic = (selectedComic: ComicSummary) => {
    setComic(selectedComic);
    const url = buildComicUrl(selectedComic.id);
    navigateTo({ type: "comic-series", comicId: String(selectedComic.id) }, url);
  };

  const openComicReader = (
    selectedChapterId: string,
    selectedChapterNumber: number,
    chapters: ComicChapter[]
  ) => {
    if (comic) {
      setChapterId(selectedChapterId);
      setChapterNumber(selectedChapterNumber);
      setComicChapters(chapters);
      const url = buildComicReaderUrl(comic.id, selectedChapterId, selectedChapterNumber);
      navigateTo(
        {
          type: "comic-reader",
          comicId: String(comic.id),
          chapterId: selectedChapterId,
          chapterNumber: selectedChapterNumber,
        },
        url
      );
    }
  };

  // In-app Back button handlers
  const handleBackFromDetail = () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      navigate("anime");
    }
  };

  const handleBackFromPlayer = () => {
    if (selectedAnime) {
      openAnimeDetail(selectedAnime);
    } else {
      navigate("anime");
    }
  };

  const activeNavPage: NavigationPage =
    route.type === "anime-detail" || route.type === "anime-watch"
      ? "anime"
      : route.type === "comic-series" || route.type === "comic-reader"
      ? "comics"
      : route.type;

  return (
    <main id="top" className="min-h-screen bg-ink-950 text-paper-100 font-body">
      {/* SiteNav is shown on top unless in immersive movie/drama/comic-reader mode */}
      {route.type !== "movies" &&
        route.type !== "drama" &&
        route.type !== "comic-reader" && (
          <SiteNav activePage={activeNavPage} onNavigate={navigate} />
        )}

      {route.type === "home" && (
        <HomePage
          onOpen={() => navigate("anime")}
          onOpenAnime={(anime) => openAnimeDetail(anime)}
          onNavigateCategory={(category) => navigate(category)}
        />
      )}

      {route.type === "anime" && (
        <AnimePage
          onBack={() => navigate("home")}
          onOpen={(anime) => openAnimeDetail(anime)}
        />
      )}

      {route.type === "movies" && <MoviesPage onExit={() => navigate("home")} />}

      {route.type === "drama" && (
        <DramaPage onBack={() => navigate("home")} onOpen={() => navigate("drama")} />
      )}

      {route.type === "comics" && (
        <ComicsPage onExit={() => navigate("home")} onOpen={openComic} />
      )}

      {route.type === "comic-series" && comic && (
        <ComicSeriesPage
          comic={comic}
          onBack={() => navigate("comics")}
          onRead={openComicReader}
        />
      )}

      {route.type === "comic-reader" && comic && (
        <ComicReaderPage
          comic={comic}
          chapterId={chapterId}
          chapterNumber={chapterNumber}
          chapters={comicChapters}
          onBack={() => {
            if (comic) {
              const url = buildComicUrl(comic.id);
              navigateTo({ type: "comic-series", comicId: String(comic.id) }, url);
            } else {
              navigate("comics");
            }
          }}
          onChangeChapter={(nextId, nextNum) => {
            setChapterId(nextId);
            setChapterNumber(nextNum);
            if (comic) {
              const url = buildComicReaderUrl(comic.id, nextId, nextNum);
              navigateTo(
                {
                  type: "comic-reader",
                  comicId: String(comic.id),
                  chapterId: nextId,
                  chapterNumber: nextNum,
                },
                url,
                true
              );
            }
          }}
        />
      )}

      {route.type === "anime-detail" && (
        <AnimeDetail
          anime={selectedAnime}
          onBack={handleBackFromDetail}
          onPlayEpisode={openPlayer}
        />
      )}

      {route.type === "anime-watch" && (
        <PlayerScreen
          anime={selectedAnime}
          episode={episode}
          dub={dub}
          episodes={animeEpisodes}
          onBack={handleBackFromPlayer}
          onSelectEpisode={(ep) => {
            setEpisode(ep);
            if (selectedAnime) {
              const url = buildAnimeWatchUrl(selectedAnime, ep, dub);
              navigateTo(
                {
                  type: "anime-watch",
                  animeId: selectedAnime.id,
                  slug: slugify(selectedAnime.title?.english || selectedAnime.title?.romaji),
                  episode: ep,
                  dub,
                },
                url
              );
            }
          }}
        />
      )}
    </main>
  );
}
