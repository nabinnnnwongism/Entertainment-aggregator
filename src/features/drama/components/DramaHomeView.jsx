import React from 'react';
import { Play, Sparkles, Flame, Tv, Trophy, History } from 'lucide-react';
import DramaCard from './DramaCard';
import DramaRow from './DramaRow';
import { CategorySkeleton, InlineLoader } from '../../../App';

export default function DramaHomeView({
  data,
  error,
  isLoading,
  searchQuery,
  searchResults,
  searchLoading,
  onSearch,
  onDramaClick
}) {
  const featured = data?.show?.[0];

  return (
    <div className="netflix-home drama-home" style={{ paddingTop: '5rem' }}>
      {searchQuery.trim() ? (
        <div className="container drama-search-results" style={{ marginTop: '2rem' }}>
          <div className="hv-section-header">
            <h2 className="hv-section-title">
              <Sparkles className="hv-icon" size={20} style={{ color: '#eab308' }} /> Results for "{searchQuery}"
            </h2>
            <span className="hv-section-line" />
          </div>
          {searchLoading ? (
            <div className="drama-loading" style={{ minHeight: '30vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <InlineLoader />
            </div>
          ) : searchResults.length ? (
            <div className="netflix-slider" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gridAutoFlow: 'initial', gap: '1.5rem' }}>
              {searchResults.map(d => <DramaCard key={d.id} drama={d} onClick={() => onDramaClick(d)} />)}
            </div>
          ) : (
            <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '3rem 0' }}>No dramas found.</p>
          )}
        </div>
      ) : isLoading ? (
        <CategorySkeleton />
      ) : !data || !Array.isArray(data.korean) ? (
        <div style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1.2rem' }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem', textAlign: 'center', maxWidth: '640px' }}>
            {error || 'Could not load drama catalog. Check that the backend is online.'}
          </p>
          <button
            className="btn btn-primary"
            onClick={() => window.location.reload()}
          >
            Retry
          </button>
        </div>
      ) : (
        <>
          {/* Cinematic Drama Hero */}
          {featured && (
            <div
              className="hero netflix-hero drama-hero"
              style={{ backgroundImage: `url(${featured.thumbnail})` }}
            >
              <div className="hero-overlay" />
              <div className="hero-scanline" />
              <div className="container hero-shell">
                <div className="hero-content">
                  <div className="hero-eyebrow">
                    <span className="hero-eyebrow-badge" style={{ background: '#3b82f6' }}>D</span>
                    <span className="hero-eyebrow-text">Drama</span>
                    <span className="hero-eyebrow-dot">•</span>
                    <span className="hero-live-tag" style={{ background: 'rgba(59, 130, 246, 0.15)', borderColor: 'rgba(59, 130, 246, 0.5)', color: '#60a5fa' }}>Popular</span>
                  </div>

                  <h1 className="hero-title">{featured.title}</h1>

                  <div className="hero-meta">
                    <span className="top-ten-badge" style={{ background: '#3b82f6' }}>TRENDING</span>
                    <span className="hero-rank">#1 in Asian Shows Today</span>
                    {featured.episodesCount && (
                      <span className="hero-meta-tag">{featured.episodesCount} Episodes</span>
                    )}
                  </div>

                  <div className="btn-group">
                    <button className="btn btn-primary hero-btn-play" onClick={() => onDramaClick(featured)}>
                      <Play size={20} fill="currentColor" /> Play Now
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="netflix-rows">
            <DramaRow
              title="Featured"
              icon={<Sparkles className="hv-icon" size={20} style={{ color: '#eab308' }} />}
              dramas={data?.show || []}
              onDramaClick={onDramaClick}
            />
            <DramaRow
              title="Most Popular Korean Dramas"
              icon={<Flame className="hv-icon" size={20} style={{ color: '#f97316' }} />}
              dramas={data?.korean || []}
              onDramaClick={onDramaClick}
            />
            <DramaRow
              title="Most Popular Chinese Dramas"
              icon={<Tv className="hv-icon" size={20} style={{ color: '#3b82f6' }} />}
              dramas={data?.chinese || []}
              onDramaClick={onDramaClick}
            />
            <DramaRow
              title="Top Rated"
              icon={<Trophy className="hv-icon" size={20} style={{ color: 'var(--accent-primary)' }} />}
              dramas={data?.topRating || []}
              onDramaClick={onDramaClick}
            />
            <DramaRow
              title="Recently Updated"
              icon={<History className="hv-icon" size={20} style={{ color: '#06b6d4' }} />}
              dramas={data?.lastUpdate || []}
              onDramaClick={onDramaClick}
            />
          </div>
        </>
      )}
    </div>
  );
}
