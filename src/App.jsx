import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, Info, Play, Star, X, ArrowLeft, Flame, Trophy, Sparkles, Compass, History, Tv, Globe, ChevronLeft, ChevronRight, BookOpen, ThumbsUp, ThumbsDown, Share2, Bookmark, MoreHorizontal, ChevronDown, PlayCircle, CheckCircle, Bell, Zap } from 'lucide-react';
import Navbar, { MobileBottomNav } from './components/Navbar';
import Sidebar from './components/Sidebar';
import SectionSlider from './components/SectionSlider';
import AnimeCard from './components/AnimeCard';
import VideoPlayer from './components/VideoPlayer';
import AuthModal from './components/AuthModal';
import { api, animeCategories, recentReleases, checkHindiDub, formatViews, formatRelativeTime, resolveEpisodeThumbnail } from './mockData';
import { apiUrl, getBackendConfigError } from './runtimeConfig';
import { supabase } from './supabaseClient';
import { getRecommendations } from './utils/cbf';
import { useDeviceType } from './utils/useDeviceType';
import WebtoonComicView from './components/WebtoonComicView';
import WebtoonDetailView from './components/WebtoonDetailView';
import { storage } from './utils/storage';
import { saveSession, loadSession, saveVideoProgress, getVideoProgress } from './utils/sessionRestore';
import { initNativeApp } from './utils/nativeApp';
import HindiView from './features/anime/hindi/components/HindiView';
import AnimeView from './features/anime/components/AnimeView';
import DramaCard from './features/drama/components/DramaCard';
import DramaRow from './features/drama/components/DramaRow';
import DramaHomeView from './features/drama/components/DramaHomeView';
import DramaDetailView from './features/drama/components/DramaDetailView';
import DramaWatchView from './features/drama/components/DramaWatchView';
import ManhwaCard from './features/manhwa/components/ManhwaCard';
import ManhwaRow from './features/manhwa/components/ManhwaRow';
import ManhwaHomeView from './features/manhwa/components/ManhwaHomeView';
import ManhwaDetailView from './features/manhwa/components/ManhwaDetailView';
import ManhwaReadView from './features/manhwa/components/ManhwaReadView';
import MovieCard from './features/movie/components/MovieCard';
import MovieRow from './features/movie/components/MovieRow';
import MovieHomeView from './features/movie/components/MovieHomeView';
import MovieDetailView from './features/movie/components/MovieDetailView';
import MoviePlexPlayerView from './features/movie/components/MoviePlexPlayerView';
import MovieWatchView from './features/movie/components/MovieWatchView';
import {
  MangaCard, MangaRow, MangaBentoGrid, MangaCategoryCards, MangaCategoryHub,
  MangaHomeView, MangaLandingShowcase, MangaShelfSpotlight, MangaCategoryCardsV2,
  MangaGenreBrowse, MangaCategoryHubV2, ComicCoverFlow, MangaHomeViewV2,
  MangaDetailView, MangaPage, MangaReaderView
} from './features/manga/components/MangaViews';
import {
  SaveToPlaylistModal,
  CreatePlaylistModal,
  YTHistoryView,
  YTPlaylistsView,
  YTPlaylistDetailView
} from './components/YTPlaylistsComponents';

