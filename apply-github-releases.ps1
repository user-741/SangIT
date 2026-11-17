# ============================================================================
# SangIT: replace Vercel Blob with GitHub Releases (user-741/SangIT, tag v1.0)
# Run from the root of a CLONE of the repo (or its parent folder):
#     powershell -ExecutionPolicy Bypass -File .\apply-github-releases.ps1
# Stops before committing if the typecheck fails. Never force-pushes.
# ============================================================================
$ErrorActionPreference = "Continue"   # Windows PowerShell 5.1 turns harmless native stderr output into errors under "Stop"
function Say($m) { Write-Host ">> $m" -ForegroundColor Cyan }
function N($t) { $t -replace "`r`n", "`n" }
function Save($path, $text) { [IO.File]::WriteAllText($path, $text, (New-Object Text.UTF8Encoding $false)) }
function Check($what) { if ($LASTEXITCODE -ne 0) { throw "$what failed (exit code $LASTEXITCODE)" } }

# --- 1. Find the project (the folder that contains server\src\library.ts) -----
$root = @((Get-Location).Path) + @(Get-ChildItem -Directory | ForEach-Object FullName) |
  Where-Object { Test-Path (Join-Path $_ "server\src\library.ts") } | Select-Object -First 1
if (-not $root) { throw "Could not find server\src\library.ts. cd into your SangIT clone first." }
Set-Location $root
Say "Project folder: $root"

