import {
  Captions,
  Check,
  FastForward,
  Loader2,
  Maximize2,
  Minimize2,
  PanelTopOpen,
  Pause,
  PictureInPicture2,
  Play,
  RotateCcw,
  Settings2,
  Volume2,
  VolumeX,
} from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import Hls from "hls.js";
import { useEffect, useRef, useState } from "react";

export type SubtitleTrack = {
  label: string;
  file: string;
  default?: boolean;
};

export type VideoPlayerProps = {
  src: string;
  poster?: string;
  title?: string;
  subtitle?: string;
  subtitles?: SubtitleTrack[];
  intro?: { start: number; end: number };
  outro?: { start: number; end: number };
  theatreMode?: boolean;
  onToggleTheatre?: () => void;
  onEnded?: () => void;
  onError?: (err: any) => void;
};

function formatTime(seconds: number) {
  if (isNaN(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export function VideoPlayer({
  src,
  poster,
  title,
  subtitle,
  subtitles = [],
  intro,
  outro,
  theatreMode = false,
  onToggleTheatre,
  onEnded,
  onError,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState("1×");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState<string | null>(null);
  const [showControls, setShowControls] = useState(true);
  const [selectedSubtitle, setSelectedSubtitle] = useState<string | null>(
    subtitles.find((s) => s.default)?.label || (subtitles.length > 0 ? subtitles[0].label : null)
  );

  const controlsTimeoutRef = useRef<any>(null);

  // Initialize HLS / video source
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    setIsLoading(true);
    setHasError(null);

    // Destroy existing Hls instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (Hls.isSupported() && (src.includes(".m3u8") || src.includes("m3u8-proxy") || !src.endsWith(".mp4"))) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 90,
      });
      hlsRef.current = hls;

      hls.loadSource(src);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsLoading(false);
        video.play().catch(() => setIsPlaying(false));
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              setHasError("Stream loading failed. Please try another source or refresh.");
              onError?.(data);
              hls.destroy();
              break;
          }
        }
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl") || src.endsWith(".mp4")) {
      // Native HLS (Safari/iOS) or MP4
      video.src = src;
      video.addEventListener("loadedmetadata", () => {
        setIsLoading(false);
        video.play().catch(() => setIsPlaying(false));
      });
    } else {
      setHasError("Playback format not supported on this browser.");
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [src]);

  // Video event handlers
  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;
    setCurrentTime(video.currentTime);
    if (!isNaN(video.duration)) {
      setDuration(video.duration);
    }
  };

  const handlePlay = () => setIsPlaying(true);
  const handlePause = () => setIsPlaying(false);
  const handleWaiting = () => setIsLoading(true);
  const handlePlaying = () => setIsLoading(false);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  };

  const seek = (seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(seconds, duration));
  };

  const handleVolumeChange = (newVol: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = newVol;
    setVolume(newVol);
    setIsMuted(newVol === 0);
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    if (isMuted) {
      video.muted = false;
      setIsMuted(false);
    } else {
      video.muted = true;
      setIsMuted(true);
    }
  };

  const handleRateChange = (rateStr: string) => {
    const rateNum = parseFloat(rateStr.replace("×", ""));
    const video = videoRef.current;
    if (!video || isNaN(rateNum)) return;
    video.playbackRate = rateNum;
    setPlaybackRate(rateStr);
  };

  const toggleFullscreen = async () => {
    const container = containerRef.current;
    if (!container) return;

    if (!document.fullscreenElement) {
      await container.requestFullscreen?.().catch(() => {});
      setIsFullscreen(true);
    } else {
      await document.exitFullscreen?.().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const togglePiP = async () => {
    const video = videoRef.current;
    if (!video) return;
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture?.().catch(() => {});
    } else if (document.pictureInPictureEnabled) {
      await video.requestPictureInPicture?.().catch(() => {});
    }
  };

  // Skip Intro / Outro logic
  const inIntro = intro && currentTime >= intro.start && currentTime <= intro.end;
  const inOutro = outro && currentTime >= outro.start && currentTime <= outro.end;

  const skipIntro = () => {
    if (intro) seek(intro.end + 1);
  };

  const skipOutro = () => {
    if (outro) seek(outro.end + 1);
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (["input", "textarea"].includes((e.target as HTMLElement)?.tagName?.toLowerCase())) return;

      switch (e.key.toLowerCase()) {
        case " ":
        case "k":
          e.preventDefault();
          togglePlay();
          break;
        case "j":
        case "arrowleft":
          e.preventDefault();
          seek(currentTime - 10);
          break;
        case "l":
        case "arrowright":
          e.preventDefault();
          seek(currentTime + 10);
          break;
        case "arrowup":
          e.preventDefault();
          handleVolumeChange(Math.min(1, volume + 0.1));
          break;
        case "arrowdown":
          e.preventDefault();
          handleVolumeChange(Math.max(0, volume - 0.1));
          break;
        case "f":
          e.preventDefault();
          void toggleFullscreen();
          break;
        case "m":
          e.preventDefault();
          toggleMute();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentTime, duration, volume, isMuted]);

  // Controls auto-hide timer
  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) {
        setShowControls(false);
      }
    }, 3000);
  };

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      className={`group relative aspect-video w-full overflow-hidden bg-black select-none ${
        theatreMode ? "max-h-[85vh]" : "rounded-xl border border-white/10 shadow-2xl"
      }`}
    >
      <video
        ref={videoRef}
        poster={poster}
        onTimeUpdate={handleTimeUpdate}
        onPlay={handlePlay}
        onPause={handlePause}
        onWaiting={handleWaiting}
        onPlaying={handlePlaying}
        onEnded={onEnded}
        onClick={togglePlay}
        crossOrigin="anonymous"
        playsInline
        className="h-full w-full object-contain cursor-pointer"
      >
        {subtitles.map((sub) => (
          <track
            key={sub.label}
            label={sub.label}
            src={sub.file}
            kind="subtitles"
            srcLang="en"
            default={selectedSubtitle === sub.label}
          />
        ))}
      </video>

      {/* Loading Spinner */}
      {isLoading && !hasError && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/40">
          <Loader2 className="h-12 w-12 animate-spin text-gold-500" />
        </div>
      )}

      {/* Error Display */}
      {hasError && (
        <div className="absolute inset-0 grid place-items-center bg-black/90 p-6 text-center">
          <div className="max-w-md space-y-3">
            <p className="text-lg font-bold text-red-400">Stream Playback Issue</p>
            <p className="text-sm text-fog-500">{hasError}</p>
            <button
              onClick={() => {
                setHasError(null);
                const video = videoRef.current;
                if (video) {
                  video.load();
                  video.play().catch(() => {});
                }
              }}
              className="inline-flex items-center gap-2 rounded-full bg-gold-500 px-5 py-2 text-sm font-semibold text-black hover:bg-gold-400"
            >
              <RotateCcw size={16} />
              Retry Stream
            </button>
          </div>
        </div>
      )}

      {/* Skip Intro / Outro Buttons */}
      {inIntro && (
        <button
          onClick={skipIntro}
          className="absolute bottom-24 right-8 z-30 inline-flex items-center gap-2 rounded-full bg-black/80 px-5 py-2.5 font-body text-sm font-semibold text-paper-100 border border-gold-500/80 shadow-2xl backdrop-blur transition-transform hover:scale-105"
        >
          <FastForward size={16} className="text-gold-500" />
          <span>Skip Intro</span>
        </button>
      )}

      {inOutro && (
        <button
          onClick={skipOutro}
          className="absolute bottom-24 right-8 z-30 inline-flex items-center gap-2 rounded-full bg-black/80 px-5 py-2.5 font-body text-sm font-semibold text-paper-100 border border-gold-500/80 shadow-2xl backdrop-blur transition-transform hover:scale-105"
        >
          <FastForward size={16} className="text-gold-500" />
          <span>Skip Outro</span>
        </button>
      )}

      {/* Title Bar Overlay (Shows on Hover/Pause) */}
      {(showControls || !isPlaying) && (title || subtitle) && (
        <div className="pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-black/80 via-black/30 to-transparent p-6 transition-opacity duration-300">
          {title && <h3 className="font-display text-lg font-bold text-white drop-shadow">{title}</h3>}
          {subtitle && <p className="font-body text-xs text-fog-500">{subtitle}</p>}
        </div>
      )}

      {/* Center Big Play Button (when paused) */}
      {!isPlaying && !isLoading && !hasError && (
        <button
          onClick={togglePlay}
          className="absolute inset-0 grid place-items-center"
          aria-label="Play video"
        >
          <span className="grid h-16 w-16 place-items-center rounded-full bg-gold-500 text-black shadow-2xl transition-transform hover:scale-110">
            <Play size={26} fill="currentColor" className="ml-1" />
          </span>
        </button>
      )}

      {/* Bottom Controls Bar */}
      <div
        className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/70 to-transparent px-5 pb-4 pt-10 transition-opacity duration-300 ${
          showControls || !isPlaying ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        {/* Timeline Slider */}
        <div className="relative mb-3 flex items-center">
          <input
            type="range"
            min={0}
            max={duration || 100}
            step={0.1}
            value={currentTime}
            onChange={(e) => seek(parseFloat(e.target.value))}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-white/20 accent-gold-500 hover:h-2 transition-all"
            aria-label="Seek time"
          />
        </div>

        {/* Controls Row */}
        <div className="flex items-center justify-between gap-3 text-white">
          {/* Left Controls: Play/Pause, Volume, Time */}
          <div className="flex items-center gap-3">
            <button
              onClick={togglePlay}
              className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/10 transition-colors"
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}
            </button>

            {/* Volume Control */}
            <div className="flex items-center gap-1.5 group/vol">
              <button
                onClick={toggleMute}
                className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/10 transition-colors"
                aria-label={isMuted ? "Unmute" : "Mute"}
              >
                {isMuted || volume === 0 ? <VolumeX size={19} /> : <Volume2 size={19} />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={isMuted ? 0 : volume}
                onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                className="h-1 w-16 cursor-pointer appearance-none rounded-full bg-white/20 accent-gold-500 transition-all opacity-70 group-hover/vol:opacity-100"
                aria-label="Volume"
              />
            </div>

            {/* Time Stamp */}
            <span className="text-xs font-mono text-fog-500">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          {/* Right Controls: Subtitles, Speed, PiP, Theater, Fullscreen */}
          <div className="flex items-center gap-2">
            {/* Subtitles Menu */}
            {subtitles.length > 0 && (
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button
                    className={`grid h-8 w-8 place-items-center rounded hover:bg-white/10 ${
                      selectedSubtitle ? "text-gold-500" : "text-white"
                    }`}
                    title="Subtitles"
                  >
                    <Captions size={18} />
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content className="z-50 min-w-36 rounded-md border border-white/15 bg-ink-950 p-1.5 text-xs text-white shadow-2xl backdrop-blur">
                    <DropdownMenu.Label className="px-2 py-1 font-semibold text-fog-500 uppercase tracking-wider text-[10px]">
                      Subtitles
                    </DropdownMenu.Label>
                    <DropdownMenu.Item
                      onClick={() => setSelectedSubtitle(null)}
                      className="flex cursor-pointer items-center justify-between rounded px-2 py-1.5 outline-none hover:bg-white/10"
                    >
                      <span>Off</span>
                      {!selectedSubtitle && <Check size={14} className="text-gold-500" />}
                    </DropdownMenu.Item>
                    {subtitles.map((sub) => (
                      <DropdownMenu.Item
                        key={sub.label}
                        onClick={() => setSelectedSubtitle(sub.label)}
                        className="flex cursor-pointer items-center justify-between rounded px-2 py-1.5 outline-none hover:bg-white/10"
                      >
                        <span>{sub.label}</span>
                        {selectedSubtitle === sub.label && <Check size={14} className="text-gold-500" />}
                      </DropdownMenu.Item>
                    ))}
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            )}

            {/* Playback Speed Menu */}
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  className="grid h-8 w-8 place-items-center rounded hover:bg-white/10 text-white"
                  title="Playback Speed"
                >
                  <Settings2 size={18} />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content className="z-50 min-w-32 rounded-md border border-white/15 bg-ink-950 p-1.5 text-xs text-white shadow-2xl backdrop-blur">
                  <DropdownMenu.Label className="px-2 py-1 font-semibold text-fog-500 uppercase tracking-wider text-[10px]">
                    Speed
                  </DropdownMenu.Label>
                  {["0.5×", "0.75×", "1×", "1.25×", "1.5×", "2×"].map((rate) => (
                    <DropdownMenu.Item
                      key={rate}
                      onClick={() => handleRateChange(rate)}
                      className="flex cursor-pointer items-center justify-between rounded px-2 py-1.5 outline-none hover:bg-white/10"
                    >
                      <span>{rate}</span>
                      {playbackRate === rate && <Check size={14} className="text-gold-500" />}
                    </DropdownMenu.Item>
                  ))}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>

            {/* Picture in Picture */}
            <button
              onClick={togglePiP}
              className="grid h-8 w-8 place-items-center rounded hover:bg-white/10 text-white"
              title="Picture in Picture"
            >
              <PictureInPicture2 size={18} />
            </button>

            {/* Theater Mode */}
            {onToggleTheatre && (
              <button
                onClick={onToggleTheatre}
                className={`grid h-8 w-8 place-items-center rounded hover:bg-white/10 ${
                  theatreMode ? "text-gold-500" : "text-white"
                }`}
                title="Theatre Mode"
              >
                <PanelTopOpen size={18} />
              </button>
            )}

            {/* Fullscreen */}
            <button
              onClick={toggleFullscreen}
              className="grid h-8 w-8 place-items-center rounded hover:bg-white/10 text-white"
              title="Fullscreen"
            >
              {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
