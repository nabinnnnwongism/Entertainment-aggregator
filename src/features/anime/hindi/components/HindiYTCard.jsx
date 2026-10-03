import React, { useState } from 'react';
import { Play, Star } from 'lucide-react';
import { formatViews } from '../../../../mockData';

export default function HindiYTCard({ anime, onPlay, onInfo }) {
  const [hovered, setHovered] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);

  const thumb = anime.bannerImage || anime.coverImage || anime.thumbnail;
  const genre = anime.genres?.[0] || 'Anime';
  const epCount = anime.totalEpisodes || anime.episodesCount || 12;

  return (
    <div
      className={`hindi-yt-card ${hovered ? 'hovered' : ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Thumbnail Container */}
      <div className="hindi-yt-card-thumb" onClick={onInfo}>
        {!imgError ? (
          <img
            src={thumb}
            alt={anime.title}
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgError(true)}
            style={{ opacity: imgLoaded ? 1 : 0, transition: 'opacity 0.25s' }}
          />
        ) : (
          <div className="hindi-yt-card-thumb-fallback">
            <span>{anime.title}</span>
          </div>
        )}

        {/* EP badge */}
        <div className="hindi-yt-card-ep-badge">
          {epCount} EPS
        </div>

        {/* Hindi audio badge */}
        <div className="hindi-yt-card-audio-badge">🇮🇳 HINDI</div>

        {/* Hover overlay play button */}
        <div className="hindi-yt-card-hover-overlay">
          <button className="hindi-yt-card-play-circle" onClick={(e) => { e.stopPropagation(); onPlay(); }}>
            <Play size={22} fill="currentColor" />
          </button>
        </div>
      </div>

      {/* Meta section below thumbnail */}
      <div className="hindi-yt-card-meta">
        <div className="hindi-yt-card-avatar-dot">
          <span>🇮🇳</span>
        </div>
        <div className="hindi-yt-card-info">
          <div className="hindi-yt-card-title" title={anime.title} onClick={onInfo}>
            {anime.title}
          </div>
          <div className="hindi-yt-card-channel">{genre} • {anime.type || 'TV'}</div>
          <div className="hindi-yt-card-stats">
            <span className="hindi-yt-card-rating">
              <Star size={11} fill="currentColor" />
              {anime.rating || '8.5'}
            </span>
            <span>•</span>
            <span>{formatViews(anime.popularity)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
