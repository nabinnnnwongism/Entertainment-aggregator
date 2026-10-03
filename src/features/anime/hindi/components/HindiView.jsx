import React, { useState } from 'react';
import { Play, Sparkles } from 'lucide-react';
import HindiYTCard from './HindiYTCard';

export default function HindiView({ hindiAnime = [], onAnimeClick, onStartWatching, isLoading = false }) {
  const [activeFilter, setActiveFilter] = useState('All');
  const [sortBy, setSortBy] = useState('popular');

  const GENRES = ['All', 'Action', 'Adventure', 'Fantasy', 'Romance', 'Comedy', 'Sci-Fi', 'Shounen'];

  if (isLoading && hindiAnime.length === 0) {
    return (
      <div className="hindi-yt-page">
        <div className="hindi-yt-banner-skeleton" />
        <div className="hindi-yt-chips-row">
          {[1, 2, 3, 4, 5].map(c => (
            <div key={c} className="hindi-chip-skeleton" />
          ))}
        </div>
        <div className="hindi-yt-grid">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="hindi-yt-card-skeleton">
              <div className="hindi-yt-card-thumb-skeleton" />
              <div className="hindi-yt-card-meta-skeleton">
                <div className="hindi-yt-line-skeleton w70" />
                <div className="hindi-yt-line-skeleton w50" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const filtered = activeFilter === 'All'
    ? hindiAnime
    : hindiAnime.filter(a => a.genres?.some(g => g.toLowerCase() === activeFilter.toLowerCase()));

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'rating') return (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0);
    return (b.popularity || 0) - (a.popularity || 0);
  });

  const topPick = hindiAnime[0];

  return (
    <div className="hindi-yt-page">
      {/* Featured Channel Banner */}
      {topPick && (
        <div
          className="hindi-yt-banner"
          style={{ backgroundImage: `url(${topPick.bannerImage || topPick.coverImage})` }}
        >
          <div className="hindi-yt-banner-overlay" />
          <div className="hindi-yt-banner-content">
            <div className="hindi-yt-channel-info">
              <div className="hindi-yt-channel-avatar">
                <span>🇮🇳</span>
              </div>
              <div className="hindi-yt-channel-text">
                <div className="hindi-yt-channel-name">Hindi Dubbed Anime</div>
                <div className="hindi-yt-channel-sub">
                  <span className="hindi-yt-live-dot" />
                  <span>{hindiAnime.length} series available</span>
                  <span className="hindi-yt-badge">Hindi Audio</span>
                </div>
              </div>
            </div>

            <button
              className="hindi-yt-play-btn"
              onClick={() => onStartWatching(topPick, 1)}
            >
              <Play size={18} fill="currentColor" /> Watch {topPick.title}
            </button>
          </div>
        </div>
      )}

      {/* Control bar: genre chips + sort dropdown */}
      <div className="hindi-yt-controls">
        <div className="hindi-yt-chips-row">
          {GENRES.map(f => (
            <button
              key={f}
              className={`hindi-yt-chip ${activeFilter === f ? 'active' : ''}`}
              onClick={() => setActiveFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>

        <select
          className="hindi-yt-sort"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
        >
          <option value="popular">Most Popular</option>
          <option value="rating">Top Rated</option>
        </select>
      </div>

      {/* Grid count summary */}
      <div className="hindi-yt-count">
        {filtered.length} Hindi dubbed {activeFilter !== 'All' ? activeFilter : ''} series
        {isLoading && <span className="hindi-yt-loading-badge"><Sparkles size={12} /> Loading more</span>}
      </div>

      {/* Grid */}
      {sorted.length === 0 ? (
        <div className="hindi-yt-empty">
          <p>No Hindi dubbed anime found for <strong>{activeFilter}</strong></p>
          <button className="hindi-yt-chip active" onClick={() => setActiveFilter('All')}>Show All</button>
        </div>
      ) : (
        <div className="hindi-yt-grid">
          {sorted.map(anime => (
            <HindiYTCard
              key={anime.id}
              anime={anime}
              onPlay={() => onStartWatching(anime, 1)}
              onInfo={() => onAnimeClick(anime.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
