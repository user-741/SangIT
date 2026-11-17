import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { api, type Playlist, type Track } from "./api";
import { Equalizer, LibraryIcon, ListIcon, NextIcon, PauseIcon, PlayIcon, PrevIcon, SearchIcon, ShuffleIcon, SignOutIcon, VolumeIcon } from "./icons";
import { usePlayer } from "./usePlayer";

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const hue = (h: number) => ({ "--h": h }) as CSSProperties;
const total = (tracks: Track[]) => {
  const mins = Math.round(tracks.reduce((n, t) => n + t.duration, 0) / 60);
  return mins >= 60 ? `${Math.floor(mins / 60)} hr ${mins % 60} min` : `${mins} min`;
};

function Login({ onDone }: { onDone: (email: string) => void }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const user = await api.login(String(form.get("email")), String(form.get("password")));
      onDone(user.email);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login">
      <div className="login-glow" aria-hidden="true" />
      <form onSubmit={submit} className="login-card">
        <div className="logo" aria-hidden="true"><LibraryIcon size={22} /></div>
        <h1>Sonora</h1>
        <p className="muted">Your music, all in one place.</p>
        <label>Email<input name="email" type="email" autoComplete="username" required /></label>
        <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
        {error && <p role="alert" className="error">{error}</p>}
        <button className="primary wide" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
    </main>
  );
}

