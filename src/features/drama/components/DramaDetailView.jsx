import React, { useState } from 'react';
import { Play } from 'lucide-react';
import { InlineLoader } from '../../../App';

export default function DramaDetailView({ drama, onBack, onWatchEpisode }) {
  const episodes = Array.isArray(drama?.episodes) ? drama.episodes : [];
  const [showAll, setShowAll] = useState(false);
  const displayedEps = showAll ? episodes : episodes.slice(0, 24);

  return (
    <div className="drama-detail">
      {/* Hero */}
      <div className="drama-detail-hero" style={{ backgroundImage: `url(${drama.thumbnail})` }}>
        <div className="drama-hero-overlay" />
        <div className="drama-detail-hero-content">
          <button className="drama-back-btn" onClick={onBack}>← Back</button>
          <h1 className="drama-detail-title">{drama.title}</h1>
          {drama.releaseDate && (
            <span className="drama-detail-meta">
              {new Date(drama.releaseDate).getFullYear()} • {drama.country} • {drama.status}
            </span>
          )}
          {episodes.length > 0 && (
            <button
              className="btn btn-primary"
              onClick={() => onWatchEpisode(drama, episodes[episodes.length - 1])}
            >
              <Play size={20} fill="currentColor" /> Episode 1
            </button>
          )}
        </div>
      </div>

      <div className="drama-detail-body container">
        {drama.description && (
          <div className="drama-detail-desc">
            <h3>Synopsis</h3>
            <p>{drama.description}</p>
          </div>
        )}

        <div className="drama-episodes-section">
          <h3 className="drama-episodes-heading">
            Episodes <span className="drama-ep-count">({episodes.length})</span>
          </h3>
          {episodes.length === 0 ? (
            <div className="drama-loading"><InlineLoader /></div>
          ) : (
            <>
              <div className="drama-episodes-grid">
                {displayedEps.map(ep => (
                  <button
                    key={ep.id}
                    className="drama-ep-btn"
                    onClick={() => onWatchEpisode(drama, ep)}
                  >
                    <span className="drama-ep-num">Ep {ep.number}</span>
                    {ep.sub > 0 && <span className="drama-ep-sub-badge">SUB</span>}
                  </button>
                ))}
              </div>
              {episodes.length > 24 && (
                <button className="drama-show-more-btn" onClick={() => setShowAll(p => !p)}>
                  {showAll ? 'Show Less' : `Show All ${episodes.length} Episodes`}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