function App() {
  const { isMobile, isTablet } = useDeviceType();
  const [view, setRawView] = useState('home');
  // Wrapper to allow setView call compatibility
  const setView = (v) => setRawView(v);
  // Sidebar: false = full 240px, true = mini 72px icons-only
  const [sidebarMini, setSidebarMini] = useState(false);

  // activeSection tracks which major section the user is browsing
  const [activeSection, setActiveSection] = useState('anime');
  const [featured, setFeatured] = useState([]);
  const [trending, setTrending] = useState([]);
  const [top10Famous, setTop10Famous] = useState([]);
  const [searchResults, setSearchResults] = useState({ anime: [], dramas: [], movies: [], manga: [] });
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [selectedAnime, setSelectedAnime] = useState(null);
  const [currentEpisode, setCurrentEpisode] = useState(null);
  const [currentSourceIndex, setCurrentSourceIndex] = useState(0);
  const [loadingSources, setLoadingSources] = useState(false);
  const [audioMode, setAudioMode] = useState('sub'); // 'sub' | 'dub' | 'hindi'
  const [pageLoading, setPageLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [franchiseList, setFranchiseList] = useState([]);

  // Category specific data sets (Netflix style rows structure)
  const [tvShowsData, setTvShowsData] = useState({ featured: null, genres: {} });
  const [moviesData, setMoviesData] = useState({ featured: null, genres: {} });
  const [newPopularData, setNewPopularData] = useState({ featured: null, rows: {} });
  const [hindiData, setHindiData] = useState({ featured: null, list: [] });
  const [hindiLoading, setHindiLoading] = useState(false);
  const [myList, setMyList] = useState([]);

  //  Playlists & History states 
  const [likedVideos, setLikedVideos] = useState(() => {
    try { return JSON.parse(localStorage.getItem('anistream_liked_videos')) || []; } catch (e) { return []; }
  });
  const [watchLater, setWatchLater] = useState(() => {
    try { return JSON.parse(localStorage.getItem('anistream_watch_later')) || []; } catch (e) { return []; }
  });
  const [customPlaylists, setCustomPlaylists] = useState(() => {
    try { return JSON.parse(localStorage.getItem('anistream_playlists')) || []; } catch (e) { return []; }
  });
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);

  // Modal states for Save & Create Playlist
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showCreatePlaylistModal, setShowCreatePlaylistModal] = useState(false);
  const [saveTargetItem, setSaveTargetItem] = useState(null);

  //  Subscriptions & Notifications System 
  const [subscriptions, setSubscriptions] = useState(() => {
    try {
      const saved = localStorage.getItem('anistream_subscriptions');
      return saved ? JSON.parse(saved) : [
        {
          id: 'chainsmoker-cat',
          media_id: 'chainsmoker-cat',
          title: 'Chainsmoker Cat',
          coverImage: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?q=80&w=400',
          hasNew: true
        },
        {
          id: 'frieren-s1',
          media_id: 'frieren-s1',
          title: 'Frieren: Beyond Journey\'s End',
          coverImage: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=400',
          hasNew: true
        }
      ];
    } catch (e) {
      return [];
    }
  });

  const [notifications, setNotifications] = useState(() => {
    try {
      const saved = localStorage.getItem('anistream_notifications');
      return saved ? JSON.parse(saved) : [
        {
          id: 'notif-season-1',
          type: 'season',
          animeTitle: 'Frieren: Beyond Journey\'s End',
          animeId: 'frieren-s1',
          season: 2,
          episode: 1,
          message: 'Season 2 has been released and its premiering its Episode 1 now!',
          avatar: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=400',
          thumb: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=400',
          timeAgo: '5 hours ago',
          read: false
        },
        {
          id: 'notif-ep-1',
          type: 'episode',
          animeTitle: 'Chainsmoker Cat',
          animeId: 'chainsmoker-cat',
          season: 1,
          episode: 2,
          message: 'Season 1 Episode 2 has been released. Click here to watch.',
          avatar: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?q=80&w=400',
          thumb: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?q=80&w=400',
          timeAgo: '15 hours ago',
          read: false
        }
      ];
    } catch (e) {
      return [];
    }
  });



  //  Drama state 
  const [dramaHomeData, setDramaHomeData] = useState(null);
  const [dramaHomeLoading, setDramaHomeLoading] = useState(false);
  const [dramaHomeError, setDramaHomeError] = useState('');
  const [selectedDrama, setSelectedDrama] = useState(null);
  const [dramaEpisode, setDramaEpisode] = useState(null);
  const [dramaStream, setDramaStream] = useState(null);
  const [dramaStreamLoading, setDramaStreamLoading] = useState(false);
  const [dramaSearchQuery, setDramaSearchQuery] = useState('');
  const [dramaSearchResults, setDramaSearchResults] = useState([]);
  const [dramaSearchLoading, setDramaSearchLoading] = useState(false);

  //  Manhwa state 
  const [manhwaHomeData, setManhwaHomeData] = useState(null);
  const [manhwaHomeLoading, setManhwaHomeLoading] = useState(false);
  const [manhwaHomeError, setManhwaHomeError] = useState('');
  const [selectedManhwa, setSelectedManhwa] = useState(null);
  const [manhwaDetailLoading, setManhwaDetailLoading] = useState(false);
  const [currentManhwaChapter, setCurrentManhwaChapter] = useState(null);
  const [manhwaChapterImages, setManhwaChapterImages] = useState([]);
  const [manhwaChapterLoading, setManhwaChapterLoading] = useState(false);
  const [manhwaSearchQuery, setManhwaSearchQuery] = useState('');
  const [manhwaSearchResults, setManhwaSearchResults] = useState([]);
  const [manhwaSearchLoading, setManhwaSearchLoading] = useState(false);

  //  Movies state 
  const [moviesHomeData, setMoviesHomeData] = useState(null);
  const [moviesHomeLoading, setMoviesHomeLoading] = useState(false);
  const [moviesHomeError, setMoviesHomeError] = useState('');
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [selectedMovieLoading, setSelectedMovieLoading] = useState(false);
  const [movieSearchQuery, setMovieSearchQuery] = useState('');
  const [movieSearchResults, setMovieSearchResults] = useState([]);
  const [movieSearchLoading, setMovieSearchLoading] = useState(false);
  const [movieActiveCategory, setMovieActiveCategory] = useState('All');

  //  Manga state 
  const [mangaHomeData, setMangaHomeData] = useState(null);
  const [mangaHomeLoading, setMangaHomeLoading] = useState(false);
  const [mangaHomeError, setMangaHomeError] = useState('');
  const [selectedManga, setSelectedManga] = useState(null);
  const [mangaDetailLoading, setMangaDetailLoading] = useState(false);
  const [currentMangaChapter, setCurrentMangaChapter] = useState(null);
  const [mangaPages, setMangaPages] = useState([]);
  const [mangaPageLoading, setMangaPageLoading] = useState(false);
  const [mangaSearchQuery, setMangaSearchQuery] = useState('');
  const [mangaSearchResults, setMangaSearchResults] = useState([]);
  const [mangaSearchLoading, setMangaSearchLoading] = useState(false);
  const [comicCategory, setComicCategory] = useState(null);

  //  Scroll Intro Overlay state 
  const [showIntroOverlay, setShowIntroOverlay] = useState(() => {
    try {
      return !sessionStorage.getItem('anistream_intro_seen');
    } catch (e) {
      return true;
    }
  });

  //  Auth & Sync states 
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [watchHistory, setWatchHistory] = useState([]);

  //  Welcome & Toast Notification states 
  const [showWelcome, setShowWelcome] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'info' });
  const toastTimeoutRef = useRef(null);

  const isPopStateRef = useRef(false);
  const stateObjRef = useRef(null);
  const [isInitialRouteReady, setInitialRouteReady] = useState(false);

  // Initialize Native APK Handlers (Back Button, Dark Status Bar, Splash Screen, Pause/Resume)
  useEffect(() => {
    initNativeApp({
      onBackButton: () => {
        if (window.history.length > 1) {
          window.history.back();
        }
      },
      onAppPause: () => {
        if (stateObjRef.current) {
          saveSession(stateObjRef.current);
        }
      },
      onAppResume: () => {
        console.log('[Native App] Resumed');
      },
      onDeepLink: (url) => {
        if (url && url.includes('callback')) {
          supabase.auth.getSession();
        }
      }
    });

    // Auto-restore previous app session if launched clean
    loadSession().then((restored) => {
      if (restored && restored.view && restored.view !== 'home' && window.location.pathname === '/') {
        if (restored.activeSection) setActiveSection(restored.activeSection);
        if (restored.selectedAnime) setSelectedAnime(restored.selectedAnime);
        if (restored.currentEpisode) setCurrentEpisode(restored.currentEpisode);
        if (restored.selectedMovie) setSelectedMovie(restored.selectedMovie);
        if (restored.selectedDrama) setSelectedDrama(restored.selectedDrama);
        if (restored.dramaEpisode) setDramaEpisode(restored.dramaEpisode);
        if (restored.selectedManhwa) setSelectedManhwa(restored.selectedManhwa);
        if (restored.currentManhwaChapter) setCurrentManhwaChapter(restored.currentManhwaChapter);
        setRawView(restored.view);
        console.log('[Session] Restored app view to:', restored.view);
      }
    }).catch(() => {});
  }, []);

  // Hook to handle Browser Back / Forward buttons (popstate)
  useEffect(() => {
    if (!window.history.state) {
      window.history.replaceState({
        view: 'home',
        selectedAnime: null,
        currentEpisode: null,
        selectedDrama: null,
        dramaEpisode: null,
        dramaStream: null,
        selectedManhwa: null,
        currentManhwaChapter: null,
        comicCategory: null,
        activeSection: 'anime'
      }, '');
    }

    const handlePopState = (event) => {
      if (event.state) {
        const state = event.state;
        isPopStateRef.current = true;

        setRawView(state.view || 'home');
        setSelectedAnime(state.selectedAnime || null);
        setCurrentEpisode(state.currentEpisode || null);
        setSelectedDrama(state.selectedDrama || null);
        setDramaEpisode(state.dramaEpisode || null);
        setSelectedManhwa(state.selectedManhwa || null);
        setCurrentManhwaChapter(state.currentManhwaChapter || null);
        setComicCategory(state.comicCategory || null);
        if (state.activeSection) setActiveSection(state.activeSection);
        
        // Clear search queries when navigating back to generic pages
        setSearchQuery('');
        setSearchResults({ anime: [], dramas: [], manga: [] });
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Hook to push views to browser history stack
  useEffect(() => {
    if (!isInitialRouteReady) return;

    if (isPopStateRef.current) {
      isPopStateRef.current = false;
      return;
    }

    // Clean serializable state object
    const stateObj = {
      view,
      activeSection,
      selectedAnime: (view === 'detail' || view === 'watch') && selectedAnime ? {
        id: selectedAnime.id,
        title: selectedAnime.title,
        japaneseTitle: selectedAnime.japaneseTitle,
        coverImage: selectedAnime.coverImage,
        bannerImage: selectedAnime.bannerImage,
        description: selectedAnime.description,
        rating: selectedAnime.rating,
        type: selectedAnime.type,
        status: selectedAnime.status,
        genres: selectedAnime.genres,
        totalEpisodes: selectedAnime.totalEpisodes,
        episodes: selectedAnime.episodes,
        episodePagination: selectedAnime.episodePagination,
        malId: selectedAnime.malId,
        relations: selectedAnime.relations
      } : null,
      currentEpisode: view === 'watch' && currentEpisode ? {
        number: currentEpisode.number,
        title: currentEpisode.title,
        sources: currentEpisode.sources,
        subtitles: currentEpisode.subtitles,
        iframeSrc: currentEpisode.iframeSrc,
        provider: currentEpisode.provider,
        error: currentEpisode.error
      } : null,
      selectedDrama: (view === 'drama-detail' || view === 'drama-watch') && selectedDrama ? selectedDrama : null,
      dramaEpisode: view === 'drama-watch' && dramaEpisode ? dramaEpisode : null,
      selectedManhwa: (view === 'manhwa-detail' || view === 'manhwa-read') && selectedManhwa ? selectedManhwa : null,
      currentManhwaChapter: view === 'manhwa-read' && currentManhwaChapter ? currentManhwaChapter : null,
      comicCategory: view === 'comic-category' ? comicCategory : null,
    };

    const currentState = window.history.state;
    
    // Check if we are updating state for the same page view
    const isSameView = currentState && currentState.view === view;
    const isSameAnime = currentState && currentState.selectedAnime && selectedAnime && currentState.selectedAnime.id === selectedAnime.id;
    const isSameEpisode = currentState && currentState.currentEpisode && currentEpisode && currentState.currentEpisode.number === currentEpisode.number;
    const isSameDrama = currentState && currentState.selectedDrama && selectedDrama && currentState.selectedDrama.id === selectedDrama.id;
    const isSameManhwa = currentState && currentState.selectedManhwa && selectedManhwa && currentState.selectedManhwa.slug === selectedManhwa.slug;

    const shouldReplace = isSameView && (
      isSameAnime || isSameEpisode || isSameDrama || isSameManhwa || 
      ['home', 'dramas', 'manhwa', 'tv-shows', 'movies', 'new-popular', 'my-list', 'hindi'].includes(view)
    );

    // Compute clean URL path (only when data is ready)
    let targetUrl = null;
    if (view === 'detail') {
      if (selectedAnime?.id) targetUrl = `/anime/${selectedAnime.id}`;
    } else if (view === 'watch') {
      if (selectedAnime?.id) {
        const epNum = currentEpisode?.number || 1;
        targetUrl = `/watch/anime/${selectedAnime.id}?ep=${epNum}`;
      }
    } else if (view === 'drama-detail') {
      if (selectedDrama?.id) targetUrl = `/drama/${encodeURIComponent(selectedDrama.id)}`;
    } else if (view === 'drama-watch') {
      if (selectedDrama?.id) {
        const epNum = dramaEpisode?.number || dramaEpisode?.id || 1;
        targetUrl = `/watch/drama/${encodeURIComponent(selectedDrama.id)}?ep=${epNum}`;
      }
    } else if (view === 'manhwa-detail') {
      if (selectedManhwa?.slug) targetUrl = `/manhwa/${encodeURIComponent(selectedManhwa.slug)}`;
    } else if (view === 'manhwa-read') {
      if (selectedManhwa?.slug) {
        const chSlug = currentManhwaChapter?.slug || 1;
        targetUrl = `/read/manhwa/${encodeURIComponent(selectedManhwa.slug)}?ch=${encodeURIComponent(chSlug)}`;
      }
    } else if (view === 'movie-detail') {
      if (selectedMovie?.id) targetUrl = `/movie/${encodeURIComponent(selectedMovie.id)}`;
    } else if (view === 'hindi') {
      targetUrl = '/hindi';
    } else if (view === 'tv-shows') {
      targetUrl = '/tv-shows';
    } else if (view === 'movies') {
      targetUrl = '/movies';
    } else if (view === 'dramas') {
      targetUrl = '/dramas';
    } else if (view === 'manhwa') {
      targetUrl = '/manhwa';
    } else if (view === 'manga-detail') {
      if (selectedManga?.id) targetUrl = `/comic/title/${encodeURIComponent(selectedManga.id)}`;
    } else if (view === 'manga-reader') {
      if (selectedManga?.id) targetUrl = `/read/comic/${encodeURIComponent(selectedManga.id)}?ch=${encodeURIComponent(currentMangaChapter?.id || 1)}`;
    } else if (view === 'comic-category' && comicCategory) {
      targetUrl = `/comic/${comicCategory}`;
    } else if (view === 'manga') {
      targetUrl = '/comic';
    } else if (view === 'new-popular') {
      targetUrl = '/new-popular';
    } else if (view === 'my-list') {
      targetUrl = '/my-list';
    } else if (view === 'anime') {
      targetUrl = '/anime';
    } else if (view === 'home') {
      targetUrl = '/';
    }

    if (targetUrl) {
      const currentUrl = window.location.pathname + window.location.search;
      if (shouldReplace || currentUrl === targetUrl) {
        window.history.replaceState(stateObj, '', targetUrl);
      } else {
        window.history.pushState(stateObj, '', targetUrl);
      }
    }
    stateObjRef.current = stateObj;
    saveSession(stateObj);
  }, [isInitialRouteReady, view, comicCategory, selectedAnime?.id, currentEpisode?.number, selectedDrama?.id, dramaEpisode?.id, selectedManhwa?.slug, currentManhwaChapter?.slug, selectedMovie?.id, selectedManga?.id, currentMangaChapter?.id]);

  const showToast = (message, type = 'info') => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast({ visible: true, message, type });
    toastTimeoutRef.current = setTimeout(() => {
      setToast(prev => ({ ...prev, visible: false }));
    }, 4000);
  };

  // Welcome banner for first time visitors
  useEffect(() => {
    // Check if user is logged in already. If not logged in and first time:
    const isFirstTime = !localStorage.getItem('eetnet_welcomed');
    if (isFirstTime && !user) {
      // Small delay to let page load look smooth
      const timer = setTimeout(() => {
        setShowWelcome(true);
        // Hide after 8 seconds
        setTimeout(() => {
          setShowWelcome(false);
          localStorage.setItem('eetnet_welcomed', 'true');
        }, 8000);
      }, 1500);

      return () => clearTimeout(timer);
    }
  }, [user]);

  const detailRequestRef = useRef(0);
  const watchRequestRef = useRef(0);
  const searchRequestRef = useRef(0);
  const searchDebounceRef = useRef(null);
  const hindiFetchInitiatedRef = useRef(false);

  //  Watch History & Watchlist Sync Engine 

  // Fetch watch history from DB/local on mount
  useEffect(() => {
    // 1. Initial local load
    try {
      const storedHistory = localStorage.getItem('anistream_watch_history');
      if (storedHistory) {
        setWatchHistory(JSON.parse(storedHistory));
      }
    } catch (e) {
      console.warn('Failed to load watch history from localStorage', e);
    }

    try {
      const storedWatchlist = localStorage.getItem('anistream_watchlist');
      if (storedWatchlist) {
        setMyList(JSON.parse(storedWatchlist));
      }
    } catch (e) {
      console.warn('Failed to load watchlist from localStorage', e);
    }

    // 1.5 Initial Route Parser for Clean URLs on Page Load / Direct Link
    const path = window.location.pathname.replace(/\/+$/, '') || '/';
    const params = new URLSearchParams(window.location.search);

    if (path === '/hindi') {
      setView('hindi');
    } else if (path === '/anime') {
      setView('anime');
      setActiveSection('anime');
    } else if (path === '/tv-shows') {
      setView('tv-shows');
      setActiveSection('anime');
    } else if (path === '/movies') {
      setView('movies');
      setActiveSection('movies');
    } else if (path === '/dramas') {
      setView('dramas');
      setActiveSection('drama');
    } else if (path === '/manhwa') {
      setView('manhwa');
      setActiveSection('comic');
    } else if (path === '/comic' || path === '/manga') {
      setView('manga');
      setComicCategory(null);
      setActiveSection('manga');
    } else if (path === '/new-popular') {
      setView('new-popular');
    } else if (path === '/my-list') {
      setView('my-list');
    } else if (path.startsWith('/watch/anime/')) {
      const id = path.replace('/watch/anime/', '');
      const epNum = parseInt(params.get('ep'), 10) || 1;
      if (id) {
        setPageLoading(true);
        api.getAnimeDetails(id).then((details) => {
          if (details) {
            startWatching(details, epNum);
          }
        }).catch((err) => {
          console.error('[Router] Direct anime watch link load error:', err);
        }).finally(() => setPageLoading(false));
      }
    } else if (path.startsWith('/anime/')) {
      const sub = path.replace('/anime/', '').toLowerCase();
      if (sub === 'topanime') {
        setView('new-popular');
        setAnimeCategory('topanime');
      } else if (sub === 'hindi') {
        setView('hindi');
        setAnimeCategory('hindi');
      } else if (['action', 'adventure', 'horror', 'thriller', 'romance', 'comedy'].includes(sub)) {
        const capitalized = sub.charAt(0).toUpperCase() + sub.slice(1);
        setGenreViewName(capitalized);
        setAnimeCategory(sub);
        setView('genre');
      } else if (sub) {
        handleAnimeClick(sub);
      }
    } else if (path.startsWith('/drama/')) {
      const id = decodeURIComponent(path.replace('/drama/', ''));
      if (id) {
        handleDramaClick({ id, title: id });
      }
    } else if (path.startsWith('/comic/title/')) {
      const id = decodeURIComponent(path.replace('/comic/title/', ''));
      if (id) {
        handleMangaClick({ id, title: id });
      }
    } else if (path.startsWith('/comic/')) {
      const category = path.replace('/comic/', '').toLowerCase();
      if (['manga', 'manhwa', 'manhua'].includes(category)) {
        setComicCategory(category);
        setView('comic-category');
        setActiveSection('manga');
      }
    } else if (path.startsWith('/manhwa/')) {
      const slug = decodeURIComponent(path.replace('/manhwa/', ''));
      if (slug) {
        handleManhwaClick({ slug, title: slug });
      }
    } else if (path.startsWith('/manga/')) {
      const id = decodeURIComponent(path.replace('/manga/', ''));
      if (id) {
        handleMangaClick({ id, title: id });
      }
    }

    setInitialRouteReady(true);

    // 2. Auth State Change Listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      setSession(newSession);
      const currentUser = newSession?.user || null;
      setUser(currentUser);

      if (currentUser) {
        // User logged in: Sync & merge database records
        setIsSyncing(true);
        try {
          await syncCloudData(currentUser.id);
        } catch (err) {
          console.error('[Sync Error] Failed to sync data with Supabase:', err);
        } finally {
          setIsSyncing(false);
        }
      } else {
        // User logged out: clear state to local only
        try {
          const storedH = localStorage.getItem('anistream_watch_history');
          const storedW = localStorage.getItem('anistream_watchlist');
          setWatchHistory(storedH ? JSON.parse(storedH) : []);
          setMyList(storedW ? JSON.parse(storedW) : []);
        } catch (e) {}
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Sync / Merge cloud data with local data
  const syncCloudData = async (userId) => {
    if (supabase.isMock) return;

    // A. Sync Watchlist
    const { data: cloudList, error: listErr } = await supabase
      .from('watchlist')
      .select('*')
      .eq('user_id', userId);

    if (!listErr && cloudList) {
      // Merge local watchlist with cloud watchlist
      const localWatchlist = JSON.parse(localStorage.getItem('anistream_watchlist') || '[]');
      const mergedWatchlist = [...cloudList];
      
      // Upload any local items not on cloud
      for (const localItem of localWatchlist) {
        const idStr = String(localItem.id || localItem.media_id);
        const exists = cloudList.some(item => String(item.media_id) === idStr);
        if (!exists) {
          const newItem = {
            user_id: userId,
            media_id: idStr,
            type: localItem.type || 'anime',
            title: localItem.title,
            cover: localItem.coverImage || localItem.cover || localItem.thumbnail,
          };
          await supabase.from('watchlist').insert(newItem);
          mergedWatchlist.push({ ...newItem, id: idStr });
        }
      }

      // Convert back to format expected by UI
      const formattedList = mergedWatchlist.map(item => ({
        id: item.media_id,
        title: item.title,
        type: item.type,
        coverImage: item.cover,
        bannerImage: item.cover,
        rating: 'N/A',
      }));

      setMyList(formattedList);
      localStorage.setItem('anistream_watchlist', JSON.stringify(formattedList));
    }

    // B. Sync Watch History
    const { data: cloudHistory, error: histErr } = await supabase
      .from('watch_history')
      .select('*')
      .eq('user_id', userId);

    if (!histErr && cloudHistory) {
      const localHistory = JSON.parse(localStorage.getItem('anistream_watch_history') || '[]');
      const mergedHistory = [...cloudHistory];

      // Upload local history not in cloud, or newer local history
      for (const localItem of localHistory) {
        const cloudItem = cloudHistory.find(item => String(item.media_id) === String(localItem.media_id));
        
        if (!cloudItem) {
          const newItem = {
            user_id: userId,
            media_id: String(localItem.media_id),
            type: localItem.type,
            title: localItem.title,
            cover: localItem.cover,
            episode_number: String(localItem.episode_number || ''),
            chapter_number: String(localItem.chapter_number || ''),
            progress_seconds: parseInt(localItem.progress_seconds || 0, 10),
            duration_seconds: parseInt(localItem.duration_seconds || 0, 10),
            updated_at: new Date().toISOString()
          };
          await supabase.from('watch_history').insert(newItem);
          mergedHistory.push(newItem);
        } else {
          // Compare dates if we have them, or just skip if cloud is present.
          // For simplicity, we assume cloud is source of truth unless local has progress
        }
      }

      // Sort by updated_at descending
      mergedHistory.sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));

      const formattedHistory = mergedHistory.map(item => ({
        media_id: item.media_id,
        id: item.media_id, // convenience duplicate
        type: item.type,
        title: item.title,
        cover: item.cover,
        coverImage: item.cover, // convenience duplicate
        episode_number: item.episode_number,
        chapter_number: item.chapter_number,
        progress_seconds: item.progress_seconds,
        duration_seconds: item.duration_seconds,
        updated_at: item.updated_at
      }));

      setWatchHistory(formattedHistory);
      localStorage.setItem('anistream_watch_history', JSON.stringify(formattedHistory));
    }
  };

  //  Playlists & Save Handlers 
  const handleToggleLiked = (item) => {
    if (!item) return;
    const idStr = String(item.id || item.media_id);
    setLikedVideos(prev => {
      const exists = prev.some(i => String(i.id || i.media_id) === idStr);
      let updated;
      if (exists) {
        updated = prev.filter(i => String(i.id || i.media_id) !== idStr);
        showToast('Removed from Liked videos');
      } else {
        const newItem = {
          id: idStr,
          media_id: idStr,
          title: item.title,
          cover: item.cover || item.coverImage || item.bannerImage,
          type: item.type || 'Anime',
          episode_number: item.episode_number || item.episode?.number || 1,
          added_at: new Date().toISOString()
        };
        updated = [newItem, ...prev];
        showToast('Added to Liked videos');
      }
      localStorage.setItem('anistream_liked_videos', JSON.stringify(updated));
      return updated;
    });
  };

  const handleToggleWatchLater = (item) => {
    if (!item) return;
    const idStr = String(item.id || item.media_id);
    setWatchLater(prev => {
      const exists = prev.some(i => String(i.id || i.media_id) === idStr);
      let updated;
      if (exists) {
        updated = prev.filter(i => String(i.id || i.media_id) !== idStr);
        showToast('Removed from Watch later');
      } else {
        const newItem = {
          id: idStr,
          media_id: idStr,
          title: item.title,
          cover: item.cover || item.coverImage || item.bannerImage,
          type: item.type || 'Anime',
          episode_number: item.episode_number || item.episode?.number || 1,
          added_at: new Date().toISOString()
        };
        updated = [newItem, ...prev];
        showToast('Added to Watch later');
      }
      localStorage.setItem('anistream_watch_later', JSON.stringify(updated));
      return updated;
    });
  };

  const handleToggleCustomPlaylist = (playlistId, item) => {
    if (!item) return;
    const idStr = String(item.id || item.media_id);
    setCustomPlaylists(prev => {
      const updated = prev.map(pl => {
        if (pl.id === playlistId) {
          const exists = pl.items?.some(i => String(i.id || i.media_id) === idStr);
          const newItems = exists
            ? pl.items.filter(i => String(i.id || i.media_id) !== idStr)
            : [{
                id: idStr,
                media_id: idStr,
                title: item.title,
                cover: item.cover || item.coverImage || item.bannerImage,
                type: item.type || 'Anime',
                episode_number: item.episode_number || item.episode?.number || 1
              }, ...(pl.items || [])];
          showToast(exists ? `Removed from ${pl.title}` : `Saved to ${pl.title}`);
          return { ...pl, items: newItems };
        }
        return pl;
      });
      localStorage.setItem('anistream_playlists', JSON.stringify(updated));
      return updated;
    });
  };

  const handleCreateNewPlaylist = (title) => {
    const formattedTarget = saveTargetItem ? {
      id: String(saveTargetItem.id || saveTargetItem.media_id),
      media_id: String(saveTargetItem.id || saveTargetItem.media_id),
      title: saveTargetItem.title,
      cover: saveTargetItem.cover || saveTargetItem.coverImage || saveTargetItem.bannerImage,
      type: saveTargetItem.type || 'Anime',
      episode_number: saveTargetItem.episode_number || saveTargetItem.episode?.number || 1
    } : null;

    const newPl = {
      id: 'pl-' + Date.now(),
      title,
      created_at: new Date().toISOString(),
      items: formattedTarget ? [formattedTarget] : []
    };

    setCustomPlaylists(prev => {
      const updated = [newPl, ...prev];
      localStorage.setItem('anistream_playlists', JSON.stringify(updated));
      return updated;
    });
    showToast(`Playlist "${title}" created`);
    setShowCreatePlaylistModal(false);
    setShowSaveModal(false);
  };

  const handleDeletePlaylist = (playlistId) => {
    setCustomPlaylists(prev => {
      const updated = prev.filter(pl => pl.id !== playlistId);
      localStorage.setItem('anistream_playlists', JSON.stringify(updated));
      return updated;
    });
    showToast('Playlist deleted');
  };

  const handleRemoveFromHistory = (item) => {
    const idStr = String(item.id || item.media_id);
    setWatchHistory(prev => {
      const updated = prev.filter(i => String(i.id || i.media_id) !== idStr);
      localStorage.setItem('anistream_watch_history', JSON.stringify(updated));
      return updated;
    });
    showToast('Removed from watch history');
  };

  const handleClearHistory = () => {
    setWatchHistory([]);
    localStorage.removeItem('anistream_watch_history');
    showToast('Watch history cleared');
  };

  const handleRemoveFromPlaylist = (playlistObj, item) => {
    if (playlistObj.type === 'liked') {
      handleToggleLiked(item);
    } else if (playlistObj.type === 'watch-later') {
      handleToggleWatchLater(item);
    } else if (playlistObj.id) {
      handleToggleCustomPlaylist(playlistObj.id, item);
    }
  };

  const handleToggleSubscribe = (anime) => {
    if (!anime) return;
    const idStr = String(anime.id || anime.media_id);
    setSubscriptions(prev => {
      const isSubbed = prev.some(s => String(s.id || s.media_id) === idStr);
      let updated;
      if (isSubbed) {
        updated = prev.filter(s => String(s.id || s.media_id) !== idStr);
        showToast(`Unsubscribed from ${anime.title}`);
      } else {
        const newSub = {
          id: idStr,
          media_id: idStr,
          title: anime.title,
          coverImage: anime.cover || anime.coverImage || anime.bannerImage,
          hasNew: true
        };
        updated = [newSub, ...prev];
        showToast(`Subscribed to ${anime.title}!`);

        // Create Season Release (Important) & Episode Release (More notifications)
        const newSeasonNotif = {
          id: 'notif-' + Date.now() + '-season',
          type: 'season', // Important section
          animeTitle: anime.title,
          animeId: idStr,
          season: 2,
          episode: 1,
          message: `Season 2 has been released and its premiering its Episode 1 now!`,
          avatar: anime.cover || anime.coverImage || anime.bannerImage,
          thumb: anime.bannerImage || anime.coverImage,
          timeAgo: 'Just now',
          read: false
        };

        const newEpNotif = {
          id: 'notif-' + Date.now() + '-ep',
          type: 'episode', // More notifications section
          animeTitle: anime.title,
          animeId: idStr,
          season: 1,
          episode: anime.totalEpisodes || 1,
          message: `Season 1 Episode ${anime.totalEpisodes || 1} has been released. Click here to watch.`,
          avatar: anime.cover || anime.coverImage || anime.bannerImage,
          thumb: anime.bannerImage || anime.coverImage,
          timeAgo: 'Just now',
          read: false
        };

        setNotifications(nPrev => {
          const nextNotifs = [newSeasonNotif, newEpNotif, ...nPrev];
          localStorage.setItem('anistream_notifications', JSON.stringify(nextNotifs));
          return nextNotifs;
        });
      }
      localStorage.setItem('anistream_subscriptions', JSON.stringify(updated));
      return updated;
    });
  };

  const handleSelectNotification = (notif) => {
    // Mark notification as read
    setNotifications(prev => {
      const updated = prev.map(n => n.id === notif.id ? { ...n, read: true } : n);
      localStorage.setItem('anistream_notifications', JSON.stringify(updated));
      return updated;
    });

    // Clear blue dot on subscription
    if (notif.animeId) {
      setSubscriptions(prev => {
        const updated = prev.map(s => String(s.id || s.media_id) === String(notif.animeId) ? { ...s, hasNew: false } : s);
        localStorage.setItem('anistream_subscriptions', JSON.stringify(updated));
        return updated;
      });

      // Navigate to Watch page for anime & episode
      setPageLoading(true);
      api.getAnimeDetails(notif.animeId).then(details => {
        if (details) {
          startWatching(details, notif.episode || 1);
        } else {
          setView('anime');
        }
      }).catch(() => setView('anime')).finally(() => setPageLoading(false));
    }
  };

  const handleSelectSubscription = (subAnime) => {
    // Clear blue dot indicator
    setSubscriptions(prev => {
      const updated = prev.map(s => String(s.id || s.media_id) === String(subAnime.id || subAnime.media_id) ? { ...s, hasNew: false } : s);
      localStorage.setItem('anistream_subscriptions', JSON.stringify(updated));
      return updated;
    });

    handleAnimeClick(subAnime.id || subAnime.media_id);
  };



  useEffect(() => {
    let mounted = true;

    const defaultFeatured = [
      {
        id: 'backrooms-movie',
        title: 'Backrooms',
        description: 'A young filmmaker enters a terrifying, liminal maze of endless empty rooms, realizing he is not alone in the yellow-hued nightmare.',
        coverImage: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?q=80&w=1920',
        bannerImage: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?q=80&w=1920',
        type: 'MOVIE',
        rating: '9.4',
        genres: ['Horror', 'Mystery', 'Thriller', 'Sci-Fi'],
        status: 'POPULAR'
      }
    ];

    api.getFeatured().then((items) => {
      if (mounted) setFeatured(items && items.length > 0 ? items : defaultFeatured);
    });
    api.getAnimeList().then((items) => {
      if (mounted) {
        setTrending(items);
        // Cache for CBF recommendations engine in WatchView
        if (items && items.length > 0) {
          window.__eetnet_trending_pool__ = items;
        }
      }
    });
    api.getTop10Famous().then((items) => {
      if (mounted) setTop10Famous(items);
    });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (featured.length === 0 || (view !== 'home' && view !== 'anime')) return undefined;

    const timer = window.setInterval(() => {
      setCarouselIndex((prev) => (prev + 1) % featured.length);
    }, 15000);

    return () => window.clearInterval(timer);
  }, [featured.length, view]);

  // Lazy-load view category content
  useEffect(() => {
    let mounted = true;
    const CATEGORY_GENRES = ['Action', 'Adventure', 'Fantasy', 'Sci-Fi', 'Drama', 'Romance'];

    if (view === 'tv-shows' && !tvShowsData.featured) {
      setPageLoading(true);
      api.getTVShows().then(async (featuredTV) => {
        if (!mounted) return;
        if (featuredTV.length === 0) {
          setPageLoading(false);
          return;
        }
        
        const genres = {};
        await Promise.all(
          CATEGORY_GENRES.map(async (genre) => {
            try {
              const list = await api.getGenreList('TV', genre);
              if (mounted) genres[genre] = list;
            } catch (e) {
              console.warn(`Failed to fetch TV genre ${genre}`, e);
            }
          })
        );
        
        if (mounted) {
          setTvShowsData({
            featured: featuredTV[0],
            genres
          });
          setPageLoading(false);
        }
      }).catch(() => {
        if (mounted) setPageLoading(false);
      });
    } else if (view === 'movies' && !moviesData.featured) {
      setPageLoading(true);
      api.getMovies().then(async (featuredMovies) => {
        if (!mounted) return;
        if (featuredMovies.length === 0) {
          setPageLoading(false);
          return;
        }

        const genres = {};
        await Promise.all(
          CATEGORY_GENRES.map(async (genre) => {
            try {
              const list = await api.getGenreList('MOVIE', genre);
              if (mounted) genres[genre] = list;
            } catch (e) {
              console.warn(`Failed to fetch Movie genre ${genre}`, e);
            }
          })
        );

        if (mounted) {
          setMoviesData({
            featured: featuredMovies[0],
            genres
          });
          setPageLoading(false);
        }
      }).catch(() => {
        if (mounted) setPageLoading(false);
      });
    } else if (view === 'new-popular' && !newPopularData.featured) {
      setPageLoading(true);
      Promise.all([
        api.getAnimeList(),      // Trending
        api.getNewAndPopular(),  // Airing now
        api.getFeatured()        // All-Time Popular
      ]).then(([trendingNow, airing, popular]) => {
        if (mounted) {
          setNewPopularData({
            featured: airing[0] || trendingNow[0] || popular[0],
            rows: {
              'Trending Now': trendingNow,
              'Currently Airing': airing,
              'All-Time Popular': popular
            }
          });
          setPageLoading(false);
        }
      }).catch(() => {
        if (mounted) setPageLoading(false);
      });
    }
    return () => {
      mounted = false;
    };
  }, [view, tvShowsData.featured, moviesData.featured, newPopularData.featured]);

  //  Hindi Dub catalog: isolated effect so its own mounted/loading never
  //    collides with the shared pageLoading used by other sections.
  useEffect(() => {
    if (view !== 'hindi' && activeCategory !== 'Hindi') return;
    if (hindiFetchInitiatedRef.current && hindiData.list.length > 0) return; // already fetching or done with results
    hindiFetchInitiatedRef.current = true;
    let alive = true;
    setHindiLoading(true);
    const accumulated = [];
    api.getHindiAnimeList((batch) => {
      if (!alive) return;
      accumulated.push(...batch);
      const sorted = [...accumulated].sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
      setHindiData({ featured: sorted[0] || null, list: sorted });
      setHindiLoading(false); // first batch â†’ stop spinner immediately
    }).then((list) => {
      if (!alive) return;
      const sorted = [...list].sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
      setHindiData({ featured: sorted[0] || null, list: sorted });
      setHindiLoading(false);
    }).catch((err) => {
      console.warn('[Hindi] Catalog fetch failed:', err);
      if (alive) setHindiLoading(false);
    });
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, activeCategory]);

  // Load drama home when switching to dramas view
  useEffect(() => {
    if (view !== 'dramas') return;
    const hasValidData = dramaHomeData && dramaHomeData.korean && Array.isArray(dramaHomeData.korean);
    if (hasValidData) return;
    const configError = getBackendConfigError();
    if (configError) {
      setDramaHomeError(configError);
      setDramaHomeData(null);
      return;
    }
    setDramaHomeLoading(true);
    setDramaHomeError('');
    fetch(apiUrl('/api/drama/home'))
      .then(async r => {
        const data = await r.json().catch(() => null);
        if (!r.ok) throw new Error(data?.message || data?.error || `Backend returned ${r.status}`);
        return data;
      })
      .then(data => {
        if (data && Array.isArray(data.korean)) {
          setDramaHomeData(data);
        } else {
          setDramaHomeData(null);
          setDramaHomeError('Drama backend returned an unexpected response.');
          console.warn('[Drama Home] API returned error:', data);
        }
        setDramaHomeLoading(false);
      })
      .catch(err => {
        console.warn('[Drama Home] Fetch failed:', err);
        setDramaHomeLoading(false);
        setDramaHomeData(null);
        setDramaHomeError(err.message || 'Could not reach the backend.');
      });
  }, [view]);

  // Load manhwa home when switching to manhwa view
  useEffect(() => {
    if (view !== 'manhwa') return;
    if (manhwaHomeData) return;
    const configError = getBackendConfigError();
    if (configError) {
      setManhwaHomeError(configError);
      setManhwaHomeData(null);
      return;
    }
    setManhwaHomeLoading(true);
    setManhwaHomeError('');
    fetch(apiUrl('/api/manhwa/home'))
      .then(async r => {
        const data = await r.json().catch(() => null);
        if (!r.ok) throw new Error(data?.message || data?.error || `Backend returned ${r.status}`);
        return data;
      })
      .then(data => {
        if (data && Array.isArray(data.popular)) {
          setManhwaHomeData(data);
        } else {
          setManhwaHomeData(null);
          setManhwaHomeError('Manhwa backend returned an unexpected response.');
        }
        setManhwaHomeLoading(false);
      })
      .catch(err => {
        console.warn('[Manhwa Home] Fetch failed:', err);
        setManhwaHomeLoading(false);
        setManhwaHomeError(err.message || 'Could not reach the backend.');
      });
  }, [view]);

  // Load movies home when switching to movies view
  // NOTE: Movies use Vercel serverless directly (TMDB), NOT the phone tunnel
  useEffect(() => {
    if (view !== 'movies') return;
    if (moviesHomeData) return;
    setMoviesHomeLoading(true);
    setMoviesHomeError('');
    fetch(apiUrl('/api/movies/home'))
      .then(async r => {
        const data = await r.json().catch(() => null);
        if (!r.ok) throw new Error(data?.message || data?.error || `Backend returned ${r.status}`);
        return data;
      })
      .then(data => {
        if (data && Array.isArray(data.bollywood)) {
          setMoviesHomeData(data);
        } else {
          setMoviesHomeData(null);
          setMoviesHomeError('Movies backend returned an unexpected response.');
        }
        setMoviesHomeLoading(false);
      })
      .catch(err => {
        console.warn('[Movies Home] Fetch failed:', err);
        setMoviesHomeLoading(false);
        setMoviesHomeError(err.message || 'Could not reach the backend.');
      });
  }, [view]);

  // Load manga home when switching to manga view
  useEffect(() => {
    if (view !== 'manga') return;
    if (mangaHomeData) return;
    let mounted = true;
    setMangaHomeLoading(true);
    setMangaHomeError('');
    api.getMangaHomeData().then(data => {
      if (!mounted) return;
      if (data && (data.trending?.length || data.popular?.length)) {
        setMangaHomeData(data);
      } else {
        setMangaHomeData(null);
        setMangaHomeError('Could not load manga catalog.');
      }
      setMangaHomeLoading(false);
    }).catch(err => {
      if (!mounted) return;
      console.warn('[Manga Home] Fetch failed:', err);
      setMangaHomeLoading(false);
      setMangaHomeData(null);
      setMangaHomeError(err.message || 'Could not load manga home.');
    });
    return () => { mounted = false; };
  }, [view]);

  const toggleWatchlist = async (animeItem) => {
    // Require login to use watchlist
    if (!user) {
      setShowAuthModal(true);
      showToast('Sign in to save titles to your watchlist!', 'info');
      return;
    }

    let exists = myList.some((item) => item.id === animeItem.id);
    let updated;

    if (exists) {
      updated = myList.filter((item) => item.id !== animeItem.id);
    } else {
      const item = {
        id: animeItem.id,
        title: animeItem.title,
        coverImage: animeItem.coverImage || animeItem.cover || animeItem.thumbnail,
        bannerImage: animeItem.bannerImage || animeItem.cover || animeItem.thumbnail,
        rating: animeItem.rating || 'N/A',
        type: animeItem.type || animeItem.format || 'anime',
        genres: animeItem.genres || []
      };
      updated = [item, ...myList];
    }

    setMyList(updated);

    try {
      localStorage.setItem('anistream_watchlist', JSON.stringify(updated));
    } catch (e) {
      console.warn('Failed to save watchlist to localStorage', e);
    }

    // Sync to Supabase in the background if logged in
    if (user && !supabase.isMock) {
      const idStr = String(animeItem.id);
      if (exists) {
        await supabase
          .from('watchlist')
          .delete()
          .eq('user_id', user.id)
          .eq('media_id', idStr);
      } else {
        await supabase
          .from('watchlist')
          .insert({
            user_id: user.id,
            media_id: idStr,
            type: animeItem.type || animeItem.format || 'anime',
            title: animeItem.title,
            cover: animeItem.coverImage || animeItem.cover || animeItem.thumbnail,
          });
      }
    }
  };

  const handleWatchProgress = async (mediaItem, itemDetail, type, progDetail) => {
    const mediaId = String(mediaItem.id || mediaItem.slug || mediaItem.idMal || mediaItem.id);
    const cover = mediaItem.coverImage || mediaItem.bannerImage || mediaItem.cover || mediaItem.thumbnail || '';
    const title = mediaItem.title || '';

    const episodeNum = type === 'manhwa' ? '' : String(itemDetail?.number || itemDetail || '');
    const chapterNum = type === 'manhwa' ? String(itemDetail?.number || itemDetail?.slug || itemDetail || '') : '';

    // Store full metadata so history items can be resumed correctly
    const newHistoryItem = {
      media_id: mediaId,
      id: mediaId,
      type,
      title,
      cover,
      coverImage: cover,
      episode_number: episodeNum,
      chapter_number: chapterNum,
      progress_seconds: progDetail.progressSeconds,
      duration_seconds: progDetail.durationSeconds,
      updated_at: new Date().toISOString(),
      // Preserve routing metadata so clicking in history resumes correctly
      slug: mediaItem.slug || mediaItem.movieplexSlug || null,
      movieplexSlug: mediaItem.movieplexSlug || null,
      netmirrorId: mediaItem.netmirrorId || null,
      source: mediaItem.source || null,
      dramaId: mediaItem.id || null,
      anilistId: mediaItem.id || null,
    };

    setWatchHistory(prev => {
      const filtered = prev.filter(item => String(item.media_id) !== mediaId);
      const updated = [newHistoryItem, ...filtered];
      try {
        localStorage.setItem('anistream_watch_history', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });

    if (user && !supabase.isMock) {
      await supabase
        .from('watch_history')
        .upsert({
          user_id: user.id,
          media_id: mediaId,
          type,
          title,
          cover,
          episode_number: episodeNum,
          chapter_number: chapterNum,
          progress_seconds: parseInt(progDetail.progressSeconds || 0, 10),
          duration_seconds: parseInt(progDetail.durationSeconds || 0, 10),
          updated_at: new Date().toISOString()
        });
    }
  };

  const resetSearch = () => {
    searchRequestRef.current += 1;
    setSearchQuery('');
    setSearchResults({ anime: [], dramas: [], manga: [] });
    setSearchLoading(false);
  };

  const goHome = () => {
    resetSearch();
    detailRequestRef.current += 1;
    watchRequestRef.current += 1;
    setView('home');
    setActiveSection('anime');
    setSelectedAnime(null);
    setCurrentEpisode(null);
    setLoadingSources(false);
    window.scrollTo(0, 0);
  };

  const goDramas = () => {
    resetSearch();
    setView('dramas');
    setActiveSection('drama');
    setSelectedDrama(null);
    setDramaEpisode(null);
    setDramaStream(null);
    window.scrollTo(0, 0);
  };

  const goMovies = () => {
    resetSearch();
    setView('movies');
    setActiveSection('movies');
    setSelectedMovie(null);
    setMovieSearchQuery('');
    setMovieSearchResults([]);
    window.scrollTo(0, 0);
  };

  const goManhwa = () => {
    resetSearch();
    setView('manhwa');
    setActiveSection('comic');
    setSelectedManhwa(null);
    setCurrentManhwaChapter(null);
    setManhwaChapterImages([]);
    setManhwaSearchQuery('');
    setManhwaSearchResults([]);
    window.scrollTo(0, 0);
  };

  const goManga = () => {
    resetSearch();
    setView('manga');
    setActiveSection('manga');
    setSelectedManga(null);
    setCurrentMangaChapter(null);
    setMangaPages([]);
    setMangaSearchQuery('');
    setMangaSearchResults([]);
    setComicCategory(null);
    window.scrollTo(0, 0);
  };

  const handleAnimeClick = async (idOrTitle, fromFranchise = false) => {
    if (!idOrTitle) return;
    resetSearch();
    if (!fromFranchise) {
      detailRequestRef.current += 1;
      watchRequestRef.current += 1;
    }
    const requestId = detailRequestRef.current;

    setSelectedAnime(null);
    setCurrentEpisode(null);
    setFranchiseList([]);
    setPageLoading(true);
    setView('detail');
    setActiveSection('anime');
    window.scrollTo(0, 0);

    try {
      const details = await api.getAnimeDetails(idOrTitle);
      if (!details || requestId !== detailRequestRef.current) return;
      setSelectedAnime(details);

      // Load franchise list in background
      if (details.id) {
        api.getFranchise(details.id, details.title, details.relations).then(list => {
          if (requestId === detailRequestRef.current) setFranchiseList(list || []);
        }).catch(() => {});
      }

      //  Async: check AnimeRulz Hindi dub availability 
      if (details.id) {
        checkHindiDub(details.id).then(langs => {
          if (requestId === detailRequestRef.current) {
            const hindiOk = langs.includes('hindi');
            setSelectedAnime(prev => prev ? { ...prev, hindiAvailable: hindiOk, hindiLanguages: langs } : prev);
          }
        }).catch(() => {});
      }
    } catch (err) {
      console.error('[handleAnimeClick] Failed to load details:', err);
    } finally {
      if (requestId === detailRequestRef.current) setPageLoading(false);
    }
  };

  const startWatching = async (animeNode, epNumberOrObj = 1, keepFranchise = false, targetAudio = audioMode) => {
    if (!animeNode) return;
    resetSearch();
    const requestId = watchRequestRef.current + 1;
    watchRequestRef.current = requestId;

    const epNum = typeof epNumberOrObj === 'object' ? (epNumberOrObj?.number ?? 1) : (epNumberOrObj ?? 1);

    setSelectedAnime(prev => ({ ...(prev || {}), ...animeNode }));
    setCurrentEpisode(null);
    setLoadingSources(true);
    setCurrentSourceIndex(0);
    setView('watch');
    setActiveSection('anime');
    window.scrollTo(0, 0);

    try {
      // Need full details if we don't have episodes
      let details = animeNode;
      if (!details.episodes || details.episodes.length === 0) {
        details = await api.getAnimeDetails(animeNode.id);
        if (!details || requestId !== watchRequestRef.current) return;
        setSelectedAnime(details);
      }

      // Load franchise in background (only if not keeping current franchise)
      if (!keepFranchise && details.id) {
        api.getFranchise(details.id, details.title, details.relations).then(list => {
          if (requestId === watchRequestRef.current) setFranchiseList(list || []);
        }).catch(() => {});
      }

      //  Async: check AnimeRulz Hindi dub availability 
      if (details.id && requestId === watchRequestRef.current) {
        checkHindiDub(details.id).then(langs => {
          if (requestId === watchRequestRef.current) {
            const hindiOk = langs.includes('hindi');
            setSelectedAnime(prev => prev ? { ...prev, hindiAvailable: hindiOk, hindiLanguages: langs } : prev);
          }
        }).catch(() => {});
      }

      //  FIXED: Pass ALL required params to getEpisodeSources 
      // Signature: (episodeId, animeTitle, japaneseTitle, episodeNumber, anilistId, seasonNum, audioMode)
      const animeTitle = details.title || details.nativeTitle || '';
      const japaneseTitle = details.nativeTitle || details.japaneseTitle || details.synonyms?.[0] || '';
      const anilistId = details.id || null;
      const seasonNum = details.seasonNum || details.season || null;

      const episodeData = await api.getEpisodeSources(
        null,           // episodeId  (not needed for AnimeKai/HiAnime path)
        animeTitle,     // animeTitle 
        japaneseTitle,  // japaneseTitle 
        epNum,          // episodeNumber 
        anilistId,      // anilistId 
        seasonNum,      // seasonNum 
        targetAudio     // audioMode 
      );

      if (!episodeData || requestId !== watchRequestRef.current) return;

      // Attach episode number so VideoPlayer / progress tracker can use it
      setCurrentEpisode({ ...episodeData, number: epNum });
      setCurrentSourceIndex(0);

      // Track progress
      handleWatchProgress(details, { ...episodeData, number: epNum }, 'anime', { progressSeconds: 0, durationSeconds: 0 });
    } catch (err) {
      console.error('[startWatching] Failed:', err);
      setCurrentEpisode({ number: epNum, error: 'Could not load this episode.' });
    } finally {
      if (requestId === watchRequestRef.current) setLoadingSources(false);
    }
  };

  const handleMangaClick = async (manga) => {

    resetSearch();
    setSelectedManga({ ...manga, chapters: [] });
    setView('manga-detail');
    setMangaDetailLoading(true);
    window.scrollTo(0, 0);
    try {
      const data = await api.getMangaInfo(manga.mangadexId || manga.id);
      if (data) setSelectedManga(prev => ({ ...prev, ...data }));
    } catch (e) {
      console.error('Manga info load failed', e);
    } finally {
      setMangaDetailLoading(false);
    }
  };

  const handleMangaRead = async (manga, chapter) => {
    setView('manga-reader');
    setMangaPageLoading(true);
    setMangaPages([]);
    window.scrollTo(0, 0);

    let targetManga = manga;
    let targetChapter = chapter;

    try {
      // 1. If chapter carries full chapters array from detail view, attach it
      if (chapter.chapters && Array.isArray(chapter.chapters) && chapter.chapters.length > 0) {
        targetManga = { ...targetManga, chapters: chapter.chapters };
      }

      // 2. If targetManga is still missing chapters array, fetch full info
      if (!targetManga.chapters || targetManga.chapters.length === 0 || !targetChapter?.id || !targetChapter.id.includes('___')) {
        const info = await api.getMangaInfo(targetManga.comickSlug || targetManga.anilistId || targetManga.id || targetManga.title);
        if (info && info.chapters && info.chapters.length > 0) {
          targetManga = { ...targetManga, ...info };

          const targetNum = String(chapter.chapter || chapter.number || '1');
          const matched = info.chapters.find(c => String(c.chapter) === targetNum || String(c.number) === targetNum);
          if (matched && !targetChapter.id.includes('___')) {
            targetChapter = matched;
          }
        }
      }

      setCurrentMangaChapter(targetChapter);
      if (targetManga) {
        setSelectedManga(prev => ({ ...prev, ...targetManga }));
        setSelectedManhwa(prev => ({ ...prev, ...targetManga }));
      }

      console.log('[handleMangaRead] Fetching chapter pages for:', targetChapter.id);
      const data = await api.getMangaChapterPages(targetChapter.id);
      const fetchedPages = data?.pages || [];
      setMangaPages(fetchedPages);

      // Preload first 6 pages in parallel in background before showing reader
      if (fetchedPages.length > 0) {
        const firstBatch = fetchedPages.slice(0, 6);
        await Promise.all(firstBatch.map(p => new Promise(resolve => {
          const img = new Image();
          img.onload = resolve;
          img.onerror = resolve;
          img.src = p.url;
        })));
      }
    } catch (e) {
      console.error('Manga chapter pages load failed', e);
      setMangaPages([]);
    } finally {
      setMangaPageLoading(false);
    }
  };

  const handleMangaSearch = (q) => {
    setMangaSearchQuery(q);
    if (!q.trim()) { setMangaSearchResults([]); return; }
    setMangaSearchLoading(true);
    api.searchManga(q)
      .then(data => {
        setMangaSearchResults(Array.isArray(data) ? data : []);
        setMangaSearchLoading(false);
      })
      .catch(() => { setMangaSearchResults([]); setMangaSearchLoading(false); });
  };

  const goAnime = () => {
    resetSearch();
    detailRequestRef.current += 1;
    watchRequestRef.current += 1;
    setView('anime');
    setActiveSection('anime');
    setSelectedAnime(null);
    setCurrentEpisode(null);
    setLoadingSources(false);
    window.scrollTo(0, 0);
  };

  const [animeCategory, setAnimeCategory] = useState('topanime');
  const [genreViewName, setGenreViewName] = useState('Horror');
  const [genreAnimeList, setGenreAnimeList] = useState([]);
  const [genreLoading, setGenreLoading] = useState(false);
  const [genrePage, setGenrePage] = useState(1);
  const [genreLoadingMore, setGenreLoadingMore] = useState(false);
  const [genreHasMore, setGenreHasMore] = useState(true);

  const handleAnimeCategoryChange = (catId) => {
    const id = (catId || 'topanime').toLowerCase();
    setAnimeCategory(id);
    resetSearch();
    setActiveSection('anime');
    setSelectedAnime(null);
    setCurrentEpisode(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (id === 'hindi') {
      setView('hindi');
      try { window.history.pushState(null, '', '/anime/hindi'); } catch (e) {}
    } else if (id === 'topanime') {
      setView('new-popular');
      try { window.history.pushState(null, '', '/anime/topanime'); } catch (e) {}
    } else if (['action', 'adventure', 'horror', 'thriller', 'romance', 'comedy'].includes(id)) {
      const capitalized = id.charAt(0).toUpperCase() + id.slice(1);
      setGenreViewName(capitalized);
      setView('genre');
      try { window.history.pushState(null, '', `/anime/${id}`); } catch (e) {}
    } else {
      setView('anime');
    }
  };

  // Initial Genre Page Fetch (Page 1)
  useEffect(() => {
    if (view !== 'genre' || !genreViewName) return;
    let mounted = true;
    setGenreLoading(true);
    setGenrePage(1);
    setGenreHasMore(true);

    api.getGenreList('ANIME', genreViewName, 1, 30).then((list) => {
      if (mounted) {
        setGenreAnimeList(list || []);
        setGenreLoading(false);
        if (!list || list.length < 30) setGenreHasMore(false);
      }
    }).catch((err) => {
      console.warn(`[Genre View] Failed to load ${genreViewName} anime:`, err);
      if (mounted) {
        setGenreAnimeList([]);
        setGenreLoading(false);
        setGenreHasMore(false);
      }
    });
    return () => { mounted = false; };
  }, [view, genreViewName]);

  // Infinite Scroll Listener for Genre View (Optimized capped at 200 anime max)
  useEffect(() => {
    if (view !== 'genre' || genreLoading || genreLoadingMore || !genreHasMore) return;

    const handleScroll = () => {
      if (genreAnimeList.length >= 200) {
        setGenreHasMore(false);
        return;
      }

      const scrollBottom = window.innerHeight + window.scrollY;
      const threshold = document.body.offsetHeight - 700;

      if (scrollBottom >= threshold && !genreLoadingMore && genreHasMore) {
        const nextPage = genrePage + 1;
        setGenreLoadingMore(true);

        api.getGenreList('ANIME', genreViewName, nextPage, 30).then((nextList) => {
          if (!nextList || nextList.length === 0) {
            setGenreHasMore(false);
          } else {
            setGenreAnimeList((prev) => {
              const existingIds = new Set(prev.map((item) => item.id));
              const freshItems = nextList.filter((item) => !existingIds.has(item.id));
              const combined = [...prev, ...freshItems];
              if (combined.length >= 200) {
                setGenreHasMore(false);
                return combined.slice(0, 200);
              }
              return combined;
            });
            setGenrePage(nextPage);
          }
        }).catch(() => {
          setGenreHasMore(false);
        }).finally(() => {
          setGenreLoadingMore(false);
        });
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [view, genreViewName, genrePage, genreLoading, genreLoadingMore, genreHasMore, genreAnimeList.length]);

  // Called by SectionSlider when user picks Anime / Drama / Comic / Movies
  const handleSectionChange = (sectionId, catId) => {
    if (catId) {
      handleAnimeCategoryChange(catId);
      return;
    }
    if (sectionId === 'anime') {
      goAnime();
    } else if (sectionId === 'drama') {
      goDramas();
    } else if (sectionId === 'movies') {
      goMovies();
    } else if (sectionId === 'comic') {
      goManhwa();
    }
  };

  const handleManhwaClick = async (series) => {
    resetSearch();
    setSelectedManhwa({ ...series, chapters: [] });
    setManhwaDetailLoading(true);
    setView('manhwa-detail');
    window.scrollTo(0, 0);
    try {
      const r = await fetch(apiUrl(`/api/manhwa/series/${series.slug}`));
      const data = await r.json();
      setSelectedManhwa(data);
    } catch (e) {
      console.error('Manhwa series load failed', e);
    } finally {
      setManhwaDetailLoading(false);
    }
  };

  const handleManhwaRead = async (series, chapter) => {
    resetSearch();
    setCurrentManhwaChapter(chapter);
    setManhwaChapterImages([]);
    setManhwaChapterLoading(true);
    setView('manhwa-read');
    window.scrollTo(0, 0);
    try {
      const r = await fetch(apiUrl(`/api/manhwa/chapter/${series.slug}/${chapter.slug}`));
      const data = await r.json();
      setManhwaChapterImages(data.images || []);
      // Track chapter reading in watch history
      handleWatchProgress(series, chapter, 'manhwa', { progressSeconds: 100, durationSeconds: 100 });
    } catch (e) {
      console.error('Manhwa chapter load failed', e);
    } finally {
      setManhwaChapterLoading(false);
    }
  };

  const handleManhwaSearch = (q) => {
    setManhwaSearchQuery(q);
    if (!q.trim()) { setManhwaSearchResults([]); return; }
    setManhwaSearchLoading(true);
    fetch(apiUrl(`/api/manhwa/search?q=${encodeURIComponent(q)}`))
      .then(r => r.json())
      .then(data => {
        setManhwaSearchResults(Array.isArray(data) ? data : []);
        setManhwaSearchLoading(false);
      })
      .catch(() => { setManhwaSearchResults([]); setManhwaSearchLoading(false); });
  };

  const handleDramaClick = async (drama) => {
    resetSearch();

    // Smart check: If the item clicked in drama search is actually an anime (e.g. Galactic Heroes, My Hero Academia, Dragon Ball), route to handleAnimeClick!
    const titleLower = (drama.title || '').toLowerCase();
    const isAnimeTitle = ['ginga eiyuu', 'galactic heroes', 'hero academia', 'boku no hero', 'dragon ball', 'naruto', 'one piece', 'bleach', 'jujutsu', 'demon slayer'].some(kw => titleLower.includes(kw));

    if (isAnimeTitle) {
      console.log(`[Search] Routing anime title "${drama.title}" from drama results to anime player...`);
      // Search AniList by title and launch anime view
      setPageLoading(true);
      api.searchAnime(drama.title).then((results) => {
        if (results && results.length > 0) {
          handleAnimeClick(results[0].id);
        } else {
          // Fallback to title string lookup
          handleAnimeClick(drama.title);
        }
      }).finally(() => setPageLoading(false));
      return;
    }

    setSelectedDrama({ ...drama, episodes: [] });
    setView('drama-detail');
    setDramaStream(null);
    window.scrollTo(0, 0);
    try {
      const r = await fetch(apiUrl(`/api/drama/info/${drama.id}`));
      const data = await r.json();
      setSelectedDrama({ ...data, thumbnail: data.thumbnail || drama.thumbnail });
    } catch (e) {
      console.error('Drama info load failed', e);
    }
  };

  const startWatchingDrama = async (drama, episode) => {
    resetSearch();
    setDramaEpisode(episode);
    setDramaStream(null);
    setDramaStreamLoading(true);
    setView('drama-watch');
    window.scrollTo(0, 0);
    try {
      const r = await fetch(apiUrl(`/api/drama/stream/${episode.id}`));
      const data = await r.json();
      setDramaStream(data);
    } catch (e) {
      console.error('Drama stream load failed', e);
      setDramaStream({ error: 'Could not load stream for this episode.' });
    } finally {
      setDramaStreamLoading(false);
    }
  };

  const handleDramaSearch = (q) => {
    setDramaSearchQuery(q);
    if (!q.trim()) { setDramaSearchResults([]); return; }
    setDramaSearchLoading(true);
    fetch(apiUrl(`/api/drama/search?q=${encodeURIComponent(q)}`))
      .then(r => r.json())
      .then(data => {
        // KissKH returns { value: [...], Count: N } " extract the array
        const arr = Array.isArray(data) ? data : (Array.isArray(data?.value) ? data.value : []);
        setDramaSearchResults(arr);
        setDramaSearchLoading(false);
      })
      .catch(() => { setDramaSearchResults([]); setDramaSearchLoading(false); });
  };

  const handleMovieClick = async (movie) => {
    resetSearch();
    setSelectedMovie({ ...movie });
    setView('movie-detail');
    setSelectedMovieLoading(true);
    window.scrollTo(0, 0);

    // If it is a NetMirror catalog item, skip TMDB movie info call
    if (movie.netmirrorId) {
      setSelectedMovieLoading(false);
      return;
    }

    // DesiCinemas / MoviePlex catalog items: fetch thumbnail via post-info
    if (movie.dcSlug || movie.source === 'desicinemas' || movie.movieplexSlug || movie.source === 'movieplex' || movie.slug) {
      const slug = movie.dcSlug || movie.movieplexSlug || movie.slug;
      fetch(apiUrl(`/api/desicinemas/post-info?slug=${encodeURIComponent(slug)}`))
        .then(r => r.json())
        .then(info => {
          setSelectedMovie(prev => ({
            ...prev,
            thumbnail: info.thumbnail || prev.thumbnail,
            coverImage: info.thumbnail || prev.coverImage,
            bannerImage: info.thumbnail || prev.bannerImage,
            title: info.title || prev.title,
          }));
        })
        .catch(() => {})
        .finally(() => setSelectedMovieLoading(false));
      return;
    }

    try {
      const r = await fetch(apiUrl(`/api/movies/info/${movie.id}`));
      const data = await r.json();
      setSelectedMovie({ ...data, coverImage: data.coverImage || movie.coverImage, bannerImage: data.bannerImage || movie.bannerImage });
    } catch (e) {
      console.error('Movie info load failed', e);
    } finally {
      setSelectedMovieLoading(false);
    }
  };

  const handleMovieSearch = (q) => {
    setMovieSearchQuery(q);
    if (!q.trim()) { setMovieSearchResults([]); return; }
    setMovieSearchLoading(true);
    fetch(apiUrl(`/api/desicinemas/catalog?search=${encodeURIComponent(q)}`))
      .then(r => r.json())
      .then(data => {
        setMovieSearchResults(Array.isArray(data.movies) ? data.movies : []);
        setMovieSearchLoading(false);
      })
      .catch(() => { setMovieSearchResults([]); setMovieSearchLoading(false); });
  };

  const handleSearch = (query) => {
    setSearchQuery(query);

    if (query.trim() === '') {
      setSearchResults({ anime: [], dramas: [], movies: [], manga: [] });
      setSearchLoading(false);
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
      return;
    }

    setSearchLoading(true);

    // Debounce: wait 400ms after user stops typing before querying providers in parallel
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      const requestId = searchRequestRef.current + 1;
      searchRequestRef.current = requestId;

      const animePromise = api.searchAnime(query).catch(() => []);
      const dramaPromise = fetch(apiUrl(`/api/drama/search?q=${encodeURIComponent(query)}`))
        .then(r => r.json())
        .then(data => {
          return Array.isArray(data) ? data : (Array.isArray(data?.value) ? data.value : []);
        })
        .catch(() => []);
      const moviePromise = fetch(apiUrl(`/api/desicinemas/catalog?search=${encodeURIComponent(query)}`))
        .then(r => r.json())
        .then(data => Array.isArray(data.movies) ? data.movies : [])
        .catch(() => []);
      const mangaPromise = api.searchManga(query).catch(() => []);

      Promise.all([animePromise, dramaPromise, moviePromise, mangaPromise]).then(([animeItems, dramaItems, movieItems, mangaItems]) => {
        if (requestId === searchRequestRef.current) {
          const animeList = Array.isArray(animeItems) ? animeItems : [];
          const dramaRaw = Array.isArray(dramaItems) ? dramaItems : [];

          // Remove anime titles mistakenly returned by drama provider
          const animeKeywords = ['ginga eiyuu', 'galactic heroes', 'hero academia', 'boku no hero', 'dragon ball', 'naruto', 'one piece', 'bleach', 'jujutsu', 'demon slayer', 'chainsaw man', 'attack on titan'];
          const cleanDramas = dramaRaw.filter((d) => {
            const titleLower = (d.title || '').toLowerCase();
            return !animeKeywords.some(kw => titleLower.includes(kw)) && !animeList.some(a => (a.title || '').toLowerCase() === titleLower);
          });

          setSearchResults({
            anime: animeList,
            dramas: cleanDramas,
            movies: Array.isArray(movieItems) ? movieItems : [],
            manga: Array.isArray(mangaItems) ? mangaItems : []
          });
          setSearchLoading(false);
        }
      }).catch(() => {
        if (requestId === searchRequestRef.current) {
          setSearchResults({ anime: [], dramas: [], movies: [], manga: [] });
          setSearchLoading(false);
        }
      });
    }, 400);
  };

  const filteredTrending = activeCategory === 'All'
    ? trending
    : activeCategory === 'Hindi'
    ? (hindiData.list.length > 0 ? hindiData.list : trending.filter((anime) => anime.hasHindiDub || anime.hindiAvailable))
    : trending.filter((anime) => anime.genres?.includes(activeCategory));

  const activeFeatured = featured[carouselIndex];
  const playerSource = React.useMemo(() => {
    const selectedSource = currentEpisode?.sources?.[currentSourceIndex] || currentEpisode?.sources?.[0];
    return selectedSource ? { ...currentEpisode, ...selectedSource } : currentEpisode;
  }, [currentEpisode, currentSourceIndex]);

  const isImmersiveView = ['watch', 'drama-watch', 'movie-watch', 'manhwa-read'].includes(view);
  const mainContentClass = ['main-content', isImmersiveView ? 'immersive' : '', !isImmersiveView && sidebarMini ? 'sidebar-mini' : '', isMobile ? 'is-mobile-view' : 'is-desktop-view'].filter(Boolean).join(' ');

  return (
    <div className={`app-container ${isMobile ? 'app-mobile' : 'app-desktop'}`}>
      {(pageLoading || loadingSources) && <GlobalLoader />}
      <Navbar
        onSearch={handleSearch}
        activeView={view}
        setView={setView}
        onHome={goHome}
        activeSection={activeSection}
        user={user}
        onSignIn={() => setShowAuthModal(true)}
        onSignOut={async () => { await supabase.auth.signOut(); }}
        onToggleSidebar={() => setSidebarMini(v => !v)}
        notifications={notifications}
        onSelectNotification={handleSelectNotification}
        setSection={handleSectionChange}
      />

      <div className="yt-body">
        {!isImmersiveView && !isMobile && (
          <Sidebar
            activeView={view}
            setView={setView}
            setSection={(s) => setActiveSection(s)}
            user={user}
            onSignIn={() => setShowAuthModal(true)}
            mini={sidebarMini}
            subscriptions={subscriptions}
            activeCategory={activeCategory}
            onSelectCategory={(cat) => {
              if (cat === 'Hindi') {
                setActiveSection('anime');
                setView('hindi');
              } else {
                setActiveCategory(cat);
                setActiveSection('anime');
                setView('anime');
              }
              window.scrollTo(0, 0);
            }}
            onSelectSubscription={handleSelectSubscription}
          />
        )}

        <main className={mainContentClass}>
          {['detail', 'drama-detail', 'movie-detail', 'manhwa-detail'].includes(view) && (
            <button className="global-back-btn" onClick={() => window.history.back()} title="Go Back">
              <ArrowLeft size={16} /><span>Back</span>
            </button>
          )}

          {/* Page-level loading bar  renders at root so it appears above everything */}

          {searchQuery.trim() !== '' ? (
            <SearchResults
              query={searchQuery}
              animeResults={searchResults.anime}
              movieResults={searchResults.movies}
              dramaResults={searchResults.dramas}
              mangaResults={searchResults.manga}
              loading={searchLoading}
              onAnimeClick={handleAnimeClick}
              onMovieClick={handleMovieClick}
              onDramaClick={handleDramaClick}
              onMangaClick={handleMangaClick}
            />
          ) : (
            <>
              {view === 'home' && (
                <HomeView
                  onAnimeClick={handleAnimeClick}
                  onStartWatching={startWatching}
                  onManhwaClick={(m) => { setSelectedManhwa(m); setView('manhwa-detail'); }}
                />
              )}
              {view === 'anime' && (
                <AnimeView
                  activeFeatured={activeFeatured}
                  featured={featured}
                  activeCategory={activeCategory}
                  filteredTrending={filteredTrending}
                  top10Famous={top10Famous}
                  setActiveCategory={setActiveCategory}
                  onAnimeClick={handleAnimeClick}
                  onStartWatching={startWatching}
                  watchHistory={watchHistory}
                  onDramaClick={handleDramaClick}
                  onManhwaClick={(m) => { setSelectedManhwa(m); setView('manhwa-detail'); }}
                  hindiLoading={hindiLoading}
                  onHistoryItemClick={(item) => {
                    const t = item.type || 'anime';
                    if (t === 'movie') {
                      handleMovieClick({
                        id: item.media_id || item.id,
                        title: item.title,
                        slug: item.slug || item.movieplexSlug,
                        movieplexSlug: item.movieplexSlug || item.slug,
                        netmirrorId: item.netmirrorId,
                        source: item.source,
                        coverImage: item.cover || item.coverImage,
                        bannerImage: item.cover || item.coverImage,
                        thumbnail: item.cover || item.coverImage,
                      });
                    } else if (t === 'drama') {
                      setSelectedDrama({
                        id: item.dramaId || item.media_id || item.id,
                        title: item.title,
                        thumbnail: item.cover || item.coverImage,
                        episodes: [],
                      });
                      setView('drama-detail');
                      window.scrollTo(0, 0);
                    } else {
                      handleAnimeClick(item.anilistId || item.media_id || item.id);
                    }
                  }}
                />
              )}
              {view === 'tv-shows' && (
                <CategoryGridView title="TV Shows" viewName="tv-shows" featuredItem={tvShowsData.featured} genresData={tvShowsData.genres} onAnimeClick={handleAnimeClick} onStartWatching={startWatching} isLoading={pageLoading} />
              )}
              {view === 'new-popular' && (
                <CategoryGridView title="New & Popular" viewName="new-popular" featuredItem={newPopularData.featured} genresData={newPopularData.rows} onAnimeClick={handleAnimeClick} onStartWatching={startWatching} isLoading={pageLoading} />
              )}
              {view === 'hindi' && (
                <HindiView hindiAnime={hindiData.list} onAnimeClick={handleAnimeClick} onStartWatching={startWatching} isLoading={hindiLoading} />
              )}
              {view === 'genre' && (
                <GenreView genreName={genreViewName} items={genreAnimeList} isLoading={genreLoading} loadingMore={genreLoadingMore} hasMore={genreHasMore} onAnimeClick={handleAnimeClick} onStartWatching={startWatching} />
              )}
              {view === 'my-list' && (
                <WatchlistView items={myList} onAnimeClick={handleAnimeClick} onBackHome={goHome} />
              )}
              {view === 'detail' && selectedAnime && (
                <DetailView
                  anime={selectedAnime}
                  franchiseList={franchiseList}
                  myList={myList}
                  onToggleWatchlist={toggleWatchlist}
                  onAnimeSelect={(id) => handleAnimeClick(id, true)}
                  onBackHome={goHome}
                  onStartWatching={startWatching}
                  subscriptions={subscriptions}
                  onToggleSubscribe={handleToggleSubscribe}
                />
              )}
              {view === 'watch' && selectedAnime && currentEpisode && (
                <WatchView
                  anime={selectedAnime} episode={currentEpisode} source={playerSource} franchiseList={franchiseList}
                  currentSourceIndex={currentSourceIndex} loadingSources={loadingSources} setCurrentSourceIndex={setCurrentSourceIndex}
                  onStartWatching={(animeNode, epNum, keepFranchise = true, targetAudio = audioMode) => startWatching(animeNode, epNum, keepFranchise, targetAudio)}
                  onAnimeSelect={(id) => { setPageLoading(true); api.getAnimeDetails(id).then((d) => { if (d) startWatching(d, 1, true); }).finally(() => setPageLoading(false)); }}
                  onProgress={(prog) => handleWatchProgress(selectedAnime, currentEpisode, 'anime', prog)}
                  audioMode={audioMode} setAudioMode={setAudioMode} showToast={showToast}
                  onOpenSaveModal={(media) => { setSaveTargetItem(media); setShowSaveModal(true); }}
                  onToggleLike={handleToggleLiked}
                  isLiked={likedVideos.some(i => String(i.id || i.media_id) === String(selectedAnime.id))}
                  subscriptions={subscriptions}
                  onToggleSubscribe={handleToggleSubscribe}
                />
              )}
              {view === 'watch-history' && (
                <YTHistoryView
                  history={watchHistory}
                  onItemClick={(item) => {
                    const t = item.type || 'anime';
                    if (t === 'movie') {
                      handleMovieClick({
                        id: item.media_id || item.id,
                        title: item.title,
                        slug: item.slug || item.movieplexSlug,
                        movieplexSlug: item.movieplexSlug || item.slug,
                        netmirrorId: item.netmirrorId,
                        source: item.source,
                        coverImage: item.cover || item.coverImage,
                        bannerImage: item.cover || item.coverImage,
                        thumbnail: item.cover || item.coverImage,
                      });
                    } else if (t === 'drama') {
                      // Navigate to drama section so user can pick episode
                      setSelectedDrama({
                        id: item.dramaId || item.media_id || item.id,
                        title: item.title,
                        thumbnail: item.cover || item.coverImage,
                        episodes: [],
                      });
                      setView('drama-detail');
                      window.scrollTo(0, 0);
                    } else {
                      // anime / manhwa / manga
                      handleAnimeClick(item.anilistId || item.media_id || item.id);
                    }
                  }}
                  onRemoveItem={handleRemoveFromHistory}
                  onClearHistory={handleClearHistory}
                />
              )}
              {view === 'playlists' && (
                <YTPlaylistsView
                  watchLater={watchLater}
                  likedVideos={likedVideos}
                  customPlaylists={customPlaylists}
                  onSelectPlaylist={(pl) => { setSelectedPlaylist(pl); setView('playlist-detail'); window.scrollTo(0, 0); }}
                  onCreatePlaylistClick={() => setShowCreatePlaylistModal(true)}
                  onDeletePlaylist={handleDeletePlaylist}
                />
              )}
              {view === 'liked' && (
                <YTPlaylistDetailView
                  playlist={{ type: 'liked', title: 'Liked videos', items: likedVideos }}
                  onBack={() => setView('playlists')}
                  onStartWatching={startWatching}
                  onAnimeClick={handleAnimeClick}
                  onRemoveItemFromPlaylist={handleRemoveFromPlaylist}
                />
              )}
              {view === 'watch-later' && (
                <YTPlaylistDetailView
                  playlist={{ type: 'watch-later', title: 'Watch Later', items: watchLater }}
                  onBack={() => setView('playlists')}
                  onStartWatching={startWatching}
                  onAnimeClick={handleAnimeClick}
                  onRemoveItemFromPlaylist={handleRemoveFromPlaylist}
                />
              )}
              {view === 'playlist-detail' && selectedPlaylist && (
                <YTPlaylistDetailView
                  playlist={selectedPlaylist}
                  onBack={() => setView('playlists')}
                  onStartWatching={startWatching}
                  onAnimeClick={handleAnimeClick}
                  onRemoveItemFromPlaylist={handleRemoveFromPlaylist}
                />
              )}
              {view === 'dramas' && (
                <DramaHomeView data={dramaHomeData} error={dramaHomeError} isLoading={dramaHomeLoading} searchQuery={dramaSearchQuery} searchResults={dramaSearchResults} searchLoading={dramaSearchLoading} onSearch={handleDramaSearch} onDramaClick={handleDramaClick} />
              )}
              {view === 'drama-detail' && selectedDrama && (
                <DramaDetailView drama={selectedDrama} onBack={goDramas} onWatchEpisode={startWatchingDrama} />
              )}
              {view === 'drama-watch' && selectedDrama && dramaEpisode && (
                <DramaWatchView drama={selectedDrama} episode={dramaEpisode} stream={dramaStream} loading={dramaStreamLoading} onBack={() => { setView('drama-detail'); window.scrollTo(0,0); }} onEpisodeSelect={(ep) => startWatchingDrama(selectedDrama, ep)} onProgress={(prog) => handleWatchProgress(selectedDrama, dramaEpisode, 'drama', prog)} />
              )}
              {(view === 'manhwa' || view === 'manga' || view === 'comic-category') && (
                <WebtoonComicView
                  onComicClick={(comic) => {
                    setSelectedManga(comic);
                    setSelectedManhwa(comic);
                    setView('webtoon-detail');
                    window.scrollTo(0, 0);
                  }}
                />
              )}
              {(view === 'webtoon-detail' || view === 'manhwa-detail' || view === 'manga-detail') && (selectedManga || selectedManhwa) && (
                <WebtoonDetailView
                  manga={selectedManga || selectedManhwa}
                  onBack={() => setView('manga')}
                  onChapterSelect={(ch) => handleMangaRead(selectedManga || selectedManhwa, ch)}
                />
              )}
              {view === 'manhwa-read' && selectedManhwa && currentManhwaChapter && (
                <ManhwaReadView series={selectedManhwa} chapter={currentManhwaChapter} images={manhwaChapterImages} isLoading={manhwaChapterLoading} onBack={() => { setView('webtoon-detail'); window.scrollTo(0, 0); }} onChapterSelect={(ch) => handleManhwaRead(selectedManhwa, ch)} />
              )}
              {view === 'manga-reader' && selectedManga && currentMangaChapter && (
                <MangaReaderView manga={selectedManga} chapter={currentMangaChapter} pages={mangaPages} isLoading={mangaPageLoading} onBack={() => { setView('webtoon-detail'); window.scrollTo(0, 0); }} onChapterSelect={(ch) => handleMangaRead(selectedManga, ch)} />
              )}
              {view === 'movies' && activeSection === 'movies' && (
                <MovieHomeView data={moviesHomeData} error={moviesHomeError} isLoading={moviesHomeLoading} activeCategory={movieActiveCategory} setActiveCategory={setMovieActiveCategory} searchQuery={movieSearchQuery} searchResults={movieSearchResults} searchLoading={movieSearchLoading} onSearch={handleMovieSearch} onMovieClick={handleMovieClick} user={user} />
              )}
              {view === 'movie-detail' && selectedMovie && (
                <MovieDetailView movie={selectedMovie} isLoading={selectedMovieLoading} onBack={goMovies} onWatch={() => { setView('movie-watch'); window.scrollTo(0, 0); }} />
              )}
              {view === 'movie-watch' && selectedMovie && (
                <MovieWatchView movie={selectedMovie} onBack={() => { setView('movie-detail'); window.scrollTo(0, 0); }} onProgress={(prog) => handleWatchProgress(
                  {
                    ...selectedMovie,
                    slug: selectedMovie.movieplexSlug || selectedMovie.slug,
                    movieplexSlug: selectedMovie.movieplexSlug || selectedMovie.slug,
                  },
                  { id: 'full', number: 1 }, 'movie', prog)} />
              )}
            </>
          )}
        </main>
      </div>

      {!isImmersiveView && (
        <MobileBottomNav activeView={view} setView={setView} setSection={handleSectionChange} user={user} onSignIn={() => setShowAuthModal(true)} />
      )}

      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}

      <SaveToPlaylistModal
        isOpen={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        targetMedia={saveTargetItem}
        customPlaylists={customPlaylists}
        watchLater={watchLater}
        likedVideos={likedVideos}
        onToggleWatchLater={handleToggleWatchLater}
        onToggleLiked={handleToggleLiked}
        onToggleCustomPlaylist={handleToggleCustomPlaylist}
        onCreateNewPlaylistClick={() => { setShowSaveModal(false); setShowCreatePlaylistModal(true); }}
      />

      <CreatePlaylistModal
        isOpen={showCreatePlaylistModal}
        onClose={() => setShowCreatePlaylistModal(false)}
        onCreate={handleCreateNewPlaylist}
      />


      <div className={`welcome-banner ${showWelcome ? 'visible' : ''}`}>
        <div className="welcome-banner-content">
          <span> First time here? Sign in to save your watchlist and sync your watch history!</span>
          <button className="welcome-banner-btn" onClick={() => { setShowWelcome(false); setShowAuthModal(true); }}>Sign In</button>
        </div>
        <button className="welcome-banner-close" onClick={() => setShowWelcome(false)} aria-label="Close welcome message">
          <X size={18} />
        </button>
      </div>

      <div className={`toast-notification toast-notification--${toast.type} ${toast.visible ? 'visible' : ''}`}>
        <div className="toast-notification-content">{toast.message}</div>
      </div>
    </div>
  );
}

//  YouTube Search Result Item Component 
function YTSearchResultItem({ item, type, onClick }) {
  const thumb = item.bannerImage || item.coverImage || item.thumbnail || item.cover || '';
  const title = item.title || 'Untitled';
  const displayTitle = type === 'manga'
    ? `${title} | Chapter 1`
    : type === 'movie'
    ? title
    : `${title} | Season 1 | Episode 1`;

  const viewsText = formatViews(item.popularity || item.viewsCount || 500000);
  const timeAgoText = formatRelativeTime(item.startDate || item.date, 1);
  const durationText = type === 'manga' ? 'Ch. 1' : type === 'movie' ? 'Movie' : '23:45';
  const genres = item.genres?.slice(0, 2).join(' • ') || (type === 'manga' ? 'Manga / Comic' : type === 'drama' ? 'Drama' : type === 'movie' ? 'Movie' : 'Anime');
  const desc = item.description || 'Watch high quality episodes, detailed synopses, and recommendations on EetNet.';

  const initial = title.charAt(0).toUpperCase();
  const colorMap = { A:'#FF0000',B:'#3ea6ff',C:'#7B68EE',D:'#FF69B4',F:'#00C853',J:'#FF6D00',K:'#1DE9B6',M:'#AA00FF',N:'#FFD600',O:'#FF5252',S:'#00BCD4',T:'#8D6E63' };
  const avatarColor = colorMap[initial] || '#606060';

  return (
    <div className="yt-search-item" onClick={onClick} role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && onClick()}>
      <div className="yt-search-thumb-wrap">
        {thumb ? (
          <img src={thumb} alt={displayTitle} loading="lazy" onError={e => { e.target.style.display='none'; }} />
        ) : (
          <div style={{ width:'100%',height:'100%',background:'#272727',display:'flex',alignItems:'center',justifyContent:'center',color:'#717171',fontSize:'14px' }}>No Image</div>
        )}
        <span className="yt-search-duration">{durationText}</span>
      </div>
      <div className="yt-search-info">
        <div className="yt-search-title">{displayTitle}</div>
        <div className="yt-search-stats">{viewsText} · {timeAgoText}</div>
        <div className="yt-search-channel-row">
          <div className="yt-search-avatar" style={{ background: avatarColor }}>{initial}</div>
          <span className="yt-search-channel-name">{genres}</span>
        </div>
        <div className="yt-search-desc">{desc}</div>
        <div className="yt-search-badges">
          <span className="yt-search-badge">4K</span>
          <span className="yt-search-badge">SUB</span>
          <span className="yt-search-badge">DUB</span>
        </div>
      </div>
    </div>
  );
}

function SearchResults({ query, animeResults = [], movieResults = [], dramaResults = [], mangaResults = [], loading, onAnimeClick, onMovieClick, onDramaClick, onMangaClick }) {
  const [activeChip, setActiveChip] = useState('all');

  const allList = [
    ...animeResults.map(item => ({ ...item, _searchType: 'anime' })),
    ...movieResults.map(item => ({ ...item, _searchType: 'movie' })),
    ...dramaResults.map(item => ({ ...item, _searchType: 'drama' })),
    ...mangaResults.map(item => ({ ...item, _searchType: 'manga' })),
  ];

  const filteredList = activeChip === 'all'
    ? allList
    : allList.filter(item => item._searchType === activeChip);

  const hasResults = filteredList.length > 0;

  return (
    <div className="yt-search-page">
      <div className="yt-search-header-bar">
        <div className="yt-search-chip-group">
          <button className={`yt-search-chip ${activeChip === 'all' ? 'active' : ''}`} onClick={() => setActiveChip('all')}>
            All ({allList.length})
          </button>
          {animeResults.length > 0 && (
            <button className={`yt-search-chip ${activeChip === 'anime' ? 'active' : ''}`} onClick={() => setActiveChip('anime')}>
              Anime ({animeResults.length})
            </button>
          )}
          {movieResults.length > 0 && (
            <button className={`yt-search-chip ${activeChip === 'movie' ? 'active' : ''}`} onClick={() => setActiveChip('movie')}>
              Movies ({movieResults.length})
            </button>
          )}
          {dramaResults.length > 0 && (
            <button className={`yt-search-chip ${activeChip === 'drama' ? 'active' : ''}`} onClick={() => setActiveChip('drama')}>
              Dramas ({dramaResults.length})
            </button>
          )}
          {mangaResults.length > 0 && (
            <button className={`yt-search-chip ${activeChip === 'manga' ? 'active' : ''}`} onClick={() => setActiveChip('manga')}>
              Comics / Manga ({mangaResults.length})
            </button>
          )}
        </div>
        <button className="yt-search-filter-btn">
          <Sparkles size={16} /> Filters
        </button>
      </div>

      {loading ? (
        <div className="yt-search-list">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="yt-search-skeleton-item">
              <div className="yt-search-skeleton-thumb" />
              <div className="yt-search-skeleton-info">
                <div className="yt-skeleton-line" style={{ width: '80%', height: '20px' }} />
                <div className="yt-skeleton-line" style={{ width: '40%', height: '14px' }} />
                <div className="yt-skeleton-line" style={{ width: '30%', height: '14px' }} />
                <div className="yt-skeleton-line" style={{ width: '90%', height: '14px' }} />
              </div>
            </div>
          ))}
        </div>
      ) : hasResults ? (
        <div className="yt-search-list">
          {filteredList.map((item, idx) => (
            <YTSearchResultItem
              key={`${item._searchType}-${item.id || item.slug || item.movieplexSlug || idx}`}
              item={item}
              type={item._searchType}
              onClick={() => {
                if (item._searchType === 'anime') onAnimeClick(item.id);
                else if (item._searchType === 'movie') onMovieClick(item);
                else if (item._searchType === 'drama') onDramaClick(item);
                else if (item._searchType === 'manga') onMangaClick(item);
              }}
            />
          ))}
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '4rem 0', color: '#aaa' }}>
          <AlertCircle size={48} style={{ marginBottom: '1rem', color: '#717171' }} />
          <h3>No search results for "{query}"</h3>
          <p style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>
            Try checking your spelling or trying different keywords.
          </p>
        </div>
      )}
    </div>
  );
}

function GlobalLoader() {
  return (
    <div className="yt-top-bar" role="progressbar" aria-label="Loading...">
      <div className="yt-top-bar-fill" />
    </div>
  );
}

export function InlineLoader({ label }) {
  return (
    <div className="inline-loader" role="status" aria-live="polite">
      <div className="blob-loader" />
      <p className="blob-loader-text">
        Loading<span className="blob-dots"><span>.</span><span>.</span><span>.</span></span>
      </p>
    </div>
  );
}

/* ''' Skeleton Components ''''''''''''''''''''''''''''''''''''''''''' */
function SkeletonHero() {
  return (
    <div className="skeleton-hero">
      <div className="skeleton-hero-bg skeleton-shimmer" />
      <div className="skeleton-hero-content">
        <div className="skeleton-badge skeleton-shimmer" />
        <div className="skeleton-title skeleton-shimmer" />
        <div className="skeleton-title skeleton-shimmer" style={{ width: '55%' }} />
        <div className="skeleton-meta">
          <div className="skeleton-pill skeleton-shimmer" />
          <div className="skeleton-pill skeleton-shimmer" />
          <div className="skeleton-pill skeleton-shimmer" />
        </div>
        <div className="skeleton-desc skeleton-shimmer" />
        <div className="skeleton-desc skeleton-shimmer" style={{ width: '70%' }} />
        <div className="skeleton-btns">
          <div className="skeleton-btn skeleton-shimmer" />
          <div className="skeleton-btn skeleton-shimmer" style={{ width: '140px' }} />
        </div>
      </div>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="skeleton-row">
      <div className="skeleton-row-title skeleton-shimmer" />
      <div className="skeleton-cards">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton-card skeleton-shimmer" />
        ))}
      </div>
    </div>
  );
}