# --- 2. server/src/library.ts : list tracks from the GitHub Release ------------
Save (Join-Path $root "server\src\library.ts") (N @'
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
'@)
Say "Wrote server/src/library.ts"

# --- 3. server/src/app.ts : add the /api/stream/:id proxy ----------------------
$appPath = Join-Path $root "server\src\app.ts"
$app = N (Get-Content $appPath -Raw)
if ($app.Contains("sourceFor")) { Say "app.ts already patched, skipping" } else {
  $old = N @'
api.get("/library/tracks", requireAuth, async (_req, res) => res.json(await library.tracks()));
api.get("/library/playlists", requireAuth, async (_req, res) => res.json(await library.playlists()));
'@
  $new = N @'
// Express 4 doesn't catch rejected promises, so route async handlers through this.
const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => {
  fn(req, res).catch(next);
};

api.get("/library/tracks", requireAuth, wrap(async (_req, res) => res.json(await library.tracks())));
api.get("/library/playlists", requireAuth, wrap(async (_req, res) => res.json(await library.playlists())));

// Streams a GitHub release file through this server with audio headers and Range support.
// Only URLs that came from the release listing can be fetched, so this is not an open proxy.
api.get(
  "/stream/:id",
  requireAuth,
  wrap(async (req, res) => {
    const source = await sourceFor(String(req.params.id));
    if (!source) return void res.status(404).json({ error: "Track not found" });

    const ctrl = new AbortController();
    res.on("close", () => ctrl.abort());
    const upstream = await fetch(source.url, {
      headers: req.headers.range ? { Range: req.headers.range } : {},
      signal: ctrl.signal,
    });
    if (!upstream.body || (!upstream.ok && upstream.status !== 206)) {
      return void res.status(502).json({ error: "Could not fetch the file" });
    }

    res.status(upstream.status);
    res.setHeader("Content-Type", source.mime); // GitHub sends application/octet-stream
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Cache-Control", "private, max-age=3600");
    for (const h of ["content-length", "content-range"]) {
      const v = upstream.headers.get(h);
      if (v) res.setHeader(h, v);
    }
    pipeline(Readable.fromWeb(upstream.body as never), res, () => {});
  }),
);
'@
  if (-not $app.Contains($old)) { throw "app.ts does not look like the expected version; add the /stream route by hand (see chat)." }
  $app = $app.Replace($old, $new)
  $app = $app.Replace('import cookieParser from "cookie-parser";', "import { pipeline, Readable } from `"node:stream`";`nimport cookieParser from `"cookie-parser`";")
  $app = $app.Replace('import { library } from "./library";', 'import { library, sourceFor } from "./library";')
  Save $appPath $app
  Say "Patched server/src/app.ts"
}

# --- 4. Front end: fall back to the other URL if the first one fails -----------
$htmlPath = Join-Path $root "web\index.html"
$playerPath = Join-Path $root "web\src\usePlayer.ts"
$apiPath = Join-Path $root "web\src\api.ts"
if ((Test-Path $htmlPath) -and ((Get-Content $htmlPath -Raw) -match "audio\.onerror")) {
  $h = Get-Content $htmlPath -Raw
  if ($h.Contains("fallbackSrc")) { Say "web/index.html already patched, skipping" } else {
    $m = [regex]::Match($h, 'audio\.onerror = \(\) => \{\r?\n\s*if \(token !== loadToken\) return;')
    $key = 'hue:t.hue, src:t.src }'
    if ($m.Success -and $h.Contains($key)) {
      $ins = N @'

    if (t.fallback && !t.triedFallback) {   // GitHub refused to stream: retry through /api/stream
      t.triedFallback = true;
      audio.src = t.fallback;
      audio.load();
      return;
    }
'@
      $h = $h.Insert($m.Index + $m.Length, $ins)
      $h = $h.Replace($key, 'hue:t.hue, src:t.src, fallback:t.fallbackSrc }')
      Save $htmlPath $h
      Say "Patched web/index.html"
    } else { Write-Warning "web/index.html differs from what I expected. Skipped; set STREAM_MODE=proxy in Vercel instead." }
  }
} elseif ((Test-Path $playerPath) -and (Test-Path $apiPath)) {
  $p = N (Get-Content $playerPath -Raw)
  $a = N (Get-Content $apiPath -Raw)
  $oldFail = 'const onFail = () => setPlaying(false);'
  if ($p.Contains($oldFail) -and -not $p.Contains("fallbackSrc")) {
    $newFail = N @'
const onFail = () => {
      const t = live.current.track;
      const alt = t?.fallbackSrc ? new URL(t.fallbackSrc, location.href).href : null;
      if (alt && a.src !== alt) {   // GitHub refused to stream: retry through /api/stream
        a.src = alt;
        a.play().catch(() => setPlaying(false));
        return;
      }
      setPlaying(false);
    };
'@
    Save $playerPath ($p.Replace($oldFail, $newFail.TrimEnd("`n")))
    $oldT = "  hue: number;`n  src: string | null;`n}"
    if ($a.Contains($oldT)) { Save $apiPath ($a.Replace($oldT, "  hue: number;`n  src: string | null;`n  fallbackSrc?: string | null;`n}")) }
    Say "Patched web/src/usePlayer.ts and api.ts"
  } else { Say "React player already patched or different, skipping" }
} else { Write-Warning "Could not find the player. Set STREAM_MODE=proxy in Vercel to avoid needing a front-end change." }

# --- 5. Remove the Vercel Blob / Mega upload tooling ----------------------------
$pkg = Get-Content (Join-Path $root "package.json") -Raw
if ($pkg -match "@vercel/blob|megajs|sync-mega") {
  npm uninstall @vercel/blob megajs; Check "npm uninstall"
  npm pkg delete scripts.sync-mega
}
Remove-Item (Join-Path $root "scripts\sync-mega.mjs") -ErrorAction SilentlyContinue
Remove-Item (Join-Path $root ".mega-cache") -Recurse -Force -ErrorAction SilentlyContinue

# --- 6. Keep secrets out of git (a file named "env" is not covered by ".env") ---
$giPath = Join-Path $root ".gitignore"
$gi = if (Test-Path $giPath) { Get-Content $giPath } else { @() }
foreach ($line in "env", ".env", ".env.*", ".mega-cache") { if ($gi -notcontains $line) { Add-Content $giPath $line } }
git rm --cached --ignore-unmatch --quiet env 2>$null

# --- 7. Install + typecheck before committing -----------------------------------
Say "npm install"
npm install; Check "npm install"
Say "npm run typecheck"
npm run typecheck; Check "typecheck"

# --- 8. Commit and push to main (Vercel deploys from this push) -----------------
git rev-parse --is-inside-work-tree *> $null
if ($LASTEXITCODE -ne 0) { throw "Not inside a git repo. Run: git clone https://github.com/user-741/SangIT.git" }
if (-not (git remote)) { git remote add origin https://github.com/user-741/SangIT.git }
git add -A
git diff --cached --quiet
if ($LASTEXITCODE -eq 0) { Say "Nothing to commit."; return }
git status --short
git commit -m "Serve music from GitHub Releases (v1.0) instead of Vercel Blob"; Check "git commit"
git push origin HEAD:main; Check "git push"
Say "Pushed. Watch the deploy at https://vercel.com/dashboard"