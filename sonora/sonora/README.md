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

## Deploy

Import the repository in Vercel and set the same three variables. `api/index.ts` serves the API and `web/dist` serves the client.

## Structure

- `server/src/library.ts`: the `LibrarySource` interface. Replace the seed data with a real storage adapter here.
- `server/src/auth.ts`: single-user sign in with a signed, httpOnly session cookie.
- `web/src/usePlayer.ts`: playback state, using an audio element when a track has a `src`.
