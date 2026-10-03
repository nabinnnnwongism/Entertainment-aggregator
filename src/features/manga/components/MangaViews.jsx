import React, { useState, useRef } from 'react';
import { Play, BookOpen, Star, Sparkles, Flame, Trophy, ChevronLeft, ChevronRight } from 'lucide-react';
import { apiUrl } from '../../../runtimeConfig';
import { InlineLoader, CategorySkeleton } from '../../../App';

function MangaCard({ manga, onClick, index = 0 }) {
  const [imgError, setImgError] = React.useState(false);
  const rating = Number.parseFloat(manga.rating);
  const hasRating = Number.isFinite(rating) && rating > 0;
  if (!hasRating) manga = { ...manga, rating: '' };
  return (
    <button type="button" className="manga-card" style={{ '--manga-card-index': index }} onClick={() => onClick(manga)}>
      <div className="manga-card-art">
        {manga.cover && !imgError ? (
          <img src={manga.cover} alt={manga.title} onError={() => setImgError(true)} loading="lazy" />
        ) : (
          <div className="manga-card-placeholder">
            <BookOpen size={32} style={{ opacity: 0.4 }} />
          </div>
        )}
        <div className="manga-card-overlay">
          <span className="manga-card-read">Read</span>
        </div>
        {manga.status && (
          <span className={`manga-status-badge ${manga.status === 'ongoing' ? 'ongoing' : manga.status === 'completed' ? 'completed' : ''}`}>
            {manga.status}
          </span>
        )}
      </div>
      <div className="manga-card-info">
        <p className="manga-card-title">{manga.title}</p>
        {manga.rating && <span style={{ color: '#f59e0b', fontWeight: 600 }}> {manga.rating}</span>}
      </div>
    </button>
  );
}

function MangaRow({ title, icon, mangas, onMangaClick }) {
  return (
    <section className="manga-row">
      <header className="manga-row-heading">
        <div className="hv-section-header">
          <h2 className="hv-section-title">{icon} {title}</h2>
          <span className="hv-section-line" />
        </div>
        <span className="manga-row-count">{mangas.length} titles</span>
      </header>
      <div className="manga-row-slider">
        {mangas.map((m, i) => (
          <MangaCard key={m.id || i} manga={m} index={i} onClick={onMangaClick} />
        ))}
      </div>
    </section>
  );
}

