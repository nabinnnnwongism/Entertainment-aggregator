
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
              title: `${item.title} - Part ${p} (Ep ${start}–${end})`,
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
          title: `Season 1 - Part ${p} (Ep ${start}–${end})`,
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
      {/* ─── 2-Column Grid Layout ─── */}
      <div className="yt-watch-layout">

        {/* ─── LEFT COLUMN: Primary ─── */}
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
              Season {seasonNum} · Episode {episode.number}{episode.title && episode.title !== `Episode ${episode.number}` ? `  ${episode.title}` : ''}
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
                    {mode === 'sub' ? '🇯🇵 SUB' : mode === 'dub' ? '🇺🇸 DUB' : '🇮🇳 HIN'}
                    {mode === 'hindi' && anime.hindiAvailable && (
                      <span className="yt-hindi-badge">✓</span>
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

        {/* ─── RIGHT COLUMN: Secondary ─── */}
        <div className="yt-watch-secondary" ref={secondaryColRef}>

          {/* ─── Season Panel (YouTube playlist bento) ─── */}
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

          {/* ─── Up Next / Recommendations ─── */}
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
                    <div className="yt-cbf-sub">{rec.type} · {rec.totalEpisodes ? `${rec.totalEpisodes} eps` : ''}</div>
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
