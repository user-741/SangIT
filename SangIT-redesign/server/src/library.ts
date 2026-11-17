import { createHash } from "node:crypto";

export interface Track {
  id: string; title: string; artist: string; album: string;
  duration: number; hue: number; src: string | null; fallbackSrc: string | null;
}
export interface Playlist { id: string; name: string; trackIds: string[]; }
export interface LibrarySource { tracks(): Promise<Track[]>; playlists(): Promise<Playlist[]>; }

const REPO = process.env.GITHUB_REPO ?? "user-741/SangIT";
const TAG = process.env.GITHUB_RELEASE_TAG ?? "v1.0";
const TOKEN = process.env.GITHUB_TOKEN;
const CACHE_MS = 10 * 60 * 1000;

const AUDIO = /\.(m4a|mp4|aac|mp3|ogg|opus|wav|flac)$/i;
const MIME: Record<string, string> = { m4a: "audio/mp4", mp4: "audio/mp4", mp3: "audio/mpeg", aac: "audio/aac", ogg: "audio/ogg", wav: "audio/wav", flac: "audio/flac" };

interface Asset { name: string; browser_download_url: string; }
export interface Source { url: string; mime: string; }
interface Snapshot { at: number; tracks: Track[]; playlists: Playlist[]; sources: Map<string, Source>; }

const md5 = (s: string) => createHash("md5").update(s).digest("hex");
const hueOf = (s: string) => parseInt(md5(s).slice(0, 4), 16) % 360;

async function gh<T>(path: string): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "sangit",
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status} for ${path}`);
  return (await res.json()) as T;
}

async function fetchAssets(): Promise<Asset[]> {
  const release = await gh<{ id: number }>(`/repos/${REPO}/releases/tags/${TAG}`);
  const all: Asset[] = [];
  for (let page = 1; page <= 30; page++) {
    const batch = await gh<Asset[]>(`/repos/${REPO}/releases/${release.id}/assets?per_page=100&page=${page}`);
    all.push(...batch);
    if (batch.length < 100) break;
  }
  return all.filter((a) => AUDIO.test(a.name));
}

function build(assets: Asset[]): Snapshot {
  const sources = new Map<string, Source>();
  const tracks = assets.map((a): Track => {
    const id = md5(a.name).slice(0, 10);
    const ext = (a.name.match(AUDIO)?.[1] ?? "m4a").toLowerCase();
    sources.set(id, { url: a.browser_download_url, mime: MIME[ext] ?? "audio/mp4" });

    const stem = a.name.replace(AUDIO, "").trim();
    // Try to parse "Artist - Title" or "Title - Artist"
    const parts = stem.split(" - ");
    let artist = "Unknown Artist";
    let title = stem;
    if (parts.length >= 2) {
      artist = parts[0].trim();
      title = parts.slice(1).join(" - ").trim();
    }

    const proxied = `/api/stream/${id}`;
    return {
      id, title, artist, album: "Singles", duration: 0, hue: hueOf(artist + title),
      src: proxied, fallbackSrc: a.browser_download_url,
    };
  });
  tracks.sort((a, b) => a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title));

  const byArtist = new Map<string, string[]>();
  for (const t of tracks) byArtist.set(t.artist, [...(byArtist.get(t.artist) ?? []), t.id]);
  const playlists: Playlist[] = [...byArtist]
    .filter(([name, ids]) => ids.length >= 5 && name !== "Unknown Artist")
    .map(([name, trackIds]) => ({ id: md5(name).slice(0, 8), name, trackIds }));

  return { at: Date.now(), tracks, playlists, sources };
}

let cache: Snapshot | null = null;
let inflight: Promise<Snapshot> | null = null;

async function snapshot(): Promise<Snapshot> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache;
  inflight ??= fetchAssets().then((assets) => (cache = build(assets))).finally(() => { inflight = null; });
  return inflight;
}

export const library: LibrarySource = {
  tracks: async () => (await snapshot()).tracks,
  playlists: async () => (await snapshot()).playlists,
};
export async function sourceFor(id: string): Promise<Source | undefined> {
  return (await snapshot()).sources.get(id);
}