function MangaBentoGrid({ items, onMangaClick }) {
  if (!items || items.length === 0) return null;
  const heroItem = items[0];
  const restItems = items.slice(1, 10);

  return (
    <div className="manga-bento-container">
      <div className="manga-bento-header">
        <h2 className="manga-bento-title">
          <Trophy size={22} style={{ color: '#f59e0b' }} /> Top 10 Comics
        </h2>
      </div>

      <div className="manga-bento-grid">
        {/* Item #1: Hero Bento Card (2x2) */}
        {heroItem && (
          <div className="bento-card-hero" onClick={() => onMangaClick(heroItem)}>
            <img src={heroItem.cover || heroItem.banner} alt={heroItem.title} className="bento-hero-bg" />
            <div className="bento-hero-overlay" />
            <div className="bento-rank-badge rank-1">
              <Trophy size={14} /> #1 TOP COMIC
            </div>
            <div className="bento-hero-content">
              <span className="manga-hero-rating"> {heroItem.rating || '9.0'} â€¢ SPOTLIGHT
              </span>
              <h3 style={{ color: '#ffffff', fontSize: '1.6rem', fontWeight: 800, margin: '0.2rem 0' }}>
                {heroItem.title}
              </h3>
              {heroItem.description && (
                <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {heroItem.description}
                </p>
              )}
              <div style={{ marginTop: '0.6rem' }}>
                <button className="btn btn-primary" style={{ padding: '0.4rem 1rem', fontSize: '0.85rem' }}>
                  <BookOpen size={15} style={{ marginRight: '0.3rem' }} /> Read Now
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Items #2 to #10 */}
        {restItems.map((item, idx) => {
          const rank = idx + 2;
          const rankClass = rank === 2 ? 'rank-2' : rank === 3 ? 'rank-3' : 'rank-standard';
          return (
            <div key={item.id || idx} className="bento-card-standard" onClick={() => onMangaClick(item)}>
              <img src={item.cover || item.banner} alt={item.title} className="bento-card-img" />
              <div className="bento-card-overlay" />
              <div className={`bento-rank-badge ${rankClass}`}>
                #{rank}
              </div>
              <div className="bento-card-info">
                <span className="manga-badge"> {item.rating || '8.5'}</span>

                <div className="bento-card-title">{item.title}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MangaCategoryCards({ onSelectCategory }) {
  const categories = [
    {
      id: 'manga',
      title: 'Manga',
      flag: 'ðŸ‡¯ðŸ‡µ',
      desc: 'Japanese Comics â€¢ Shonen, Seinen, Shojo & Romance',
      className: 'manga'
    },
    {
      id: 'manhwa',
      title: 'Manhwa',
      flag: '',
      desc: 'Korean Webtoons â€¢ Solo Leveling, System, Reincarnation & Action',
      className: 'manhwa'
    },
    {
      id: 'manhua',
      title: 'Manhua / Donghua Comic',
      flag: '',
      desc: 'Chinese Webtoons â€¢ Martial Arts, Cultivation & Donghua Adaptations',
      className: 'manhua'
    }
  ];

  return (
    <div className="manga-categories-section">
      <div className="hv-section-header" style={{ marginBottom: '1.25rem' }}>
        <h2 className="hv-section-title">
          <Compass size={20} style={{ color: '#3b82f6' }} /> Browse by Format
        </h2>
        <span className="hv-section-line" />
      </div>
      <div className="manga-category-grid">
        {categories.map(cat => (
          <div key={cat.id} className={`manga-cat-card ${cat.className}`} onClick={() => onSelectCategory(cat.id)}>
            <div className="manga-cat-flag">{cat.flag}</div>
            <div className="manga-cat-title">{cat.title}</div>
            <div className="manga-cat-desc">{cat.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MangaCategoryHub({ category, onBack, onMangaClick }) {
  const [selectedGenre, setSelectedGenre] = React.useState('all');
  const [catData, setCatData] = React.useState(null);
  const [isLoading, setIsLoading] = React.useState(true);

  const categoryMeta = {
    manga: { title: 'Manga Hub', subtitle: 'Explore Japanese Manga Comics' },
    manhwa: { title: 'Manhwa Hub', subtitle: 'Explore Korean Webtoons & Manhwa' },
    manhua: { title: 'Manhua Hub', subtitle: 'Explore Chinese Manhua & Cultivation Comics' }
  }[category] || { title: 'Manga Hub', subtitle: 'Browse Catalog' };

  const genres = [
    { id: 'all', label: 'All Genres' },
    { id: 'action', label: 'Action' },
    { id: 'fantasy', label: 'Fantasy' },
    { id: 'romance', label: 'Romance' },
    { id: 'system', label: 'System' },
    { id: 'isekai', label: 'Isekai' },
    { id: 'adventure', label: 'Adventure' },
    { id: 'drama', label: 'Drama' },
    { id: 'sci-fi', label: 'Sci-Fi' }
  ];

  React.useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    api.getMangaCategoryData(category, selectedGenre).then(res => {
      if (isMounted) {
        setCatData(res);
        setIsLoading(false);
      }
    });
    return () => { isMounted = false; };
  }, [category, selectedGenre]);

  return (
    <div className="container manga-subhub-header">
      {/* Breadcrumb Header */}
      <div className="manga-breadcrumb">
        <span className="manga-breadcrumb-link" onClick={onBack}>Â Ã‚Â Back to Manga Landing</span>
        <span>/</span>
        <span style={{ color: '#ffffff', fontWeight: 600 }}>{categoryMeta.title}</span>
      </div>

      <div className="manga-subhub-title-row">
        <span className="manga-subhub-flag">{categoryMeta.flag}</span>
        <div>
          <h1 className="manga-subhub-heading">{categoryMeta.title}</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>{categoryMeta.subtitle}</p>
        </div>
      </div>

      {/* Horizontal Genre Slider */}
      <div className="manga-genre-slider">
        {genres.map(g => (
          <button
            key={g.id}
            className={`manga-genre-pill ${selectedGenre === g.id ? 'active' : ''}`}
            onClick={() => setSelectedGenre(g.id)}
          >
            {g.label}
          </button>
        ))}
      </div>

      {/* Rows */}
      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
          <InlineLoader />
        </div>
      ) : !catData || !catData.trending?.length ? (
        <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '3rem 0' }}>
          No titles found for this genre filter.
        </p>
      ) : (
        <div className="manga-rows-container">
          {catData.trending?.length > 0 && (
            <MangaRow
              title="Trending Now"
              icon={<Flame size={18} style={{ color: '#f97316' }} />}
              mangas={catData.trending}
              onMangaClick={onMangaClick}
            />
          )}
          {catData.popular?.length > 0 && (
            <MangaRow
              title="Most Popular"
              icon={<Trophy size={18} style={{ color: '#eab308' }} />}
              mangas={catData.popular}
              onMangaClick={onMangaClick}
            />
          )}
          {catData.topPick?.length > 0 && (
            <MangaRow
              title="Fan's Top Pick"
              icon={<Star size={18} fill="#a855f7" style={{ color: '#a855f7' }} />}
              mangas={catData.topPick}
              onMangaClick={onMangaClick}
            />
          )}
          {catData.recent?.length > 0 && (
            <MangaRow
              title="Recently Updated"
              icon={<Sparkles size={18} style={{ color: '#3b82f6' }} />}
              mangas={catData.recent}
              onMangaClick={onMangaClick}
            />
          )}
        </div>
      )}
    </div>
  );
}

function MangaHomeView({ data, error, isLoading, searchQuery, searchResults, searchLoading, onSearch, onMangaClick }) {
  const [selectedCategory, setSelectedCategory] = React.useState(null);
  const bentoItems = data?.bentoTop10 || data?.trending || [];

  return (
    <div className="manga-home" style={{ paddingTop: '4rem' }}>
      {searchQuery.trim() ? (
        <div className="container manga-search-results">
          <div className="hv-section-header" style={{ marginBottom: '1.5rem' }}>
            <h2 className="hv-section-title">
              <Sparkles size={20} style={{ color: '#eab308' }} /> Results for &quot;{searchQuery}&quot;
            </h2>
            <span className="hv-section-line" />
          </div>
          {searchLoading ? (
            <div className="manga-loading"><InlineLoader /></div>
          ) : searchResults.length ? (
            <div className="manga-grid">
              {searchResults.map((m, i) => <MangaCard key={m.id || i} manga={m} onClick={onMangaClick} />)}
            </div>
          ) : (
            <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '3rem 0' }}>No manga found.</p>
          )}
        </div>
      ) : selectedCategory ? (
        /* Render Dedicated Category Hub Sub-Page (Manga / Manhwa / Manhua) */
        <MangaCategoryHub
          category={selectedCategory}
          onBack={() => setSelectedCategory(null)}
          onMangaClick={onMangaClick}
        />
      ) : isLoading ? (
        <CategorySkeleton />
      ) : !data || (!data.bentoTop10?.length && !data.trending?.length) ? (
        <div style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1.2rem' }}>
          <BookOpen size={48} style={{ color: 'var(--text-muted)' }} />
          <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem', textAlign: 'center', maxWidth: '640px' }}>
            {error || 'Could not load manga catalog. Check your connection.'}
          </p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>Retry</button>
        </div>
      ) : (
        /* Main Bento Top 10 Landing Page + Category Selector Cards */
        <div className="container">
          {/* Top 10 Bento Grid */}
          <MangaBentoGrid items={bentoItems} onMangaClick={onMangaClick} />

          {/* Category Choice Cards (Manga, Manhwa, Manhua) */}
          <MangaCategoryCards onSelectCategory={(catId) => setSelectedCategory(catId)} />

          {/* Previews */}
          {data.manhwaPreview?.length > 0 && (
            <MangaRow
              title="Trending Manhwa Webtoons"
              icon={<Flame size={18} style={{ color: '#3b82f6' }} />}
              mangas={data.manhwaPreview}
              onMangaClick={onMangaClick}
            />
          )}

          {data.mangaPreview?.length > 0 && (
            <MangaRow
              title="Popular Japanese Manga"
              icon={<Trophy size={18} style={{ color: '#ef4444' }} />}
              mangas={data.mangaPreview}
              onMangaClick={onMangaClick}
            />
          )}
        </div>
      )}
    </div>
  );
}

function MangaLandingShowcase({ items, onMangaClick }) {
  if (!items?.length) return null;
  const featured = items[0];
  const railItems = items.slice(1, 10);

  return (
    <section className="manga-landing-showcase">
      <article className="manga-featured-story" style={{ backgroundImage: `url(${featured.banner || featured.cover})` }}>
        <div className="manga-featured-scrim" />
        <div className="manga-featured-content">
          <span className="manga-featured-kicker">Top story this week</span>
          <h1>{featured.title}</h1>
          {featured.description && <p>{featured.description}</p>}
          <div className="manga-featured-actions">
            <button type="button" className="manga-featured-read" onClick={() => onMangaClick(featured)}>
              <BookOpen size={17} /> Read now
            </button>
            <span className="manga-featured-rating"><Star size={15} fill="currentColor" /> {featured.rating || '8.8'}</span>
          </div>
        </div>
        <span className="manga-featured-rank">01</span>
      </article>

      {railItems.length > 0 && (
        <div className="manga-story-rail-wrap">
          <div className="manga-story-rail-heading">
            <div>
              <span>Top 10</span>
              <h2>Keep exploring</h2>
            </div>
            <span className="manga-story-rail-note">This week&apos;s most-read stories</span>
          </div>
          <div className="manga-story-rail">
            {railItems.map((item, index) => (
              <button key={item.id || index} type="button" className="manga-story-rail-card" onClick={() => onMangaClick(item)}>
                <img src={item.cover || item.banner} alt="" loading="lazy" />
                <span className="manga-story-rail-rank">{String(index + 2).padStart(2, '0')}</span>
                <span className="manga-story-rail-title">{item.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function MangaShelfSpotlight({ item, category, onMangaClick }) {
  if (!item) return null;
  const labels = { manga: 'Featured manga', manhwa: 'Featured manhwa', manhua: 'Featured manhua' };

  return (
    <article className="manga-shelf-spotlight" style={{ backgroundImage: `url(${item.banner || item.cover})` }}>
      <div className="manga-shelf-spotlight-scrim" />
      <div className="manga-shelf-spotlight-content">
        <span>{labels[category] || 'Featured story'}</span>
        <h2>{item.title}</h2>
        {item.description && <p>{item.description}</p>}
        <button type="button" onClick={() => onMangaClick(item)}><BookOpen size={16} /> Start reading</button>
      </div>
    </article>
  );
}

function MangaCategoryCardsV2({ onSelectCategory }) {
  const categories = [
    { id: 'manga', title: 'Manga', country: 'Japan', description: 'Shonen, seinen, shojo and every kind of panel-to-panel escape.', icon: BookOpen },
    { id: 'manhwa', title: 'Manhwa', country: 'Korea', description: 'Webtoons, action fantasy, romance and cliffhangers worth chasing.', icon: Sparkles },
    { id: 'manhua', title: 'Donghua', country: 'China', description: 'Chinese manhua, cultivation stories and worlds built on scale.', icon: Globe }
  ];

  return (
    <section className="manga-categories-section manga-categories-section--v2">
      <div className="hv-section-header manga-shelf-header">
        <h2 className="hv-section-title"><Compass size={20} /> Choose Your Shelf</h2>
        <span className="hv-section-line" />
      </div>
      <div className="manga-category-grid manga-category-grid--v2">
        {categories.map(({ icon: Icon, ...category }) => (
          <button key={category.id} type="button" className={`manga-cat-card manga-cat-card--v2 ${category.id}`} onClick={() => onSelectCategory(category.id)}>
            <span className="manga-cat-icon"><Icon size={23} /></span>
            <span className="manga-cat-eyebrow">{category.country}</span>
            <strong className="manga-cat-title">{category.title}</strong>
            <span className="manga-cat-desc">{category.description}</span>
            <span className="manga-cat-enter">Explore <ChevronRight size={16} /></span>
          </button>
        ))}
      </div>
    </section>
  );
}

function MangaGenreBrowse({ category, genre, onMangaClick }) {
  const [items, setItems] = React.useState([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  const [hasMore, setHasMore] = React.useState(true);
  const [error, setError] = React.useState('');
  const sentinelRef = React.useRef(null);
  const pageRef = React.useRef(0);
  const keyRef = React.useRef('');
  const knownIdsRef = React.useRef(new Set());

  const loadBatch = React.useCallback(async (page, replace = false) => {
    const requestKey = `${category}:${genre}`;
    if (keyRef.current !== requestKey) return;

    if (replace) setIsLoading(true);
    else setIsLoadingMore(true);
    setError('');

    try {
      const response = await api.getMangaCategoryData(category, genre, page);
      if (keyRef.current !== requestKey) return;

      const incoming = Array.isArray(response?.items) ? response.items : [];
      if (replace) knownIdsRef.current = new Set();
      const unique = incoming.filter(item => {
        const id = item.id || item.comickSlug || item.title;
        if (!id || knownIdsRef.current.has(id)) return false;
        knownIdsRef.current.add(id);
        return true;
      });

      setItems(previous => replace ? unique : [...previous, ...unique]);
      pageRef.current = page;
      setHasMore(Boolean(response?.hasMore && unique.length > 0));
    } catch (err) {
      if (keyRef.current === requestKey) setError('Could not load more titles right now.');
    } finally {
      if (keyRef.current === requestKey) {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    }
  }, [category, genre]);

  React.useEffect(() => {
    keyRef.current = `${category}:${genre}`;
    pageRef.current = 0;
    knownIdsRef.current = new Set();
    setItems([]);
    setHasMore(true);
    loadBatch(1, true);
  }, [category, genre, loadBatch]);

  const loadMore = React.useCallback(() => {
    if (!isLoading && !isLoadingMore && hasMore) loadBatch(pageRef.current + 1);
  }, [hasMore, isLoading, isLoadingMore, loadBatch]);

  React.useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore || isLoading) return undefined;
    const observer = new IntersectionObserver(entries => {
      if (entries[0]?.isIntersecting) loadMore();
    }, { rootMargin: '500px 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, isLoading, loadMore]);

  return (
    <section className="manga-genre-results" aria-live="polite">
      <div className="manga-genre-results-heading">
        <div>
          <span className="manga-results-kicker">{category}</span>
          <h2>{genre}</h2>
        </div>
        {!isLoading && <span className="manga-results-count">{items.length} titles</span>}
      </div>

      {isLoading ? (
        <div className="manga-genre-loading"><InlineLoader /></div>
      ) : items.length ? (
        <>
          <div className="manga-genre-grid">
            {items.map((manga, index) => <MangaCard key={manga.id || manga.comickSlug || index} manga={manga} onClick={onMangaClick} />)}
          </div>
          <div ref={sentinelRef} className="manga-load-sentinel">
            {isLoadingMore && <InlineLoader />}
            {error && <p className="manga-load-message">{error}</p>}
            {!isLoadingMore && hasMore && <button type="button" className="manga-load-more" onClick={loadMore}>Load more</button>}
            {!hasMore && <p className="manga-load-message">You have reached the end of this shelf.</p>}
          </div>
        </>
      ) : (
        <p className="manga-empty-state">No titles were found in this genre.</p>
      )}
    </section>
  );
}

function MangaCategoryHubV2({ category, onBack, onMangaClick }) {
  const [selectedGenre, setSelectedGenre] = React.useState('all');
  const [data, setData] = React.useState(null);
  const [isLoading, setIsLoading] = React.useState(true);

  const categoryMeta = {
    manga: { title: 'Manga', eyebrow: 'Japanese comics', subtitle: 'A home for long-running favorites, new discoveries and every genre in between.' },
    manhwa: { title: 'Manhwa', eyebrow: 'Korean webtoons', subtitle: 'The stories people cannot stop reading, arranged for relaxed browsing.' },
    manhua: { title: 'Manhua', eyebrow: 'Chinese comics', subtitle: 'Manhua, donghua, cultivation epics and wide-open worlds with room to roam.' }
  }[category] || { title: 'Manga', eyebrow: 'Comic library', subtitle: 'Browse the catalog.' };

  const genres = [
    { id: 'all', label: 'For You' },
    { id: 'action', label: 'Action' },
    { id: 'fantasy', label: 'Fantasy' },
    { id: 'romance', label: 'Romance' },
    { id: 'system', label: 'System' },
    { id: 'isekai', label: 'Isekai' },
    { id: 'adventure', label: 'Adventure' },
    { id: 'drama', label: 'Drama' },
    { id: 'sci-fi', label: 'Sci-Fi' }
  ];

  React.useEffect(() => {
    if (selectedGenre !== 'all') {
      setIsLoading(false);
      return undefined;
    }
    let active = true;
    setIsLoading(true);
    api.getMangaCategoryData(category, 'all')
      .then(result => { if (active) setData(result); })
      .catch(() => { if (active) setData(null); })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [category, selectedGenre]);

  return (
    <div className={`container manga-subhub-header manga-subhub-header--v2 manga-subhub-header--${category}`}>
      <div className="manga-breadcrumb">
        <button type="button" className="manga-breadcrumb-link" onClick={onBack}>Comics</button>
        <ChevronRight size={15} />
        <span>{categoryMeta.title}</span>
      </div>

      <header className="manga-subhub-title-row manga-subhub-title-row--v2">
        <p className="manga-subhub-eyebrow">{categoryMeta.eyebrow}</p>
        <h1 className="manga-subhub-heading">{categoryMeta.title}</h1>
        <p className="manga-subhub-subtitle">{categoryMeta.subtitle}</p>
      </header>

      {selectedGenre === 'all' && data?.trending?.[0] && (
        <MangaShelfSpotlight item={data.trending[0]} category={category} onMangaClick={onMangaClick} />
      )}

      <section className="manga-genre-deck" aria-label={`${categoryMeta.title} genres`}>
        <div className="manga-genre-deck-heading">
          <span>Explore by genre</span>
          <span>Choose a lane</span>
        </div>
        <div className="manga-genre-slider manga-genre-slider--v2">
          {genres.map(genre => (
            <button key={genre.id} type="button" className={`manga-genre-pill ${selectedGenre === genre.id ? 'active' : ''}`} onClick={() => setSelectedGenre(genre.id)}>
              {genre.label}
            </button>
          ))}
        </div>
      </section>

      {selectedGenre !== 'all' ? (
        <MangaGenreBrowse category={category} genre={selectedGenre} onMangaClick={onMangaClick} />
      ) : isLoading ? (
        <div className="manga-category-loading"><InlineLoader /></div>
      ) : !data?.trending?.length ? (
        <p className="manga-empty-state">No titles are available in this shelf right now.</p>
      ) : (
        <div className="manga-rows-container manga-category-rows">
          <MangaRow title="Trending Now" icon={<Flame size={18} />} mangas={data.trending || []} onMangaClick={onMangaClick} />
          <MangaRow title="Most Read" icon={<Trophy size={18} />} mangas={data.popular || []} onMangaClick={onMangaClick} />
          <MangaRow title="Fan Favorites" icon={<Sparkles size={18} />} mangas={data.topPick || []} onMangaClick={onMangaClick} />
          <MangaRow title="Fresh Chapters" icon={<BookOpen size={18} />} mangas={data.recent || []} onMangaClick={onMangaClick} />
        </div>
      )}
    </div>
  );
}

function ComicCoverFlow({ data, onCategorySelect }) {
  const fallbackCovers = data?.bentoTop10 || data?.trending || [];
  const categories = [
    {
      id: 'manga',
      title: 'Manga',
      label: 'Japan',
      description: 'Panel stories from Japan, from long-running classics to new favorites.',
      cover: data?.mangaPreview?.[0]?.cover || fallbackCovers[1]?.cover || fallbackCovers[0]?.cover
    },
    {
      id: 'manhwa',
      title: 'Manhwa',
      label: 'Korea',
      description: 'Korean webcomics built for one more chapter.',
      cover: data?.manhwaPreview?.[0]?.cover || fallbackCovers[2]?.cover || fallbackCovers[0]?.cover
    },
    {
      id: 'manhua',
      title: 'Manhua',
      label: 'China / Donghua',
      description: 'Chinese comics, cultivation worlds, and stories on a grand scale.',
      cover: data?.manhuaPreview?.[0]?.cover || fallbackCovers[3]?.cover || fallbackCovers[0]?.cover
    }
  ];

  return (
    <section className="comic-gateway" aria-labelledby="comic-gateway-title">
      <header className="comic-gateway-header">
        <span>Explore EetNet</span>
        <h1 id="comic-gateway-title">Comics</h1>
        <p>Choose a world to enter.</p>
      </header>

      <div className="comic-coverflow" role="list">
        {categories.map((category, index) => (
          <button
            key={category.id}
            type="button"
            className={`comic-coverflow-card comic-coverflow-card--${category.id}`}
            style={{ '--coverflow-index': index }}
            onClick={() => onCategorySelect(category.id)}
            role="listitem"
          >
            {category.cover ? <img src={category.cover} alt="" loading={index === 1 ? 'eager' : 'lazy'} /> : <span className="comic-coverflow-fallback" />}
            <span className="comic-coverflow-scrim" />
            <span className="comic-coverflow-copy">
              <span className="comic-coverflow-label">{category.label}</span>
              <strong>{category.title}</strong>
              <span className="comic-coverflow-description">{category.description}</span>
              <span className="comic-coverflow-enter">Open library <ChevronRight size={16} /></span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function MangaHomeViewV2({ data, searchQuery, searchResults, searchLoading, onMangaClick, onCategorySelect }) {

  if (searchQuery.trim()) {
    return (
      <div className="manga-home" style={{ paddingTop: '4rem' }}>
        <div className="container manga-search-results">
          <div className="hv-section-header" style={{ marginBottom: '1.5rem' }}>
            <h2 className="hv-section-title"><Sparkles size={20} /> Results for &quot;{searchQuery}&quot;</h2>
            <span className="hv-section-line" />
          </div>
          {searchLoading ? <div className="manga-loading"><InlineLoader /></div> : searchResults.length ? (
            <div className="manga-grid">{searchResults.map((manga, index) => <MangaCard key={manga.id || index} manga={manga} onClick={onMangaClick} />)}</div>
          ) : <p className="manga-empty-state">No manga found.</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="manga-home manga-home--v2 comic-gateway-page" style={{ paddingTop: '4rem' }}>
      <div className="container">
        <ComicCoverFlow data={data} onCategorySelect={onCategorySelect} />
      </div>
    </div>
  );
}

function MangaDetailView({ manga, isLoading, onBack, onReadChapter }) {
  const [chapterSearch, setChapterSearch] = React.useState('');
  const [sortDesc, setSortDesc] = React.useState(true);

  const filteredChapters = React.useMemo(() => {
    let chs = manga.chapters || [];
    if (chapterSearch.trim()) {
      const q = chapterSearch.toLowerCase();
      chs = chs.filter(c => (c.chapter + '').includes(q) || (c.title || '').toLowerCase().includes(q));
    }
    return sortDesc ? [...chs].reverse() : chs;
  }, [manga.chapters, chapterSearch, sortDesc]);

  return (
    <div className="manga-detail">
      {/* Hero */}
      <div className="manga-detail-hero" style={{ backgroundImage: `url(${manga.banner || manga.cover})` }}>
        <div className="manga-detail-hero-overlay" />
        <div className="container manga-detail-hero-content">
          <button className="drama-back-btn" onClick={onBack}>Â Ã‚Â Back</button>
        </div>
      </div>

      {/* Meta Row */}
      <div className="container manga-detail-meta-row">
        <div className="manga-detail-cover">
          {manga.cover && <img src={manga.cover} alt={manga.title} />}
        </div>
        <div className="manga-detail-info">
          <h1 className="manga-detail-title">{manga.title}</h1>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center', margin: '0.6rem 0' }}>
            {manga.status && (
              <span className={`manga-status-badge inline ${manga.status === 'ongoing' ? 'ongoing' : 'completed'}`}>{manga.status}</span>
            )}
            {manga.rating && <span style={{ color: '#f59e0b', fontWeight: 600 }}> {manga.rating}</span>}
            {manga.chapters?.length > 0 && <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{manga.chapters.length} chapters</span>}
          </div>
          {manga.genres?.length > 0 && (
            <div className="manhwa-genres" style={{ marginBottom: '0.75rem' }}>
              {manga.genres.slice(0, 6).map(g => <span key={g} className="manhwa-genre-tag">{g}</span>)}
            </div>
          )}
          {manga.description && <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: 1.6 }}>{manga.description.slice(0, 400)}{manga.description.length > 400 ? '...' : ''}</p>}
        </div>
      </div>

      {/* Chapter List */}
      <div className="container manga-detail-body">
        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}><InlineLoader /></div>
        ) : (
          <>
            <div className="manga-chapter-controls">
              <h3 style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: '1.1rem' }}>
                <BookOpen size={16} style={{ marginRight: '0.4rem', verticalAlign: 'middle' }} />
                Chapters
              </h3>
              <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  className="manga-chapter-search"
                  type="text"
                  placeholder="Search chapters..."
                  value={chapterSearch}
                  onChange={e => setChapterSearch(e.target.value)}
                />
                <button
                  className="manga-sort-btn"
                  onClick={() => setSortDesc(p => !p)}
                  title="Toggle sort order"
                >
                  {sortDesc ? ' â€œ Newest' : ' â€˜ Oldest'}
                </button>
              </div>
            </div>
            {filteredChapters.length > 0 ? (
              <div className="manga-chapter-list">
                {filteredChapters.map((ch) => (
                  <button
                    key={ch.id}
                    className="manga-chapter-item"
                    onClick={() => onReadChapter(ch)}
                  >
                    <span className="manga-chapter-num">Ch. {ch.chapter}</span>
                    <span className="manga-chapter-title">{ch.title && ch.title !== `Chapter ${ch.chapter}` ? ch.title : ''}</span>
                    {ch.pages > 0 && <span className="manga-chapter-pages">{ch.pages}p</span>}
                  </button>
                ))}
              </div>
            ) : (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem 0' }}>
                {chapterSearch
                  ? 'No chapters match your search.'
                  : 'No readable chapters available. This manga may be licensed exclusively on Manga Plus or Bilibili - chapters are hosted externally and cannot be read here.'
                }
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function MangaPage({ page, pageIdx }) {
  const [status, setStatus] = React.useState('idle'); // 'idle' | 'loading' | 'ok'
  const [retryCount, setRetryCount] = React.useState(0);
  const containerRef = React.useRef(null);
  const imgRef = React.useRef(null);

  React.useEffect(() => {
    setStatus('idle');
    setRetryCount(0);
  }, [page.url]);

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting && status === 'idle') {
            setStatus('loading');
            observer.disconnect();
          }
        });
      },
      { rootMargin: '800px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [status, page.url]);

  const handleLoad = () => setStatus('ok');

  const handleError = () => {
    // Silently auto-retry up to 6 times in background with backoff
    if (retryCount < 6) {
      const nextRetry = retryCount + 1;
      setRetryCount(nextRetry);
      setTimeout(() => {
        if (imgRef.current) {
          const sep = page.url.includes('?') ? '&' : '?';
          imgRef.current.src = `${page.url}${sep}retry=${nextRetry}_${Date.now()}`;
        }
      }, 1000 * Math.min(nextRetry, 4));
    }
  };

  return (
    <div
      ref={containerRef}
      className="manga-page-wrap"
      style={{
        minHeight: status === 'ok' ? 'auto' : '500px',
        display: 'flex',
        justify: 'center',
        alignItems: 'center',
        background: status === 'ok' ? 'transparent' : 'rgba(255, 255, 255, 0.02)'
      }}
    >
      {status !== 'idle' && (
        <img
          ref={imgRef}
          src={page.url}
          alt={`Page ${page.page}`}
          className="manga-page-img"
          onLoad={handleLoad}
          onError={handleError}
          style={{ opacity: status === 'ok' ? 1 : 0.0, transition: 'opacity 0.2s' }}
        />
      )}
    </div>
  );
}

function MangaReaderView({ manga, chapter, pages, isLoading, onBack, onChapterSelect }) {
  const [readMode, setReadMode] = React.useState('scroll'); // 'scroll' | 'page'
  const [currentPage, setCurrentPage] = React.useState(0);
  const [showControls, setShowControls] = React.useState(true);

  //  Reset everything when chapter changes 
  React.useEffect(() => {
    setCurrentPage(0);
  }, [chapter?.id]);

  const allChapters = manga.chapters || [];
  const currentChIdx = allChapters.findIndex(c => c.id === chapter.id);

  const goNextChapter = () => {
    if (currentChIdx < allChapters.length - 1) {
      onChapterSelect(allChapters[currentChIdx + 1]);
      setCurrentPage(0);
    }
  };
  const goPrevChapter = () => {
    if (currentChIdx > 0) {
      onChapterSelect(allChapters[currentChIdx - 1]);
      setCurrentPage(0);
    }
  };

  // Page-mode single-image retry state
  const [pageImgKey, setPageImgKey] = React.useState(0);
  const [pageImgError, setPageImgError] = React.useState(false);

  React.useEffect(() => {
    setPageImgKey(0);
    setPageImgError(false);
  }, [chapter?.id, currentPage]);

  const handlePageImgError = () => {
    if (pageImgKey < 3) {
      setTimeout(() => setPageImgKey(k => k + 1), 1500);
    } else {
      setPageImgError(true);
    }
  };

  return (
    <div className="manga-reader" onClick={() => setShowControls(p => !p)}>
      {/* Top Toolbar */}
      <div className={`manga-reader-toolbar top ${showControls ? 'visible' : ''}`} onClick={e => e.stopPropagation()}>
        <button className="manga-reader-back-btn" onClick={onBack}>
          <ArrowLeft size={18} /> {manga.title}
        </button>
        <span className="manga-reader-chapter-label">Ch. {chapter.chapter}</span>
        <div className="manga-reader-controls">
          <button className={`manga-mode-btn ${readMode === 'scroll' ? 'active' : ''}`} onClick={() => setReadMode('scroll')}>Scroll</button>
          <button className={`manga-mode-btn ${readMode === 'page' ? 'active' : ''}`} onClick={() => { setReadMode('page'); setCurrentPage(0); }}>Page</button>
        </div>
      </div>

      {/* Chapter nav */}
      <div className={`manga-reader-toolbar bottom ${showControls ? 'visible' : ''}`} onClick={e => e.stopPropagation()}>
        <button className="manga-chapter-nav-btn" disabled={currentChIdx <= 0} onClick={goPrevChapter}>
          <ChevronLeft size={18} /> Prev Ch
        </button>
        {allChapters.length > 0 && (
          <select
            className="manga-chapter-select"
            value={chapter.id}
            onChange={e => {
              const ch = allChapters.find(c => c.id === e.target.value);
              if (ch) { onChapterSelect(ch); setCurrentPage(0); }
            }}
          >
            {allChapters.map(c => (
              <option key={c.id} value={c.id}>Ch. {c.chapter}</option>
            ))}
          </select>
        )}
        <button className="manga-chapter-nav-btn" disabled={currentChIdx >= allChapters.length - 1} onClick={goNextChapter}>Next Ch <ChevronRight size={18} /></button>
      </div>

      {/* Pages */}
      <div className="manga-reader-content">
        {isLoading ? (
          <div className="manga-reader-loading"><InlineLoader /><p>Loading chapter...</p></div>
        ) : pages.length === 0 ? (
          <div className="manga-reader-loading">
            <BookOpen size={48} style={{ opacity: 0.4 }} />
            <p>Pages could not be loaded.<br />Try a different chapter.</p>
          </div>
        ) : readMode === 'scroll' ? (
          <div className="manga-reader-scroll">
            {pages.map((p, idx) => (
              <MangaPage key={`${chapter.id}-${idx}`} page={p} pageIdx={idx} />
            ))}
          </div>
        ) : (
          <div className="manga-reader-page-mode">
            {pageImgError ? (
              <div className="manga-page-error" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', padding: '40px', color: '#999' }}>
                <span>Â  Page {currentPage + 1} failed to load</span>
                <button onClick={e => { e.stopPropagation(); setPageImgKey(0); setPageImgError(false); }}
                  style={{ background: '#00e561', color: '#000', border: 'none', borderRadius: '4px', padding: '6px 14px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                  Â Ã‚Âº Retry
                </button>
              </div>
            ) : (
              <img
                key={`${chapter.id}-pg-${currentPage}-${pageImgKey}`}
                src={pages[currentPage]?.url}
                alt={`Page ${currentPage + 1}`}
                className="manga-page-img-single"
                onError={handlePageImgError}
              />
            )}
            <div className="manga-page-nav">
              <button
                className="manga-page-btn"
                disabled={currentPage === 0}
                onClick={e => { e.stopPropagation(); setCurrentPage(p => Math.max(0, p - 1)); }}
              >
                <ChevronLeft size={22} />
              </button>
              <span className="manga-page-counter">{currentPage + 1} / {pages.length}</span>
              <button
                className="manga-page-btn"
                disabled={currentPage >= pages.length - 1}
                onClick={e => { e.stopPropagation(); setCurrentPage(p => Math.min(pages.length - 1, p + 1)); }}
              >
                <ChevronRight size={22} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export { MangaCard, MangaRow, MangaBentoGrid, MangaCategoryCards, MangaCategoryHub,
  MangaHomeView, MangaLandingShowcase, MangaShelfSpotlight, MangaCategoryCardsV2,
  MangaGenreBrowse, MangaCategoryHubV2, ComicCoverFlow, MangaHomeViewV2,
  MangaDetailView, MangaPage, MangaReaderView };
