import React from 'react';
import { apiUrl } from '../../../runtimeConfig';

function MovieCard({ movie, onClick }) {
  const [imgSrc, setImgSrc] = React.useState(movie.coverImage || movie.thumbnail || movie.poster || null);
  const [imgErr, setImgErr] = React.useState(false);
  const [fetchedPoster, setFetchedPoster] = React.useState(null);

  // Sync src when parent updates the movie object
  React.useEffect(() => {
    const src = movie.coverImage || movie.thumbnail || movie.poster || null;
    if (src && src !== imgSrc) { setImgSrc(src); setImgErr(false); }
  }, [movie.coverImage, movie.thumbnail, movie.poster]);

  // If img failed or no poster at all, try fetching from backend on-demand
  const handleImgErr = React.useCallback(() => {
    setImgErr(true);
    const slug = movie.dcSlug || movie.movieplexSlug || movie.slug;
    if (slug && !fetchedPoster) {
      fetch(apiUrl('/api/desicinemas/post-info?slug=' + encodeURIComponent(slug)))
        .then(r => r.json())
        .then(d => {
          if (d.thumbnail) { setFetchedPoster(d.thumbnail); setImgErr(false); }
        })
        .catch(() => {});
    }
  }, [movie.dcSlug, movie.movieplexSlug, movie.slug, fetchedPoster]);

  const activeSrc = fetchedPoster || imgSrc;

  // Generate a stable vibrant gradient per title initial
  const GRADIENTS = [
    'linear-gradient(145deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
    'linear-gradient(145deg, #2d1b33 0%, #1a0a2e 50%, #6b21a8 100%)',
    'linear-gradient(145deg, #1e3a1e 0%, #14532d 50%, #166534 100%)',
    'linear-gradient(145deg, #1e1a0e 0%, #451a03 50%, #7c2d12 100%)',
    'linear-gradient(145deg, #0c1445 0%, #1e3a5f 50%, #1e40af 100%)',
    'linear-gradient(145deg, #3f0d0d 0%, #7f1d1d 50%, #991b1b 100%)',
    'linear-gradient(145deg, #1a1a1a 0%, #374151 50%, #111827 100%)',
    'linear-gradient(145deg, #0d2137 0%, #0e4f69 50%, #155e75 100%)',
  ];
  const gradientIdx = (movie.title?.charCodeAt(0) || 0) % GRADIENTS.length;
  const placeholder = GRADIENTS[gradientIdx];

  return (
    <button
      className="movie-tile"
      onClick={onClick}
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: 0,
        textAlign: 'left',
        width: '100%',
      }}
    >
      <span style={{
        display: 'block',
        position: 'relative',
        aspectRatio: '2/3',
        borderRadius: '6px',
        overflow: 'hidden',
        background: '#161618',
        transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.25s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'scale(1.08) translateY(-4px)';
        e.currentTarget.style.boxShadow = '0 14px 36px rgba(0,0,0,0.85)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'scale(1) translateY(0)';
        e.currentTarget.style.boxShadow = 'none';
      }}
      >
        {activeSrc && !imgErr ? (
          <img
            src={activeSrc}
            alt={movie.title}
            loading="lazy"
            onError={handleImgErr}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          /* Beautiful gradient placeholder — no more grey letter boxes */
          <div style={{
            width: '100%', height: '100%',
            background: placeholder,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            padding: '1rem', textAlign: 'center', position: 'relative', overflow: 'hidden'
          }}>
            {/* Decorative glow rings */}
            <div style={{
              position: 'absolute', width: '150px', height: '150px',
              borderRadius: '50%', border: '1px solid rgba(255,255,255,0.06)',
              top: '-30px', right: '-30px'
            }} />
            <div style={{
              position: 'absolute', width: '100px', height: '100px',
              borderRadius: '50%', border: '1px solid rgba(255,255,255,0.05)',
              bottom: '-20px', left: '-20px'
            }} />
            <span style={{
              fontSize: '2.8rem', fontWeight: 900,
              color: 'rgba(255,255,255,0.22)',
              letterSpacing: '-1px', lineHeight: 1,
              textTransform: 'uppercase', fontFamily: 'Inter, sans-serif',
              position: 'relative', zIndex: 1
            }}>
              {movie.title?.[0] || '?'}
            </span>
            <span style={{
              position: 'absolute', bottom: '10px',
              left: '8px', right: '8px',
              fontSize: '0.6rem', color: 'rgba(255,255,255,0.25)',
              fontWeight: 600, textAlign: 'center',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
            }}>{movie.title}</span>
          </div>
        )}
        {/* Hover overlay */}
        <span style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.3) 50%, transparent 100%)',
          opacity: 0, transition: 'opacity 0.22s ease',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '0.75rem'
        }}
        onMouseEnter={e => e.currentTarget.style.opacity = 1}
        onMouseLeave={e => e.currentTarget.style.opacity = 0}
        >
          <span style={{
            background: '#E50914', color: '#fff',
            padding: '0.4rem 1rem', borderRadius: '20px',
            fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.4px',
            display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
            boxShadow: '0 4px 12px rgba(229,9,20,0.4)'
          }}>▶ Play</span>
        </span>
        {/* Rating badge */}
        {movie.rating && (
          <span style={{
            position: 'absolute', top: '6px', right: '6px',
            background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)',
            color: '#facc15', padding: '2px 6px',
            borderRadius: '4px', fontSize: '0.68rem', fontWeight: 700
          }}>★ {movie.rating}</span>
        )}
      </span>
      {/* Title below card */}
      <span style={{ display: 'block', padding: '0.45rem 0.1rem 0' }}>
        <strong style={{
          display: 'block', color: '#ffffff', fontSize: '0.82rem',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          fontWeight: 500, lineHeight: 1.3
        }}>{movie.title}</strong>
        <small style={{ color: '#b3b3b3', fontSize: '0.7rem' }}>
          {movie.releaseDate ? String(movie.releaseDate).split('-')[0] : movie.type || 'Movie'}
        </small>
      </span>
    </button>
  );
}

export default MovieCard;
