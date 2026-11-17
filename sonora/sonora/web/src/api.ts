export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  hue: number;
  src: string | null;
}

export interface Playlist {
  id: string;
  name: string;
  trackIds: string[];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

export const api = {
  me: () => request<{ email: string }>("/auth/me"),
  login: (email: string, password: string) =>
    request<{ email: string }>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  logout: () => request<{ ok: true }>("/auth/logout", { method: "POST" }),
  tracks: () => request<Track[]>("/library/tracks"),
  playlists: () => request<Playlist[]>("/library/playlists"),
};
