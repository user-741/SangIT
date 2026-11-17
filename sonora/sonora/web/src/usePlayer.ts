import { useEffect, useRef, useState } from "react";
import type { Track } from "./api";

export function usePlayer(queue: Track[]) {
  const [id, setId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const audio = useRef<HTMLAudioElement | null>(null);
  const track = queue.find((t) => t.id === id) ?? null;

  const start = (t: Track) => {
    setId(t.id);
    setTime(0);
    setPlaying(true);
  };

  const play = (t: Track) => (t.id === id ? setPlaying((p) => !p) : start(t));

  const step = (dir: 1 | -1) => {
    if (!queue.length) return;
    const i = queue.findIndex((t) => t.id === id);
    const next = queue[(i + dir + queue.length) % queue.length];
    if (next) start(next);
  };

  useEffect(() => {
    audio.current ??= new Audio();
    const a = audio.current;
    if (!track?.src) {
      a.pause();
      return;
    }
    if (!a.src.endsWith(track.src)) a.src = track.src;
    if (playing) void a.play();
    else a.pause();
  }, [track, playing]);

  useEffect(() => {
    if (!playing || !track) return;
    const k = setInterval(() => {
      setTime((t) => {
        if (t + 1 >= track.duration) {
          step(1);
          return 0;
        }
        return t + 1;
      });
    }, 1000);
    return () => clearInterval(k);
  });

  return { track, playing, time, play, step, toggle: () => setPlaying((p) => !p), seek: setTime };
}
