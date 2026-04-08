'use client';

import { useState, useRef, useEffect } from 'react';
import { Play, Pause } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AudioPlayerProps {
  url: string;
  isOutbound?: boolean;
}

export function AudioPlayer({ url, isOutbound = false }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onLoadedMetadata = () => setDuration(audio.duration);
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onEnded = () => setIsPlaying(false);

    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
    };
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) { audio.pause(); } else { audio.play(); }
    setIsPlaying(!isPlaying);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex items-center gap-2 min-w-[200px]">
      <audio ref={audioRef} src={url} preload="metadata" />
      <button
        onClick={togglePlay}
        className={cn(
          'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
          isOutbound ? 'bg-[#00a884] text-white' : 'bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-200'
        )}
      >
        {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
      </button>

      <div className="flex-1 min-w-0">
        {/* Progress bar */}
        <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden cursor-pointer"
          onClick={(e) => {
            const audio = audioRef.current;
            if (!audio || !duration) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const pct = (e.clientX - rect.left) / rect.width;
            audio.currentTime = pct * duration;
          }}
        >
          <div
            className={cn('h-full rounded-full transition-all', isOutbound ? 'bg-[#00a884]' : 'bg-[#8696a0]')}
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-[10px] text-muted-foreground mt-0.5 block">
          {isPlaying ? formatTime(currentTime) : formatTime(duration || 0)}
        </span>
      </div>
    </div>
  );
}
