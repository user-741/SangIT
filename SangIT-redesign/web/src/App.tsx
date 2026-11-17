import { useEffect, useState } from 'react';
import { usePlayer } from './usePlayer';

export interface Track {
  id: string; title: string; artist: string; album: string;
  duration: number; hue: number; src: string | null; fallbackSrc?: string | null;
}
interface Playlist { id: string; name: string; trackIds: string[]; }

// Procedural Album Art Generator
const getArt = (seed: string, hue: number) => {
  const n = seed.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
  const bg = `hsl(${hue}, 40%, 20%)`;
  const fg = `hsl(${(hue + 180) % 360}, 50%, 70%)`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="${bg}"/><circle cx="50" cy="50" r="${20 + (n % 30)}" fill="${fg}" opacity="0.8"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};

const ICONS = {
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6zm8 0h4v16h-4z"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>',
  heartFill: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>',
  lib: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
  prev: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>',
  next: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 6h2v12h-2zm-2.5 6L5 6v12z"/></svg>',
  shuffle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/></svg>',
  repeat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>'
};

export default function App() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'home' | 'search' | 'library' | 'playlist'>('home');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Local Storage Playlists & Likes
  const [playlists, setPlaylists] = useState<Playlist[]>(() => {
    const saved = localStorage.getItem('sangit_playlists');
    return saved ? JSON.parse(saved) : [];
  });
  const [liked, setLiked] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('sangit_liked');
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null);

  const player = usePlayer();

  useEffect(() => {
    fetch('/api/library/tracks', { credentials: 'include' })
      .then(res => {
        if (res.status === 401) throw new Error('Unauthorized');
        if (!res.ok) throw new Error('Error');
        return res.json();
      })
      .then(data => { setTracks(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  // Save to LocalStorage
  useEffect(() => { localStorage.setItem('sangit_playlists', JSON.stringify(playlists)); }, [playlists]);
  useEffect(() => { localStorage.setItem('sangit_liked', JSON.stringify([...liked])); }, [liked]);

  const toggleLike = (id: string) => {
    const newLiked = new Set(liked);
    if (newLiked.has(id)) newLiked.delete(id); else newLiked.add(id);
    setLiked(newLiked);
  };

  const createPlaylist = () => {
    const name = prompt("Enter playlist name:");
    if (!name) return;
    const newPl = { id: Date.now().toString(), name, trackIds: [] };
    setPlaylists([...playlists, newPl]);
  };

  const addToPlaylist = (trackId: string, playlistId: string) => {
    setPlaylists(playlists.map(p => {
      if (p.id === playlistId && !p.trackIds.includes(trackId)) {
        return { ...p, trackIds: [...p.trackIds, trackId] };
      }
      return p;
    }));
    alert("Added to playlist!");
  };

  const formatTime = (s: number) => isFinite(s) ? Math.floor(s/60) + ':' + String(Math.floor(s%60)).padStart(2, '0') : '0:00';

  if (loading) return <div style={{color:'white', background:'#050507', height:'100vh', display:'flex', justifyContent:'center', alignItems:'center'}}>Loading SangIT...</div>;

  // Filtering Logic
  let displayTracks = tracks;
  if (view === 'search' && searchQuery) {
    displayTracks = tracks.filter(t => t.title.toLowerCase().includes(searchQuery.toLowerCase()) || t.artist.toLowerCase().includes(searchQuery.toLowerCase()));
  } else if (view === 'library') {
    displayTracks = tracks.filter(t => liked.has(t.id));
  } else if (view === 'playlist' && activePlaylistId) {
    const pl = playlists.find(p => p.id === activePlaylistId);
    displayTracks = tracks.filter(t => pl?.trackIds.includes(t.id));
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="logo" dangerouslySetInnerHTML={{__html: ICONS.play}} />
          <span>SangIT</span>
        </div>
        <nav className="side-nav">
          <button className={`side-link ${view === 'home' ? 'active' : ''}`} onClick={() => setView('home')}>
            <span className="icon" dangerouslySetInnerHTML={{__html: ICONS.home}} /> Home
          </button>
          <button className={`side-link ${view === 'search' ? 'active' : ''}`} onClick={() => setView('search')}>
            <span className="icon" dangerouslySetInnerHTML={{__html: ICONS.search}} /> Search
          </button>
          <button className={`side-link ${view === 'library' ? 'active' : ''}`} onClick={() => setView('library')}>
            <span className="icon" dangerouslySetInnerHTML={{__html: ICONS.heart}} /> Liked Songs
          </button>
        </nav>
        
        <div className="side-head" style={{marginTop: '20px'}}>
          Playlists <button onClick={createPlaylist} dangerouslySetInnerHTML={{__html: ICONS.plus}} style={{width:16}}/>
        </div>
        <div className="side-playlists">
          {playlists.map(p => (
            <button key={p.id} className={`side-pl ${view === 'playlist' && activePlaylistId === p.id ? 'active' : ''}`} onClick={() => { setActivePlaylistId(p.id); setView('playlist'); }}>
              {p.name} ({p.trackIds.length})
            </button>
          ))}
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="topbar-left"><h1 style={{ fontSize: '20px', textTransform: 'capitalize' }}>{view}</h1></div>
        </header>

        {view === 'search' && (
          <div className="view">
            <input 
              className="search-input" 
              placeholder="Search songs or artists..." 
              value={searchQuery} 
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
        )}

        <div className="view track-list">
          {displayTracks.map((t, i) => (
            <div key={t.id} className={`track ${player.currentTrack?.id === t.id ? 'playing' : ''}`} onClick={() => player.playTrack(t, displayTracks)}>
              <div className="t-idx">{i + 1}</div>
              <div className="art"><img src={getArt(t.title, t.hue)} alt="" className="loaded" /></div>
              <div className="t-meta">
                <div className="t-title">{t.title}</div>
                <div className="t-artist">{t.artist}</div>
              </div>
              <div className="t-actions">
                <button onClick={(e) => { e.stopPropagation(); toggleLike(t.id); }} dangerouslySetInnerHTML={{__html: liked.has(t.id) ? ICONS.heartFill : ICONS.heart}} />
                <select onChange={(e) => { e.stopPropagation(); addToPlaylist(t.id, e.target.value); e.target.value=""; }} onClick={e => e.stopPropagation()}>
                  <option value="">Add to...</option>
                  {playlists.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            </div>
          ))}
        </div>
      </main>

      <div className="player">
        <div className="p-left">
          <div className="art">
             {player.currentTrack && <img src={getArt(player.currentTrack.title, player.currentTrack.hue)} alt="" className="loaded" />}
          </div>
          <div className="p-meta">
            <div className="p-title">{player.currentTrack ? player.currentTrack.title : 'Select a track'}</div>
            <div className="p-artist">{player.currentTrack ? player.currentTrack.artist : '---'}</div>
          </div>
        </div>

        <div className="p-center">
          <div className="p-controls">
            <button className={`ctrl ${player.shuffle ? 'active' : ''}`} onClick={() => player.setShuffle(!player.shuffle)} dangerouslySetInnerHTML={{__html: ICONS.shuffle}} />
            <button className="ctrl" onClick={player.prev} dangerouslySetInnerHTML={{__html: ICONS.prev}} />
            <button className="ctrl play" onClick={player.togglePlay} dangerouslySetInnerHTML={{__html: player.isPlaying ? ICONS.pause : ICONS.play}} />
            <button className="ctrl" onClick={player.next} dangerouslySetInnerHTML={{__html: ICONS.next}} />
            <button className={`ctrl ${player.repeat !== 'off' ? 'active' : ''}`} onClick={() => player.setRepeat(player.repeat === 'off' ? 'all' : player.repeat === 'all' ? 'one' : 'off')} dangerouslySetInnerHTML={{__html: ICONS.repeat}} />
          </div>
          <div className="p-bar">
            <span className="time">{formatTime(player.progress)}</span>
            <div className="bar" onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              player.seek((e.clientX - rect.left) / rect.width);
            }}>
              <div className="bar-fill" style={{ width: `${player.duration ? (player.progress / player.duration) * 100 : 0}%` }}></div>
            </div>
            <span className="time right">{formatTime(player.duration)}</span>
          </div>
        </div>

        <div className="p-right">
           <input type="range" min="0" max="1" step="0.01" value={player.volume} onChange={e => player.setVolume(Number(e.target.value))} />
        </div>
      </div>
    </div>
  );
}
