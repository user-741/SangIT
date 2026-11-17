import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { api, type Playlist, type Track } from "./api";
import { usePlayer } from "./usePlayer";

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const hue = (h: number) => ({ "--h": h }) as CSSProperties;

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
      <form onSubmit={submit} className="login-card">
        <h1>Sonora</h1>
        <p className="muted">Sign in to your library.</p>
        <label>Email<input name="email" type="email" autoComplete="username" required /></label>
        <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
        {error && <p role="alert" className="error">{error}</p>}
        <button className="primary" disabled={busy}>{busy ? "Signing in" : "Sign in"}</button>
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

  useEffect(() => {
    Promise.all([api.tracks(), api.playlists()])
      .then(([t, p]) => {
        setTracks(t);
        setPlaylists(p);
      })
      .catch((e: Error) => setLoadError(e.message));
  }, []);

  const visible = useMemo(() => {
    const ids = scope === "all" ? null : new Set(playlists.find((p) => p.id === scope)?.trackIds);
    const q = query.trim().toLowerCase();
    return tracks.filter(
      (t) => (!ids || ids.has(t.id)) && (!q || `${t.title} ${t.artist} ${t.album}`.toLowerCase().includes(q)),
    );
  }, [tracks, playlists, scope, query]);

  const player = usePlayer(visible);

  return (
    <div className="shell">
      <header className="bar">
        <strong className="brand">Sonora</strong>
        <input className="search" type="search" placeholder="Search your library" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search your library" />
        <span className="muted who">{email}</span>
        <button onClick={onSignOut}>Sign out</button>
      </header>

      <nav className="scopes" aria-label="Library sections">
        <button className={scope === "all" ? "on" : ""} onClick={() => setScope("all")}>All music</button>
        {playlists.map((p) => (
          <button key={p.id} className={scope === p.id ? "on" : ""} onClick={() => setScope(p.id)}>{p.name}</button>
        ))}
      </nav>

      <main className="content">
        {loadError && <p role="alert" className="error">{loadError}</p>}
        {!loadError && visible.length === 0 && <p className="muted">No songs match. Clear the search or pick another section.</p>}
        <ul className="tracks">
          {visible.map((t) => (
            <li key={t.id} className={player.track?.id === t.id ? "current" : ""}>
              <button className="row" onClick={() => player.play(t)} aria-label={`Play ${t.title} by ${t.artist}`}>
                <span className="art" style={hue(t.hue)} />
                <span className="meta"><b>{t.title}</b><small>{t.artist}</small></span>
                <span className="album muted">{t.album}</span>
                <span className="muted num">{fmt(t.duration)}</span>
              </button>
            </li>
          ))}
        </ul>
      </main>

      <footer className="player" hidden={!player.track}>
        {player.track && (
          <>
            <span className="art" style={hue(player.track.hue)} />
            <span className="meta"><b>{player.track.title}</b><small>{player.track.artist}</small></span>
            <div className="controls">
              <button onClick={() => player.step(-1)}>Prev</button>
              <button className="primary" onClick={player.toggle}>{player.playing ? "Pause" : "Play"}</button>
              <button onClick={() => player.step(1)}>Next</button>
            </div>
            <input type="range" min={0} max={player.track.duration} value={player.time} onChange={(e) => player.seek(Number(e.target.value))} aria-label="Seek" />
            <span className="muted num">{fmt(player.time)} / {fmt(player.track.duration)}</span>
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
