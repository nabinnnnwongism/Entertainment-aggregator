import React from 'react';
import { ChipBar, YTCard } from '../../../App'; // ChipBar and YTCard components

export default function AnimeView({
  activeFeatured,
  featured = [],
  activeCategory = 'All',
  filteredTrending = [],
  top10Famous = [],
  setActiveCategory,
  onAnimeClick,
  onStartWatching,
  watchHistory = [],
  onHistoryItemClick,
  onDramaClick,
  onManhwaClick,
  hindiLoading = false
}) {
  const ANIME_CHIPS = [
    { id: 'All', label: 'All' },
    { id: 'Action', label: 'Action' },
    { id: 'Adventure', label: 'Adventure' },
    { id: 'Romance', label: 'Romance' },
    { id: 'Comedy', label: 'Comedy' },
    { id: 'Fantasy', label: 'Fantasy' },
    { id: 'Thriller', label: 'Thriller' },
    { id: 'Horror', label: 'Horror' },
    { id: 'Sci-Fi', label: 'Sci-Fi' },
    { id: 'Sports', label: 'Sports' },
    { id: 'Hindi', label: 'Hindi Dub' },
  ];

  // Show all types in Continue Watching (anime, movie, drama, manhwa)
  const continueWatching = watchHistory.slice(0, 12);

  const TYPE_COLORS = { anime: '#6366f1', movie: '#f59e0b', drama: '#ec4899', manhwa: '#10b981', manga: '#3b82f6' };
  const getCWBadge = (h) => {
    const t = h.type || 'anime';
    if (t === 'movie') return '▶ Movie';
    if (t === 'drama') return `Ep. ${h.episode_number || '?'}`;
    if (t === 'manhwa') return `Ch. ${h.chapter_number || '?'}`;
    return `Ep. ${h.episode_number || '?'}`;
  };

  return (
    <div className="yt-section-view">
      {/* Chip filter bar */}
      <ChipBar chips={ANIME_CHIPS} active={activeCategory} onSelect={setActiveCategory} />

      {/* Continue Watching row (if exists) */}
      {continueWatching.length > 0 && (
        <div className="yt-section-block">
          <div className="yt-section-header">
            <span className="yt-section-title">Continue Watching</span>
          </div>
          <div className="yt-content-grid">
            {continueWatching.slice(0, 8).map(h => {
              const typeColor = TYPE_COLORS[h.type || 'anime'] || '#6366f1';
              return (
                <div key={h.media_id || h.id} style={{ position: 'relative' }}>
                  <YTCard
                    item={{ id: h.media_id || h.id, title: h.title, coverImage: h.cover || h.coverImage, rating: 'N/A', genres: [] }}
                    badge={getCWBadge(h)}
                    onClick={() => onHistoryItemClick ? onHistoryItemClick(h) : onAnimeClick(h.media_id || h.id)}
                  />
                  {/* Type label */}
                  <span style={{
                    position: 'absolute', top: 6, left: 6,
                    background: typeColor, color: '#fff',
                    borderRadius: '4px', padding: '2px 6px',
                    fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', zIndex: 2,
                  }}>
                    {(h.type || 'anime').charAt(0).toUpperCase() + (h.type || 'anime').slice(1)}
                  </span>
                  {/* Progress bar */}
                  {h.duration_seconds > 0 && (
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '3px', background: 'rgba(255,255,255,0.15)', borderRadius: '0 0 6px 6px' }}>
                      <div style={{ height: '100%', background: '#e50914', width: `${Math.min(100, Math.round((h.progress_seconds / h.duration_seconds) * 100))}%`, borderRadius: '0 0 6px 6px' }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Top 10 */}
      {top10Famous.length > 0 && (
        <div className="yt-section-block">
          <div className="yt-section-header">
            <span className="yt-section-title"> Top 10 This Week</span>
          </div>
          <div className="yt-content-grid">
            {top10Famous.slice(0, 10).map((anime, i) => (
              <YTCard
                key={anime.id}
                item={anime}
                badge={`#${i + 1}`}
                onClick={() => onStartWatching(anime, 1)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Main grid */}
      <div className="yt-section-block">
        <div className="yt-section-header">
          <span className="yt-section-title">
            {activeCategory === 'All' ? 'Trending Anime' : activeCategory === 'Hindi' ? 'Hindi Dubbed Anime' : `${activeCategory} Anime`}
          </span>
          {featured.length > 0 && (
            <button className="yt-section-more" onClick={() => onAnimeClick(featured[0]?.id)}>
              View all →
            </button>
          )}
        </div>
        <div className="yt-content-grid">
          {filteredTrending.length > 0 ? (
            filteredTrending.map(anime => (
              <YTCard
                key={anime.id}
                item={anime}
                onClick={() => onStartWatching(anime, 1)}
              />
            ))
          ) : (activeCategory === 'Hindi' && hindiLoading) || (activeCategory === 'All' && featured.length === 0) ? (
            Array.from({ length: 12 }).map((_, i) => (
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
            ))
          ) : (
            <div style={{ gridColumn: '1 / -1', padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              No {activeCategory} anime found at the moment.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
