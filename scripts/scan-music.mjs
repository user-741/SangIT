// Builds server/src/music.json from the audio files in web/public/music.
// Usage: npm run scan-music
import { createHash } from "node:crypto";
import { readdir, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseFile } from "music-metadata";

const root = fileURLToPath(new URL("..", import.meta.url));
const dir = join(root, "web/public/music");
const out = join(root, "server/src/music.json");
const exts = new Set([".m4a", ".mp4", ".aac", ".mp3", ".ogg", ".opus", ".wav", ".flac"]);

const hueOf = (s) => parseInt(createHash("md5").update(s).digest("hex").slice(0, 4), 16) % 360;

const files = (await readdir(dir)).filter((f) => exts.has(extname(f).toLowerCase())).sort();
const tracks = [];

for (const file of files) {
  let title, artist, album, duration;
  try {
    const { common, format } = await parseFile(join(dir, file), { duration: true });
    title = common.title;
    artist = common.artist ?? common.albumartist;
    album = common.album;
    duration = format.duration;
  } catch (e) {
    console.warn(`Could not read tags for ${file}: ${e.message}`);
  }
  // Fall back to "Artist - Title.m4a" file names.
  const stem = basename(file, extname(file));
  const [a, ...rest] = stem.split(" - ");
  title ||= rest.length ? rest.join(" - ").trim() : stem;
  artist ||= rest.length ? a.trim() : "Unknown artist";
  album ||= "Singles";
  tracks.push({
    id: createHash("md5").update(file).digest("hex").slice(0, 10),
    title,
    artist,
    album,
    duration: Math.round(duration ?? 0),
    hue: hueOf(artist),
    src: `/music/${encodeURIComponent(file)}`,
  });
}

const byAlbum = new Map();
for (const t of tracks) byAlbum.set(t.album, [...(byAlbum.get(t.album) ?? []), t.id]);
const playlists = [...byAlbum]
  .filter(([name, ids]) => ids.length > 1 && name !== "Singles")
  .map(([name, trackIds]) => ({ id: createHash("md5").update(name).digest("hex").slice(0, 8), name, trackIds }));

await writeFile(out, JSON.stringify({ tracks, playlists }, null, 2) + "\n");
console.log(`Wrote ${tracks.length} tracks and ${playlists.length} playlists to server/src/music.json`);
