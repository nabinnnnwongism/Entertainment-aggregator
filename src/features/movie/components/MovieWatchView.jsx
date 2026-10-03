import React from 'react';
import { Play, AlertCircle } from 'lucide-react';
import { apiUrl } from '../../../runtimeConfig';
import VideoPlayer from '../../../components/VideoPlayer';
import MoviePlexPlayerView from './MoviePlexPlayerView';

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

function MovieWatchView({ movie, onBack, onProgress }) {
  const isDesiCinemasOrMp = !!(movie.dcSlug || movie.source === 'desicinemas' || movie.movieplexSlug || movie.source === 'movieplex' || (movie.slug && !movie.netmirrorId && !movie.imdbId));

  // All hooks must be declared unconditionally (Rules of Hooks)
  const [movieData, setMovieData] = React.useState(movie);
  const [activeServerId, setActiveServerId] = React.useState('vidlink-pro');
  const [resolving, setResolving] = React.useState(false);

  // If it's a DesiCinemas / MoviePlex movie, delegate to MoviePlexPlayerView.
  if (isDesiCinemasOrMp) {
    return <MoviePlexPlayerView movie={movie} onBack={onBack} />;
  }

  // For NetMirror items: search TMDB by title to get a TMDB ID for embed servers
  // For regular TMDB items: fetch full info to get imdbId
  React.useEffect(() => {
    if (movie.netmirrorId && movie.title) {
      setResolving(true);
      fetch(`/api/movies/search?q=${encodeURIComponent(movie.title)}`)
        .then(r => r.json())
        .then(results => {
          if (results?.length) {
            const best = results.find(r => r.title?.toLowerCase() === movie.title?.toLowerCase()) || results[0];
            setMovieData(prev => ({ ...prev, id: best.id, tmdbId: best.id, imdbId: best.imdbId }));
          }
        })
        .catch(() => {})
        .finally(() => setResolving(false));
    } else if (!movie.imdbId && movie.id && !movie.netmirrorId) {
      fetch(`/api/movies/info/${movie.id}`)
        .then(r => r.json())
        .then(data => { if (data?.imdbId) setMovieData(prev => ({ ...prev, imdbId: data.imdbId })); })
        .catch(() => {});
    }
  }, [movie.id, movie.title]);

  const tmdbId = movieData.tmdbId || movieData.id;
  const imdbId = movieData.imdbId;
  const activeId = imdbId || tmdbId;

  const iframeServers = [
    { id: 'vidlink-pro', name: 'Server 1', tag: 'VidLink Pro', getUrl: () => `https://vidlink.pro/movie/${tmdbId}` },
    { id: 'vidsrc-cc', name: 'Server 2', tag: 'VidSrc HD', getUrl: () => `https://vidsrc.cc/v2/embed/movie/${tmdbId}` },
    { id: 'vidsrc-xyz', name: 'Server 3', tag: 'VidSrc XYZ', getUrl: () => `https://vidsrc.xyz/embed/movie/${activeId}` },
    { id: '2embed', name: 'Server 4', tag: '2Embed', getUrl: () => `https://www.2embed.cc/embed/${tmdbId}` },
    { id: 'smashy', name: 'Server 5', tag: 'SmashyStream', getUrl: () => `https://player.smashystream.com/movie/${tmdbId}` },
    { id: 'multiembed', name: 'Server 6', tag: 'MultiEmbed', getUrl: () => `https://multiembed.mov/?video_id=${tmdbId}&tmdb=1` }
  ];

  // Track progress
  React.useEffect(() => {
    const timer = setInterval(() => {
      if (onProgress) onProgress({ progress_seconds: 100, duration_seconds: 100 });
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  const currentServer = iframeServers.find(s => s.id === activeServerId) || iframeServers[0];

  return (
    <div className="nm-watch" style={{
      minHeight: '100vh',
      background: '#000',
      color: '#fff',
      fontFamily: '"Roboto","HelveticaNeue-Light",sans-serif'
    }}>
      {/* NetMirror-style top bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        padding: '1rem 1.5rem',
        background: 'linear-gradient(#000 20%, #0000001c 86%, #0000 94%)',
        position: 'sticky',
        top: 0,
        zIndex: 10
      }}>
        <button
          onClick={onBack}
          style={{
            background: 'none',
            border: 'none',
            color: '#fff',
            fontSize: '1.5rem',
            cursor: 'pointer',
            padding: '0.4rem',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center'
          }}
          aria-label="Back"
        >
          ←
        </button>
        <span style={{ color: '#06b900', fontWeight: 700, fontSize: '1.3rem' }}>NET MIRROR</span>
      </div>

      {/* Player area */}
      <div style={{
        position: 'relative',
        width: '100%',
        maxWidth: '900px',
        margin: '0 auto',
        aspectRatio: '16/9',
        background: '#000',
        boxShadow: '0 0 40px rgba(0,0,0,0.8)'
      }}>
        <iframe
          key={activeServerId + '-' + (imdbId || 'noimdb')}
          src={currentServer.getUrl()}
          title={movie.title}
          style={{ width: '100%', height: '100%', border: 'none' }}
          allowFullScreen
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          sandbox="allow-scripts allow-same-origin allow-presentation allow-encrypted-media allow-forms"
          referrerPolicy="no-referrer"
        />
      </div>

      {/* Server selector */}
      <div style={{
        maxWidth: '900px',
        margin: '1.5rem auto',
        padding: '0 1rem'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          marginBottom: '0.75rem',
          flexWrap: 'wrap'
        }}>
          <span style={{
            fontSize: '0.75rem',
            color: 'rgba(255,255,255,0.5)',
            textTransform: 'uppercase',
            letterSpacing: '1px',
            marginRight: '0.5rem'
          }}>Servers</span>
          {iframeServers.map(s => (
            <button
              key={s.id}
              onClick={() => setActiveServerId(s.id)}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '4px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.85rem',
                fontWeight: 600,
                transition: 'all 0.2s',
                background: activeServerId === s.id ? '#06b900' : 'rgba(255,255,255,0.1)',
                color: activeServerId === s.id ? '#000' : '#fff'
              }}
            >
              {s.name}
            </button>
          ))}
        </div>

        {/* Movie info block */}
        <div style={{
          marginTop: '1.5rem',
          padding: '1.5rem',
          background: 'rgba(255,255,255,0.05)',
          borderRadius: '8px',
          borderLeft: '3px solid #06b900'
        }}>
          <h1 style={{ margin: '0 0 0.5rem', fontSize: '1.8rem', fontWeight: 700 }}>
            {movie.title}
          </h1>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.9rem', color: 'rgba(255,255,255,0.7)', marginBottom: '1rem' }}>
            {movie.releaseDate && <span>{String(movie.releaseDate).split('-')[0]}</span>}
            {movie.rating && <span style={{ color: '#06b900' }}>★ {movie.rating}</span>}
            {movie.runtime && <span>{movie.runtime} mins</span>}
            <span style={{ color: '#06b900', fontWeight: 600 }}>HD Available</span>
          </div>
          {movie.description && (
            <p style={{ margin: 0, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6, fontSize: '0.9rem' }}>
              {movie.description}
            </p>
          )}
          {movie.genres && movie.genres.length > 0 && (
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '1rem' }}>
              {movie.genres.map(g => (
                <span key={g} style={{
                  padding: '0.25rem 0.75rem',
                  background: 'rgba(6,185,0,0.15)',
                  border: '1px solid rgba(6,185,0,0.3)',
                  borderRadius: '20px',
                  fontSize: '0.75rem',
                  color: '#06b900'
                }}>{g}</span>
              ))}
            </div>
          )}
        </div>

        {/* Currently watching tag */}
        <div style={{
          marginTop: '1rem',
          padding: '0.75rem 1rem',
          background: 'rgba(6,185,0,0.08)',
          borderRadius: '6px',
          fontSize: '0.8rem',
          color: 'rgba(255,255,255,0.5)',
          textAlign: 'center'
        }}>
          You're watching <span style={{ color: '#06b900', fontWeight: 600 }}>{movie.title}</span> · Source: {currentServer.tag}
          <br />
          If the video doesn't load, try another server above.
        </div>
      </div>
    </div>
  );
}

export default MovieWatchView;
