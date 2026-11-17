import scanned from "./music.json";

export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  hue: number;
  src: string | null;
}

export interface Playlist {
  id: string;
  name: string;
  trackIds: string[];
}

export interface LibrarySource {
  tracks(): Promise<Track[]>;
  playlists(): Promise<Playlist[]>;
}

type Row = [string, string, string, string, number, number];

const rows: Row[] = [
  ["t1", "Neon Weather", "Halcyon Drift", "Slow Static", 214, 265],
  ["t2", "Paper Cities", "Mira Vell", "Paper Cities", 242, 22],
  ["t3", "Low Tide", "Otis Rane", "Alluvial", 178, 195],
  ["t4", "Golden Hour", "Sable Court", "Half Light", 201, 40],
  ["t5", "Kite and Compass", "Lantern Field", "Field Notes", 227, 145],
  ["t6", "Static Bloom", "Halcyon Drift", "Slow Static", 192, 285],
  ["t7", "Every Quiet Room", "Juno Ash", "Nightform", 258, 320],
  ["t8", "Undertow", "Nova Reyes", "Alluvial", 185, 210],
];

const seed: Track[] = rows.map(([id, title, artist, album, duration, hue]) => ({
  id,
  title,
  artist,
  album,
  duration,
  hue,
  src: null,
}));

const demoPlaylists: Playlist[] = [
  { id: "p1", name: "Late night", trackIds: ["t1", "t3", "t7"] },
  { id: "p2", name: "Focus", trackIds: ["t2", "t4", "t6", "t8"] },
];

// Real files (from `npm run scan-music`) replace the demo data once present.
const hasMusic = scanned.tracks.length > 0;

export const library: LibrarySource = {
  tracks: async () => (hasMusic ? (scanned.tracks as Track[]) : seed),
  playlists: async () => (hasMusic ? (scanned.playlists as Playlist[]) : demoPlaylists),
};
