import { createHash } from "node:crypto";
import catalog from "./catalog.json";

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
  cover: string | null;
  year: number | null;
  explicit: boolean;
}

export interface Playlist {
  id: string;
  name: string;
  trackIds: string[];
  /** Songs in the original playlist, including ones you don't have yet. */
  total: number;
}

/** A song that is in one of your imported playlists but has no file in the release yet. */
export interface MissingTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  cover: string | null;
  popularity: number;
  playlists: string[];
}

export interface LibrarySource {
  tracks(): Promise<Track[]>;
  playlists(): Promise<Playlist[]>;
  missing(): Promise<MissingTrack[]>;
}

// ---- Settings (all optional; the defaults match your repo) -----------------
const REPO = process.env.GITHUB_REPO ?? "user-741/SangIT";
const TAG = process.env.GITHUB_RELEASE_TAG ?? "v1.0";
// "direct": the browser streams from GitHub. "proxy": it streams through /api/stream/:id.
const STREAM_MODE = process.env.STREAM_MODE === "proxy" ? "proxy" : "direct";
// Optional read-only token. Only needed if GitHub's 60 requests/hour anonymous limit bites.
const TOKEN = process.env.GITHUB_TOKEN;
const CACHE_MS = 10 * 60 * 1000;
const MIN_ARTIST_PLAYLIST = 5; // artists with this many unmatched songs get an auto playlist

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

interface CatalogTrack {
  k: string;
  t: string;
  a: string[];
  al: string;
  c: string | null;
  d: number;
  y: number | null;
  e: number;
  p: number;
}

interface Snapshot {
  at: number;
  tracks: Track[];
  playlists: Playlist[];
  missing: MissingTrack[];
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

// ---- Matching files to the Spotify catalog ---------------------------------
const squash = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");

/** "Work from Home (feat. Ty Dolla $ign) - Remix" and "Work from Home feat Ty Dolla ign" -> "workfromhome" */
const titleKey = (s: string) =>
  squash(
    s
      .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
      .replace(/\s(feat\.?|ft\.?|featuring)(\s|$).*$/i, "")
      .replace(/\s-\s.*$/, ""),
  );

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0] ?? 0;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j] ?? 0;
      row[j] = Math.min((row[j] ?? 0) + 1, (row[j - 1] ?? 0) + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length] ?? 0;
}

/** GitHub drops non-ASCII letters from uploaded file names ("Tiësto" -> "Tisto", "GIVĒON" -> "GIVON"). */
const ascii = (s: string) => s.replace(/[^\x00-\x7F]/g, "");

const entries = catalog.tracks as CatalogTrack[];
type Candidate = { entry: CatalogTrack; key: string; full: string; asciiKey: string };
const byArtist = new Map<string, Candidate[]>();
for (const entry of entries) {
  const cand = { entry, key: titleKey(entry.t), full: squash(entry.t), asciiKey: titleKey(ascii(entry.t)) };
  for (const artist of entry.a) {
    for (const ak of new Set([squash(artist), squash(ascii(artist))])) {
      if (ak) byArtist.set(ak, [...(byArtist.get(ak) ?? []), cand]);
    }
  }
}

function matchCatalog(artist: string, title: string): CatalogTrack | undefined {
  const pool = byArtist.get(squash(artist)) ?? byArtist.get(squash(ascii(artist)));
  const key = titleKey(title);
  const full = squash(title);
  if (!pool || !key) return undefined;
  return (
    pool.find((c) => c.key === key) ??
    pool.find((c) => c.full === full || c.asciiKey === key) ?? // "D T B Interlude" = "D.T.B. (Interlude)"
    pool.find((c) => key.length >= 4 && c.key.length >= 4 && (c.key.startsWith(key) || key.startsWith(c.key))) ??
    pool.find((c) => key.length >= 6 && distance(c.key, key) <= Math.max(1, Math.floor(key.length * 0.2)))
  )?.entry;
}

function sameSong(hit: CatalogTrack, key: string): CatalogTrack[] {
  const artist = squash(hit.a[0] ?? "");
  return (byArtist.get(artist) ?? []).filter((c) => c.key === key && squash(c.entry.a[0] ?? "") === artist).map((c) => c.entry);
}

