import React from 'react';
import { Flame, Globe, Tv, Sparkles, Star, Zap, Info } from 'lucide-react';
import { supabase } from '../../../supabaseClient';
import { apiUrl } from '../../../runtimeConfig';
import { InlineLoader } from '../../../App';
import MovieCard from './MovieCard';
import MovieRow from './MovieRow';

function MovieHomeView({
  data,
  error,
  isLoading,
  activeCategory,
  setActiveCategory,
  searchQuery,
  searchResults,
  searchLoading,
  onSearch,
  onMovieClick,
  user
}) {
  const mpTrending   = data?.desicinemas?.trending   || data?.movieplex?.trending    || data?.trending  || [];
  const mpWebSeries  = data?.desicinemas?.webSeries  || data?.movieplex?.webSeries   || [];
  const mpHindiDub   = data?.desicinemas?.hindiDubbed || data?.movieplex?.hindiDubbed || [];
  const mpBollywood  = data?.desicinemas?.bollywood  || data?.movieplex?.bollywood   || data?.bollywood || [];
  const mpHollywood  = data?.desicinemas?.hollywood  || data?.movieplex?.hollywood   || data?.hollywood || [];
  const mpAction     = data?.desicinemas?.action     || data?.movieplex?.action      || data?.action    || [];
  const mpThriller   = data?.desicinemas?.thriller   || data?.movieplex?.thriller    || [];
  const mpRomance    = data?.desicinemas?.romance    || data?.movieplex?.romance     || [];
  const mpShortFilm  = data?.movieplex?.shortFilm   || [];
  const mpHot        = data?.movieplex?.hot         || [];

  // Hero carousel auto-rotate
  const featuredPool = React.useMemo(() => {
    const list = mpTrending.length ? mpTrending : mpHindiDub.length ? mpHindiDub : mpBollywood;
    return list.slice(0, 5);
  }, [mpTrending, mpHindiDub, mpBollywood]);

  const [heroIdx, setHeroIdx] = React.useState(0);
  React.useEffect(() => {
    if (!featuredPool.length) return;
    const interval = setInterval(() => {
      setHeroIdx(prev => (prev + 1) % featuredPool.length);
    }, 8000);
    return () => clearInterval(interval);
  }, [featuredPool]);

  const featured = featuredPool[heroIdx] || data?.featured || mpTrending[0] || null;

  const categories = ['All', 'Trending', 'Hindi Dubbed', 'Bollywood', 'Hollywood', 'Web Series', 'Action', 'Drama', 'Thriller', 'Romance', 'Horror', 'Tamil', 'Telugu', 'Punjabi'];

  const CAT_MAP = {
    'Trending': { key: 'movies' },
    'Hindi Dubbed': { key: 'hindi_dubbed' },
    'Bollywood': { key: 'desi_cinema' },
    'Hollywood': { key: 'hollywood' },
    'Web Series': { key: 'series' },
    'Action': { key: 'action' },
    'Drama': { key: 'drama' },
    'Thriller': { key: 'thriller' },
    'Romance': { key: 'romance' },
    'Horror': { key: 'horror' },
    'Tamil': { key: 'tamil' },
    'Telugu': { key: 'telugu' },
    'Punjabi': { key: 'punjabi' }
  };

  // ─── Admin identity (only this user can see Dev Options and push picks) ───
  const ADMIN_UID = '01d0cb3e-2c7b-4357-9c5b-5500be26e592';
  const isAdmin = user?.id === ADMIN_UID || user?.email === 'godkillermhz98@gmail.com';

  // ─── Random Picks (Supabase-backed: visible to ALL visitors) ───
  const [randomPicks, setRandomPicks] = React.useState([]);
  const [picksLoaded, setPicksLoaded] = React.useState(false);

  // Load picks from Supabase on mount
  React.useEffect(() => {
    const loadPicks = async () => {
      try {
        const { data, error } = await supabase
          .from('site_config')
          .select('value')
          .eq('key', 'random_picks')
          .single();
        if (!error && data) setRandomPicks(data.value || []);
      } catch (e) {
        console.warn('[RandomPicks] Could not load from Supabase:', e);
      } finally {
        setPicksLoaded(true);
      }
    };
    loadPicks();

    // Realtime: update all open tabs when admin pushes new picks
    const channel = supabase
      .channel('site_config_picks')
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'site_config', filter: 'key=eq.random_picks' },
        (payload) => { if (payload.new?.value) setRandomPicks(payload.new.value); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const saveRandomPicks = async (picks) => {
    setRandomPicks(picks);
    try {
      const { error } = await supabase
        .from('site_config')
        .upsert({ key: 'random_picks', value: picks, updated_at: new Date().toISOString() });
      if (error) {
        console.error('[RandomPicks] Supabase write error:', error);
        alert('⚠️ Cloud Sync Warning: ' + (error.message || 'Row Level Security policy blocked the update in Supabase. Please check SQL permissions.'));
      }
    } catch (e) {
      console.error('[RandomPicks] Save failed:', e);
    }
  };

  // ─── Dev Selection Mode ───
  const [devModeActive, setDevModeActive] = React.useState(false);
  const [selectedMovieIds, setSelectedMovieIds] = React.useState(new Set());
  const [showPushPopup, setShowPushPopup] = React.useState(false);

  const toggleMovieSelection = (movie) => {
    setSelectedMovieIds(prev => {
      const next = new Set(prev);
      if (next.has(movie.id)) next.delete(movie.id);
      else next.add(movie.id);
      if (next.size > 0) setShowPushPopup(true);
      return next;
    });
  };

  const handlePushPicks = async () => {
    const picked = catMovies.filter(m => selectedMovieIds.has(m.id));
    const merged = [...randomPicks, ...picked.filter(p => !randomPicks.some(e => e.id === p.id))];
    await saveRandomPicks(merged);
    setSelectedMovieIds(new Set());
    setShowPushPopup(false);
    setDevModeActive(false);
    setActiveCategory('All');
  };

  const handleCancelPicks = () => {
    setSelectedMovieIds(new Set());
    setShowPushPopup(false);
  };

  // State for category grid view (paginated loading for movies per category)
  const [catMovies, setCatMovies] = React.useState([]);
  const [catPage, setCatPage] = React.useState(1);
  const [catTotalPages, setCatTotalPages] = React.useState(1);
  const [catTotalCount, setCatTotalCount] = React.useState(0);
  const [catLoading, setCatLoading] = React.useState(false);
  const [loadingMore, setLoadingMore] = React.useState(false);

  // Fetch paginated category movies whenever activeCategory changes
  React.useEffect(() => {
    if (activeCategory === 'All') {
      setCatMovies([]);
      setCatPage(1);
      return;
    }

    const config = CAT_MAP[activeCategory];
    if (!config) return;

    setCatLoading(true);
    setCatPage(1);

    const queryParams = new URLSearchParams({ page: 1, limit: 36 });
    if (config.key || config.id) queryParams.set('category', config.key || config.id);

    fetch(apiUrl(`/api/desicinemas/catalog?${queryParams.toString()}`))
      .then(r => r.json())
      .then(res => {
        setCatMovies(Array.isArray(res.movies) ? res.movies : []);
        setCatTotalPages(res.totalPages || 1);
        setCatTotalCount(res.total || 0);
        setCatLoading(false);
      })
      .catch(() => {
        setCatMovies([]);
        setCatLoading(false);
      });
  }, [activeCategory]);

  const loadMoreCategoryMovies = () => {
    if (loadingMore || catPage >= catTotalPages) return;
    const nextPage = catPage + 1;
    setLoadingMore(true);

    const config = CAT_MAP[activeCategory] || {};
    const queryParams = new URLSearchParams({ page: nextPage, limit: 36 });
    if (config.key || config.id) queryParams.set('category', config.key || config.id);

    fetch(apiUrl(`/api/desicinemas/catalog?${queryParams.toString()}`))
      .then(r => r.json())
      .then(res => {
        if (Array.isArray(res.movies)) {
          setCatMovies(prev => [...prev, ...res.movies]);
        }
        setCatPage(nextPage);
        setLoadingMore(false);
      })
      .catch(() => setLoadingMore(false));
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: '#fff', fontFamily: '"Inter","Roboto",sans-serif' }}>

      {searchQuery.trim() ? (
        <div style={{ padding: '1.5rem', maxWidth: '1400px', margin: '0 auto' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 1rem', color: '#fff' }}>
            Results for "{searchQuery}"
          </h2>
          {searchLoading ? (
            <div style={{ minHeight: '30vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <InlineLoader />
            </div>
          ) : searchResults.length ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '1rem' }}>
              {searchResults.map(m => <MovieCard key={m.id} movie={m} onClick={() => onMovieClick(m)} />)}
            </div>
          ) : (
            <p style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: '4rem 0' }}>No movies found.</p>
          )}
        </div>
      ) : isLoading ? (
        <div style={{ padding: '2rem', display: 'flex', gap: '1rem', overflow: 'hidden' }}>
          {[1,2,3,4,5,6].map(i => <div key={i} className="mp-skeleton-card" style={{ flex: '0 0 148px' }} />)}
        </div>
      ) : !data || (!Array.isArray(data.popular) && !Array.isArray(data.bollywood) && !data.movieplex && !data.desicinemas) ? (
        <div style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1.2rem' }}>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '1rem', textAlign: 'center', maxWidth: '520px' }}>
            {error || 'Could not load movie catalog.'}
          </p>
          <button onClick={() => window.location.reload()} style={{
            padding: '0.7rem 2rem', background: '#E50914', color: '#fff',
            border: 'none', borderRadius: '4px', fontWeight: 700, cursor: 'pointer'
          }}>Retry</button>
        </div>
      ) : (
        <>
          {/* Billboard Hero only visible in 'All' mode */}
          {activeCategory === 'All' && featured && (
            <div style={{
              width: '100%', height: '70vh', minHeight: '440px',
              position: 'relative',
              backgroundImage: `url(${featured.bannerImage || featured.coverImage || featured.thumbnail})`,
              backgroundPosition: 'center top', backgroundSize: 'cover', backgroundRepeat: 'no-repeat',
              transition: 'background-image 0.8s ease-in-out'
            }}>
              {/* Dual scrim gradient */}
              <div style={{
                position: 'absolute', inset: 0,
                background: 'linear-gradient(to right, rgba(10,10,10,0.95) 0%, rgba(10,10,10,0.6) 45%, transparent 85%), linear-gradient(to top, #0a0a0a 0%, rgba(10,10,10,0.5) 50%, transparent 100%)'
              }} />

              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                padding: '3rem clamp(1rem, 5vw, 4rem) 3.5rem',
                maxWidth: '850px'
              }}>
                {/* Category tag */}
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.8rem' }}>
                  <span style={{ background: '#E50914', color: '#fff', padding: '0.2rem 0.6rem', borderRadius: '3px', fontSize: '0.72rem', fontWeight: 800, letterSpacing: '1px', textTransform: 'uppercase' }}>Featured</span>
                  {featured.releaseDate && <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.82rem', fontWeight: 600 }}>{String(featured.releaseDate).split('-')[0]}</span>}
                </div>

                <h1 style={{
                  margin: '0 0 0.8rem',
                  fontSize: 'clamp(1.8rem, 5vw, 3.2rem)',
                  fontWeight: 800, letterSpacing: '-0.5px',
                  textShadow: '0 2px 20px rgba(0,0,0,0.9)',
                  lineHeight: 1.15
                }}>{featured.title}</h1>

                {featured.description && (
                  <p style={{
                    color: 'rgba(255,255,255,0.8)', fontSize: '0.95rem',
                    margin: '0 0 1.6rem', maxWidth: '540px', lineHeight: 1.55,
                    textShadow: '0 1px 4px rgba(0,0,0,0.8)'
                  }}>
                    {featured.description.substring(0, 170)}{featured.description.length > 170 ? '…' : ''}
                  </p>
                )}

                <div style={{ display: 'flex', gap: '0.9rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => onMovieClick(featured)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '0.6rem',
                      background: '#E50914', color: '#fff',
                      padding: '0.8rem 2.2rem', borderRadius: '6px',
                      border: 'none', fontSize: '1.05rem', fontWeight: 700,
                      cursor: 'pointer', transition: 'all 0.18s ease',
                      boxShadow: '0 6px 20px rgba(229,9,20,0.45)'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = '#F6121D'}
                    onMouseLeave={e => e.currentTarget.style.background = '#E50914'}
                  >
                    ▶ Play
                  </button>
                  <button
                    onClick={() => onMovieClick(featured)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                      background: 'rgba(255,255,255,0.14)', color: '#fff',
                      padding: '0.8rem 1.8rem', borderRadius: '6px',
                      border: '1px solid rgba(255,255,255,0.2)', fontSize: '1rem', fontWeight: 600,
                      cursor: 'pointer', backdropFilter: 'blur(8px)', transition: 'background 0.18s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.24)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.14)'}
                  >
                    <Info size={18} /> More Info
                  </button>
                </div>
              </div>

              {/* Carousel Indicator Dots */}
              {featuredPool.length > 1 && (
                <div style={{
                  position: 'absolute', bottom: '1.5rem', right: '3rem',
                  display: 'flex', gap: '0.5rem', zIndex: 5
                }}>
                  {featuredPool.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setHeroIdx(idx)}
                      style={{
                        width: heroIdx === idx ? '24px' : '8px', height: '8px',
                        borderRadius: '4px', border: 'none', cursor: 'pointer',
                        background: heroIdx === idx ? '#E50914' : 'rgba(255,255,255,0.3)',
                        transition: 'all 0.3s ease'
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Category Filter Pills Navbar */}
          <div style={{ padding: '1.8rem clamp(1rem, 4vw, 3rem) 0' }}>
            <div className="mp-scroll-row" style={{ gap: '0.6rem', paddingBottom: '0.4rem' }}>
              {categories.map((c) => (
                <button
                  key={c}
                  onClick={() => setActiveCategory(c)}
                  style={{
                    padding: '0.45rem 1.2rem', borderRadius: '20px', border: 'none',
                    cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
                    whiteSpace: 'nowrap', flexShrink: 0,
                    background: activeCategory === c ? '#E50914' : '#1e1e22',
                    color: activeCategory === c ? '#fff' : '#b3b3b3',
                    transition: 'all 0.18s ease',
                    boxShadow: activeCategory === c ? '0 4px 14px rgba(229,9,20,0.35)' : 'none'
                  }}
                >{c}</button>
              ))}
            </div>
          </div>

          {/* MAIN CONTENT AREA */}
          {activeCategory === 'All' ? (
            /* ALL CATEGORIES HOME VIEW (Horizontal Scrolling Rows) */
            <div style={{ padding: '0.5rem clamp(1rem, 4vw, 3rem) 4rem' }}>
              {mpTrending.length > 0 && (
                <MovieRow title="Trending" icon={<Flame size={20} style={{ color: '#ef4444' }} />} movies={mpTrending} onMovieClick={onMovieClick} />
              )}
              {mpHindiDub.length > 0 && (
                <MovieRow title="Hindi Dubbed" icon={<Globe size={20} style={{ color: '#06b900' }} />} movies={mpHindiDub} onMovieClick={onMovieClick} />
              )}
              {mpBollywood.length > 0 && (
                <MovieRow title="Bollywood" icon={<Flame size={20} style={{ color: '#f97316' }} />} movies={mpBollywood} onMovieClick={onMovieClick} />
              )}
              {mpHollywood.length > 0 && (
                <MovieRow title="Hollywood" icon={<Tv size={20} style={{ color: '#3b82f6' }} />} movies={mpHollywood} onMovieClick={onMovieClick} />
              )}
              {mpWebSeries.length > 0 && (
                <MovieRow title="Web Series" icon={<Tv size={20} style={{ color: '#8b5cf6' }} />} movies={mpWebSeries} onMovieClick={onMovieClick} />
              )}
              {mpAction.length > 0 && (
                <MovieRow title="Action" icon={<Zap size={20} style={{ color: '#f97316' }} />} movies={mpAction} onMovieClick={onMovieClick} />
              )}
              {mpThriller.length > 0 && (
                <MovieRow title="Thriller" icon={<Zap size={20} style={{ color: '#ef4444' }} />} movies={mpThriller} onMovieClick={onMovieClick} />
              )}
              {mpRomance.length > 0 && (
                <MovieRow title="Romance" icon={<Star size={20} style={{ color: '#ec4899' }} />} movies={mpRomance} onMovieClick={onMovieClick} />
              )}

              {/* ──  Random Picks Section (Developer-Curated Infinite Grid at Bottom) ── */}
              {randomPicks.length > 0 && (
                <section style={{ marginTop: '3.5rem', paddingTop: '2rem', borderTop: '1px solid rgba(255,255,255,0.08)', position: 'relative' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <Sparkles size={20} style={{ color: '#a78bfa' }} />
                      <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.2px' }}>Random Picks</h2>
                      <span style={{ background: 'rgba(139,92,246,0.25)', color: '#a78bfa', padding: '2px 9px', borderRadius: '12px', fontSize: '0.72rem', fontWeight: 700 }}>{randomPicks.length} movies</span>
                    </div>
                    <button
                      onClick={() => { if (window.confirm('Clear all Random Picks?')) saveRandomPicks([]); }}
                      style={{ background: 'none', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.4)', padding: '3px 10px', borderRadius: '12px', cursor: 'pointer', fontSize: '0.72rem' }}
                    >Clear</button>
                  </div>
                  {/* Infinite Grid for Random Picks */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '1.2rem 1rem' }}>
                    {randomPicks.map((m, idx) => (
                      <MovieCard key={m.id + '-rp-' + idx} movie={m} onClick={() => onMovieClick(m)} />
                    ))}
                  </div>
                </section>
              )}
            </div>
          ) : (
            /* DEDICATED CATEGORY GRID VIEW (Full paginated catalog of movies) */
            <div style={{ padding: '1.5rem clamp(1rem, 4vw, 3rem) 4rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.8rem', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', flexWrap: 'wrap' }}>
                  <h2 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0, color: '#fff' }}>
                    {activeCategory} Movies {catMovies.length > 0 && <span style={{ fontSize: '0.9rem', color: '#b3b3b3', fontWeight: 400 }}>({catMovies.length} items)</span>}
                  </h2>
                </div>
                <button
                  onClick={() => { setActiveCategory('All'); setDevModeActive(false); setSelectedMovieIds(new Set()); setShowPushPopup(false); }}
                  style={{
                    background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
                    color: '#fff', padding: '0.4rem 1rem', borderRadius: '20px',
                    fontSize: '0.8rem', cursor: 'pointer'
                  }}
                >← All Categories</button>
              </div>

              {catLoading ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '1rem' }}>
                  {[1,2,3,4,5,6,7,8,9,10,11,12].map(i => (
                    <div key={i} className="mp-skeleton-card" />
                  ))}
                </div>
              ) : catMovies.length > 0 ? (
                <>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                    gap: '1.2rem 1rem'
                  }}>
                    {catMovies.map((m, idx) => (
                      <div key={m.id + '-' + idx} style={{ position: 'relative' }}
                        onClick={devModeActive ? (e) => { e.stopPropagation(); toggleMovieSelection(m); } : undefined}
                      >
                        {/* Checkmark overlay in dev mode */}
                        {devModeActive && (
                          <div style={{
                            position: 'absolute', top: '6px', right: '6px', zIndex: 10,
                            width: '22px', height: '22px', borderRadius: '50%',
                            background: selectedMovieIds.has(m.id) ? '#8b5cf6' : 'rgba(0,0,0,0.55)',
                            border: `2px solid ${selectedMovieIds.has(m.id) ? '#8b5cf6' : 'rgba(255,255,255,0.5)'}`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'all 0.15s', cursor: 'pointer',
                          }}>
                            {selectedMovieIds.has(m.id) && (
                              <svg viewBox="0 0 12 12" width="12" height="12" fill="none">
                                <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            )}
                          </div>
                        )}
                        <div style={{ opacity: devModeActive && selectedMovieIds.has(m.id) ? 0.85 : 1, outline: devModeActive && selectedMovieIds.has(m.id) ? '2px solid #8b5cf6' : 'none', borderRadius: '8px', transition: 'all 0.15s' }}>
                          <MovieCard movie={m} onClick={devModeActive ? () => {} : () => onMovieClick(m)} />
                        </div>
                      </div>
                    ))}
                  </div>

                  {catPage < catTotalPages && (
                    <div style={{ display: 'flex', justifyContent: 'center', marginTop: '3rem' }}>
                      <button
                        onClick={loadMoreCategoryMovies}
                        disabled={loadingMore}
                        style={{
                          padding: '0.85rem 3rem', background: '#E50914', color: '#fff',
                          border: 'none', borderRadius: '6px', fontSize: '0.95rem', fontWeight: 700,
                          cursor: 'pointer', opacity: loadingMore ? 0.6 : 1,
                          boxShadow: '0 4px 16px rgba(229,9,20,0.4)', transition: 'all 0.18s'
                        }}
                      >
                        {loadingMore ? 'Loading More Movies...' : `Load More (${catTotalCount - catMovies.length} remaining)`}
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <p style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: '4rem 0' }}>No movies found in this category.</p>
              )}
            </div>
          )}

          {/* ── Push to Random Picks Popup ── */}
          {showPushPopup && selectedMovieIds.size > 0 && (
            <div style={{
              position: 'fixed', bottom: '90px', left: '50%', transform: 'translateX(-50%)',
              zIndex: 9999, minWidth: 'min(92vw, 380px)',
            }}>
              <div style={{
                background: '#1a1a2e', border: '1px solid rgba(139,92,246,0.5)',
                borderRadius: '16px', padding: '1.2rem 1.4rem',
                boxShadow: '0 20px 60px rgba(0,0,0,0.8)',
                display: 'flex', flexDirection: 'column', gap: '0.9rem',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <span style={{ fontSize: '1.4rem' }}>🎲</span>
                  <div>
                    <div style={{ color: '#fff', fontWeight: 700, fontSize: '0.95rem' }}>{selectedMovieIds.size} movie{selectedMovieIds.size > 1 ? 's' : ''} selected</div>
                    <div style={{ color: 'rgba(196,181,253,0.7)', fontSize: '0.75rem' }}>Push to <strong>Random Picks!</strong> on the homepage?</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.7rem' }}>
                  <button
                    onClick={handleCancelPicks}
                    style={{
                      flex: 1, padding: '0.65rem', background: 'rgba(255,255,255,0.08)',
                      border: '1px solid rgba(255,255,255,0.15)', color: '#fff',
                      borderRadius: '10px', cursor: 'pointer', fontWeight: 600, fontSize: '0.88rem',
                    }}
                  >✕ Cancel</button>
                  <button
                    onClick={handlePushPicks}
                    style={{
                      flex: 2, padding: '0.65rem', background: 'linear-gradient(135deg, #7c3aed, #8b5cf6)',
                      border: 'none', color: '#fff',
                      borderRadius: '10px', cursor: 'pointer', fontWeight: 700, fontSize: '0.88rem',
                      boxShadow: '0 4px 16px rgba(139,92,246,0.5)',
                    }}
                  >🚀 Push to Random Picks!</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default MovieHomeView;