export function CategorySkeleton() {
  return (
    <div className="skeleton-page">
      <SkeletonHero />
      <div className="netflix-rows" style={{ marginTop: '0' }}>
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </div>
    </div>
  );
}

function Top10Row({ title, items, onAnimeClick }) {
  if (!items || items.length === 0) return null;

  return (
    <section className="hv-section top10-row-section">
      <div className="hv-section-header">
        <h2 className="hv-section-title">
          <Trophy className="hv-icon" size={20} style={{ color: 'var(--accent-primary)' }} /> {title}
        </h2>
        <span className="hv-section-line" />
      </div>
      <div className="top10-slider">
        {items.slice(0, 10).map((anime, index) => (
          <Top10Tile
            key={`top10-${anime.id}`}
            anime={anime}
            rank={index + 1}
            onClick={() => onAnimeClick(anime.id)}
          />
        ))}
      </div>
    </section>
  );
}

function Top10Tile({ anime, rank, onClick }) {
  return (
    <button className="top10-tile" onClick={onClick}>
      <div className="top10-rank-container">
        <span className="top10-rank-number">{rank}</span>
      </div>
      <div className="top10-card">
        <div className="top10-card-img-wrapper">
          <img src={anime.coverImage} alt={anime.title} loading="lazy" />
          <div className="top10-card-glow" />
        </div>
        <div className="top10-card-overlay">
          <span className="top10-card-rating"> {anime.rating}</span>
          <span className="top10-card-title">{anime.title}</span>
          <span className="top10-card-type">{anime.type}</span>
        </div>
      </div>
    </button>
  );
}

