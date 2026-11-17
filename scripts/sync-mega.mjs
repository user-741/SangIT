// Downloads every audio file from a public Mega folder, stores it, and rebuilds server/src/music.json.
//
//   npm run sync-mega -- "https://mega.nz/folder/ID#KEY"     (or set MEGA_URL)
//
// Where the files go:
//   - BLOB_READ_WRITE_TOKEN set  -> uploaded to Vercel Blob (recommended; no size limit on your repo)
//   - otherwise                  -> copied into web/public/music (small libraries only)
//
// Re-running is cheap: files already downloaded or uploaded are skipped.
import { createReadStream } from "node:fs";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { put } from "@vercel/blob";
import { File } from "megajs";
import { audioExts, musicDir, readTrack, root, writeManifest } from "./lib/manifest.mjs";

const url = process.argv[2] ?? process.env.MEGA_URL;
if (!url || !url.includes("mega.nz/folder/")) {
  console.error('Usage: npm run sync-mega -- "https://mega.nz/folder/ID#KEY"');
  process.exit(1);
}

const cacheDir = join(root, ".mega-cache");
const indexPath = join(cacheDir, "uploaded.json");
const useBlob = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
await mkdir(cacheDir, { recursive: true });
if (!useBlob) await mkdir(musicDir, { recursive: true });

const uploaded = await readFile(indexPath, "utf8").then(JSON.parse, () => ({}));
const mime = { ".m4a": "audio/mp4", ".mp4": "audio/mp4", ".aac": "audio/aac", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".opus": "audio/ogg", ".wav": "audio/wav", ".flac": "audio/flac" };

const walk = (node) => (node.children ?? []).flatMap((c) => (c.directory ? walk(c) : [c]));

console.log("Reading the Mega folder…");
const folder = File.fromURL(url);
await folder.loadAttributes();
const remote = walk(folder).filter((f) => f.name && audioExts.has(extname(f.name).toLowerCase()));
console.log(`Found ${remote.length} audio file${remote.length === 1 ? "" : "s"}. Storage: ${useBlob ? "Vercel Blob" : "web/public/music"}\n`);

const names = new Set();
const tracks = [];
let n = 0;
for (const f of remote.sort((a, b) => a.name.localeCompare(b.name))) {
  n++;
  // Names must be unique because they become the track id.
  let name = f.name;
  for (let i = 2; names.has(name); i++) name = `${basename(f.name, extname(f.name))} (${i})${extname(f.name)}`;
  names.add(name);

  const local = join(cacheDir, name);
  const have = await stat(local).then((s) => s.size === f.size, () => false);
  if (have) console.log(`[${n}/${remote.length}] ${name} (already downloaded)`);
  else {
    console.log(`[${n}/${remote.length}] Downloading ${name}…`);
    await writeFile(local, await f.downloadBuffer({}));
  }

  let src;
  if (useBlob) {
    const key = `${name}:${f.size}`;
    if (!uploaded[key]) {
      console.log("   uploading to Vercel Blob…");
      const blob = await put(`music/${name}`, createReadStream(local), {
        access: "public",
        addRandomSuffix: true,
        contentType: mime[extname(name).toLowerCase()],
        multipart: true,
      });
      uploaded[key] = blob.url;
      await writeFile(indexPath, JSON.stringify(uploaded, null, 2));
    }
    src = uploaded[key];
  } else {
    await copyFile(local, join(musicDir, name));
    src = `/music/${encodeURIComponent(name)}`;
  }
  tracks.push(await readTrack(local, name, src));
}

await writeManifest(tracks);
console.log("\nDone. Commit server/src/music.json" + (useBlob ? "" : " and web/public/music") + ", then push to deploy.");
