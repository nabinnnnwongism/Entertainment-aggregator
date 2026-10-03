import React from 'react';
import ManhwaCard from './ManhwaCard';
import ManhwaRow from './ManhwaRow';
import { CategorySkeleton, InlineLoader } from '../../../App';

function ManhwaHomeView({ data, error, isLoading, searchQuery, searchResults, searchLoading, onSearch, onSeriesClick }) {
  return (
    <div className="manhwa-home" style={{ paddingTop: '5rem' }}>

      {searchQuery.trim() ? (
        <div className="container manhwa-search-results">
          <h2 className="manhwa-row-title">Results for "{searchQuery}"</h2>
          {searchLoading ? (
            <div className="manhwa-loading"><InlineLoader /></div>
          ) : searchResults.length ? (
            <div className="manhwa-grid">
              {searchResults.map((s, i) => <ManhwaCard key={s.slug + i} series={s} onClick={() => onSeriesClick(s)} />)}
            </div>
          ) : (
            <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '3rem 0' }}>No results found.</p>
          )}
        </div>
      ) : isLoading ? (
        <CategorySkeleton />
      ) : !data ? (
        <div style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1.2rem' }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem', textAlign: 'center', maxWidth: '640px' }}>
            {error || 'Could not load manhwa catalog.'}
          </p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>Retry</button>
        </div>
      ) : (
        <>
          {/* Hero banner using first popular series */}
          {data.popular?.[0] && (
            <div
              className="manhwa-hero"
              style={{ backgroundImage: `url(${data.popular[0].cover})` }}
            >
              <div className="manhwa-hero-overlay" />
              <div className="manhwa-hero-content">
                <div className="manhwa-hero-badge">Featured Manhwa</div>
                <h1 className="manhwa-hero-title">{data.popular[0].title}</h1>
                <button
                  className="btn btn-primary manhwa-hero-btn"
                  onClick={() => onSeriesClick(data.popular[0])}
                >
                  Start Reading
                </button>
              </div>
            </div>
          )}

          <div className="manhwa-rows-container">
            <ManhwaRow title="Popular Now" series={data.popular} onSeriesClick={onSeriesClick} />
            <ManhwaRow title="Latest Updates" series={data.latest} onSeriesClick={onSeriesClick} />
          </div>
        </>
      )}
    </div>
  );
}

export default ManhwaHomeView;
