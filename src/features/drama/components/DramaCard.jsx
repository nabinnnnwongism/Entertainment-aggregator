import React, { useState } from 'react';
import { Play } from 'lucide-react';

export default function DramaCard({ drama, onClick }) {
  const [imgErr, setImgErr] = useState(false);

  return (
    <button className="netflix-tile drama-tile" onClick={onClick}>
      <span className="tile-art">
        {!imgErr ? (
          <img
            src={drama.thumbnail}
            alt={drama.title}
            loading="lazy"
            onError={() => setImgErr(true)}
          />
        ) : (
          <div className="drama-card-placeholder">
            <span>{drama.title?.[0] || '?'}</span>
          </div>
        )}
        <span className="tile-logo-mark">EN</span>
        <span className="tile-hover-overlay">
          <span className="tile-hover-play">
            <Play size={20} fill="white" style={{ color: 'white' }} />
          </span>
        </span>
        {drama.episodesCount && (
          <span className="tile-rating-badge" style={{ color: '#fff' }}>
            {drama.episodesCount} Ep
          </span>
        )}
      </span>
      <span className="tile-info">
        <strong>{drama.title}</strong>
        <small>{drama.country || 'Drama'} • {drama.status || 'Ongoing'}</small>
      </span>
    </button>
  );
}
