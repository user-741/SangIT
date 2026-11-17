// Builds server/src/music.json from the audio files already in web/public/music.
// Usage: npm run scan-music
import { readdir } from "node:fs/promises";
import { extname, join } from "node:path";
import { audioExts, musicDir, readTrack, writeManifest } from "./lib/manifest.mjs";

const files = (await readdir(musicDir)).filter((f) => audioExts.has(extname(f).toLowerCase())).sort();
const tracks = [];
for (const file of files) tracks.push(await readTrack(join(musicDir, file), file, `/music/${encodeURIComponent(file)}`));
await writeManifest(tracks);