function build(assets: Asset[]): Snapshot {
  const sources = new Map<string, Source>();
  const bySpotifyId = new Map<string, string>(); // catalog track id -> our track id
  const tracks: Track[] = [];

  for (const a of [...assets].sort((x, y) => x.name.localeCompare(y.name))) {
    const id = md5(a.name).slice(0, 10); // same id scheme as before, so saved likes keep working
    const ext = (a.name.match(AUDIO)?.[1] ?? "m4a").toLowerCase();
    const parsed = parseName(a.name);
    const hit = matchCatalog(parsed.artist, parsed.title);

    // The same song twice (e.g. it was in both playlists): keep the first file only.
    if (hit && bySpotifyId.has(hit.k)) continue;
    if (hit) {
      // Playlists can hold the same song under several Spotify entries (single vs album version):
      // point all of them at this file.
      const key = titleKey(hit.t);
      for (const twin of sameSong(hit, key)) if (!bySpotifyId.has(twin.k)) bySpotifyId.set(twin.k, id);
    }

    sources.set(id, { url: a.browser_download_url, mime: MIME[ext] ?? "audio/mp4" });
    const proxied = `/api/stream/${id}`;
    const direct = a.browser_download_url;
    const artist = hit?.a[0] ?? parsed.artist;
    const album = hit?.al ?? "Singles";
    tracks.push({
      id,
      title: hit?.t ?? parsed.title,
      artist,
      album,
      duration: hit?.d ?? 0, // unmatched files: the player reads the real length once audio loads
      hue: hueOf(hit ? album : artist),
      src: STREAM_MODE === "proxy" ? proxied : direct,
      fallbackSrc: STREAM_MODE === "proxy" ? direct : proxied,
      cover: hit?.c ?? null,
      year: hit?.y ?? null,
      explicit: Boolean(hit?.e),
    });
  }
  tracks.sort((a, b) => a.artist.localeCompare(b.artist) || a.album.localeCompare(b.album) || a.title.localeCompare(b.title));

  // Playlists from your imported Spotify exports ...
  const playlists: Playlist[] = catalog.playlists
    .map((p) => ({
      id: md5(`pl:${p.name}`).slice(0, 8),
      name: p.name,
      trackIds: p.ids.map((k) => bySpotifyId.get(k)).filter((v): v is string => Boolean(v)),
      total: p.ids.length,
    }))
    .filter((p) => p.trackIds.length);

  // ... plus automatic ones for artists whose files didn't match any export.
  const unmatched = new Map<string, string[]>();
  for (const t of tracks) {
    if (t.album === "Singles" && t.artist !== "Unknown artist") unmatched.set(t.artist, [...(unmatched.get(t.artist) ?? []), t.id]);
  }
  for (const [name, trackIds] of unmatched) {
    if (trackIds.length >= MIN_ARTIST_PLAYLIST) playlists.push({ id: md5(name).slice(0, 8), name, trackIds, total: trackIds.length });
  }

  // Songs you listed on Spotify but don't have a file for yet.
  const inPlaylists = new Map<string, string[]>();
  for (const p of catalog.playlists) for (const k of p.ids) inPlaylists.set(k, [...(inPlaylists.get(k) ?? []), p.name]);
  const missing: MissingTrack[] = entries
    .filter((e) => !bySpotifyId.has(e.k))
    .map((e) => ({
      id: e.k,
      title: e.t,
      artist: e.a.join(", "),
      album: e.al,
      cover: e.c,
      popularity: e.p,
      playlists: inPlaylists.get(e.k) ?? [],
    }))
    .sort((a, b) => b.popularity - a.popularity);

  return { at: Date.now(), tracks, playlists, missing, sources };
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
  missing: async () => (await snapshot()).missing,
};

/**
 * Fast path for /api/stream: the client also sends the release file name, so the URL can be built
 * without listing the release through the GitHub API (60 requests/hour without a token). The name must
 * hash to the track id, and the URL is always inside this repo's release, so this is still not an open proxy.
 */
export function directSource(id: string, name: string): Source | undefined {
  if (!name || name.length > 300 || /[\\/]/.test(name) || !AUDIO.test(name) || md5(name).slice(0, 10) !== id) return undefined;
  const ext = (name.match(AUDIO)?.[1] ?? "m4a").toLowerCase();
  return {
    url: `https://github.com/${REPO}/releases/download/${encodeURIComponent(TAG)}/${encodeURIComponent(name)}`,
    mime: MIME[ext] ?? "audio/mp4",
  };
}

/** Look up the GitHub URL for a track id (used by the /api/stream proxy; only known URLs are ever fetched). */
export async function sourceFor(id: string): Promise<Source | undefined> {
  return (await snapshot()).sources.get(id);
}
