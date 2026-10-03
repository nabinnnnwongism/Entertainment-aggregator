import React from 'react';
import { Play, Bookmark, ThumbsUp, Share2, Star } from 'lucide-react';
import { apiUrl } from '../../../runtimeConfig';
import { InlineLoader } from '../../../App';
import MovieCard from './MovieCard';

function cleanMovieDisplayTitle(raw) {
  if (!raw) return 'Untitled Movie';
  const cleaned = raw
    .replace(/\bWatch\s+Online\b/gi, '')
    .replace(/\bFull\s+Movie\b/gi, '')
    .replace(/\bFull\s+Web\s+Series\b/gi, '')
    .replace(/\bDownload\s+Now\b/gi, '')
    .replace(/\(\d{4}\)/g, '').replace(/\b(19|20)\d{2}\b/g, '')
    .replace(/\[.*?\]/g, '')
    .replace(/E\d+[-T]\d+/gi, '').replace(/\bE\d+\b/gi, '').replace(/\bS\d+\b/gi, '')
    .replace(/\bPart\s*\d+\b/gi, '').replace(/\bVolume\s*\d+\b/gi, '').replace(/\bVol\.?\s*\d+\b/gi, '')
    .replace(/\bEpisode\s*\d+\b/gi, '').replace(/\bSeason\s*\d+\b/gi, '').replace(/\bComplete\b/gi, '')
    .replace(/\b(Hindi Dubbed|Hindi Dub|Hindi|Bengali|Malayalam|Tamil|Telugu|Kannada|Marathi|Punjabi|Gujarati|English|Bangladeshi|South Indian|Korean|Japanese|Chinese|Thai)\b/gi, '')
    .replace(/\b(HDRip|BluRay|WEB-DL|WEBRip|UNCUT|HDTS|HDTC|HDCam|HDCAM|CAMRip|CAM|DVDSCR|DVDScr|SCR|TS|DVDRIP|DVDRip|HD|4K|1080p|720p|480p|360p|Extended|Directors.?Cut)\b/gi, '')
    .replace(/\b(Hollywood|Bollywood|Tollywood|Mollywood|Kollywood|Pollywood)\b/gi, '')
    .replace(/\b(Short Film|App Video|Webseries|Web Series|OTT|Originals|Exclusive)\b/gi, '')
    .replace(/\b(Sigmaseries|Sigma|Cukkuboo|Hulchul|HulChul|Hoichoi|Moodx|Kooku|Ullu|ALTBalaji|PrimeShots|Rabbit|RabbitMovies|Voovi|Chikooflix|Atrangii|NewSensations|LookEnt|Nuefliks|GupChup|Hotshots|Flizmovies|Mastram|DigiMoviePlex|Balloons|Besharams|Cinemadosti|Netflix|Amazon|Hotstar|SonyLiv|ZEE5|Voot|MXPlayer|JioCinema|Aha|Lionsgate|Disney)\b/gi, '')
    .replace(/\bMovie\b/gi, '').replace(/\bSeries\b/gi, '').replace(/\bFilm\b/gi, '')
    .replace(/[-_:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || raw;
}

function MovieDetailView({ movie, isLoading, onBack, onWatch }) {
  const [relatedMovies, setRelatedMovies] = React.useState([]);
  const [relatedLoading, setRelatedLoading] = React.useState(false);
  const [inWatchlist, setInWatchlist] = React.useState(false);

  const displayTitle = cleanMovieDisplayTitle(movie.title);
  const yearMatch = (movie.title || '').match(/\b(19|20)\d{2}\b/);
  const releaseYear = movie.releaseDate ? String(movie.releaseDate).split('-')[0] : (yearMatch ? yearMatch[0] : '2026');
  const heroImage = movie.bannerImage || movie.coverImage || movie.thumbnail || movie.poster || '';

  // Fetch "More Like This" recommendations
  React.useEffect(() => {
    setRelatedLoading(true);
    fetch(apiUrl('/api/desicinemas/catalog?category=movies&page=1&limit=12'))
      .then(r => r.json())
      .then(res => {
        const items = Array.isArray(res.movies) ? res.movies.filter(m => m.id !== movie.id) : [];
        setRelatedMovies(items.slice(0, 10));
        setRelatedLoading(false);
      })
      .catch(() => setRelatedLoading(false));
  }, [movie.id]);

  return (
    <div style={{
      minHeight: '100vh', background: '#0a0a0a', color: '#fff',
      fontFamily: '"Inter","Roboto",sans-serif'
    }}>
      {/* Full-bleed 75vh Billboard Hero */}
      <div style={{
        position: 'relative', minHeight: '72vh', width: '100%',
        backgroundImage: `url(${heroImage})`,
        backgroundSize: 'cover', backgroundPosition: 'center top',
        backgroundRepeat: 'no-repeat'
      }}>
        {/* Triple Netflix Scrim Gradient */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to right, #0a0a0a 0%, rgba(10,10,10,0.8) 35%, rgba(10,10,10,0.2) 75%, transparent 100%), linear-gradient(to top, #0a0a0a 0%, rgba(10,10,10,0.6) 45%, transparent 100%)'
        }} />

        {/* Floating Back Button */}
        <div style={{ position: 'absolute', top: '1.5rem', left: 'clamp(1rem, 4vw, 3rem)', zIndex: 10 }}>
          <button onClick={onBack} style={{
            background: 'rgba(20,20,20,0.8)', border: '1px solid rgba(255,255,255,0.2)',
            color: '#fff', padding: '0.5rem 1.2rem', borderRadius: '30px',
            cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
            display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
            backdropFilter: 'blur(10px)', boxShadow: '0 4px 16px rgba(0,0,0,0.6)'
          }}>← Back to Movies</button>
        </div>

        {/* Billboard Hero Content */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          padding: '4rem clamp(1rem, 4vw, 3rem) 3rem', maxWidth: '850px'
        }}>
          {/* Quality badge & Release year */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.8rem', flexWrap: 'wrap' }}>
            <span style={{
              background: '#e50914', color: '#fff', fontSize: '0.72rem', fontWeight: 800,
              padding: '0.2rem 0.6rem', borderRadius: '3px', letterSpacing: '0.5px'
            }}>CINEMA HD</span>
            <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', fontWeight: 600 }}>{releaseYear}</span>
            {movie.rating && (
              <span style={{ color: '#facc15', fontSize: '0.85rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                <Star size={14} fill="#facc15" /> {movie.rating}
              </span>
            )}
            {movie.duration && (
              <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem' }}>{movie.duration}</span>
            )}
          </div>

          <h1 style={{
            fontSize: 'clamp(2rem, 5vw, 3.2rem)', fontWeight: 800, margin: '0 0 1rem',
            lineHeight: 1.15, textShadow: '0 2px 20px rgba(0,0,0,0.9)'
          }}>{displayTitle}</h1>

          {movie.description && (
            <p style={{
              color: 'rgba(255,255,255,0.75)', fontSize: '0.95rem', lineHeight: 1.6,
              margin: '0 0 1.8rem', maxWidth: '600px',
              textShadow: '0 1px 4px rgba(0,0,0,0.8)'
            }}>
              {movie.description.substring(0, 200)}{movie.description.length > 200 ? '…' : ''}
            </p>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => onWatch(movie)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.6rem',
                background: '#e50914', color: '#fff', padding: '0.85rem 2.4rem',
                borderRadius: '6px', border: 'none', fontSize: '1.05rem', fontWeight: 700,
                cursor: 'pointer', boxShadow: '0 6px 24px rgba(229,9,20,0.5)',
                transition: 'all 0.18s'
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#f6121d'}
              onMouseLeave={e => e.currentTarget.style.background = '#e50914'}
            >
              <Play size={20} fill="#fff" /> Watch Now
            </button>

            <button
              onClick={() => setInWatchlist(v => !v)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                background: inWatchlist ? 'rgba(229,9,20,0.2)' : 'rgba(255,255,255,0.12)',
                color: inWatchlist ? '#e50914' : '#fff',
                border: `1px solid ${inWatchlist ? '#e50914' : 'rgba(255,255,255,0.2)'}`,
                padding: '0.85rem 1.6rem', borderRadius: '6px', fontSize: '0.95rem', fontWeight: 600,
                cursor: 'pointer', backdropFilter: 'blur(8px)', transition: 'all 0.18s'
              }}
            >
              <Bookmark size={18} fill={inWatchlist ? '#e50914' : 'none'} />
              {inWatchlist ? 'In Watchlist' : 'Watchlist'}
            </button>
          </div>
        </div>
      </div>

      {/* Main Details Body */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem clamp(1rem, 4vw, 3rem) 5rem' }}>
        {/* Full Overview */}
        {movie.description && (
          <div style={{ marginBottom: '3rem' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: '0 0 0.8rem', color: '#fff' }}>Overview</h3>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.95rem', lineHeight: 1.7, margin: 0, maxWidth: '800px' }}>
              {movie.description}
            </p>
          </div>
        )}

        {/* More Like This */}
        {relatedMovies.length > 0 && (
          <div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: '0 0 1.2rem', color: '#fff' }}>
              More Like This
            </h3>
            {relatedLoading ? (
              <div style={{ padding: '2rem 0', display: 'flex', justifyContent: 'center' }}>
                <InlineLoader />
              </div>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                gap: '1.2rem 1rem'
              }}>
                {relatedMovies.map((m, idx) => (
                  <MovieCard key={m.id + '-' + idx} movie={m} onClick={() => onWatch(m)} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default MovieDetailView;
