import { useState, useRef, useEffect } from 'react';

export interface Track {
  id: string; title: string; artist: string; album: string;
  duration: number; hue: number; src: string | null; fallbackSrc?: string | null;
}

export function usePlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [queue, setQueue] = useState<Track[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<'off' | 'all' | 'one'>('off');

  useEffect(() => {
    audioRef.current = new Audio();
    const audio = audioRef.current;
    
    const onTimeUpdate = () => setProgress(audio.currentTime);
    const onLoadedMetadata = () => {
      setDuration(audio.duration || 0);
      audio.play().catch(() => setIsPlaying(false));
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);

    return () => {
      audio.pause();
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
    };
  }, []);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  const currentTrack = queue[currentIndex] || null;

  const playTrack = (track: Track, newQueue: Track[]) => {
    setQueue(newQueue);
    const idx = newQueue.findIndex(t => t.id === track.id);
    setCurrentIndex(idx);
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

  const next = () => {
    if (!queue.length || !audioRef.current) return;
    let nextIdx = currentIndex + 1;
    if (shuffle) nextIdx = Math.floor(Math.random() * queue.length);
    else if (nextIdx >= queue.length) nextIdx = 0;

    setCurrentIndex(nextIdx);
    audioRef.current.src = queue[nextIdx].src || '';
    audioRef.current.load();
  };

  const prev = () => {
    if (!queue.length || !audioRef.current) return;
    let prevIdx = currentIndex - 1;
    if (prevIdx < 0) prevIdx = queue.length - 1;
    setCurrentIndex(prevIdx);
    audioRef.current.src = queue[prevIdx].src || '';
    audioRef.current.load();
  };

  const seek = (fraction: number) => {
    if (audioRef.current && duration > 0) {
      audioRef.current.currentTime = fraction * duration;
    }
  };

  return {
    currentTrack, isPlaying, progress, duration, volume, shuffle, repeat,
    playTrack, togglePlay, next, prev, seek, setVolume, setShuffle, setRepeat
  };
}