const HOME_FEATURED_ITEMS = [
  {
    id: 154587,
    title: "Frieren: Beyond Journey's End",
    badge: "Trending Anime",
    description: "After the party of heroes defeated the Demon King, elf mage Frieren sets out on a journey to understand humanity.",
    bannerImage: "/home-carousel/81wyRXGKnpL.jpg",
    coverImage: "/home-carousel/81wyRXGKnpL.jpg",
    type: "ANIME",
    rating: "9.3",
    hasHindiDub: true,
    actionType: "anime"
  }
];

export function YTCard({ item, onClick, badge }) {
  const thumb = item.episodeThumbnail || item.bannerImage || item.coverImage || item.thumbnail || item.cover || '';
  const animeTitle = item.title || 'Untitled';
  const seasonNum = item.season || 1;
  const epNum = item.episode || 1;
  const displayTitle = `${animeTitle} | Season ${seasonNum} | Episode ${epNum}`;

  const channelText = item.genres?.slice(0, 2).join(' • ') || item.type || 'Anime';
  const viewsText = formatViews(item.popularity || item.viewsCount);
  const timeAgoText = formatRelativeTime(item.startDate, epNum);
  const durationText = item.formattedDuration || (item.rawDuration ? `${item.rawDuration}:00` : (item.duration && !isNaN(parseInt(item.duration)) ? `${parseInt(item.duration)}:00` : '23:45'));

  const initial = animeTitle.charAt(0).toUpperCase();
  const colorMap = { A:'#FF0000',B:'#3ea6ff',C:'#7B68EE',D:'#FF69B4',F:'#00C853',J:'#FF6D00',K:'#1DE9B6',M:'#AA00FF',N:'#FFD600',O:'#FF5252',S:'#00BCD4',T:'#8D6E63' };
  const avatarColor = colorMap[initial] || '#606060';

  return (
    <div className="yt-card" onClick={onClick} role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && onClick()}>
      <div className="yt-card-thumb-wrap">
        {thumb ? (
          <img src={thumb} alt={displayTitle} loading="lazy" onError={e => { e.target.style.display='none'; }} />
        ) : (
          <div style={{ width:'100%',height:'100%',background:'#272727',display:'flex',alignItems:'center',justifyContent:'center',color:'#717171',fontSize:'14px' }}>No Image</div>
        )}
        {badge && <span className="yt-card-badge">{badge}</span>}
        <span className="yt-card-duration">{durationText}</span>
      </div>
      <div className="yt-card-meta">
        <div className="yt-card-avatar" style={{ background: avatarColor }}>
          <span style={{ color:'white',fontSize:'14px',fontWeight:'700',display:'flex',alignItems:'center',justifyContent:'center',height:'100%' }}>{initial}</span>
        </div>
        <div className="yt-card-info">
          <div className="yt-card-title">{displayTitle}</div>
          <div className="yt-card-channel">{channelText}</div>
          <div className="yt-card-stats">{viewsText} • {timeAgoText}</div>
        </div>
      </div>
    </div>
  );
}

