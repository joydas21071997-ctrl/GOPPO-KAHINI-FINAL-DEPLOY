import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  SkipBack,
  SkipForward,
  Video,
  X,
} from 'lucide-react';
import type { Episode, StoryItem } from '../types/content';
import type { UIStrings } from '../i18n/translations';
import { resolveArtworkUrl } from '../utils/artworkRegistry';
import { isPremiumStory } from '../utils/contentClassification';
import { ArtworkImage } from './ArtworkImage';
import { AdSlotContainer } from './AdSlotContainer';

export interface ActiveTrack {
  story: StoryItem;
  isTrailer: boolean;
  episode?: Episode;
}

interface AudioPlayerProps {
  track: ActiveTrack | null;
  authToken: string | null;
  t: UIStrings;
  canPlayEpisodes: boolean;
  initialPositionSeconds?: number;
  onSelectEpisode: (story: StoryItem, episode: Episode) => void;
  onEpisodeComplete?: (story: StoryItem, episode: Episode) => void;
  onPlayingStateChange: (playing: boolean) => void;
  onProgressSync: (payload: {
    storyId: string;
    episodeId: string;
    isTrailer: boolean;
    positionSeconds: number;
    durationSeconds: number;
  }) => void;
  onClose: () => void;
}

const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5, 2] as const;

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '00:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({
  track,
  authToken,
  t,
  canPlayEpisodes,
  initialPositionSeconds = 0,
  onSelectEpisode,
  onEpisodeComplete,
  onPlayingStateChange,
  onProgressSync,
  onClose,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastSyncedRef = useRef<number>(0);
  const completedTrackRef = useRef<string | null>(null);

  const [expanded, setExpanded] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speedIndex, setSpeedIndex] = useState(1); // 1x default
  const [audioError, setAudioError] = useState<string | null>(null);

  const playbackRate = SPEED_OPTIONS[speedIndex];

  const trackId = track
    ? track.isTrailer
      ? `${track.story.id}_trailer`
      : track.episode?.id || `${track.story.id}_ep1`
    : '';

  const audioSrc = track
    ? (track.isTrailer ? track.story.trailerAudioUrl : track.episode?.audioUrl) ||
      (track.isTrailer
        ? `/api/audio/${track.story.id}/trailer/trailer.wav`
        : `/api/audio/${track.story.id}/episode/${track.episode?.id}.wav${
            authToken ? `?token=${encodeURIComponent(authToken)}` : ''
          }`)
    : '';

  const activeVideoSrc = track
    ? track.isTrailer
      ? track.story.trailerVideoUrl
      : track.episode?.videoUrl
    : undefined;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !track || !audioSrc) return;

    setAudioError(null);
    completedTrackRef.current = null;
    setCurrentTime(initialPositionSeconds > 0 ? initialPositionSeconds : 0);
    audio.playbackRate = playbackRate;

    const startPlayback = async () => {
      try {
        audio.load();
        if (initialPositionSeconds > 2) {
          audio.currentTime = initialPositionSeconds;
        }
        await audio.play();
        setPlaying(true);
        onPlayingStateChange(true);
      } catch {
        setPlaying(false);
        onPlayingStateChange(false);
      }
    };

    startPlayback();
  }, [audioSrc, trackId]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  useEffect(() => {
    if (!track || typeof navigator === 'undefined' || !('mediaSession' in navigator)) {
      return;
    }

    const title = track.isTrailer
      ? track.story.trailerTitle
      : track.episode?.title || track.story.title;
    const artworkUrl = resolveArtworkUrl(track.story.coverArt);

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title,
        artist: track.story.narrator,
        album: `Goppo Kahini · ${track.story.title}`,
        artwork: artworkUrl
          ? [{ src: artworkUrl, sizes: '512x512', type: 'image/jpeg' }]
          : [],
      });

      navigator.mediaSession.setActionHandler('play', async () => {
        await audioRef.current?.play();
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        audioRef.current?.pause();
      });
      navigator.mediaSession.setActionHandler('seekbackward', () => {
        if (audioRef.current) {
          audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 10);
        }
      });
      navigator.mediaSession.setActionHandler('seekforward', () => {
        if (audioRef.current) {
          audioRef.current.currentTime = Math.min(
            audioRef.current.duration || 0,
            audioRef.current.currentTime + 10,
          );
        }
      });
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (audioRef.current && typeof details.seekTime === 'number') {
          audioRef.current.currentTime = details.seekTime;
        }
      });
    } catch {
      // Gracefully ignore partial MediaSession implementations
    }
  }, [track, trackId]);

  if (!track) return null;

  const currentEpIndex = track.episode
    ? track.story.episodes.findIndex((e) => e.id === track.episode?.id)
    : -1;
  const hasPrevEp = !track.isTrailer && canPlayEpisodes && currentEpIndex > 0;
  const hasNextEp =
    !track.isTrailer &&
    canPlayEpisodes &&
    currentEpIndex >= 0 &&
    currentEpIndex < track.story.episodes.length - 1;

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      try {
        await audio.play();
      } catch {
        setAudioError('Audio playback could not start.');
      }
    } else {
      audio.pause();
    }
  };

  const skipBy = (delta: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const next = Math.max(0, Math.min(audio.duration || duration || 0, audio.currentTime + delta));
    audio.currentTime = next;
    setCurrentTime(next);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = Number(e.target.value);
    setCurrentTime(next);
    if (audioRef.current) {
      audioRef.current.currentTime = next;
    }
  };

  const cycleSpeed = () => {
    setSpeedIndex((prev) => (prev + 1) % SPEED_OPTIONS.length);
  };

  const displayEpisodeTitle = track.isTrailer
    ? track.story.trailerTitle
    : track.episode?.title || track.story.title;

  return (
    <>
      <audio
        ref={audioRef}
        src={audioSrc}
        preload="none"
        onPlay={() => {
          setPlaying(true);
          onPlayingStateChange(true);
        }}
        onPause={() => {
          setPlaying(false);
          onPlayingStateChange(false);
        }}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d)) setDuration(d);
        }}
        onTimeUpdate={(e) => {
          const ct = e.currentTarget.currentTime;
          const dur = e.currentTarget.duration || duration || 1;
          setCurrentTime(ct);
          if (Math.abs(ct - lastSyncedRef.current) >= 5) {
            lastSyncedRef.current = ct;
            onProgressSync({
              storyId: track.story.id,
              episodeId: trackId,
              isTrailer: track.isTrailer,
              positionSeconds: ct,
              durationSeconds: dur,
            });
          }
        }}
        onEnded={() => {
          setPlaying(false);
          onPlayingStateChange(false);
          if (!track.isTrailer && track.episode && completedTrackRef.current !== trackId) {
            completedTrackRef.current = trackId;
            onEpisodeComplete?.(track.story, track.episode);
          }
          if (hasNextEp) {
            onSelectEpisode(track.story, track.story.episodes[currentEpIndex + 1]);
          }
        }}
        onError={() => {
          setPlaying(false);
          onPlayingStateChange(false);
          setAudioError('Audio stream unavailable or requires verified entitlement.');
        }}
      />

      {/* FULL-SCREEN DEDICATED AUDIO PLAYER */}
      {expanded && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={displayEpisodeTitle}
          className="fixed inset-0 z-50 bg-[#09080B] flex flex-col overflow-y-auto"
        >
          <div className="mx-auto w-full max-w-3xl flex-1 flex flex-col justify-between px-5 py-6 sm:px-8">
            {/* Top Bar */}
            <div className="flex items-center justify-between gap-4 border-b border-white/[0.06] pb-3">
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-xs text-[#9E968F] hover:text-[#F5F2EB] transition-colors cursor-pointer"
              >
                <ChevronDown className="h-4 w-4" />
                <span>{t.player.minimizePlayer}</span>
              </button>

              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-[#EF4444]">
                  {track.isTrailer ? t.player.promotionalTrailer : t.player.fullEpisode}
                </span>
                {track.isTrailer ? (
                  <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-semibold text-emerald-300">
                    {t.player.freePreviewLabel}
                  </span>
                ) : isPremiumStory(track.story) ? (
                  <span className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-400/30 text-[10px] font-semibold text-amber-300">
                    {t.player.adFreeLabel}
                  </span>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => {
                  audioRef.current?.pause();
                  setExpanded(false);
                  onClose();
                }}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-[#9E968F] hover:text-[#F5F2EB] cursor-pointer"
                aria-label={t.player.closePlayer}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Center Artwork or Video Player */}
            <div className="my-6 flex flex-col items-center text-center space-y-5 w-full">
              {activeVideoSrc ? (
                <div className="w-full max-w-2xl aspect-video rounded-2xl overflow-hidden border border-red-500/30 shadow-2xl bg-black">
                  <video
                    controls
                    autoPlay
                    playsInline
                    src={activeVideoSrc}
                    onEnded={() => {
                      if (!track.isTrailer && track.episode && completedTrackRef.current !== trackId) {
                        completedTrackRef.current = trackId;
                        onEpisodeComplete?.(track.story, track.episode);
                      }
                    }}
                    className="h-full w-full object-contain"
                  />
                </div>
              ) : (
                <div className="w-56 sm:w-68 aspect-[4/5] rounded-2xl overflow-hidden border border-white/[0.08] shadow-2xl shadow-black/90 bg-[#120F16]">
                  <ArtworkImage
                    srcKeyOrUrl={track.story.coverArt}
                    alt={track.story.title}
                    eager
                    className="h-full w-full object-cover"
                  />
                </div>
              )}

              <div className="space-y-1.5 max-w-lg">
                <div className="flex items-center justify-center gap-2">
                  <p className="text-xs text-[#EF4444] font-medium tracking-wide">
                    {track.story.title}
                  </p>
                  {activeVideoSrc && (
                    <span className="px-2 py-0.5 rounded bg-red-500/20 border border-red-500/30 text-[10px] font-semibold text-red-300 flex items-center gap-1">
                      <Video className="h-3 w-3" />
                      ভিডিও মোড
                    </span>
                  )}
                </div>
                <h2 className="font-editorial text-2xl sm:text-3xl font-bold text-[#F5F2EB]">
                  {displayEpisodeTitle}
                </h2>
                <p className="text-xs text-[#9E968F]">{track.story.narrator}</p>
              </div>
            </div>

            {/* Scrubber, Transport Controls & Episode Switcher */}
            <div className="space-y-5 pb-4">
              {audioError && (
                <p className="text-xs text-center text-[#E05A5B]">{audioError}</p>
              )}

              {/* Timeline Scrubber */}
              <div className="space-y-1.5">
                <input
                  type="range"
                  min={0}
                  max={Math.max(1, duration)}
                  step={0.5}
                  value={Math.min(currentTime, Math.max(1, duration))}
                  onChange={handleSeek}
                  aria-label="Audio playback timeline"
                  className="w-full accent-[#EF4444] h-1.5 bg-white/[0.08] rounded-lg cursor-pointer"
                />
                <div className="flex items-center justify-between font-mono-num text-[11px] text-[#9E968F]">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>

              {/* Primary Transport Controls */}
              <div className="flex items-center justify-center gap-4 sm:gap-7">
                <button
                  type="button"
                  disabled={!hasPrevEp}
                  onClick={() =>
                    hasPrevEp &&
                    onSelectEpisode(track.story, track.story.episodes[currentEpIndex - 1])
                  }
                  aria-label={t.player.prevEpisode}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[#F5F2EB] disabled:opacity-20 hover:bg-white/[0.06] cursor-pointer disabled:cursor-not-allowed"
                >
                  <SkipBack className="h-5 w-5" />
                </button>

                <button
                  type="button"
                  onClick={() => skipBy(-10)}
                  aria-label={t.player.skipBack10}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.04] border border-white/[0.07] text-[#F5F2EB] hover:bg-white/[0.08] cursor-pointer"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  onClick={togglePlay}
                  aria-label={playing ? 'Pause' : 'Play'}
                  className="inline-flex h-15 w-15 items-center justify-center rounded-full bg-gradient-to-r from-[#DC2626] via-[#EF4444] to-[#B91C1C] hover:brightness-110 text-white shadow-lg shadow-red-950/40 transition-all cursor-pointer"
                >
                  {playing ? (
                    <Pause className="h-6 w-6 fill-current" />
                  ) : (
                    <Play className="h-6 w-6 fill-current ml-0.5" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => skipBy(10)}
                  aria-label={t.player.skipForward10}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.04] border border-white/[0.07] text-[#F5F2EB] hover:bg-white/[0.08] cursor-pointer"
                >
                  <RotateCw className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  disabled={!hasNextEp}
                  onClick={() =>
                    hasNextEp &&
                    onSelectEpisode(track.story, track.story.episodes[currentEpIndex + 1])
                  }
                  aria-label={t.player.nextEpisode}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[#F5F2EB] disabled:opacity-20 hover:bg-white/[0.06] cursor-pointer disabled:cursor-not-allowed"
                >
                  <SkipForward className="h-5 w-5" />
                </button>
              </div>

              {/* Speed Control & Background Audio Note */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-white/[0.06]">
                <button
                  type="button"
                  onClick={cycleSpeed}
                  className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.07] text-xs font-mono-num font-semibold text-[#EF4444] hover:bg-white/[0.07] cursor-pointer"
                >
                  {t.player.speed}: {playbackRate}x
                </button>
                <p className="text-[11px] text-[#7D7670] text-center sm:text-right max-w-md">
                  {t.player.backgroundAudioNote}
                </p>
              </div>

              {/* Episode Selector inside Full Player */}
              {canPlayEpisodes && track.story.episodes.length > 1 && (
                <div className="pt-2 space-y-2">
                  <h3 className="text-xs font-semibold text-[#9E968F]">
                    {t.player.episodeListHeading}
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {track.story.episodes.map((ep) => {
                      const active = !track.isTrailer && track.episode?.id === ep.id;
                      return (
                        <button
                          key={ep.id}
                          type="button"
                          onClick={() => onSelectEpisode(track.story, ep)}
                          className={`flex items-center justify-between px-3 py-2.5 rounded-xl border text-left text-xs transition-all cursor-pointer ${
                            active
                              ? 'bg-red-500/15 border-red-500/30 text-red-300'
                              : 'bg-white/[0.02] border-white/[0.05] text-[#9E968F] hover:text-[#F5F2EB] hover:bg-white/[0.04]'
                          }`}
                        >
                          <span className="truncate pr-2">{ep.title}</span>
                          <span className="font-mono-num shrink-0 text-[#EF4444]">{ep.durationLabel}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <AdSlotContainer
                placement="free_player_banner"
                isAdFreeContent={!track.isTrailer && isPremiumStory(track.story)}
              />
            </div>
          </div>
        </div>
      )}

      {/* COMPACT PERSISTENT MINI-PLAYER BAR */}
      {!expanded && (
        <div className="fixed bottom-0 inset-x-0 z-40 bg-gradient-to-r from-[#0E0C11]/95 via-[#110E14]/95 to-[#0D0B10]/95 backdrop-blur-xl border-t border-white/[0.08] shadow-2xl shadow-black">
          {/* Top progress indicator */}
          <div className="h-0.5 w-full bg-white/[0.05]">
            <div
              className="h-full bg-gradient-to-r from-[#DC2626] to-[#EF4444] transition-all duration-150"
              style={{
                width: `${duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0}%`,
              }}
            />
          </div>

          <div className="mx-auto max-w-7xl px-3 sm:px-6 h-16 flex items-center justify-between gap-3">
            {/* Artwork + Title */}
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="flex items-center gap-3 min-w-0 text-left flex-1 cursor-pointer"
            >
              <div className="h-11 w-9 rounded-md overflow-hidden border border-white/[0.08] shrink-0 bg-[#120F16]">
                <ArtworkImage
                  srcKeyOrUrl={track.story.coverArt}
                  alt={track.story.title}
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="min-w-0">
                <p className="font-editorial text-sm font-bold text-[#F5F2EB] truncate">
                  {displayEpisodeTitle}
                </p>
                <p className="text-xs text-[#9E968F] truncate">
                  {track.story.title} ·{' '}
                  <span className="font-mono-num text-[#EF4444]">
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </span>
                </p>
              </div>
            </button>

            {/* Controls */}
            <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
              {activeVideoSrc && (
                <button
                  type="button"
                  onClick={() => setExpanded(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-600/30 hover:bg-red-600/50 border border-red-500/40 text-[11px] font-semibold text-red-200 cursor-pointer transition-all"
                  title="ভিডিও স্ক্রিন ওপেন করুন"
                >
                  <Video className="h-3.5 w-3.5 text-red-400" />
                  <span className="hidden sm:inline">ভিডিও দেখুন</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => skipBy(-10)}
                aria-label={t.player.skipBack10}
                className="hidden sm:inline-flex h-9 w-9 items-center justify-center rounded-full text-[#9E968F] hover:text-[#F5F2EB] hover:bg-white/[0.05] cursor-pointer"
              >
                <RotateCcw className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={togglePlay}
                aria-label={playing ? 'Pause' : 'Play'}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-r from-[#DC2626] via-[#EF4444] to-[#B91C1C] hover:brightness-110 text-white cursor-pointer shadow-md shadow-red-950/30"
              >
                {playing ? (
                  <Pause className="h-4 w-4 fill-current" />
                ) : (
                  <Play className="h-4 w-4 fill-current ml-0.5" />
                )}
              </button>

              <button
                type="button"
                onClick={cycleSpeed}
                className="hidden md:inline-flex px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/[0.07] font-mono-num text-xs text-[#EF4444] hover:bg-white/[0.08] cursor-pointer"
              >
                {playbackRate}x
              </button>

              <button
                type="button"
                onClick={() => setExpanded(true)}
                aria-label={t.player.expandPlayer}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-[#9E968F] hover:text-[#F5F2EB] hover:bg-white/[0.05] cursor-pointer"
              >
                <ChevronUp className="h-5 w-5" />
              </button>

              <button
                type="button"
                onClick={() => {
                  audioRef.current?.pause();
                  onClose();
                }}
                aria-label={t.player.closePlayer}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-[#9E968F] hover:text-[#F5F2EB] hover:bg-white/[0.05] cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