function Library({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [scope, setScope] = useState("all");
  const [query, setQuery] = useState("");
  const [loadError, setLoadError] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([api.tracks(), api.playlists()])
      .then(([t, p]) => {
        setTracks(t);
        setPlaylists(p);
      })
      .catch((e: Error) => setLoadError(e.message))
      .finally(() => setLoaded(true));
  }, []);

  const visible = useMemo(() => {
    const ids = scope === "all" ? null : new Set(playlists.find((p) => p.id === scope)?.trackIds);
    const q = query.trim().toLowerCase();
    return tracks.filter(
      (t) => (!ids || ids.has(t.id)) && (!q || `${t.title} ${t.artist} ${t.album}`.toLowerCase().includes(q)),
    );
  }, [tracks, playlists, scope, query]);

  const player = usePlayer(visible);
  const title = scope === "all" ? "All music" : (playlists.find((p) => p.id === scope)?.name ?? "All music");
  const accent = player.track?.hue ?? visible[0]?.hue ?? 170;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.code !== "Space" || /^(INPUT|TEXTAREA|BUTTON)$/.test(el.tagName)) return;
      e.preventDefault();
      player.toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const playAll = (shuffle: boolean) => {
    if (!visible.length) return;
    if (shuffle !== player.shuffle) player.toggleShuffle();
    const first = shuffle ? visible[Math.floor(Math.random() * visible.length)] : visible[0];
    if (first) player.start(first);
  };

  return (
    <div className="shell" style={hue(accent)}>
      <aside className="side">
        <div className="brand"><span className="logo" aria-hidden="true"><LibraryIcon size={18} /></span>Sonora</div>
        <nav aria-label="Library sections">
          <p className="eyebrow">Library</p>
          <button className={scope === "all" ? "nav on" : "nav"} onClick={() => setScope("all")}>
            <LibraryIcon size={18} />All music<span className="count">{tracks.length}</span>
          </button>
          {playlists.length > 0 && <p className="eyebrow">Playlists</p>}
          {playlists.map((p) => (
            <button key={p.id} className={scope === p.id ? "nav on" : "nav"} onClick={() => setScope(p.id)}>
              <ListIcon size={18} /><span className="clip">{p.name}</span><span className="count">{p.trackIds.length}</span>
            </button>
          ))}
        </nav>
        <div className="account">
          <span className="clip muted" title={email}>{email}</span>
          <button className="icon-btn" onClick={onSignOut} aria-label="Sign out" title="Sign out"><SignOutIcon size={18} /></button>
        </div>
      </aside>

      <main className="main">
        <header className="hero">
          <div className="topbar">
            <div className="search">
              <SearchIcon size={18} />
              <input type="search" placeholder="Search songs, artists, albums" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search your library" />
            </div>
            <button className="icon-btn mobile-only" onClick={onSignOut} aria-label="Sign out"><SignOutIcon size={18} /></button>
          </div>

          <div className="mobile-tabs" role="tablist" aria-label="Library sections">
            <button className={scope === "all" ? "chip on" : "chip"} onClick={() => setScope("all")}>All music</button>
            {playlists.map((p) => (
              <button key={p.id} className={scope === p.id ? "chip on" : "chip"} onClick={() => setScope(p.id)}>{p.name}</button>
            ))}
          </div>

          <div className="hero-body">
            <div className="cover" style={hue(accent)} aria-hidden="true"><LibraryIcon size={56} /></div>
            <div>
              <p className="eyebrow">{scope === "all" ? "Your library" : "Playlist"}</p>
              <h1>{title}</h1>
              <p className="muted">{visible.length} {visible.length === 1 ? "song" : "songs"}{visible.length > 0 && ` · ${total(visible)}`}</p>
            </div>
          </div>

          <div className="actions">
            <button className="play-all" onClick={() => playAll(false)} disabled={!visible.length}><PlayIcon size={20} />Play</button>
            <button className="ghost" onClick={() => playAll(true)} disabled={!visible.length}><ShuffleIcon size={18} />Shuffle</button>
          </div>
        </header>

        <section className="content" aria-label={title}>
          {loadError && <p role="alert" className="error">{loadError}</p>}
          {loaded && !loadError && visible.length === 0 && (
            <p className="empty">{tracks.length === 0 ? "Your library is empty. Add music files and run the scan script." : "No songs match. Clear the search or pick another section."}</p>
          )}
          {visible.length > 0 && (
            <>
              <div className="thead" aria-hidden="true"><span>#</span><span>Title</span><span className="album">Album</span><span className="num">Time</span></div>
              <ul className="tracks">
                {visible.map((t, i) => {
                  const current = player.track?.id === t.id;
                  return (
                    <li key={t.id} className={current ? "current" : ""}>
                      <button className="row" onClick={() => player.play(t)} aria-label={`${current && player.playing ? "Pause" : "Play"} ${t.title} by ${t.artist}`}>
                        <span className="idx">
                          {current ? <Equalizer active={player.playing} /> : <span className="n num">{i + 1}</span>}
                          <span className="hover-play">{current && player.playing ? <PauseIcon size={16} /> : <PlayIcon size={16} />}</span>
                        </span>
                        <span className="titlecell">
                          <span className="art" style={hue(t.hue)} />
                          <span className="meta"><b>{t.title}</b><small>{t.artist}</small></span>
                        </span>
                        <span className="album muted clip">{t.album}</span>
                        <span className="muted num">{fmt(t.duration)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>
      </main>

      <footer className="player" hidden={!player.track}>
        {player.track && (
          <>
            <div className="now">
              <span className="art lg" style={hue(player.track.hue)} />
              <span className="meta"><b>{player.track.title}</b><small>{player.track.artist}</small></span>
            </div>

            <div className="transport">
              <div className="controls">
                <button className={player.shuffle ? "icon-btn toggled" : "icon-btn"} onClick={player.toggleShuffle} aria-label="Shuffle" aria-pressed={player.shuffle}><ShuffleIcon size={18} /></button>
                <button className="icon-btn" onClick={() => player.step(-1)} aria-label="Previous"><PrevIcon size={20} /></button>
                <button className="play-btn" onClick={player.toggle} aria-label={player.playing ? "Pause" : "Play"}>{player.playing ? <PauseIcon size={20} /> : <PlayIcon size={20} />}</button>
                <button className="icon-btn" onClick={() => player.step(1)} aria-label="Next"><NextIcon size={20} /></button>
              </div>
              <div className="seek">
                <span className="muted num">{fmt(player.time)}</span>
                <input type="range" min={0} max={Math.max(1, Math.floor(player.duration))} value={Math.floor(player.time)} onChange={(e) => player.seek(Number(e.target.value))} aria-label="Seek" style={{ "--p": `${(player.time / Math.max(1, player.duration)) * 100}%` } as CSSProperties} />
                <span className="muted num">{fmt(player.duration)}</span>
              </div>
            </div>

            <div className="volume">
              <VolumeIcon size={18} />
              <input type="range" min={0} max={1} step={0.01} value={player.volume} onChange={(e) => player.setVolume(Number(e.target.value))} aria-label="Volume" style={{ "--p": `${player.volume * 100}%` } as CSSProperties} />
            </div>
          </>
        )}
      </footer>
    </div>
  );
}

export default function App() {
  const [email, setEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    api.me().then((u) => setEmail(u.email)).catch(() => setEmail(null)).finally(() => setReady(true));
  }, []);

  if (!ready) return null;
  if (!email) return <Login onDone={setEmail} />;
  return <Library email={email} onSignOut={() => void api.logout().then(() => setEmail(null))} />;
}
