import React, { useState } from 'react';
import { InlineLoader } from '../../../App';

function ManhwaDetailView({ series, isLoading, onBack, onReadChapter }) {
  const chapters = Array.isArray(series?.chapters) ? series.chapters : [];
  const [showAll, setShowAll] = React.useState(false);
  const displayed = showAll ? chapters : chapters.slice(-50).reverse();

  return (
    <div className="manhwa-detail">
      {/* Hero */}
      <div
        className="manhwa-detail-hero"
        style={{ backgroundImage: `url(${series.cover})` }}
      >
        <div className="manhwa-hero-overlay" />
        <div className="manhwa-detail-hero-content">
          <button className="manhwa-back-btn" onClick={onBack}>Â Ã‚Â </button>
          <div className="manhwa-detail-meta-row">
            <img src={series.cover} alt={series.title} className="manhwa-detail-cover" />
            <div className="manhwa-detail-info">
              <h1 className="manhwa-detail-title">{series.title}</h1>
              {series.genres?.length > 0 && (
                <div className="manhwa-genres">
                  {series.genres.slice(0, 5).map(g => (
                    <span key={g} className="manhwa-genre-tag">{g}</span>
                  ))}
                </div>
              )}
              {chapters.length > 0 && (
                <button
                  className="btn btn-primary"
                  onClick={() => onReadChapter(series, chapters[0])}
                  style={{ marginTop: '1rem' }}
                >
                  Read Chapter 1
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="manhwa-detail-body container">
        {series.description && (
          <div className="manhwa-detail-desc">
            <h3>Synopsis</h3>
            <p>{series.description}</p>
          </div>
        )}

        <div className="manhwa-chapters-section">
          <h3 className="manhwa-chapters-heading">
            Chapters <span className="manhwa-ch-count">({chapters.length})</span>
          </h3>

          {isLoading ? (
            <div className="manhwa-loading"><InlineLoader /></div>
          ) : chapters.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)' }}>No chapters available.</p>
          ) : (
            <>
              <div className="manhwa-chapters-list">
                {displayed.map(ch => {
                  return (
                    <button
                      key={ch.slug}
                      className="manhwa-chapter-row"
                      onClick={() => onReadChapter(series, ch)}
                    >
                      <div className="manhwa-chapter-thumb-container">
                        {ch.thumbnail ? (
                          <img
                            src={ch.thumbnail}
                            alt={`Chapter ${ch.number}`}
                            className="manhwa-chapter-thumb"
                            loading="lazy"
                          />
                        ) : (
                          <div className="manhwa-chapter-thumb-placeholder"></div>
                        )}
                      </div>
                      <div className="manhwa-chapter-meta">
                        <div className="manhwa-chapter-name-row">
                          <span className="manhwa-chapter-label">Chapter {ch.number}</span>
                          {ch.title && <span className="manhwa-chapter-sub">&middot; {ch.title}</span>}
                        </div>
                        {ch.date && <span className="manhwa-chapter-date">{ch.date}</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
              {chapters.length > 50 && (
                <button
                  className="manhwa-show-more-btn"
                  onClick={() => setShowAll(p => !p)}
                >
                  {showAll ? 'Show Recent Only' : `Show All ${chapters.length} Chapters`}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default ManhwaDetailView;
