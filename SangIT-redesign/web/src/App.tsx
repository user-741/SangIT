import { useEffect, useState } from 'react';
import { usePlayer, Track } from './usePlayer';

const ICON = {
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.2v13.6a.8.8 0 0 0 1.22.68l11-6.8a.8.8 0 0 0 0-1.36l-11-6.8A.8.8 0 0 0 8 5.2Z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6.5" y="4.5" width="3.6" height="15" rx="1.2"/><rect x="13.9" y="4.5" width="3.6" height="15" rx="1.2"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1Z"/></svg>',
  lib: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3.5" y="4.5" width="4" height="15" rx="1"/><rect x="10" y="4.5" width="4" height="15" rx="1"/><path d="m17.4 5.6 3.4 13.2-2.2.6L15.2 6.2z"/></svg>',
  prev: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18 5v14l-9-7z"/><rect x="5" y="5" width="2.4" height="14" rx="1.2"/></svg>',
  next: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 5v14l9-7z"/><rect x="16.6" y="5" width="2.4" height="14" rx="1.2"/></svg>'
};

export default function App() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [view, setView] = useState<'home' | 'search' | 'library'>('home');
  
  const { currentTrack, isPlaying, progress, duration, togglePlay, playTrack, playNext, playPrev, seek } = usePlayer(tracks);

  const loadData = () => {
    setLoading(true);
    
    // Try /api/library/tracks first, then fallback to /library/tracks if Vercel stripped the prefix
    const tryFetch = (url: string): Promise<any> => {
      return fetch(url, { credentials: 'include' }).then(res => {
        if (res.status === 401) throw new Error('UNAUTHORIZED');
        if (!res.ok) throw new Error('404');
        return res.json();
      });
    };

    tryFetch('/api/library/tracks')
      .catch(err => {
        if (err.message === 'UNAUTHORIZED') throw err;
        return tryFetch('/library/tracks');
      })
      .then(data => {
        setTracks(Array.isArray(data) ? data : data.tracks || []);
        setNeedsLogin(false);
        setLoading(false);
      })
      .catch(err => {
        if (err.message === 'UNAUTHORIZED') {
          setNeedsLogin(true);
        } else {
          console.error("Fetch Error:", err);
        }
        setLoading(false);
      });
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password })
    })
    .then(res => {
      if (!res.ok) throw new Error('Login failed');
      loadData();
    })
    .catch(() => {
      fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password })
      })
      .then(res => {
        if (!res.ok) throw new Error('Login failed');
        loadData();
      })
      .catch(err => {
        alert("Login failed. Please check your credentials.");
        setLoading(false);
      });
    });
  };

  const formatTime = (s: number) => {
    if (!isFinite(s)) return '0:00';
    return Math.floor(s/60) + ':' + String(Math.floor(s%60)).padStart(2, '0');
  };

  if (loading) return <div style={{color:'white', padding:'40px', background:'#050507', height:'100vh', display:'flex', alignItems:'center', justifyContent:'center'}}>Loading...</div>;

  if (needsLogin) {
    return (
      <div style={{background:'#050507', height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', color:'white'}}>
        <form onSubmit={handleLogin} style={{background:'#101014', padding:'40px', borderRadius:'12px', border:'1px solid rgba(255,255,255,0.1)', width:'100%', maxWidth:'400px'}}>
          <h1 style={{marginBottom:'24px', fontSize:'24px', fontWeight:'bold'}}>Sign in to SangIT</h1>
          <input 
            type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required
            style={{width:'100%', padding:'12px', marginBottom:'16px', background:'#17171d', border:'1px solid #333', borderRadius:'6px', color:'white'}} 
          />
          <input 
            type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required
            style={{width:'100%', padding:'12px', marginBottom:'24px', background:'#17171d', border:'1px solid #333', borderRadius:'6px', color:'white'}} 
          />
          <button type="submit" style={{width:'100%', padding:'12px', background:'#c1a8ff', color:'#17101f', border:'none', borderRadius:'6px', fontWeight:'bold', cursor:'pointer'}}>
            Log In
          </button>
        </form>
      </div>
    );
  }

  if (!tracks.length) return <div style={{color:'white', padding:'40px', background:'#050507', height:'100vh', display:'flex', alignItems:'center', justifyContent:'center'}}>No tracks found. Check your GitHub release.</div>;

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="logo" dangerouslySetInnerHTML={{__html: ICON.play}} />
          <span>SangIT</span>
        </div>
        <nav className="side-nav">
          <button className={`side-link ${view === 'home' ? 'active' : ''}`} onClick={() => setView('home')}>
            <span className="icon" dangerouslySetInnerHTML={{__html: ICON.home}} /> Home
          </button>
          <button className={`side-link ${view === 'search' ? 'active' : ''}`} onClick={() => setView('search')}>
            <span className="icon" dangerouslySetInnerHTML={{__html: ICON.search}} /> Search
          </button>
          <button className={`side-link ${view === 'library' ? 'active' : ''}`} onClick={() => setView('library')}>
            <span className="icon" dangerouslySetInnerHTML={{__html: ICON.lib}} /> Library
          </button>
        </nav>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="topbar-left">
            <h1 style={{ fontSize: '20px' }}>{view.charAt(0).toUpperCase() + view.slice(1)}</h1>
          </div>
          <div className="topbar-right">
            <div className="avatar">U</div>
          </div>
        </header>

        <div className="view">
          {view === 'home' && (
            <>
              <div className="card-row">
                {tracks.slice(0, 6).map(t => (
                  <div key={t.id} className="card" onClick={() => playTrack(t, tracks)}>
                    <div className="art">
                      <img src={`https://picsum.photos/seed/${t.id}/400/400`} alt="" className="loaded" />
                    </div>
                    <div className="card-name">{t.title}</div>
                    <div className="card-sub">{t.artist}</div>
                  </div>
                ))}
              </div>

              <h2 style={{ marginTop: '32px', marginBottom: '16px' }}>All Tracks</h2>
              <div className="track-list">
                {tracks.map((t, i) => (
                  <div 
                    key={t.id} 
                    className={`track ${currentTrack?.id === t.id ? 'playing' : ''}`}
                    onClick={() => playTrack(t, tracks)}
                  >
                    <div className="t-idx">{i + 1}</div>
                    <div className="art">
                      <img src={`https://picsum.photos/seed/${t.id}/100/100`} alt="" className="loaded" />
                    </div>
                    <div className="t-meta">
                      <div className="t-title">{t.title}</div>
                      <div className="t-artist">{t.artist}</div>
                    </div>
                    <div className="t-album">{t.album}</div>
                    <div className="t-dur">{formatTime(t.duration)}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </main>

      <div className="player">
        <div className="p-left">
          <div className="art">
             {currentTrack && <img src={`https://picsum.photos/seed/${currentTrack.id}/100/100`} alt="" className="loaded" />}
          </div>
          <div className="p-meta">
            <div className="p-title">{currentTrack ? currentTrack.title : 'Select a track'}</div>
            <div className="p-artist">{currentTrack ? currentTrack.artist : '---'}</div>
          </div>
        </div>

        <div className="p-center">
          <div className="p-controls">
            <button className="ctrl" onClick={playPrev} dangerouslySetInnerHTML={{__html: ICON.prev}} />
            <button className="ctrl play" onClick={togglePlay} dangerouslySetInnerHTML={{__html: isPlaying ? ICON.pause : ICON.play}} />
            <button className="ctrl" onClick={playNext} dangerouslySetInnerHTML={{__html: ICON.next}} />
          </div>
          <div className="p-bar">
            <span className="time">{formatTime(progress)}</span>
            <div className="bar" onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              seek((e.clientX - rect.left) / rect.width);
            }}>
              <div className="bar-fill" style={{ width: `${duration ? (progress / duration) * 100 : 0}%` }}></div>
            </div>
            <span className="time right">{formatTime(duration)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
