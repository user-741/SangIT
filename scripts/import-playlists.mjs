// Turns Spotify playlist exports (Exportify CSVs) into server/src/catalog.json.
// The catalog gives your songs real album names, cover art, durations and playlists.
//
//   npm run import-playlists            (reads every .csv in the "playlists" folder)
//   npm run import-playlists -- C:\path\to\folder
//
// Export a playlist as CSV at https://exportify.net, drop it in "playlists/", run the command, commit.
import { readdir, readFile, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const dir = process.argv[2] ?? join(root, "playlists");
const out = join(root, "server/src/catalog.json");

/** Minimal RFC 4180 CSV parser (quoted fields, commas and newlines inside quotes). */
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((v) => v !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); if (row.some((v) => v !== "")) rows.push(row); }
  return rows;
}

const prettyName = (file) =>
  basename(file, extname(file)).replace(/_pl$/i, "").replace(/[_-]+/g, " ").trim().replace(/^./, (c) => c.toUpperCase());

const files = (await readdir(dir)).filter((f) => f.toLowerCase().endsWith(".csv")).sort();
if (!files.length) { console.error(`No .csv files found in ${dir}`); process.exit(1); }

const tracks = new Map();
const playlists = [];
for (const file of files) {
  const [header, ...rows] = parseCsv((await readFile(join(dir, file), "utf8")).replace(/^\uFEFF/, ""));
  const col = (name) => header.indexOf(name);
  const need = ["Track URI", "Track Name", "Artist Name(s)", "Album Name", "Album Image URL"];
  const missing = need.filter((n) => col(n) < 0);
  if (missing.length) { console.warn(`Skipping ${file}: missing columns ${missing.join(", ")}`); continue; }

  const ids = [];
  for (const r of rows) {
    const uri = r[col("Track URI")] ?? "";
    const id = uri.split(":").pop();
    if (!id || uri.startsWith("spotify:local")) continue; // local files have no Spotify data
    if (!tracks.has(id)) {
      tracks.set(id, {
        k: id,
        t: r[col("Track Name")],
        a: (r[col("Artist Name(s)")] ?? "").split(",").map((s) => s.trim()).filter(Boolean),
        al: r[col("Album Name")] || "Singles",
        c: r[col("Album Image URL")] || null,
        d: Math.round(Number(r[col("Track Duration (ms)")] || 0) / 1000),
        y: Number((r[col("Album Release Date")] || "").slice(0, 4)) || null,
        e: r[col("Explicit")] === "true" ? 1 : 0,
        p: Number(r[col("Popularity")] || 0),
      });
    }
    if (!ids.includes(id)) ids.push(id);
  }
  playlists.push({ name: prettyName(file), ids });
  console.log(`${file}: ${ids.length} songs -> playlist "${prettyName(file)}"`);
}

await writeFile(out, JSON.stringify({ tracks: [...tracks.values()], playlists }) + "\n");
console.log(`Wrote ${tracks.size} unique songs and ${playlists.length} playlists to server/src/catalog.json`);
