import { createHash } from "node:crypto";

export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  hue: number;
  /** What the <audio> element plays first. */
  src: string | null;
  /** Used automatically if `src` fails (the other one of direct / proxy). */
  fallbackSrc: string | null;
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

// ---- Settings (all optional; the defaults match your repo) -----------------
const REPO = process.env.GITHUB_REPO ?? "user-741/SangIT";
const TAG = process.env.GITHUB_RELEASE_TAG ?? "v1.0";
// "direct": the browser streams from GitHub. "proxy": it streams through /api/stream/:id.
const STREAM_MODE = process.env.STREAM_MODE === "proxy" ? "proxy" : "direct";
// Optional read-only token. Only needed if GitHub's 60 requests/hour anonymous limit bites.
const TOKEN = process.env.GITHUB_TOKEN;
const CACHE_MS = 10 * 60 * 1000;
const MIN_ARTIST_PLAYLIST = 5; // artists with this many songs get an auto playlist

const AUDIO = /\.(m4a|mp4|aac|mp3|ogg|opus|wav|flac)$/i;
const MIME: Record<string, string> = {
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  aac: "audio/aac",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  opus: "audio/ogg",
  wav: "audio/wav",
  flac: "audio/flac",
};

interface Asset {
  name: string;
  browser_download_url: string;
}

export interface Source {
  url: string;
  mime: string;
}

interface Snapshot {
  at: number;
  tracks: Track[];
  playlists: Playlist[];
  sources: Map<string, Source>;
}

const md5 = (s: string) => createHash("md5").update(s).digest("hex");
const hueOf = (s: string) => parseInt(md5(s).slice(0, 4), 16) % 360;

async function gh<T>(path: string): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "sangit-library",
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status} for ${path}`);
  return (await res.json()) as T;
}

async function fetchAssets(): Promise<Asset[]> {
  const release = await gh<{ id: number }>(`/repos/${REPO}/releases/tags/${TAG}`);
  // The release object can truncate big asset lists, so page through the assets endpoint (100 per page).
  const all: Asset[] = [];
  for (let page = 1; page <= 30; page++) {
    const batch = await gh<Asset[]>(`/repos/${REPO}/releases/${release.id}/assets?per_page=100&page=${page}`);
    all.push(...batch);
    if (batch.length < 100) break;
  }
  return all.filter((a) => AUDIO.test(a.name));
}

/**
 * GitHub rewrites spaces (and apostrophes) in uploaded asset names to dots, so
 * "01.-.Drake.-.One.Dance.m4a" is really "01 - Drake - One Dance". Handles both styles.
 */
function parseName(fileName: string): { artist: string; title: string } {
  const stem = fileName.replace(AUDIO, "").trim();
  const dotted = !stem.includes(" - ");
  const sep = dotted ? ".-." : " - ";
  const clean = (s: string) =>
    (dotted ? s.replace(/([a-z])\.(t|s|m|d|ll|re|ve)(?=\.|$)/g, "$1'$2").replace(/\./g, " ") : s).replace(/\s+/g, " ").trim();

  const parts = stem.split(sep);
  if (/^\d+$/.test(parts[0] ?? "") && parts.length > 1) parts.shift(); // leading track number
  const [first = "", ...rest] = parts;
  if (!rest.length) return { artist: "Unknown artist", title: clean(first) };
  return { artist: clean(first), title: clean(rest.join(sep)) };
}

function build(assets: Asset[]): Snapshot {
  const sources = new Map<string, Source>();
  const tracks = assets.map((a): Track => {
    const id = md5(a.name).slice(0, 10); // same id scheme as before, so saved likes keep working
    const ext = (a.name.match(AUDIO)?.[1] ?? "m4a").toLowerCase();
    sources.set(id, { url: a.browser_download_url, mime: MIME[ext] ?? "audio/mp4" });

    const { artist, title } = parseName(a.name);

    const direct = a.browser_download_url;
    const proxied = `/api/stream/${id}`;
    return {
      id,
      title,
      artist,
      album: "Singles",
      duration: 0, // GitHub doesn't know durations; the player reads it from the audio once loaded
      hue: hueOf(artist),
      src: STREAM_MODE === "proxy" ? proxied : direct,
      fallbackSrc: STREAM_MODE === "proxy" ? direct : proxied,
    };
  });
  tracks.sort((a, b) => a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title));

  const byArtist = new Map<string, string[]>();
  for (const t of tracks) byArtist.set(t.artist, [...(byArtist.get(t.artist) ?? []), t.id]);
  const playlists: Playlist[] = [...byArtist]
    .filter(([name, ids]) => ids.length >= MIN_ARTIST_PLAYLIST && name !== "Unknown artist")
    .map(([name, trackIds]) => ({ id: md5(name).slice(0, 8), name, trackIds }));

  return { at: Date.now(), tracks, playlists, sources };
}

// ---- Cache: one GitHub round trip per warm serverless instance per 10 minutes ----
let cache: Snapshot | null = null;
let inflight: Promise<Snapshot> | null = null;

async function snapshot(): Promise<Snapshot> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache;
  inflight ??= fetchAssets()
    .then((assets) => (cache = build(assets)))
    .catch((err) => {
      if (!cache) throw err;
      cache.at = Date.now() - CACHE_MS + 60_000; // keep serving the old list, retry in a minute
      return cache;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export const library: LibrarySource = {
  tracks: async () => (await snapshot()).tracks,
  playlists: async () => (await snapshot()).playlists,
};

/** Look up the GitHub URL for a track id (used by the /api/stream proxy; only known URLs are ever fetched). */
export async function sourceFor(id: string): Promise<Source | undefined> {
  return (await snapshot()).sources.get(id);
}