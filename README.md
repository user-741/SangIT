# Sonora

A private music library for the web. TypeScript end to end: an Express API in `server/` and a React + Vite client in `web/`.

## Requirements

Node.js 20 or newer.

## Run locally

1. Copy `.env.example` to `.env` and fill in the three values.
2. Run `npm install`.
3. Run `npm run dev`.

The client runs on http://localhost:5173 and proxies `/api` to the API on port 3001.

## Environment variables

| Name | Purpose |
| --- | --- |
| `AUTH_EMAIL` | Email address allowed to sign in |
| `AUTH_PASSWORD` | Password for that account, at least 8 characters |
| `JWT_SECRET` | Signs the session cookie, at least 32 characters |

## Add your music

1. Put your `.m4a` (or `.mp3`, `.aac`, `.ogg`, `.flac`, `.wav`) files in `web/public/music/`. Name them `Artist - Title.m4a` if they have no tags.
2. Run `npm run scan-music`. It reads the tags and writes `server/src/music.json`. Albums with two or more songs become playlists.
3. Commit the files and `music.json`, then deploy.

Files in `web/public` are served as static files, so anyone with a file's exact URL can download it. Keep large libraries (the Vercel upload limit is 100 MB per deployment) in object storage such as Vercel Blob and point `src` at those URLs.

## Deploy

Import the repository in Vercel and set the same three variables. `api/index.ts` serves the API and `web/dist` serves the client.

## Structure

- `server/src/library.ts`: the `LibrarySource` interface. Replace the seed data with a real storage adapter here.
- `server/src/auth.ts`: single-user sign in with a signed, httpOnly session cookie.
- `web/src/usePlayer.ts`: playback state, using an audio element when a track has a `src`.
