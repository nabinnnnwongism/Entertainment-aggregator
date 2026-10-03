import React, { useState } from 'react';
import { Play, Star } from 'lucide-react';
import { hasHindiDubAvailable } from '../../../mockData';

export default function AnimeCard({ anime, onClick }) {
  const { title, coverImage, bannerImage, rating, type, genres, hasHindiDub, japaneseTitle, episodes, totalEpisodes } = anime;
  const isHindi = hasHindiDub || hasHindiDubAvailable(title, japaneseTitle);
  const displayImage = bannerImage || coverImage;
  const [imgErr, setImgErr] = useState(false);

  const genreText = genres && genres.length > 0
    ? genres.slice(0, 2).join(' · ')
    : (type || 'Anime');

  const epCount = totalEpisodes || (Array.isArray(episodes) ? episodes.length : null);

  return (
    <button className="netflix-tile drama-tile anime-bento-tile" onClick={onClick}>
      <span className="tile-art">
        {!imgErr ? (
          <img
            src={displayImage}
            alt={title}
            loading="lazy"
            onError={() => setImgErr(true)}
          />
        ) : (
          <div className="drama-card-placeholder">
            <span>{title?.[0] || '?'}</span>
          </div>
        )}
        <span className="tile-logo-mark">EN</span>

        {isHindi && (
          <span className="bento-hindi-badge" style={{ position: 'absolute', top: '0.5rem', right: '0.5rem', zIndex: 4 }}>
            Hindi
          </span>
        )}

        <span className="tile-hover-overlay">
          <span className="tile-hover-play">
            <Play size={22} fill="white" style={{ color: 'white' }} />
          </span>
        </span>

        {rating && rating !== 'N/A' ? (
          <span className="tile-rating-badge" style={{ color: '#fbbf24' }}>
            ★ {rating}
          </span>
        ) : epCount ? (
          <span className="tile-rating-badge" style={{ color: '#fff' }}>
            {epCount} Ep
          </span>
        ) : null}
      </span>
      <span className="tile-info">
        <strong style={{ fontSize: '0.92rem', fontWeight: '700', color: '#fff' }}>{title}</strong>
        <small style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem' }}>{genreText}</small>
      </span>
    </button>
  );
}
