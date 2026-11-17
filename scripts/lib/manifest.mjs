import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseFile } from "music-metadata";

export const root = fileURLToPath(new URL("../..", import.meta.url));
export const musicDir = join(root, "web/public/music");
export const manifestPath = join(root, "server/src/music.json");
export const audioExts = new Set([".m4a", ".mp4", ".aac", ".mp3", ".ogg", ".opus", ".wav", ".flac"]);

const md5 = (s) => createHash("md5").update(s).digest("hex");
const hueOf = (s) => parseInt(md5(s).slice(0, 4), 16) % 360;

/** Read tags from an audio file on disk and return a library track. */
export async function readTrack(absPath, fileName, src) {
  let title, artist, album, duration;
  try {
    const { common, format } = await parseFile(absPath, { duration: true });
    title = common.title;
    artist = common.artist ?? common.albumartist;
    album = common.album;
    duration = format.duration;
  } catch (e) {
    console.warn(`  Could not read tags for ${fileName}: ${e.message}`);
  }
  // Fall back to "Artist - Title.m4a" file names.
  const stem = basename(fileName, extname(fileName));
  const [a, ...rest] = stem.split(" - ");
  title ||= rest.length ? rest.join(" - ").trim() : stem;
  artist ||= rest.length ? a.trim() : "Unknown artist";
  album ||= "Singles";
  return { id: md5(fileName).slice(0, 10), title, artist, album, duration: Math.round(duration ?? 0), hue: hueOf(artist), src };
}

/** Write server/src/music.json; albums with 2+ songs become playlists. */
export async function writeManifest(tracks) {
  const byAlbum = new Map();
  for (const t of tracks) byAlbum.set(t.album, [...(byAlbum.get(t.album) ?? []), t.id]);
  const playlists = [...byAlbum]
    .filter(([name, ids]) => ids.length > 1 && name !== "Singles")
    .map(([name, trackIds]) => ({ id: md5(name).slice(0, 8), name, trackIds }));
  await writeFile(manifestPath, JSON.stringify({ tracks, playlists }, null, 2) + "\n");
  console.log(`Wrote ${tracks.length} tracks and ${playlists.length} playlists to server/src/music.json`);
}
