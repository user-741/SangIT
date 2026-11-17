import { useState, useRef, useEffect, useCallback } from 'react';
import { Track } from './api';

export function usePlayer(tracks: Track[]) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [queue, setQueue] = useState<Track[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.72);
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    audioRef.current = new Audio();
    const audio = audioRef.current;
    
    const onTimeUpdate = () => setProgress(audio.currentTime);
    const onLoadedMetadata = () => {
      setDuration(audio.duration || 0);
      if (audio.src) audio.play().catch(() => setIsPlaying(false));
    };
    const onEnded = () => playNext();
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
  }, []);

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
    if (queue.length === 0) return;
    const nextIdx = (currentIndex + 1) % queue.length;
    setCurrentIndex(nextIdx);
    if (audioRef.current) {
      audioRef.current.src = queue[nextIdx].src || queue[nextIdx].fallbackSrc || '';
      audioRef.current.load();
    }
  };

  const playPrev = () => {
    if (queue.length === 0) return;
    const prevIdx = (currentIndex - 1 + queue.length) % queue.length;
    setCurrentIndex(prevIdx);
    if (audioRef.current) {
      audioRef.current.src = queue[prevIdx].src || queue[prevIdx].fallbackSrc || '';
      audioRef.current.load();
    }
  };

  const seek = (fraction: number) => {
    if (audioRef.current && duration > 0) {
      audioRef.current.currentTime = fraction * duration;
    }
  };

  const changeVolume = (val: number) => {
    setVolume(val);
    if (audioRef.current) audioRef.current.volume = val;
  };

  return {
    currentTrack, isPlaying, progress, duration, volume, isMuted,
    playTrack, togglePlay, playNext, playPrev, seek, changeVolume, queue
  };
}
