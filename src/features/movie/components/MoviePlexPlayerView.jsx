import React from 'react';
import { Play, AlertCircle, ShieldCheck, ShieldAlert, RefreshCw } from 'lucide-react';
import { apiUrl } from '../../../runtimeConfig';
import VideoPlayer from '../../../components/VideoPlayer';
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

function MoviePlexPlayerView({ movie, onBack }) {
  const [streamData, setStreamData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [useFallback, setUseFallback] = React.useState(false);
  const [shieldActive, setShieldActive] = React.useState(false);
  const [postInfo, setPostInfo] = React.useState(null);
  const [moreMovies, setMoreMovies] = React.useState([]);

  const slug = movie.dcSlug || movie.movieplexSlug || movie.slug;
  const displayTitle = cleanMovieDisplayTitle(movie.title || postInfo?.title || '');

  React.useEffect(() => {
    if (!slug) return;
    fetch(apiUrl(`/api/desicinemas/post-info?slug=${encodeURIComponent(slug)}`))
      .then(r => r.json())
      .then(data => { setPostInfo(data); })
      .catch(() => {});
  }, [slug]);

  React.useEffect(() => {
    if (!slug) { setError('No slug provided'); setLoading(false); return; }
    setLoading(true); setError(null); setUseFallback(false);
    fetch(apiUrl(`/api/desicinemas/stream?slug=${encodeURIComponent(slug)}`))
      .then(r => r.json())
      .then(data => {
        setStreamData(data);
        setLoading(false);
        // If direct stream URL is not available, automatically use the external player
        if (!data.streamUrl && data.fallbackIframe) {
          setUseFallback(true);
        }
      })
      .catch(err => { setError(err.message || 'Failed to load stream'); setLoading(false); });
  }, [slug]);

  // Fetch recommendations for below player
  React.useEffect(() => {
    fetch(apiUrl('/api/desicinemas/catalog?category=movies&page=1&limit=12'))
      .then(r => r.json())
      .then(res => {
        if (Array.isArray(res.movies)) setMoreMovies(res.movies.slice(0, 10));
      })
      .catch(() => {});
  }, []);

  const thumbnail = postInfo?.thumbnail || movie.thumbnail || movie.coverImage || '';
  const isHLS = (streamData?.isHls || streamData?.directHls || streamData?.source === 'desicinemas' || streamData?.source === 'lulustream') && !!streamData?.streamUrl;
  const extractionFailed = !loading && streamData && !streamData.streamUrl && !streamData.fallbackIframe;

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: '#fff', fontFamily: '"Inter","Roboto",sans-serif' }}>

      {/* Top Navbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '1rem',
        padding: '0.9rem clamp(1rem, 4vw, 2rem)',
        background: 'rgba(10,10,10,0.96)', backdropFilter: 'blur(12px)',
        position: 'sticky', top: 0, zIndex: 30,
        borderBottom: '1px solid rgba(255,255,255,0.08)'
      }}>
        <button onClick={onBack} style={{
          background: 'rgba(255,255,255,0.08)', border: 'none', color: '#fff',
          padding: '0.4rem 1rem', borderRadius: '20px', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: '0.4rem',
          fontSize: '0.85rem', fontWeight: 600, flexShrink: 0
        }} aria-label="Back">← Back</button>

        <span style={{
          fontWeight: 800, fontSize: '1.05rem', color: '#fff',
          flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
        }}>{displayTitle}</span>

        <span style={{
          fontSize: '0.68rem', fontWeight: 800, letterSpacing: '1px',
          color: '#e50914', border: '1px solid #e50914',
          padding: '0.2rem 0.6rem', borderRadius: '3px', flexShrink: 0,
          textTransform: 'uppercase'
        }}>CINEMA 4K</span>
      </div>

      {/* Main Player Box with Ambient Shadow */}
      <div style={{
        width: '100%', maxWidth: '1200px', margin: '1.5rem auto 0',
        padding: '0 clamp(1rem, 3vw, 2rem)'
      }}>
        <div style={{
          width: '100%', aspectRatio: '16/9', position: 'relative',
          background: '#000', borderRadius: '12px', overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,0.9), 0 0 40px rgba(229,9,20,0.08)',
          border: '1px solid rgba(255,255,255,0.1)'
        }}>
          {loading && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', background: '#111', gap: '1.2rem'
            }}>
              {thumbnail && <img src={thumbnail} alt={displayTitle} style={{
                position: 'absolute', inset: 0, width: '100%', height: '100%',
                objectFit: 'cover', opacity: 0.3
              }} />}
              <div className="loading-spinner" style={{ width: '48px', height: '48px', borderWidth: '3px', zIndex: 2 }} />
              <p style={{ color: '#fff', fontSize: '0.9rem', fontWeight: 600, zIndex: 2 }}>Loading Player…</p>
            </div>
          )}

          {!loading && isHLS && !useFallback && (
            <VideoPlayer
              source={{ url: streamData.streamUrl, isM3U8: true }}
              poster={thumbnail}
              title={displayTitle}
              className="movieplex-player"
              onError={() => {
                if (streamData?.fallbackIframe) setUseFallback(true);
              }}
            />
          )}

          {!loading && useFallback && streamData?.fallbackIframe && (
            <iframe
              key={shieldActive ? 'shield-on' : 'shield-off'}
              src={streamData.fallbackIframe}
              title={displayTitle}
              style={{ width: '100%', height: '100%', border: 'none', position: 'absolute', inset: 0 }}
              allowFullScreen
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              sandbox={shieldActive ? "allow-scripts allow-same-origin allow-presentation allow-forms" : undefined}
            />
          )}

          {!loading && extractionFailed && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: '1rem', background: '#111'
            }}>
              {thumbnail && <img src={thumbnail} alt={displayTitle} style={{
                position: 'absolute', inset: 0, width: '100%', height: '100%',
                objectFit: 'cover', opacity: 0.12
              }} />}
              <div style={{ zIndex: 2, textAlign: 'center', padding: '0 2rem' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>⚠️</div>
                <p style={{ fontWeight: 700, fontSize: '1.1rem', margin: '0 0 0.4rem' }}>Stream Unavailable</p>
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem', margin: '0 0 1.2rem' }}>
                  Could not load a playable stream for this title.
                </p>
                <button onClick={onBack} style={{
                  padding: '0.6rem 1.6rem', background: '#E50914',
                  border: 'none', borderRadius: '6px',
                  color: '#fff', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 700
                }}>← Go Back</button>
              </div>
            </div>
          )}

          {!loading && error && !streamData && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: '1rem'
            }}>
              <p style={{ color: '#ef4444', fontSize: '0.9rem' }}>Could not load stream: {error}</p>
              <button onClick={onBack} style={{
                padding: '0.5rem 1.5rem', background: '#e50914',
                border: 'none', borderRadius: '4px', color: '#fff', cursor: 'pointer'
              }}>Go Back</button>
            </div>
          )}
        </div>
      </div>

      {/* Below Player Controls & Recommendations */}
      {!loading && streamData && (
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '1.5rem clamp(1rem, 3vw, 2rem) 4rem' }}>

          {/* Player Switcher Bar */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0.8rem 1.2rem', background: 'rgba(255,255,255,0.03)',
            borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)',
            marginBottom: '2rem', flexWrap: 'wrap', gap: '0.8rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>Player Server:</span>
              {isHLS && (
                <button onClick={() => setUseFallback(false)} style={{
                  padding: '0.45rem 1.3rem', borderRadius: '20px', border: 'none', cursor: 'pointer',
                  fontSize: '0.85rem', fontWeight: 700,
                  background: !useFallback ? '#E50914' : 'rgba(255,255,255,0.08)',
                  color: '#fff', transition: 'all 0.18s'
                }}>⚡ Our Custom Player (Ad-Free)</button>
              )}
              {streamData.fallbackIframe && (
                <button onClick={() => setUseFallback(true)} style={{
                  padding: '0.45rem 1.3rem', borderRadius: '20px', border: 'none', cursor: 'pointer',
                  fontSize: '0.85rem', fontWeight: 700,
                  background: useFallback ? '#E50914' : 'rgba(255,255,255,0.08)',
                  color: '#fff', transition: 'all 0.18s'
                }}>🌐 External Player</button>
              )}
            </div>

            {useFallback && (
              <button
                onClick={() => setShieldActive(!shieldActive)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                  fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
                  background: shieldActive ? 'rgba(74,222,128,0.15)' : 'rgba(255,255,255,0.08)',
                  color: shieldActive ? '#4ade80' : 'rgba(255,255,255,0.7)',
                  padding: '0.4rem 0.9rem',
                  borderRadius: '20px',
                  border: `1px solid ${shieldActive ? 'rgba(74,222,128,0.3)' : 'rgba(255,255,255,0.12)'}`,
                  transition: 'all 0.2s'
                }}
                title={shieldActive ? "Shield is blocking popup tabs. If video is blocked, click to disable shield." : "Direct mode active for maximum video host compatibility."}
              >
                {shieldActive ? <ShieldCheck size={14} /> : <ShieldAlert size={14} />}
                <span>{shieldActive ? 'Popup Shield: ON' : 'Popup Shield: OFF (Compatible Mode)'}</span>
              </button>
            )}
          </div>

          {/* Movie Recommendation Grid Below Player */}
          {moreMovies.length > 0 && (
            <div style={{ marginTop: '2rem' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: '0 0 1.2rem', color: '#fff' }}>
                More Movies to Watch
              </h3>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                gap: '1.2rem 1rem'
              }}>
                {moreMovies.map((m, idx) => (
                  <MovieCard key={m.id + '-' + idx} movie={m} onClick={() => {
                    window.location.href = `/movie/${m.movieplexSlug || m.slug || m.id}`;
                  }} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default MoviePlexPlayerView;
