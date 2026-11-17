import { useState, useRef, useEffect } from 'react';

export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  hue: number;
  src: string | null;
  fallbackSrc?: string | null;
}

export function usePlayer(tracks: Track[]) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [queue, setQueue] = useState<Track[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    audioRef.current = new Audio();
    const audio = audioRef.current;
    
    const onTimeUpdate = () => setProgress(audio.currentTime);
    const onLoadedMetadata = () => {
      setDuration(audio.duration || 0);
      if (audio.src) audio.play().catch(() => setIsPlaying(false));
    };
    const onEnded = () => {
      if (queue.length > 0) {
        const nextIdx = (currentIndex + 1) % queue.length;
        setCurrentIndex(nextIdx);
        audio.src = queue[nextIdx].src || queue[nextIdx].fallbackSrc || '';
        audio.load();
      }
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);

    return () => {
      audio.pause();
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
    };
  }, [queue, currentIndex]);

  const currentTrack = queue[currentIndex] || null;

  const playTrack = (track: Track, newQueue?: Track[]) => {
    if (newQueue) setQueue(newQueue);
    else if (queue.length === 0) setQueue([track]);
    
    const idx = newQueue ? newQueue.findIndex(t => t.id === track.id) : queue.findIndex(t => t.id === track.id);
    setCurrentIndex(idx >= 0 ? idx : 0);
    
    if (audioRef.current) {
      audioRef.current.src = track.src || track.fallbackSrc || '';
      audioRef.current.load();
    }
  };

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) audioRef.current.pause();
    else audioRef.current.play().catch(() => {});
  };

  const playNext = () => {
    if (queue.length === 0 || !audioRef.current) return;
    const nextIdx = (currentIndex + 1) % queue.length;
    setCurrentIndex(nextIdx);
    audioRef.current.src = queue[nextIdx].src || queue[nextIdx].fallbackSrc || '';
    audioRef.current.load();
  };

  const playPrev = () => {
    if (queue.length === 0 || !audioRef.current) return;
    const prevIdx = (currentIndex - 1 + queue.length) % queue.length;
    setCurrentIndex(prevIdx);
    audioRef.current.src = queue[prevIdx].src || queue[prevIdx].fallbackSrc || '';
    audioRef.current.load();
  };

  const seek = (fraction: number) => {
    if (audioRef.current && duration > 0) {
      audioRef.current.currentTime = fraction * duration;
    }
  };

  return {
    currentTrack, isPlaying, progress, duration,
    playTrack, togglePlay, playNext, playPrev, seek
  };
}
