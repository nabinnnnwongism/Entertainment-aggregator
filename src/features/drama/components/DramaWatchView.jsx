import React, { useState, useEffect, useMemo } from 'react';
import { AlertCircle } from 'lucide-react';
import VideoPlayer from '../../../components/VideoPlayer';

export default function DramaWatchView({ drama, episode, stream, loading, onBack, onEpisodeSelect }) {
  const episodes = Array.isArray(drama?.episodes) ? drama.episodes : [];
  // activeSub = the `file` URL of the selected subtitle, or null = off
  const [activeSub, setActiveSub] = useState(null);

  // Auto-select English subtitle whenever a new stream loads
  useEffect(() => {
    if (stream?.subtitles?.length) {
      const eng = stream.subtitles.find(s => s.default) || stream.subtitles[0];
      setActiveSub(eng?.file || null);
    } else {
      setActiveSub(null);
    }
  }, [stream]);

  // Build a SINGLE-element subtitle array for VideoPlayer so only one track
  // is ever mounted. Swapping this triggers VideoPlayer to remount the track.
  const playerSubtitle = useMemo(() => {
    if (!activeSub || !stream?.subtitles) return [];
    const found = stream.subtitles.find(s => s.file === activeSub);
    if (!found) return [];
    return [{ url: found.file, lang: 'en', label: found.label, default: true }];
  }, [activeSub, stream]);

  return (
    <div className="drama-watch">
      <div className="drama-watch-header">
        <button className="drama-back-btn" onClick={onBack}>← {drama.title}</button>
        <span className="drama-watch-ep-label">Episode {episode.number}</span>
      </div>

      <div className="drama-player-wrap">
        {loading ? (
          <div className="drama-player-loading">
            <div className="blob-loader-wrap">
              <div className="blob-loader" />
              <p className="blob-loader-text">
                Loading<span className="blob-dots"><span>.</span><span>.</span><span>.</span></span>
              </p>
            </div>
          </div>
        ) : stream?.error ? (
          <div className="drama-player-error">
            <AlertCircle size={40} />
            <p>{stream.error}</p>
          </div>
        ) : stream?.streamUrl ? (
          <VideoPlayer
            source={{
              url: stream.streamUrl,
              isM3U8: stream.type === 'hls',
              error: stream.error
            }}
            subtitles={playerSubtitle}
            poster={drama.thumbnail}
          />
        ) : null}
      </div>

      {/* Subtitle selector */}
      {stream?.subtitles?.length > 0 && (
        <div className="drama-sub-selector">
          <span className="drama-sub-label">Subtitles:</span>
          <button
            className={`drama-sub-btn ${!activeSub ? 'active' : ''}`}
            onClick={() => setActiveSub(null)}
          >Off</button>
          {stream.subtitles.map(s => (
            <button
              key={s.file}
              className={`drama-sub-btn ${activeSub === s.file ? 'active' : ''}`}
              onClick={() => setActiveSub(s.file)}
            >{s.label}</button>
          ))}
        </div>
      )}

      {/* Episode list */}
      {episodes.length > 0 && (
        <div className="drama-watch-episodes container">
          <h3 className="drama-episodes-heading">Episodes</h3>
          <div className="drama-episodes-grid">
            {episodes.slice(0, 50).map(ep => (
              <button
                key={ep.id}
                className={`drama-ep-btn ${ep.id === episode.id ? 'active' : ''}`}
                onClick={() => onEpisodeSelect(ep)}
              >
                <span className="drama-ep-num">Ep {ep.number}</span>
                {ep.sub > 0 && <span className="drama-ep-sub-badge">SUB</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