//  Chip Bar Component 
export function ChipBar({ chips, active, onSelect }) {
  return (
    <div className="yt-chip-bar">
      {chips.map(chip => (
        <button
          key={chip.id}
          className={`yt-chip ${active === chip.id ? 'active' : ''}`}
          onClick={() => onSelect(chip.id)}
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}

//  HomeView (YouTube-style infinite scroll grid) 
function HomeView({ onAnimeClick, onStartWatching, onManhwaClick }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [chipActive, setChipActive] = useState('all');
  const observerRef = useRef(null);
  const sentinelRef = useRef(null);

  const HOME_CHIPS = [
    { id: 'all', label: 'All' },
    { id: 'anime', label: 'Anime' },
    { id: 'action', label: 'Action' },
    { id: 'adventure', label: 'Adventure' },
    { id: 'romance', label: 'Romance' },
    { id: 'comedy', label: 'Comedy' },
    { id: 'drama', label: 'Drama' },
    { id: 'fantasy', label: 'Fantasy' },
    { id: 'thriller', label: 'Thriller' },
    { id: 'popular', label: 'Popular' },
    { id: 'new', label: 'New' },
  ];

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setItems([]);

    (async () => {
      let results;
      try {
        results = await Promise.allSettled([
          api.getAnimeList(),
          api.getTop10Famous(),
          api.getNewAndPopular(),
        ]);
      } catch (e) {
        if (!cancelled) setLoading(false);
        return;
      }
      if (cancelled) return;

      const allItems = [];
      const seen = new Set();
      results.forEach(r => {
        if (r.status === 'fulfilled' && Array.isArray(r.value)) {
          r.value.forEach(item => {
            if (item.id && !seen.has(String(item.id))) {
              seen.add(String(item.id));
              const epNum = Math.random() < 0.8 ? 1 : Math.floor(Math.random() * 3) + 2;
              allItems.push({ ...item, _contentType: 'anime', season: 1, episode: epNum });
            }
          });
        }
      });

      // Shuffle for variety
      for (let i = allItems.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allItems[i], allItems[j]] = [allItems[j], allItems[i]];
      }

      // Render immediately with fallback banners
      if (!cancelled) {
        setItems(allItems);
        setLoading(false);
      }

      // Background: resolve unique per-episode thumbnails in batches
      const BATCH_SIZE = 6;
      for (let start = 0; start < allItems.length; start += BATCH_SIZE) {
        if (cancelled) break;
        const batch = allItems.slice(start, start + BATCH_SIZE);
        const thumbResults = await Promise.allSettled(
          batch.map(item => resolveEpisodeThumbnail(item, item.episode, item.season || 1))
        );
        if (cancelled) break;
        setItems(prev => {
          const updated = [...prev];
          batch.forEach((item, idx) => {
            const thumb = thumbResults[idx].status === 'fulfilled' ? thumbResults[idx].value : null;
            const pos = updated.findIndex(u => u.id === item.id);
            if (pos !== -1 && thumb && thumb !== updated[pos].bannerImage) {
              updated[pos] = { ...updated[pos], episodeThumbnail: thumb };
            }
          });
          return updated;
        });
        await new Promise(r => setTimeout(r, 300));
      }
    })();

    return () => { cancelled = true; };
  }, [chipActive]);

  const filtered = chipActive === 'all'
    ? items
    : items.filter(item => {
        if (chipActive === 'popular' || chipActive === 'new') return true;
        return item.genres?.some(g => g.toLowerCase() === chipActive.toLowerCase());
      });

  return (
    <div className="yt-home-view">
      <ChipBar chips={HOME_CHIPS} active={chipActive} onSelect={setChipActive} />

      {loading ? (
        <div className="yt-content-grid">
          {Array.from({ length: 16 }).map((_, i) => (
            <div key={i} className="yt-card-skeleton">
              <div className="yt-skeleton-thumb" />
              <div className="yt-card-meta" style={{ padding: '4px 0' }}>
                <div className="yt-skeleton-avatar" />
                <div style={{ flex: 1 }}>
                  <div className="yt-skeleton-line" style={{ width: '90%' }} />
                  <div className="yt-skeleton-line" style={{ width: '60%', marginTop: '6px' }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="yt-content-grid">
          {filtered.map(item => (
            <YTCard
              key={item.id}
              item={item}
              onClick={() => onStartWatching(item, item.episode || 1)}
            />
          ))}
          {filtered.length === 0 && (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>
              No content found for this filter.
            </div>
          )}
        </div>
      )}
      <div ref={sentinelRef} style={{ height: '1px' }} />
    </div>
  );
}

// AnimeView is imported from ./features/anime/components/AnimeView



function NetflixRow({ title, icon, items, onAnimeClick, progress = false, ranked = false }) {
  const sliderRef = useRef(null);
  const [hoverZone, setHoverZone] = useState(null); // 'left' | 'right' | null
  const [dwellProgress, setDwellProgress] = useState(0); // 0 to 100
  const [isSliding, setIsSliding] = useState(false);

  const dwellTimerRef = useRef(null);
  const animFrameRef = useRef(null);
  const hoverStartTimeRef = useRef(null);
  const lastMousePosRef = useRef({ x: 0, y: 0 });

  const stopAutoScroll = () => {
    if (dwellTimerRef.current) clearInterval(dwellTimerRef.current);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    dwellTimerRef.current = null;
    animFrameRef.current = null;
    hoverStartTimeRef.current = null;
    setDwellProgress(0);
    setHoverZone(null);
    setIsSliding(false);
  };

  const startContinuousSlide = (direction) => {
    setIsSliding(true);
    const slideStep = () => {
      const slider = sliderRef.current;
      if (!slider) return;

      const speed = direction === 'right' ? 7 : -7;
      slider.scrollLeft += speed;

      // Check boundary conditions
      if (direction === 'right' && slider.scrollLeft >= slider.scrollWidth - slider.clientWidth - 2) {
        stopAutoScroll();
        return;
      }
      if (direction === 'left' && slider.scrollLeft <= 2) {
        stopAutoScroll();
        return;
      }

      animFrameRef.current = requestAnimationFrame(slideStep);
    };

    animFrameRef.current = requestAnimationFrame(slideStep);
  };

  const handleMouseMove = (e) => {
    const slider = sliderRef.current;
    if (!slider) return;

    const rect = slider.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const dist = Math.hypot(x - lastMousePosRef.current.x, y - lastMousePosRef.current.y);
    lastMousePosRef.current = { x, y };

    const width = rect.width;
    const zoneWidth = Math.max(100, width * 0.15); // End 15% edge zone

    let newZone = null;
    if (x >= width - zoneWidth && slider.scrollLeft < slider.scrollWidth - slider.clientWidth - 5) {
      newZone = 'right';
    } else if (x <= zoneWidth && slider.scrollLeft > 5) {
      newZone = 'left';
    }

    if (newZone !== hoverZone) {
      stopAutoScroll();
      if (newZone) {
        setHoverZone(newZone);
        hoverStartTimeRef.current = Date.now();

        dwellTimerRef.current = setInterval(() => {
          if (!hoverStartTimeRef.current) return;
          const elapsed = Date.now() - hoverStartTimeRef.current;
          const pct = Math.min(100, (elapsed / 3000) * 100);
          setDwellProgress(pct);

          if (elapsed >= 3000) {
            clearInterval(dwellTimerRef.current);
            dwellTimerRef.current = null;
            startContinuousSlide(newZone);
          }
        }, 30);
      }
    } else if (hoverZone && dist > 150) {
      stopAutoScroll();
    }
  };

  const handleMouseLeave = () => {
    stopAutoScroll();
  };

  const handleWheel = (e) => {
    const slider = sliderRef.current;
    if (!slider) return;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      slider.scrollLeft += e.deltaY;
    }
  };

  const manualScroll = (direction) => {
    stopAutoScroll();
    const slider = sliderRef.current;
    if (!slider) return;
    const scrollAmount = slider.clientWidth * 0.75;
    slider.scrollBy({
      left: direction === 'right' ? scrollAmount : -scrollAmount,
      behavior: 'smooth'
    });
  };

  useEffect(() => {
    return () => stopAutoScroll();
  }, []);

  if (!items || items.length === 0) return null;

  return (
    <section className="hv-section netflix-row">
      <div className="hv-section-header">
        <h2 className="hv-section-title">
          {icon && <span className="hv-title-accent">{icon}</span>} {title}
        </h2>
        <span className="hv-section-line" />

        {hoverZone && (
          <div className="auto-slide-banner">
            <span>{isSliding ? 'Auto-sliding...' : `Hold cursor at edge to slide (${Math.max(1, Math.ceil((3000 - (dwellProgress / 100) * 3000) / 1000))}s)`}</span>
            <div className="auto-slide-progress-bar">
              <div className="auto-slide-progress-fill" style={{ width: `${dwellProgress}%` }} />
            </div>
          </div>
        )}
      </div>

      <div
        className="row-container-wrapper"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onWheel={handleWheel}
      >
        <button
          className="row-scroll-btn row-scroll-btn--left"
          onClick={() => manualScroll('left')}
          title="Scroll Left"
        >
          <ChevronLeft size={22} />
        </button>

        <div ref={sliderRef} className={`netflix-slider ${ranked ? 'ranked-row' : ''}`}>
          {items.map((anime, index) => (
            <NetflixTile
              key={`${title}-${anime.id}`}
              anime={anime}
              rank={ranked ? index + 1 : null}
              progress={progress
                ? (anime.progressPercent !== undefined ? anime.progressPercent : ((index + 2) * 13) % 88)
                : null
              }
              onClick={() => onAnimeClick(anime)}
            />
          ))}
        </div>

        <button
          className="row-scroll-btn row-scroll-btn--right"
          onClick={() => manualScroll('right')}
          title="Scroll Right"
        >
          <ChevronRight size={22} />
        </button>
      </div>
    </section>
  );
}

function NetflixTile({ anime, rank, progress, onClick }) {
  return (
    <button className={`netflix-tile ${rank ? 'ranked-tile' : ''}`} onClick={onClick}>
      {rank && <span className="tile-rank">{rank}</span>}
      <span className="tile-art">
        <img src={anime.bannerImage || anime.coverImage} alt={anime.title} loading="lazy" />
        <span className="tile-logo-mark">N</span>
        <span className="tile-hover-overlay">
          <span className="tile-hover-play"><Play size={20} fill="white" style={{ color: 'white' }} /></span>
        </span>
        {progress !== null && (
          <span className="watch-progress">
            <span style={{ width: `${progress}%` }} />
          </span>
        )}
        {anime.rating && anime.rating !== 'N/A' && (
          <span className="tile-rating-badge"> {anime.rating}</span>
        )}
      </span>
      <span className="tile-info">
        <strong>{anime.title}</strong>
        <small>{anime.subtitle || `${anime.type} Â· ${anime.rating}`}</small>
      </span>
    </button>
  );
}

function GenreView({ genreName, items = [], isLoading, loadingMore = false, hasMore = true, onAnimeClick, onStartWatching }) {
  if (isLoading) {
    return <CategorySkeleton />;
  }

  const featured = items[0] || null;

  return (
    <div className="genre-view-container" style={{ paddingTop: '5.5rem', paddingBottom: '5rem' }}>
      {/*  Glassmorphic Genre Hero Card  */}
      <div className="container">
        <div
          className="genre-hero-glass-card"
          style={{
            position: 'relative',
            borderRadius: '20px',
            overflow: 'hidden',
            marginBottom: '2.5rem',
            background: 'rgba(18, 18, 28, 0.65)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
            minHeight: '300px',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          {/* Background Image & Blur */}
          {featured && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                backgroundImage: `url(${featured.bannerImage || featured.coverImage})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                opacity: 0.35,
                filter: 'blur(4px)',
                transform: 'scale(1.05)',
              }}
            />
          )}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(90deg, #09090d 0%, rgba(9,9,13,0.85) 50%, rgba(9,9,13,0.4) 100%)',
            }}
          />

          {/* Content */}
          <div style={{ position: 'relative', zIndex: 2, padding: '3rem 2.5rem', maxWidth: '680px' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.35rem 0.9rem',
                borderRadius: '20px',
                background: 'rgba(229, 9, 20, 0.15)',
                border: '1px solid rgba(229, 9, 20, 0.4)',
                color: '#ff4d4d',
                fontSize: '0.72rem',
                fontWeight: 800,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                marginBottom: '1rem',
              }}
            >
              <Sparkles size={14} /> {genreName} COLLECTION
            </div>

            <h1
              style={{
                fontSize: '3rem',
                fontWeight: 900,
                color: '#fff',
                letterSpacing: '-0.02em',
                lineHeight: 1.1,
                marginBottom: '0.8rem',
              }}
            >
              {genreName} Anime
            </h1>

            <p style={{ color: '#9ca3af', fontSize: '0.95rem', lineHeight: 1.5, marginBottom: '1.5rem' }}>
              Explore the complete {genreName.toLowerCase()} anime universe. Stream top-rated series, movies, and trending releases in high quality.
            </p>

            {featured && (
              <div style={{ display: 'flex', gap: '0.85rem' }}>
                <button
                  className="btn btn-primary"
                  onClick={() => onStartWatching(featured, 1)}
                  style={{
                    borderRadius: '24px',
                    padding: '0.7rem 1.8rem',
                    fontWeight: 700,
                    boxShadow: '0 4px 18px rgba(229, 9, 20, 0.4)',
                  }}
                >
                  <Play size={18} fill="currentColor" /> Watch Spotlight
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => onAnimeClick(featured.id)}
                  style={{
                    borderRadius: '24px',
                    padding: '0.7rem 1.6rem',
                    background: 'rgba(255,255,255,0.08)',
                    borderColor: 'rgba(255,255,255,0.15)',
                  }}
                >
                  View Details
                </button>
              </div>
            )}
          </div>
        </div>

        {/*  Section Title  */}
        <div className="hv-section-header" style={{ marginBottom: '1.8rem' }}>
          <h2 className="hv-section-title" style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fff' }}>
            <Sparkles className="hv-icon" size={20} style={{ color: '#e50914' }} />
            All {genreName} Anime ({items.length})
          </h2>
          <span className="hv-section-line" />
        </div>

        {/*  16:9 Bento Cards Grid  */}
        <div
          className="bento-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: '1.3rem',
          }}
        >
          {items.map((item) => (
            <AnimeCard
              key={item.id}
              anime={item}
              onClick={() => onAnimeClick(item.id)}
              variant="bento"
            />
          ))}
        </div>

        {/*  Infinite Scroll Skeleton Loader  */}
        {loadingMore && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: '1.3rem',
              marginTop: '1.3rem',
            }}
          >
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={`more-skel-${i}`}
                className="skeleton-bento-card"
                style={{ height: '200px', borderRadius: '14px' }}
              />
            ))}
          </div>
        )}

        {/* 200 items limit reached notice */}
        {!hasMore && items.length >= 200 && (
          <div style={{ textAlign: 'center', padding: '3.5rem 0', color: '#6b7280', fontSize: '0.85rem' }}>
            Showing top 200 {genreName} anime. Explore other categories from the left slider menu!
          </div>
        )}
      </div>
    </div>
  );
}

function DetailView({ anime, franchiseList = [], myList = [], onToggleWatchlist, onAnimeSelect, onBackHome, onStartWatching, subscriptions = [], onToggleSubscribe }) {
  const EPISODES_PER_PART = 100;
  const totalPages = anime.episodePagination?.lastPage || 1;
  const totalEpisodes = anime.totalEpisodes || anime.episodes?.length || 0;

  const isSubscribed = subscriptions.some(s => String(s.id || s.media_id) === String(anime.id));

  const getPartLabel = (pageNum) => {
    const start = (pageNum - 1) * EPISODES_PER_PART + 1;
    const end = Math.min(pageNum * EPISODES_PER_PART, totalEpisodes);
    if (totalPages <= 1) return 'Season 1';
    return `Part ${pageNum} (Ep ${start}\u2013${end})`;
  };

  const [selectedPart, setSelectedPart] = React.useState(1);
  const [pageEpisodes, setPageEpisodes] = React.useState(anime.episodes || []);
  const [loadingPage, setLoadingPage] = React.useState(false);
  const [filter, setFilter] = React.useState('all');
  const [showSeasonDropdown, setShowSeasonDropdown] = React.useState(false);
  const dropdownRef = React.useRef(null);

  // Close season dropdown when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowSeasonDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  React.useEffect(() => {
    // Reset selection to part 1 when selected anime changes
    setSelectedPart(1);
  }, [anime.id]);

  React.useEffect(() => {
    if (selectedPart === 1) {
      setPageEpisodes(anime.episodes || []);
      return;
    }
    if (!anime.malId) return;
    setLoadingPage(true);
    api.getEpisodePage(anime.malId, selectedPart).then((data) => {
      if (data && data.episodes) {
        setPageEpisodes(data.episodes.map(ep => ({
          id: null,
          number: ep.number,
          title: ep.title,
          aired: ep.aired,
          score: ep.score,
          filler: ep.filler,
          recap: ep.recap,
          thumbnail: anime.bannerImage || anime.coverImage,
          sources: []
        })));
      }
    }).finally(() => setLoadingPage(false));
  }, [selectedPart, anime.malId, anime.episodes]);

  const filteredEpisodes = pageEpisodes.filter(ep => {
    if (filter === 'canon') return !ep.filler && !ep.recap;
    if (filter === 'filler') return ep.filler;
    if (filter === 'recap') return ep.recap;
    return true;
  });

  const isLongRunning = totalPages > 1;
  const hasFranchise = franchiseList.length > 1;

  // Build season/franchise selector options (mirrors WatchView logic)
  const seasonOptions = [];
  if (franchiseList && franchiseList.length > 0) {
    franchiseList.forEach(item => {
      const isActive = item.id === anime.id;
      if (isActive && isLongRunning) {
        for (let p = 1; p <= totalPages; p++) {
          const start = (p - 1) * EPISODES_PER_PART + 1;
          const end = Math.min(p * EPISODES_PER_PART, totalEpisodes || (p * EPISODES_PER_PART));
          seasonOptions.push({
            id: item.id,
            title: `${item.title} - Part ${p} (Ep ${start}â€“${end})`,
            part: p,
            isActive: isActive && selectedPart === p
          });
        }
      } else {
        seasonOptions.push({
          id: item.id,
          title: `${item.title} (${item.format || ''})`.trim(),
          part: 1,
          isActive
        });
      }
    });
  }
  if (seasonOptions.length === 0) {
    seasonOptions.push({ id: anime.id, title: 'Season 1', part: 1, isActive: true });
  }
  const activeOption = seasonOptions.find(opt => opt.isActive) || seasonOptions[0];
  const activeLabel = activeOption ? activeOption.title : 'Select Season';

  return (
    <div>
      <div
        className="detail-banner"
        style={{ backgroundImage: `url(${anime.bannerImage || anime.coverImage})` }}
      >
        <div className="detail-banner-overlay"></div>
      </div>

      <div className="container">
        <div className="detail-content">
          <div className="detail-left">
            <div className="detail-poster">
              <img src={anime.coverImage} alt={anime.title} />
            </div>
          </div>
          <div className="detail-right">
            <h1 className="detail-title">{anime.title}</h1>
            <div className="detail-sub">{anime.japaneseTitle}</div>

            <div className="detail-tags">
              <div className="detail-tag" style={{ borderColor: 'var(--accent-primary)', color: 'var(--accent-primary)' }}>
                {'\u2605'} {anime.rating}
              </div>
              <div className="detail-tag">{anime.type}</div>
              <div className="detail-tag">{anime.status}</div>
              {anime.totalEpisodes && (
                <div className="detail-tag">{anime.totalEpisodes} Episodes</div>
              )}
              {anime.genres?.map((genre) => (
                <div key={genre} className="detail-tag">{genre}</div>
              ))}
            </div>

            <p className="detail-synopsis">{anime.description}</p>

            <div className="btn-group">
              <button className="btn btn-primary" onClick={() => onStartWatching(anime, 1)}>
                <Play size={18} fill="currentColor" /> Play Episode 1
              </button>
              <button
                className={`btn ${isSubscribed ? 'btn-subscribed' : 'btn-subscribe'}`}
                onClick={() => onToggleSubscribe && onToggleSubscribe(anime)}
              >
                <Bell size={18} fill={isSubscribed ? "currentColor" : "none"} />
                {isSubscribed ? 'Subscribed' : 'Subscribe'}
              </button>
              <button
                className={`btn ${myList.some(item => item.id === anime.id) ? 'âœ“ Saved' : '+ Save'}`}
                onClick={() => onToggleWatchlist(anime)}
              >
                {myList.some(item => item.id === anime.id) ? 'âœ“ In My List' : '+ My List'}
              </button>
              <button className="btn btn-secondary" onClick={onBackHome}>
                Back to Home
              </button>
            </div>
          </div>
        </div>

        {/* Episodes Section */}
        <div className="episodes-section">
          <div className="episodes-section-header">
            <h2 className="section-title">Episodes</h2>

            <div className="episodes-controls">
              {/* Franchise / Season Selector */}
              {hasFranchise && (
                <div className="franchise-selector" ref={dropdownRef}>
                  <button className="franchise-btn" onClick={() => setShowSeasonDropdown(v => !v)}>
                    <span>{activeLabel}</span>
                    <ChevronDown size={14} />
                  </button>
                  {showSeasonDropdown && (
                    <div className="franchise-dropdown">
                      {seasonOptions.map((opt, idx) => (
                        <button
                          key={`${opt.id}-${idx}`}
                          className={`franchise-option ${opt.isActive ? "active" : ""}`}
                          onClick={() => {
                            if (opt.id !== anime.id) {
                              const target = franchiseList.find(f => f.id === opt.id);
                              if (target) onAnimeSelect(target);
                            } else { setSelectedPart(opt.part || 1); }
                            setShowSeasonDropdown(false);
                          }}>
                          {opt.title}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {/* Filter pills for DetailView */}
              <div className="episodes-filter-bar">
                {[["all","All"],["canon","Canon"],["filler","Filler"],["recap","Recap"]].map(([f,label]) => (
                  <button key={f} className={`ep-filter-pill ${filter === f ? "active" : ""}`} onClick={() => setFilter(f)}>{label}</button>
                ))}
              </div>
            </div>
          </div>
          {/* Episode Grid */}
          <div className="episodes-grid">
            {loadingPage ? (
              Array.from({length: 12}).map((_, i) => <BentoEpisodeSkeleton key={i} />)
            ) : filteredEpisodes.length === 0 ? (
              <div className="episodes-empty">No episodes found.</div>
            ) : filteredEpisodes.map(ep => (
              <div
                key={ep.id || ep.number}
                className={`ep-bento-card ${ep.number === 1 ? "active" : ""}`}
                onClick={() => onStartWatching(anime, ep.number)}
              >
                <div className="ep-bento-number">{ep.number}</div>
                <div className="ep-bento-thumb">
                  {ep.thumbnail ? <img src={ep.thumbnail} alt={`Episode ${ep.number}`} loading="lazy" /> : <div className="ep-bento-thumb-placeholder"><Play size={16} /></div>}
                </div>
                <div className="ep-bento-info">
                  <div className="ep-bento-header">
                    <div className="ep-bento-title">{ep.title && ep.title !== `Episode ${ep.number}` ? ep.title : `Episode ${ep.number}`}</div>
                    {ep.filler && <span className="ep-bento-badge filler">Filler</span>}
                    {ep.recap && <span className="ep-bento-badge recap">Recap</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function WatchView({
  anime,
  episode,
  source,
  franchiseList = [],
  currentSourceIndex,
  loadingSources,
  setCurrentSourceIndex,
  onStartWatching,
  onAnimeSelect,
  audioMode = 'sub',
  setAudioMode,
  showToast,
  onOpenSaveModal,
  onToggleLike,
  isLiked,
  subscriptions = [],
  onToggleSubscribe
}) {
  const EPISODES_PER_PART = 100;
  const totalPages = anime.episodePagination?.lastPage || 1;
  const isLongRunning = totalPages > 1;
  const defaultPart = Math.ceil(episode.number / EPISODES_PER_PART) || 1;

  const [selectedPart, setSelectedPart] = React.useState(defaultPart);
  const [episodesList, setEpisodesList] = React.useState([]);
  const [loadingEpisodes, setLoadingEpisodes] = React.useState(false);
  const [filter, setFilter] = React.useState('all');
  const [showSeasonDropdown, setShowSeasonDropdown] = React.useState(false);
  const [cbfPool, setCbfPool] = React.useState([]);
  const [cbfPage, setCbfPage] = React.useState(1);
  const [visibleCbfCount, setVisibleCbfCount] = React.useState(8);
  const [cbfLoadingMore, setCbfLoadingMore] = React.useState(false);
  const [liked, setLiked] = React.useState(false);
  const [descExpanded, setDescExpanded] = React.useState(false);

  const isSubscribed = subscriptions.some(s => String(s.id || s.media_id) === String(anime.id));

  const currentEpNum = episode.number || 1;
  const totalEpCount = anime.totalEpisodes || anime.episodes?.length || (episodesList.length || 1000);
  const hasPrevEp = currentEpNum > 1;
  const hasNextEp = currentEpNum < totalEpCount;

  const handlePrevEp = () => {
    if (hasPrevEp && onStartWatching) {
      onStartWatching(anime, currentEpNum - 1, true, audioMode);
    }
  };

  const handleNextEp = () => {
    if (hasNextEp && onStartWatching) {
      onStartWatching(anime, currentEpNum + 1, true, audioMode);
    }
  };

  const dropdownRef = React.useRef(null);
  const activeEpisodeRef = React.useRef(null);
  const secondaryColRef = React.useRef(null);

  // Sync part with current episode number when it changes
  React.useEffect(() => {
    const currentPart = Math.ceil(episode.number / EPISODES_PER_PART) || 1;
    setSelectedPart(currentPart);
  }, [episode.number]);

  // Handle click outside to close dropdown
  React.useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowSeasonDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch episodes when part changes
  React.useEffect(() => {
    if (selectedPart === 1) {
      setEpisodesList(anime.episodes || []);
      return;
    }
    if (!anime.malId) {
      setEpisodesList([]);
      return;
    }
    setLoadingEpisodes(true);
    const fetchPromise = api.getEpisodePage(anime.malId, selectedPart);
    const delayPromise = new Promise(resolve => setTimeout(resolve, 800));
    Promise.all([fetchPromise, delayPromise]).then(([data]) => {
      if (data && data.episodes) {
        setEpisodesList(data.episodes.map(ep => ({
          id: null,
          number: ep.number,
          title: ep.title,
          filler: ep.filler,
          recap: ep.recap,
          thumbnail: anime.bannerImage || anime.coverImage,
          sources: []
        })));
      }
    }).finally(() => setLoadingEpisodes(false));
  }, [selectedPart, anime.malId, anime.episodes]);

  // Center active episode in viewport if needed
  React.useEffect(() => {
    if (activeEpisodeRef.current) {
      setTimeout(() => {
        activeEpisodeRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'nearest'
        });
      }, 400);
    }
  }, [episode.number, loadingEpisodes]);

  const hasProviderProblem = ['fallback', 'error', 'unavailable'].includes(episode.provider);

  // Generate Season dropdown options
  const seasonOptions = [];
  if (franchiseList && franchiseList.length > 0) {
    franchiseList.forEach(item => {
      const isActive = item.id === anime.id;
      if (isActive) {
        if (isLongRunning) {
          for (let p = 1; p <= totalPages; p++) {
            const start = (p - 1) * EPISODES_PER_PART + 1;
            const end = Math.min(p * EPISODES_PER_PART, anime.totalEpisodes || (p * EPISODES_PER_PART));
            seasonOptions.push({
              id: item.id,
              title: `${item.title} - Part ${p} (Ep ${start}â€“${end})`,
              part: p,
              isActive: isActive && selectedPart === p
            });
          }
        } else {
          seasonOptions.push({
            id: item.id,
            title: `${item.title} (${item.format})`,
            part: 1,
            isActive: true
          });
        }
      } else {
        seasonOptions.push({
          id: item.id,
          title: `${item.title} (${item.format})`,
          part: 1,
          isActive: false
        });
      }
    });
  }

  // Fallback if no franchise list
  if (seasonOptions.length === 0) {
    if (isLongRunning) {
      for (let p = 1; p <= totalPages; p++) {
        const start = (p - 1) * EPISODES_PER_PART + 1;
        const end = Math.min(p * EPISODES_PER_PART, anime.totalEpisodes || (p * EPISODES_PER_PART));
        seasonOptions.push({
          id: anime.id,
          title: `Season 1 - Part ${p} (Ep ${start}â€“${end})`,
          part: p,
          isActive: selectedPart === p
        });
      }
    } else {
      seasonOptions.push({
        id: anime.id,
        title: `Season 1`,
        part: 1,
        isActive: true
      });
    }
  }

  const activeOption = seasonOptions.find(opt => opt.isActive) || seasonOptions[0];
  const activeLabel = activeOption ? activeOption.title : 'Select Season';

  // Filtered episodes
  const filteredEpisodes = episodesList.filter(ep => {
    if (filter === 'canon') return !ep.filler && !ep.recap;
    if (filter === 'filler') return ep.filler;
    if (filter === 'recap') return ep.recap;
    return true;
  });

  // Initialize CBF Pool when selected anime changes
  React.useEffect(() => {
    if (!anime) return;
    setCbfPage(1);
    setVisibleCbfCount(8);
    const initialPool = window.__eetnet_trending_pool__ || [];
    if (initialPool.length > 0) {
      setCbfPool(initialPool);
    } else {
      api.getAnimeList(1, 30).then(list => {
        if (list && list.length > 0) {
          window.__eetnet_trending_pool__ = list;
          setCbfPool(list);
        }
      }).catch(() => {});
    }
  }, [anime?.id]);

  // Compute recommendations dynamically over the entire pool
  const cbfRecs = React.useMemo(() => {
    if (!anime || !cbfPool || cbfPool.length === 0) return [];
    return getRecommendations(anime, cbfPool, cbfPool.length);
  }, [anime, cbfPool]);

  const displayedCbfRecs = cbfRecs.slice(0, visibleCbfCount);

  // Load more CBF recommendations
  const loadMoreCbf = React.useCallback(async () => {
    if (cbfLoadingMore) return;
    if (visibleCbfCount < cbfRecs.length) {
      setVisibleCbfCount(prev => Math.min(prev + 8, cbfRecs.length));
      return;
    }
    setCbfLoadingMore(true);
    try {
      const nextPage = cbfPage + 1;
      const newItems = await api.getAnimeList(nextPage, 30);
      if (newItems && newItems.length > 0) {
        setCbfPool(prev => {
          const existingIds = new Set(prev.map(item => String(item.id)));
          const filteredNew = newItems.filter(item => !existingIds.has(String(item.id)));
          return [...prev, ...filteredNew];
        });
        setCbfPage(nextPage);
        setVisibleCbfCount(prev => prev + 8);
      }
    } catch (err) {
      console.warn('[CBF] Failed to fetch more recommendations:', err);
    } finally {
      setCbfLoadingMore(false);
    }
  }, [cbfLoadingMore, visibleCbfCount, cbfRecs.length, cbfPage]);

  // Attach infinite scroll listener on window
  React.useEffect(() => {
    const handleScroll = () => {
      const scrollPos = window.innerHeight + window.scrollY;
      const threshold = document.documentElement.scrollHeight - 450;
      if (scrollPos >= threshold) {
        loadMoreCbf();
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [loadMoreCbf]);

  const franchiseIndex = franchiseList.findIndex(item => item.id === anime.id);
  const seasonNum = franchiseIndex !== -1 ? franchiseIndex + 1 : 1;

  return (
    <div className="yt-watch-page">
      {/* Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ 2-Column Grid Layout Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */}
      <div className="yt-watch-layout">

        {/* Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ LEFT COLUMN: Primary Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */}
        <div className="yt-watch-primary">

          {/* Video Player */}
          <div className="yt-player-wrap">
            {loadingSources ? (
              <LoadingPlayer />
            ) : (
              <VideoPlayer
                source={source}
                poster={episode.thumbnail || anime.bannerImage}
                subtitles={episode?.subtitles}
                malId={anime.idMal}
                episodeNumber={episode.number}
                onNextEpisode={handleNextEp}
                onPrevEpisode={handlePrevEp}
                hasNextEpisode={hasNextEp}
                hasPrevEpisode={hasPrevEp}
                className="yt-player-skin"
              />
            )}
            {hasProviderProblem && <ProviderWarning error={episode.error} />}
          </div>

          {/* Title block */}
          <div className="yt-watch-title-block">
            <h1 className="yt-watch-title">
              {anime.title}
            </h1>
            <div className="yt-watch-ep-label">
              Season {seasonNum} Ã‚Â· Episode {episode.number}{episode.title && episode.title !== `Episode ${episode.number}` ? `  ${episode.title}` : ''}
            </div>
          </div>

          {/* Action bar */}
          <div className="yt-watch-action-bar">
            <div className="yt-watch-action-left">
              {/* Audio mode */}
              <div className="yt-audio-pills">
                {['sub','dub','hindi'].map(mode => (
                  <button
                    key={mode}
                    className={`yt-audio-pill ${audioMode === mode ? 'active' : ''}`}
                    onClick={() => {
                      if (setAudioMode) setAudioMode(mode);
                      if (onStartWatching) onStartWatching(anime, episode.number, true, mode);
                    }}
                  >
                    {mode === 'sub' ? 'ðŸ‡¯ðŸ‡µ SUB' : mode === 'dub' ? 'ðŸ‡ºðŸ‡¸ DUB' : 'ðŸ‡®ðŸ‡³ HIN'}
                    {mode === 'hindi' && anime.hindiAvailable && (
                      <span className="yt-hindi-badge">âœ“</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="yt-watch-action-right">
              <button
                className={`yt-action-btn ${isSubscribed ? 'btn-subscribed' : 'btn-subscribe'}`}
                onClick={() => onToggleSubscribe && onToggleSubscribe(anime)}
                style={{ height: '36px', padding: '0 1rem' }}
              >
                <Bell size={16} fill={isSubscribed ? "currentColor" : "none"} />
                <span>{isSubscribed ? 'Subscribed' : 'Subscribe'}</span>
              </button>
              <button
                className={`yt-action-btn ${(isLiked || liked) ? 'active' : ''}`}
                onClick={() => {
                  setLiked(v => !v);
                  if (onToggleLike) onToggleLike({ ...anime, episode_number: episode.number });
                }}
              >
                <ThumbsUp size={18} fill={(isLiked || liked) ? "currentColor" : "none"} />
                <span>{(isLiked || liked) ? 'Liked' : 'Like'}</span>
              </button>
              <button
                className="yt-action-btn"
                onClick={() => {
                  if (navigator.clipboard) {
                    navigator.clipboard.writeText(window.location.href);
                  }
                  if (showToast) showToast('Link copied to clipboard!');
                }}
              >
                <Share2 size={18} />
                <span>Share</span>
              </button>
              <button
                className="yt-action-btn"
                onClick={() => {
                  if (onOpenSaveModal) onOpenSaveModal({ ...anime, episode_number: episode.number });
                }}
              >
                <Bookmark size={18} />
                <span>Save</span>
              </button>
              <button className="yt-action-btn">
                <MoreHorizontal size={18} />
              </button>
            </div>
          </div>

          {/* Server selector */}
          {episode.sources && episode.sources.length > 1 && (
            <div className="yt-server-selector">
              <span className="yt-server-label">Server / Quality:</span>
              {episode.sources.map((src, idx) => (
                <button
                  key={`${src.url}-${idx}`}
                  className={`yt-server-btn ${currentSourceIndex === idx ? 'active' : ''}`}
                  onClick={() => setCurrentSourceIndex(idx)}
                >
                  {src.quality || `Server ${idx + 1}`}
                </button>
              ))}
            </div>
          )}

          {/* Description */}
          {anime.description && (
            <div className="yt-watch-desc-block">
              <p
                className={`yt-watch-desc ${descExpanded ? 'expanded' : ''}`}
                onClick={() => setDescExpanded(v => !v)}
              >
                {anime.description}
              </p>
              <button className="yt-desc-toggle" onClick={() => setDescExpanded(v => !v)}>
                {descExpanded ? 'Show less' : 'more'}
              </button>
            </div>
          )}
        </div>

        {/* Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ RIGHT COLUMN: Secondary Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */}
        <div className="yt-watch-secondary" ref={secondaryColRef}>

          {/* Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Season Panel (YouTube playlist bento) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */}
          <div className="yt-season-panel">
            {/* Panel header */}
            <div className="yt-season-panel-header">
              <div className="yt-season-panel-header-left">
                <div className="yt-season-panel-title">Episodes</div>
                <div className="yt-season-panel-subtitle">
                  {filteredEpisodes.length} episodes
                </div>
              </div>
              {/* Clickable Season Selector */}
              <div className="yt-season-selector-wrap" ref={dropdownRef}>
                <button
                  className="yt-season-selector-btn"
                  onClick={() => setShowSeasonDropdown(v => !v)}
                >
                  <span>{activeLabel}</span>
                  <ChevronDown size={14} />
                </button>
                {showSeasonDropdown && (
                  <div className="yt-season-dropdown">
                    {seasonOptions.map((opt, idx) => (
                      <button
                        key={`${opt.id}-${idx}`}
                        className={`yt-season-option ${opt.isActive ? 'active' : ''}`}
                        onClick={() => {
                          if (opt.id !== anime.id) {
                            if (onAnimeSelect) onAnimeSelect(opt.id);
                          } else {
                            setSelectedPart(opt.part || 1);
                          }
                          setShowSeasonDropdown(false);
                        }}
                      >
                        {opt.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Filter pills */}
            <div className="yt-ep-filters">
              {['all','canon','filler','recap'].map(f => (
                <button
                  key={f}
                  className={`yt-ep-filter-pill ${filter === f ? 'active' : ''}`}
                  onClick={() => setFilter(f)}
                >
                  {f === 'all' ? 'All' : f === 'canon' ? 'Canon' : f === 'filler' ? 'Filler' : 'Recap'}
                </button>
              ))}
            </div>

            {/* Episode bento list */}
            <div className="yt-ep-bento-list">
              {loadingEpisodes ? (
                Array.from({ length: 6 }).map((_, i) => <BentoEpisodeSkeleton key={i} />)
              ) : filteredEpisodes.length === 0 ? (
                <div className="yt-ep-empty">No episodes found.</div>
              ) : (
                filteredEpisodes.map(ep => {
                  const isActive = ep.number === episode.number;
                  return (
                    <div
                      key={ep.id || ep.number}
                      ref={isActive ? activeEpisodeRef : null}
                      className={`ep-bento-card ${isActive ? 'active' : ''} ${ep.filler ? 'filler' : ''}`}
                      onClick={() => {
                        if (!isActive && onStartWatching) {
                          onStartWatching(anime, ep.number, true, audioMode);
                        }
                      }}
                    >
                      <div className="ep-bento-number">{ep.number}</div>
                      <div className="ep-bento-thumb">
                        {ep.thumbnail ? (
                          <img src={ep.thumbnail} alt={ep.title || `Episode ${ep.number}`} loading="lazy" />
                        ) : (
                          <div className="ep-bento-thumb-placeholder">
                            <Play size={16} />
                          </div>
                        )}
                        {isActive && <div className="ep-bento-playing-overlay"><div className="ep-bento-playing-bar" /><div className="ep-bento-playing-bar" /><div className="ep-bento-playing-bar" /></div>}
                      </div>
                      <div className="ep-bento-info">
                        <div className="ep-bento-header">
                          <div className="ep-bento-title">{ep.title || `Episode ${ep.number}`}</div>
                          {ep.filler && <span className="ep-bento-badge filler">Filler</span>}
                          {ep.recap && <span className="ep-bento-badge recap">Recap</span>}
                        </div>
                        <div className="ep-bento-sub">{anime.title}</div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Up Next / Recommendations Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */}
          <div className="yt-cbf-section">
            <div className="yt-cbf-header">Up next</div>
            {displayedCbfRecs.length === 0 ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="yt-cbf-card skeleton">
                  <div className="yt-cbf-thumb skeleton-shimmer" />
                  <div className="yt-cbf-info" style={{ gap: 8, flex: 1 }}>
                    <div className="yt-skeleton-line" style={{ width: '85%', height: 14 }} />
                    <div className="yt-skeleton-line" style={{ width: '50%', height: 12 }} />
                  </div>
                </div>
              ))
            ) : (
              displayedCbfRecs.map(rec => (
                <div
                  key={rec.id}
                  className="yt-cbf-card"
                  onClick={() => onAnimeSelect && onAnimeSelect(rec.id)}
                >
                  <div className="yt-cbf-thumb">
                    <img src={rec.coverImage} alt={rec.title} loading="lazy" />
                  </div>
                  <div className="yt-cbf-info">
                    <div className="yt-cbf-title">{rec.title}</div>
                    <div className="yt-cbf-sub">{rec.type} Ã‚Â· {rec.totalEpisodes ? `${rec.totalEpisodes} eps` : ''}</div>
                  </div>
                </div>
              ))
            )}
            {cbfLoadingMore && (
              Array.from({ length: 2 }).map((_, i) => (
                <div key={`loading-${i}`} className="yt-cbf-card skeleton">
                  <div className="yt-cbf-thumb skeleton-shimmer" />
                  <div className="yt-cbf-info" style={{ gap: 8, flex: 1 }}>
                    <div className="yt-skeleton-line" style={{ width: '85%', height: 14 }} />
                    <div className="yt-skeleton-line" style={{ width: '50%', height: 12 }} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
function BentoEpisodeSkeleton() {
  return (
    <div className="ep-bento-card skeleton-bento">
      <div className="ep-bento-number skeleton-shimmer" style={{ height: '30px', width: '20px', borderRadius: '4px' }} />
      <div className="ep-bento-thumb skeleton-shimmer" style={{ background: 'none' }} />
      <div className="ep-bento-info">
        <div className="ep-bento-header">
          <div className="skeleton-shimmer" style={{ height: '18px', width: '40%', borderRadius: '4px' }} />
          <div className="skeleton-shimmer" style={{ height: '14px', width: '60px', borderRadius: '4px' }} />
        </div>
        <div className="skeleton-shimmer" style={{ height: '14px', width: '90%', borderRadius: '4px', marginTop: '8px' }} />
        <div className="skeleton-shimmer" style={{ height: '14px', width: '70%', borderRadius: '4px', marginTop: '6px' }} />
      </div>
    </div>
  );
}

function LoadingPlayer() {
  return (
    <div className="player-wrapper player-loading">
      <div className="blob-loader-wrap">
        <div className="blob-loader" />
        <p className="blob-loader-text">
          Loading<span className="blob-dots"><span>.</span><span>.</span><span>.</span></span>
        </p>
      </div>
    </div>
  );
}

function ProviderWarning({ error }) {
  return (
    <div className="provider-warning">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '600' }}>
        <AlertCircle size={16} />
        <span>Streaming providers are currently unavailable</span>
      </div>
      <span style={{ color: '#fca5a5', fontSize: '0.8rem' }}>
        {error || 'The streaming provider did not return a playable source.'} Try another episode or connect a working stream source.
      </span>
    </div>
  );
}

function CategoryGridView({
  viewName,
  featuredItem,
  genresData = {},
  onAnimeClick,
  onStartWatching,
  isLoading = false
}) {
  if (isLoading || !featuredItem) {
    return <CategorySkeleton />;
  }

  return (
    <div className="netflix-home">
      <div
        className="hero netflix-hero"
        style={{ backgroundImage: `url(${featuredItem.bannerImage})` }}
      >
        <div className="hero-overlay"></div>
        <div className="container hero-shell">
          <div className="hero-content">
            <div className="netflix-series-mark">
              <span>N</span>
              <strong>{viewName === 'movies' ? 'Film' : 'Series'}</strong>
            </div>
            <h1 className="hero-title">{featuredItem.title}</h1>

            <div className="hero-meta">
              <span className="top-ten-badge">Top Picks</span>
              <span>
                <Star size={16} fill="var(--accent-primary)" style={{ color: 'var(--accent-primary)' }} />
                {featuredItem.rating}
              </span>
              <span>{featuredItem.type}</span>
              <span>{featuredItem.duration || 'HD'}</span>
              <span>{featuredItem.status}</span>
            </div>

            <p className="hero-desc">{featuredItem.description}</p>

            <div className="btn-group">
              <button className="btn btn-primary" onClick={() => onStartWatching(featuredItem, 1)}>
                <Play size={22} fill="currentColor" /> Play
              </button>
              <button className="btn btn-secondary" onClick={() => onAnimeClick(featuredItem.id)}>
                <Info size={22} /> More Info
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Netflix Horizontal Rows Grouped by Genres */}
      <div className="netflix-rows">
        {Object.entries(genresData).map(([genreName, list]) => {
          if (!list || list.length === 0) return null;
          return (
            <NetflixRow
              key={genreName}
              title={`${genreName} ${viewName === 'movies' ? 'Movies' : 'Shows'}`}
              items={list}
              onAnimeClick={(a) => onAnimeClick(a.id ?? a)}
            />
          );
        })}
      </div>
    </div>
  );
}

// HindiView and HindiYTCard are imported from ./features/anime/hindi/components/HindiView



function WatchlistView({ items, onAnimeClick, onBackHome }) {
  return (
    <div className="container" style={{ marginTop: '5rem', minHeight: '60vh' }}>
      <div className="section-header" style={{ marginBottom: '2rem' }}>
        <h2 className="section-title">My List</h2>
      </div>

      {items.length > 0 ? (
        <div className="anime-grid">
          {items.map((anime) => (
            <AnimeCard
              key={anime.id}
              anime={anime}
              onClick={() => onAnimeClick(anime.id)}
            />
          ))}
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '6rem 0', color: 'var(--text-secondary)' }}>
          <Star size={48} style={{ marginBottom: '1rem', color: 'var(--text-muted)' }} />
          <h3>Your watchlist is empty</h3>
          <p style={{ fontSize: '0.9rem', marginTop: '0.5rem', color: 'var(--text-muted)' }}>
            Explore shows and movies, and click "+ My List" to bookmark them.
          </p>
          <button className="btn btn-primary" onClick={onBackHome} style={{ marginTop: '1.5rem', display: 'inline-flex' }}>
            Browse Shows
          </button>
        </div>
      )}
    </div>
  );
}

export default App;

// '''''''''''''''''''''''''''''''''''''''''''''''''''''
// MANHWA COMPONENTS (Hivetoons)
// '''''''''''''''''''''''''''''''''''''''''''''''''''''

// Manhwa components imported from ./features/manhwa/components





// Drama components imported from ./features/drama/components


// 
// MOVIE COMPONENTS

// Movie components imported from ./features/movie/components






// Helper to clean raw WordPress titles for display (e.g. "Drishyam 3 (2026) Hindi Dubbed Movie Watch Online" -> "Drishyam 3")

// ── Netflix-Style Movie Detail View ──────────────────────────────────────────

// ── MoviePlex Cinema Player View ─────────────────────────────────────────────


// 
// MANGA COMPONENTS

// Manga components imported from ./features/manga/components/MangaViews














//  Lazy-loading manga page wrapper using IntersectionObserver 
// Prevents Chrome's 6-connection limit from aborting off-screen images.
// Only starts loading when the image enters the viewport (+ 800px margin).


