import React, { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize, Tv, Globe, Subtitles, Settings, RotateCcw, RotateCw, ChevronLeft, ChevronRight } from 'lucide-react';

export default function VideoPlayer({
  source,
  poster,
  subtitles,
  malId,
  episodeNumber,
  title,
  type,
  onProgress,
  onNextEpisode,
  onPrevEpisode,
  hasNextEpisode = true,
  hasPrevEpisode = true,
  onError,
  className = ''
}) {
  const containerRef = useRef(null);
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const controlsTimeoutRef = useRef(null);
  const isDraggingRef = useRef(false);

  // ── Hover Preview Thumbnail Scrubbing refs & states ──
  const previewVideoRef = useRef(null);
  const previewCanvasRef = useRef(null);
  const previewHlsRef = useRef(null);

  const [showPreviewTooltip, setShowPreviewTooltip] = useState(false);
  const [hoverTime, setHoverTime] = useState(0);
  const [hoverPos, setHoverPos] = useState(0);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [error, setError] = useState(null);
  const [bufferPercent, setBufferPercent] = useState(0);
  const [ccActive, setCcActive] = useState(true);
  const [rippleAction, setRippleAction] = useState(null);

  // ── Seek Step state (5s, 10s, 15s - default 10s) ───────────────────────────
  const [seekStep, setSeekStep] = useState(() => {
    try {
      const saved = localStorage.getItem('anistream_seek_step');
      if (saved) {
        const val = parseInt(saved, 10);
        if ([5, 10, 15].includes(val)) return val;
      }
    } catch (e) { }
    return 10;
  });

  const cycleSeekStep = () => {
    const steps = [5, 10, 15];
    const nextIdx = (steps.indexOf(seekStep) + 1) % steps.length;
    const nextVal = steps[nextIdx];
    setSeekStep(nextVal);
    try {
      localStorage.setItem('anistream_seek_step', nextVal.toString());
    } catch (e) { }
    resetControlsTimeout();
  };

  // ── Quality state ──────────────────────────────────────────────────────────
  const [qualityLevels, setQualityLevels] = useState([]); // [{ label, height, index }]
  const [currentQuality, setCurrentQuality] = useState(-1); // -1 = Auto
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const qualityMenuRef = useRef(null);

  // ── Audio Track state ──────────────────────────────────────────────────────
  const [audioTracks, setAudioTracks] = useState([]); // [{ index, name, lang }]
  const [currentAudioTrack, setCurrentAudioTrack] = useState(-1);
  const [showAudioMenu, setShowAudioMenu] = useState(false);
  const audioMenuRef = useRef(null);

  // AniSkip state
  const [skipTimes, setSkipTimes] = useState(null); // { op: {start, end}, ed: {start, end} }
  const [activeSkip, setActiveSkip] = useState(null); // 'op' | 'ed' | null

  const isIframe = Boolean(source?.iframeSrc);
  const streamUrl = source?.url;
  const sourceError = source?.error;
  const preferredAudioLang = source?.preferredAudioLang || (source?.audioMode === 'hindi' ? 'hin' : null);

  // ── AniSkip fetch ─────────────────────────────────────────────────────────
  useEffect(() => {
    setSkipTimes(null);
    setActiveSkip(null);

    if (!malId || !episodeNumber) return;

    const fetchSkipTimes = async () => {
      try {
        const url = `https://api.aniskip.com/v1/skip-times/${malId}/${episodeNumber}?types[]=op&types[]=ed`;
        const res = await fetch(url);
        const data = await res.json();

        if (!data.found || !data.results?.length) return;

        const times = {};
        for (const result of data.results) {
          times[result.skip_type] = {
            start: result.interval.start_time,
            end: result.interval.end_time
          };
        }
        setSkipTimes(times);
      } catch (e) {
        // silently fail — skip intro is optional
        console.warn('AniSkip fetch failed:', e);
      }
    };

    fetchSkipTimes();
  }, [malId, episodeNumber]);

  // ── Detect active skip window as video plays ───────────────────────────────
  useEffect(() => {
    if (!skipTimes) {
      setActiveSkip(null);
      return;
    }

    let detected = null;
    if (skipTimes.op && currentTime >= skipTimes.op.start && currentTime < skipTimes.op.end) {
      detected = 'op';
    } else if (skipTimes.ed && currentTime >= skipTimes.ed.start && currentTime < skipTimes.ed.end) {
      detected = 'ed';
    }
    setActiveSkip(detected);
  }, [currentTime, skipTimes]);

  const handleSkip = () => {
    const video = videoRef.current;
    if (!video || !activeSkip || !skipTimes[activeSkip]) return;
    video.currentTime = skipTimes[activeSkip].end;
    setActiveSkip(null);
  };

  // ── Initialize HLS / Video source ─────────────────────────────────────────
  useEffect(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (isIframe) {
      setError(null);
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    video.removeAttribute('src');
    video.load();
    setIsPlaying(false);
    setCurrentTime(0);
    setBufferPercent(0);
    setIsBuffering(false);
    setError(sourceError || null);

    if (!streamUrl) {
      if (!sourceError) {
        setError('No playable source is available for this episode.');
      }
      return;
    }

    setIsBuffering(true);

    const isHls = source?.isM3U8 || source?.type === 'hls' || (streamUrl && streamUrl.includes('m3u8'));

    if (isHls && Hls.isSupported()) {
      // ── HLS.js path (Chrome, Firefox, Android, desktop) ──
      setQualityLevels([]);
      setCurrentQuality(-1);
      const hls = new Hls({
        maxMaxBufferLength: 60,
        enableWorker: true,
        manifestLoadingMaxRetry: 6,
        manifestLoadingRetryDelay: 1000,
        levelLoadingMaxRetry: 6,
        levelLoadingRetryDelay: 1000,
        fragLoadingMaxRetry: 6,
        fragLoadingRetryDelay: 1000,
      });
      hlsRef.current = hls;

      // Populate quality levels once manifest is parsed
      hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
        const levels = data.levels.map((lvl, idx) => ({
          index: idx,
          height: lvl.height || 0,
          label: lvl.height ? `${lvl.height}p` : `Level ${idx + 1}`,
          bitrate: lvl.bitrate || 0,
        }));
        // Sort highest quality first
        levels.sort((a, b) => b.height - a.height);
        setQualityLevels(levels);
        setCurrentQuality(-1); // Start on Auto
      });

      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (_, data) => {
        const rawTracks = data.audioTracks || hls.audioTracks || [];
        const tracks = rawTracks.map((track, idx) => ({
          index: idx,
          name: track.name || track.lang || `Track ${idx + 1}`,
          lang: track.lang || '',
        }));
        setAudioTracks(tracks);
        setCurrentAudioTrack(hls.audioTrack);

        // Auto-select preferred language or Hindi if available
        const targetLang = (preferredAudioLang || 'hindi').toLowerCase();
        const targetIndex = tracks.findIndex(track => {
          const lang = (track.lang || '').toLowerCase();
          const name = (track.name || '').toLowerCase();
          return lang === targetLang || name.includes('hindi') || name.includes('हिन्दी');
        });
        if (targetIndex >= 0 && hls.audioTrack !== targetIndex) {
          hls.audioTrack = targetIndex;
          setCurrentAudioTrack(targetIndex);
        }
      });

      hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, (_, data) => {
        setCurrentAudioTrack(data.id);
      });

      let networkRecoveryAttempts = 0;
      let mediaRecoveryAttempts = 0;
      const maxNetworkRecoveryAttempts = 2;
      const maxMediaRecoveryAttempts = 2;

      hls.on(Hls.Events.ERROR, (event, data) => {
        if (!data.fatal) return;
        console.error('[HLS] Fatal error:', data.type, data.details);
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR && networkRecoveryAttempts < maxNetworkRecoveryAttempts) {
          networkRecoveryAttempts += 1;
          hls.startLoad();
          return;
        }
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR && mediaRecoveryAttempts < maxMediaRecoveryAttempts) {
          mediaRecoveryAttempts += 1;
          hls.recoverMediaError();
          return;
        }
        setError('Stream failed to load. The episode may be unavailable.');
        setIsBuffering(false);
        hls.destroy();
        if (onError) onError('hls_fatal');
      });

      hls.loadSource(streamUrl);
      hls.attachMedia(video);
    } else if (source?.isM3U8 && nativeHLSSupport) {
      // ── Native HLS path (iOS Safari) ──
      // iOS Safari parses m3u8 natively — pass our proxy URL directly
      video.src = streamUrl;
      video.load();
    } else if (!source?.isM3U8) {
      // ── Direct MP4 / non-HLS ──
      video.src = streamUrl;
    } else {
      // No HLS support at all
      setError('Your browser does not support HLS video. Please try Chrome or Firefox.');
      setIsBuffering(false);
    }

    return () => {
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    };
  }, [source, isIframe, streamUrl, sourceError, preferredAudioLang]);

  // ── CC (subtitles) ────────────────────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const tracks = video.textTracks;
    for (let i = 0; i < tracks.length; i++) {
      tracks[i].mode = ccActive ? 'showing' : 'hidden';
    }
  }, [ccActive, subtitles]);

  // ── Video Events ──────────────────────────────────────────────────────────
  const onPlay = () => { setIsPlaying(true); setIsBuffering(false); };
  const onPause = () => setIsPlaying(false);
  const onWaiting = () => setIsBuffering(true);
  const onCanPlay = () => setIsBuffering(false);

  const onTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;
    setCurrentTime(video.currentTime);

    if (video.buffered.length > 0 && video.duration) {
      let bufferedEnd = 0;
      for (let i = 0; i < video.buffered.length; i++) {
        if (video.buffered.start(i) <= video.currentTime && video.buffered.end(i) >= video.currentTime) {
          bufferedEnd = video.buffered.end(i);
          break;
        }
      }
      setBufferPercent((bufferedEnd / video.duration) * 100);
    }
  };

  const onDurationChange = () => {
    if (videoRef.current) setDuration(videoRef.current.duration);
  };

  const lastReportedTimeRef = useRef(0);
  useEffect(() => {
    if (!onProgress || !duration) return;
    const diff = Math.abs(currentTime - lastReportedTimeRef.current);
    if (diff >= 10 || (duration > 0 && Math.abs(currentTime - duration) < 1 && lastReportedTimeRef.current !== currentTime)) {
      lastReportedTimeRef.current = currentTime;
      onProgress({
        progressSeconds: Math.floor(currentTime),
        durationSeconds: Math.floor(duration)
      });
    }
  }, [currentTime, duration, onProgress]);

  const [topToast, setTopToast] = useState(null); // { text, type }
  const topToastTimeoutRef = useRef(null);

  const triggerTopToast = useCallback((text, type) => {
    setTopToast({ text, type });
    if (topToastTimeoutRef.current) clearTimeout(topToastTimeoutRef.current);
    topToastTimeoutRef.current = setTimeout(() => {
      setTopToast(null);
    }, 1800);
  }, []);

  const triggerRipple = (type) => {
    setRippleAction(type);
    setTimeout(() => setRippleAction(null), 500);
  };

  const resetControlsTimeout = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (!isDraggingRef.current) setShowControls(false);
    }, 5500);
  }, []);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video || !streamUrl) return;
    if (video.paused) {
      video.play().catch(console.error);
      triggerTopToast('Video Resumed', 'play');
    } else {
      video.pause();
      triggerTopToast('Video Paused', 'pause');
    }
    resetControlsTimeout();
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !isMuted;
    setIsMuted(!isMuted);
    resetControlsTimeout();
  };

  const handleVolumeChange = (e) => {
    const val = parseFloat(e.target.value);
    const video = videoRef.current;
    if (!video) return;
    video.volume = val;
    video.muted = val === 0;
    setVolume(val);
    setIsMuted(val === 0);
    resetControlsTimeout();
  };

  const toggleFullscreen = () => {
    const container = containerRef.current;
    if (!container) return;

    // Standard + WebKit (iOS Safari) fullscreen entry/exit with prefixed fallbacks.
    const isCurrentlyFs = document.fullscreenElement || document.webkitFullscreenElement;
    try {
      if (!isCurrentlyFs) {
        const req = container.requestFullscreen?.() ?? container.webkitRequestFullscreen?.();
        Promise.resolve(req)?.catch?.(console.error);
      } else {
        const exit = document.exitFullscreen?.() ?? document.webkitExitFullscreen?.();
        Promise.resolve(exit)?.catch?.(console.error);
      }
    } catch (err) {
      console.error('Fullscreen toggle failed:', err);
    }
    // State + orientation lock are handled in the fullscreenchange listener below.
    resetControlsTimeout();
  };

  useEffect(() => {
    const handleFsChange = () => {
      const isFs = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
      setIsFullscreen(isFs);

      // Auto-rotate to landscape on enter — the same Screen Orientation API that
      // YouTube / MX Player use on Android Chrome. Once the device is in landscape,
      // a 16:9 video fills the screen with no black bars and no cropping.
      // Silently no-op on iOS Safari (lock() unsupported there) and on desktop
      // (already landscape). Browser releases the lock automatically on exit.
      if (isFs && screen.orientation?.type?.startsWith?.('portrait')) {
        screen.orientation.lock?.('landscape')?.catch?.(() => { });
      }
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('webkitfullscreenchange', handleFsChange);
    };
  }, []);

  const togglePiP = () => {
    const video = videoRef.current;
    if (!video) return;
    if (document.pictureInPictureElement) {
      document.exitPictureInPicture().catch(console.error);
    } else {
      video.requestPictureInPicture().catch(console.error);
    }
    resetControlsTimeout();
  };

  const skipTime = useCallback((amount) => {
    const video = videoRef.current;
    if (!video || !duration) return;
    video.currentTime = Math.max(0, Math.min(duration, video.currentTime + amount));
    triggerRipple(amount > 0 ? 'forward' : 'backward');
    resetControlsTimeout();
  }, [duration, resetControlsTimeout]);

  // ── Touch Double Tap Gestures (Mobile left = rewind, right = forward) ──────
  const lastTouchRef = useRef({ time: 0, x: 0 });
  const touchTimerRef = useRef(null);

  const handlePlayerClick = (e) => {
    // Ignore clicks on control buttons, range sliders, floating controls, or submenus
    if (
      e.target.closest('button') ||
      e.target.closest('input') ||
      e.target.closest('.yt-controls-row') ||
      e.target.closest('.yt-timeline-container') ||
      e.target.closest('.quality-menu') ||
      e.target.closest('.floating-controls-group')
    ) {
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const clickX = e.clientX ?? (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
    const xRatio = (clickX - rect.left) / rect.width;
    const now = Date.now();
    const timeDiff = now - lastTouchRef.current.time;

    if (timeDiff < 300) {
      // Double Tap detected!
      if (touchTimerRef.current) {
        clearTimeout(touchTimerRef.current);
        touchTimerRef.current = null;
      }
      lastTouchRef.current = { time: 0, x: 0 };

      if (xRatio < 0.5) {
        skipTime(-seekStep);
      } else {
        skipTime(seekStep);
      }
    } else {
      // Single tap: toggle controls smoothly
      lastTouchRef.current = { time: now, x: xRatio };
      if (touchTimerRef.current) clearTimeout(touchTimerRef.current);
      touchTimerRef.current = setTimeout(() => {
        setShowControls(prev => {
          const next = !prev;
          if (next) resetControlsTimeout();
          else if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
          return next;
        });
      }, 180);
    }
  };

  // ── Quality switching ──────────────────────────────────────────────────────
  const handleQualityChange = (levelIndex) => {
    if (hlsRef.current) {
      hlsRef.current.currentLevel = levelIndex;
      setCurrentQuality(levelIndex);
    }
    setShowQualityMenu(false);
  };

  const handleAudioTrackChange = (trackIndex) => {
    if (hlsRef.current && trackIndex >= 0) {
      hlsRef.current.audioTrack = trackIndex;
      setCurrentAudioTrack(trackIndex);
    }
    setShowAudioMenu(false);
  };

  const activeAudioTrackLabel = (() => {
    if (currentAudioTrack === -1 || !audioTracks.length) return 'Audio';
    const found = audioTracks.find(t => t.index === currentAudioTrack);
    return found ? (found.name.length > 10 ? found.name.slice(0, 8) + '…' : found.name) : `Track ${currentAudioTrack + 1}`;
  })();

  // Close quality menu on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (qualityMenuRef.current && !qualityMenuRef.current.contains(e.target)) {
        setShowQualityMenu(false);
      }
    };
    if (showQualityMenu) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showQualityMenu]);

  const activeQualityLabel = currentQuality === -1
    ? 'Auto'
    : (qualityLevels.find(l => l.index === currentQuality)?.label || 'Auto');

  // ── Keyboard Shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    if (isIframe) return;

    const handleKeyDown = (e) => {
      if (document.activeElement.tagName === 'INPUT') return;

      switch (e.key.toLowerCase()) {
        case ' ':
        case 'k':
        case 'backspace': e.preventDefault(); togglePlay(); break;
        case 'm': toggleMute(); break;
        case 'f': toggleFullscreen(); break;
        case 'arrowleft': e.preventDefault(); skipTime(-seekStep); break;
        case 'arrowright': e.preventDefault(); skipTime(seekStep); break;
        case 'arrowup':
          e.preventDefault();
          setVolume(prev => {
            const next = Math.min(1, prev + 0.1);
            if (videoRef.current) { videoRef.current.volume = next; videoRef.current.muted = false; }
            setIsMuted(false);
            return next;
          });
          break;
        case 'arrowdown':
          e.preventDefault();
          setVolume(prev => {
            const next = Math.max(0, prev - 0.1);
            if (videoRef.current) { videoRef.current.volume = next; videoRef.current.muted = next === 0; }
            setIsMuted(next === 0);
            return next;
          });
          break;
        case 'c': setCcActive(prev => !prev); break;
        case 'q': setShowQualityMenu(prev => !prev); break;
        default: break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isIframe, duration, isMuted, resetControlsTimeout, seekStep, skipTime]);

  // ── Timeline Scrubbing ────────────────────────────────────────────────────
  const seekTo = (e) => {
    const video = videoRef.current;
    const timeline = e.currentTarget;
    if (!video || !timeline || !duration) return;
    const rect = timeline.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    const seekTime = Math.max(0, Math.min(duration, pos * duration));
    video.currentTime = seekTime;
    setCurrentTime(seekTime);
  };

  const handleTimelineMouseDown = (e) => {
    isDraggingRef.current = true;
    seekTo(e);
    resetControlsTimeout();

    const handleMouseMove = (moveEvent) => {
      if (!isDraggingRef.current) return;
      seekTo({ ...moveEvent, currentTarget: e.currentTarget });
    };
    const handleMouseUp = () => {
      isDraggingRef.current = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // ── Frame drawing handler for Scrubbing Preview Tooltip ──
  const updatePreviewCanvas = useCallback(() => {
    const video = previewVideoRef.current || videoRef.current;
    const canvas = previewCanvasRef.current;
    if (!video || !canvas) return;
    try {
      const ctx = canvas.getContext('2d');
      if (ctx && video.readyState >= 2) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      }
    } catch (e) {
      // Cross-origin canvas protection fallback silently handled
    }
  }, []);

  const handleTimelineMouseMove = (e) => {
    const timeline = e.currentTarget;
    if (!timeline || !duration) return;
    const rect = timeline.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetTime = pos * duration;

    setHoverPos(pos);
    setHoverTime(targetTime);
    setShowPreviewTooltip(true);

    if (previewVideoRef.current) {
      if (Math.abs(previewVideoRef.current.currentTime - targetTime) > 0.3) {
        previewVideoRef.current.currentTime = targetTime;
      }
    }
    updatePreviewCanvas();
  };

  const handleTimelineMouseLeave = () => {
    setShowPreviewTooltip(false);
  };

  useEffect(() => {
    resetControlsTimeout();
    return () => { if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current); };
  }, [isPlaying, resetControlsTimeout]);

  // ── Time formatter ────────────────────────────────────────────────────────
  const formatTime = (timeInSecs) => {
    if (isNaN(timeInSecs)) return '0:00';
    const hrs = Math.floor(timeInSecs / 3600);
    const mins = Math.floor((timeInSecs - hrs * 3600) / 60);
    const secs = Math.floor(timeInSecs - hrs * 3600 - mins * 60);
    const pad = (n) => (n < 10 ? `0${n}` : n);
    return hrs > 0 ? `${hrs}:${pad(mins)}:${pad(secs)}` : `${mins}:${pad(secs)}`;
  };

  // ── Iframe Fallback ───────────────────────────────────────────────────────
  if (isIframe) {
    const iframeLabel = source?.language || (source?.audioMode === 'hindi' ? 'Hindi Dub' : 'Embedded Player');

    return (
      <div className="player-wrapper">
        <div className="iframe-badge">
          <Globe size={14} />
          <span>{iframeLabel}</span>
        </div>
        <iframe
          src={source.iframeSrc}
          className="player-iframe"
          allowFullScreen
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          referrerPolicy="no-referrer"
          sandbox={source?.iframeSandbox || undefined}
          title="Episode player"
          style={{ width: '100%', height: '100%', border: 'none', position: 'absolute', top: 0, left: 0 }}
        />
      </div>
    );
  }

  const playPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className={`player-wrapper custom-yt-player yt-player-skin ${className} ${isFullscreen ? 'is-fullscreen' : ''} ${showControls ? 'show-controls' : 'hide-controls'}`}
      onMouseMove={() => { if (showControls) resetControlsTimeout(); }}
      onMouseLeave={() => isPlaying && setShowControls(false)}
    >
      {error ? (
        <div className="player-error">{error}</div>
      ) : (
        <>
          {/* Top Play/Pause Toast Badge */}
          {topToast && (
            <div className="player-top-toast">
              {topToast.type === 'play' ? (
                <Play size={15} fill="white" />
              ) : (
                <Pause size={15} fill="white" />
              )}
              <span>{topToast.text}</span>
            </div>
          )}
          {/* Main Video Element — clicks on video itself do NOT toggle play (use the dedicated button) */}
          <video
            ref={videoRef}
            className="player-video"
            poster={poster}
            playsInline
            onPlay={onPlay}
            onPause={onPause}
            onWaiting={onWaiting}
            onCanPlay={onCanPlay}
            onCanPlayThrough={onCanPlay}
            onTimeUpdate={onTimeUpdate}
            onDurationChange={onDurationChange}
            onDoubleClick={toggleFullscreen}
          >
            {subtitles && subtitles.map((sub, index) => (
              <track
                key={index}
                src={sub.url}
                kind="subtitles"
                srcLang={sub.lang || 'en'}
                label={sub.label || 'English'}
                default={index === 0 || sub.default}
              />
            ))}
          </video>

          {/* Player Click / Touch Overlay Handler for Double-Tap */}
          <div
            className="player-touch-overlay"
            onClick={handlePlayerClick}
          />

          {/* Center Play/Pause Control */}
          <div className={`floating-controls-group ${showControls ? 'floating-controls--visible' : ''}`}>
            <button
              className="floating-play-btn"
              onClick={(e) => { e.stopPropagation(); togglePlay(); }}
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause size={32} fill="white" /> : <Play size={32} fill="white" />}
            </button>
          </div>

          {/* Buffering spinner overlay */}
          {isBuffering && !error && (
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(0,0,0,0.45)', zIndex: 5, pointerEvents: 'none'
            }}>
              <div className="loading-spinner" style={{ width: '52px', height: '52px', borderWidth: '4px' }} />
            </div>
          )}

          {/* Skip Intro / Skip Ending Button */}
          {activeSkip && (
            <button
              className={`skip-btn ${activeSkip === 'op' ? 'skip-op' : 'skip-ed'}`}
              onClick={handleSkip}
              aria-label={activeSkip === 'op' ? 'Skip Intro' : 'Skip Ending'}
            >
              <span className="skip-btn-label">
                {activeSkip === 'op' ? 'Skip Intro' : 'Skip Ending'}
              </span>
              <svg className="skip-btn-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="5 12 19 12"></polyline>
                <polyline points="13 6 19 12 13 18"></polyline>
              </svg>
            </button>
          )}

          {/* Center / Side Ripple Indicator */}
          {rippleAction && (
            <div className={`ripple-overlay-yt ${rippleAction === 'backward' ? 'ripple-left' : rippleAction === 'forward' ? 'ripple-right' : ''}`}>
              <div className="ripple-icon-yt">
                {rippleAction === 'play' && <Play size={42} fill="white" />}
                {rippleAction === 'pause' && <Pause size={42} fill="white" />}
                {rippleAction === 'forward' && (
                  <div className="ripple-skip-content">
                    <RotateCw size={28} />
                    <span className="skip-text">+{seekStep}s</span>
                  </div>
                )}
                {rippleAction === 'backward' && (
                  <div className="ripple-skip-content">
                    <RotateCcw size={28} />
                    <span className="skip-text">-{seekStep}s</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Custom YouTube Controls Overlay */}
          <div className="custom-yt-controls">
            {/* Timeline Progress Bar */}
            <div
              className="yt-timeline-container"
              onMouseDown={handleTimelineMouseDown}
              onMouseMove={handleTimelineMouseMove}
              onMouseLeave={handleTimelineMouseLeave}
            >
              {/* Video Seek Hover Thumbnail Preview Tooltip */}
              {showPreviewTooltip && duration > 0 && (
                <div
                  className="yt-scrub-tooltip"
                  style={{
                    left: `clamp(85px, ${hoverPos * 100}%, calc(100% - 85px))`
                  }}
                >
                  <div className="yt-scrub-preview-box">
                    {(poster || source?.bannerImage || source?.coverImage || source?.thumbnail) && (
                      <img
                        src={poster || source?.bannerImage || source?.coverImage || source?.thumbnail}
                        alt="Preview"
                        className="yt-scrub-img-fallback"
                      />
                    )}
                    <canvas ref={previewCanvasRef} width={160} height={90} className="yt-scrub-canvas" />
                  </div>
                  <div className="yt-scrub-time-label">
                    {formatTime(hoverTime)}
                  </div>
                </div>
              )}

              {/* Hidden Video element for frame extraction */}
              <video
                ref={previewVideoRef}
                style={{ display: 'none' }}
                muted
                playsInline
                preload="auto"
                onSeeked={updatePreviewCanvas}
                onCanPlay={updatePreviewCanvas}
              />

              <div className="yt-timeline">
                <div className="yt-buffer-bar" style={{ width: `${bufferPercent}%` }}></div>
                {/* AniSkip intro highlight markers */}
                {skipTimes?.op && duration > 0 && (
                  <div
                    className="yt-skip-marker yt-skip-marker-op"
                    style={{
                      left: `${(skipTimes.op.start / duration) * 100}%`,
                      width: `${((skipTimes.op.end - skipTimes.op.start) / duration) * 100}%`
                    }}
                    title="Opening"
                  />
                )}
                {skipTimes?.ed && duration > 0 && (
                  <div
                    className="yt-skip-marker yt-skip-marker-ed"
                    style={{
                      left: `${(skipTimes.ed.start / duration) * 100}%`,
                      width: `${((skipTimes.ed.end - skipTimes.ed.start) / duration) * 100}%`
                    }}
                    title="Ending"
                  />
                )}
                <div className="yt-play-bar" style={{ width: `${playPercent}%` }}>
                  <div className="yt-scrubber-handle"></div>
                </div>
              </div>
            </div>

            {/* Buttons & Actions Row */}
            <div className="yt-controls-row">
              <div className="yt-controls-left">
                {/* Previous Episode (<) */}
                <button
                  className="yt-control-btn ep-nav-btn"
                  onClick={(e) => { e.stopPropagation(); if (hasPrevEpisode && onPrevEpisode) onPrevEpisode(); }}
                  disabled={!hasPrevEpisode}
                  aria-label="Previous episode"
                  title={hasPrevEpisode ? "Previous episode (<)" : "First episode"}
                  style={{ opacity: hasPrevEpisode ? 1 : 0.38, cursor: hasPrevEpisode ? 'pointer' : 'not-allowed' }}
                >
                  <ChevronLeft size={22} />
                </button>

                {/* Play / Pause */}
                <button className="yt-control-btn" onClick={togglePlay} aria-label={isPlaying ? 'Pause' : 'Play'}>
                  {isPlaying ? <Pause size={20} fill="white" /> : <Play size={20} fill="white" />}
                </button>

                {/* Next Episode (>) */}
                <button
                  className="yt-control-btn ep-nav-btn"
                  onClick={(e) => { e.stopPropagation(); if (hasNextEpisode && onNextEpisode) onNextEpisode(); }}
                  disabled={!hasNextEpisode}
                  aria-label="Next episode"
                  title={hasNextEpisode ? "Next episode (>)" : "No more episodes"}
                  style={{ opacity: hasNextEpisode ? 1 : 0.38, cursor: hasNextEpisode ? 'pointer' : 'not-allowed' }}
                >
                  <ChevronRight size={22} />
                </button>

                <div className="yt-volume-control">
                  <button className="yt-control-btn" onClick={toggleMute} aria-label={isMuted ? 'Unmute' : 'Mute'}>
                    {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                  </button>
                  <input
                    type="range"
                    min="0" max="1" step="0.05"
                    value={isMuted ? 0 : volume}
                    onChange={handleVolumeChange}
                    className="yt-volume-slider"
                    aria-label="Volume slider"
                  />
                </div>

                <div className="yt-time-display">
                  <span>{formatTime(currentTime)}</span>
                  <span className="yt-time-divider">/</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>

              <div className="yt-controls-right">
                {subtitles && subtitles.length > 0 && (
                  <button
                    className={`yt-control-btn CC-btn ${ccActive ? 'active' : ''}`}
                    onClick={() => setCcActive(!ccActive)}
                    aria-label="Toggle subtitles"
                  >
                    <Subtitles size={20} color={ccActive ? 'var(--accent-primary)' : 'white'} />
                  </button>
                )}

                {/* Quality selector — only shown when HLS levels are available */}
                {qualityLevels.length > 1 && (
                  <div className="yt-quality-wrap" ref={qualityMenuRef}>
                    <button
                      className={`yt-control-btn quality-btn ${showQualityMenu ? 'active' : ''}`}
                      onClick={() => { setShowQualityMenu(p => !p); setShowAudioMenu(false); resetControlsTimeout(); }}
                      aria-label="Quality settings"
                      title="Quality (Q)"
                    >
                      <Settings size={18} />
                      <span className="quality-badge">{activeQualityLabel}</span>
                    </button>

                    {showQualityMenu && (
                      <div className="quality-menu">
                        <div className="quality-menu-header">Quality</div>

                        {/* Auto option */}
                        <button
                          className={`quality-option ${currentQuality === -1 ? 'active' : ''}`}
                          onClick={() => handleQualityChange(-1)}
                        >
                          <span className="quality-option-label">Auto</span>
                          {currentQuality === -1 && <span className="quality-check">✓</span>}
                        </button>

                        {qualityLevels.map(lvl => (
                          <button
                            key={lvl.index}
                            className={`quality-option ${currentQuality === lvl.index ? 'active' : ''}`}
                            onClick={() => handleQualityChange(lvl.index)}
                          >
                            <span className="quality-option-label">
                              {lvl.label}
                              {lvl.height >= 1080 && <span className="quality-hd-tag">HD</span>}
                            </span>
                            {currentQuality === lvl.index && <span className="quality-check">✓</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Audio Track selector — shown when multi-audio tracks are available */}
                {audioTracks.length > 1 && (
                  <div className="yt-quality-wrap" ref={audioMenuRef} style={{ position: 'relative' }}>
                    <button
                      className={`yt-control-btn quality-btn ${showAudioMenu ? 'active' : ''}`}
                      onClick={() => { setShowAudioMenu(p => !p); setShowQualityMenu(false); resetControlsTimeout(); }}
                      aria-label="Audio track settings"
                      title="Audio Track"
                    >
                      <Globe size={18} />
                      <span className="quality-badge">{activeAudioTrackLabel}</span>
                    </button>

                    {showAudioMenu && (
                      <div className="quality-menu">
                        <div className="quality-menu-header">Audio Track</div>

                        {audioTracks.map(trk => (
                          <button
                            key={trk.index}
                            className={`quality-option ${currentAudioTrack === trk.index ? 'active' : ''}`}
                            onClick={() => handleAudioTrackChange(trk.index)}
                          >
                            <span className="quality-option-label">
                              {trk.name}
                            </span>
                            {currentAudioTrack === trk.index && <span className="quality-check">✓</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <button className="yt-control-btn" onClick={togglePiP} aria-label="Picture in Picture">
                  <Tv size={20} />
                </button>

                <button className="yt-control-btn" onClick={toggleFullscreen} aria-label="Toggle fullscreen">
                  {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
