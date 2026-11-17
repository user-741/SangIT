import { useEffect, useRef, useState } from "react";
import type { Track } from "./api";

export function usePlayer(queue: Track[]) {
  const [track, setTrack] = useState<Track | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [mediaDuration, setMediaDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [shuffle, setShuffle] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);

  // Latest values for event handlers that outlive a render.
  const live = useRef({ queue, track, shuffle, time });
  live.current = { queue, track, shuffle, time };

  const start = (t: Track) => {
    setTrack(t);
    setTime(0);
    setPlaying(true);
  };

  const play = (t: Track) => (t.id === track?.id ? setPlaying((p) => !p) : start(t));

  const step = (dir: 1 | -1) => {
    const { queue: q, track: cur, shuffle: shuf } = live.current;
    if (!q.length) return;
    if (shuf && q.length > 1) {
      const pool = q.filter((t) => t.id !== cur?.id);
      const pick = pool[Math.floor(Math.random() * pool.length)];
      if (pick) start(pick);
      return;
    }
    const i = q.findIndex((t) => t.id === cur?.id);
    const next = i < 0 ? q[0] : q[(i + dir + q.length) % q.length];
    if (next) start(next);
  };

  const stepRef = useRef(step);
  stepRef.current = step;

  // One audio element for the life of the app.
  useEffect(() => {
    const a = (audio.current ??= new Audio());
    a.preload = "metadata";
    const onTime = () => setTime(a.currentTime);
    const onMeta = () => setMediaDuration(Number.isFinite(a.duration) ? a.duration : 0);
    const onEnd = () => stepRef.current(1);
    const onFail = () => setPlaying(false);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("ended", onEnd);
    a.addEventListener("error", onFail);
    return () => {
      a.pause();
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("ended", onEnd);
      a.removeEventListener("error", onFail);
    };
  }, []);

  useEffect(() => {
    if (audio.current) audio.current.volume = volume;
  }, [volume]);

  // Load the new source when the track changes.
  useEffect(() => {
    const a = audio.current;
    if (!a) return;
    setMediaDuration(0);
    if (track?.src) {
      a.src = track.src;
    } else {
      a.removeAttribute("src");
      a.load();
    }
  }, [track]);

  useEffect(() => {
    const a = audio.current;
    if (!a || !track?.src) return;
    if (playing) a.play().catch(() => setPlaying(false));
    else a.pause();
  }, [playing, track]);

  // Tracks without a file (the demo data) keep time with a timer.
  useEffect(() => {
    if (!playing || !track || track.src) return;
    const k = setInterval(() => {
      const next = live.current.time + 0.25;
      if (next >= track.duration) stepRef.current(1);
      else setTime(next);
    }, 250);
    return () => clearInterval(k);
  }, [playing, track]);

  // Lock screen and media key controls.
  useEffect(() => {
    if (!("mediaSession" in navigator) || !track) return;
    navigator.mediaSession.metadata = new MediaMetadata({ title: track.title, artist: track.artist, album: track.album });
    navigator.mediaSession.setActionHandler("play", () => setPlaying(true));
    navigator.mediaSession.setActionHandler("pause", () => setPlaying(false));
    navigator.mediaSession.setActionHandler("previoustrack", () => stepRef.current(-1));
    navigator.mediaSession.setActionHandler("nexttrack", () => stepRef.current(1));
  }, [track]);

  const seek = (s: number) => {
    setTime(s);
    if (audio.current && track?.src) audio.current.currentTime = s;
  };

  const duration = track ? (track.src && mediaDuration ? mediaDuration : track.duration) : 0;

  return {
    track,
    playing,
    time,
    duration,
    volume,
    shuffle,
    start,
    play,
    step,
    seek,
    setVolume,
    toggle: () => setPlaying((p) => !p),
    toggleShuffle: () => setShuffle((s) => !s),
  };
}
