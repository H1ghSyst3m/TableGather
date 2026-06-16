# TableGather Hub

TableGather Hub is a browser-first React/Vite PWA for local table games. V1 ships Werewolf as the playable game. Imposter and Undercover are registered in the hub as coming-soon games so the registry and UI already support multiple games.

The product is designed for two table-play modes plus an optional public display:

- **Pass-and-play**: one device is used by the host/table. Players privately reveal roles one at a time, then the host runs night and day phases.
- **Room mode**: the host creates a room with a room code, join link, and QR code. Players join from their own phones. The host still runs the game; player devices only receive role-filtered private/public snapshots.
- **Stage mode**: in a Werewolf room, the host can create a separate read-only stage link for a TV, projector, or second screen. The stage client receives only public snapshots and follows the host-controlled reveal queue.

## Quick Start

Requirements:

- Node.js `>=22.12.0`
- npm

Commands:

```bash
npm install
npm run dev          # Vite frontend on all interfaces
npm run server:dev   # WebSocket room server
npm run server:start # WebSocket room server without watch mode
npm run dev:all      # frontend and server together
npm run lint
npm run test
npm run build
```

Room mode needs the WebSocket server. By default, the server listens on port `8787`, and the browser connects to `ws://<current-hostname>:8787/ws`.

Configuration:

- Copy `.env.example` to `.env` for local defaults or `.env.production.local` for production secrets. `npm run server:start` loads `.env`, `.env.local`, `.env.production`, and `.env.production.local` in that order.
- `PORT` or `TABLEGATHER_PORT` changes the room server port.
- `TABLEGATHER_ADMIN_TOKEN` enables the protected admin room overview API and `/admin` dashboard. Open `/admin#token=<token>` only as a transient way to load the token; the client immediately stores it in `sessionStorage` and removes it from the fragment so it is not kept in the address bar. Subsequent admin visits should use `/admin` without the token.
- `TABLEGATHER_ADMIN_ALLOWED_ORIGINS` optionally allows comma-separated cross-origin admin UI origins. Production defaults to same-origin admin access; set this only for split-origin admin deployments.
- `TABLEGATHER_SERVE_STATIC` controls whether the room server serves the built `dist/` frontend. It defaults to enabled when `NODE_ENV=production` and disabled otherwise.
- `VITE_WS_URL` overrides the browser WebSocket URL. It accepts `ws://`, `wss://`, `http://`, or `https://`; HTTP(S) values are converted to WS(S). In production, leave it empty for a same-origin `/ws` endpoint behind your reverse proxy.
- For phone/tablet testing on the same local network, run `npm run dev:all`, open the Vite URL from the host machine's LAN address, and make sure the room server port is reachable from the other devices.

## Production Deployment

Production can run as a single Node room server that also serves the built frontend. The process manager and reverse proxy are deployment-specific; they only need to start the current server script and forward traffic to it.

Use `.env.example` as the reference for production values. The usual production environment is:

- `NODE_ENV=production` so the room server serves the built `dist/` frontend by default.
- `PORT` or `TABLEGATHER_PORT` for the room server listen port.
- `TABLEGATHER_ADMIN_TOKEN` when the protected `/admin` dashboard should be enabled.
- `TABLEGATHER_ADMIN_ALLOWED_ORIGINS` only when `/admin` is served from a different origin than `/admin/rooms`.
- `TABLEGATHER_SERVE_STATIC=false` only for split deployments where another service serves `dist/`.

Build and start with the repository scripts:

```bash
npm ci --include=dev
npm run build
npm run server:start
```

The current scripts build and start from TypeScript, so install the full dependency set needed by both build and runtime. Configure any process manager to run `npm run server:start` with the production environment available.

For same-origin production deployments, leave `VITE_WS_URL` empty. The built browser app connects to `/ws` on the current origin, and the room server exposes the matching WebSocket endpoint. In the single-process setup, route `/`, SPA routes, `/ws`, `/health`, and `/admin/rooms` to the same TableGather server. No separate static host or admin API location is required.

Set `VITE_WS_URL` only when the browser app and room server are intentionally split across different origins or path prefixes. It accepts `ws://`, `wss://`, `http://`, or `https://`; HTTP(S) values are converted to WS(S).

Main routes:

- `/` - hub game/mode selection and device-local room sessions.
- `/play/werewolf` - local pass-and-play Werewolf.
- `/room/create/werewolf` - create a Werewolf room as host.
- `/room/<CODE>` - join or resume a room. A stored host token opens the host view; otherwise the player view opens.
- `/stage/<CODE>/<TOKEN>` - open a Werewolf stage screen from a host-created stage link.
- `/admin` - protected room overview dashboard when `TABLEGATHER_ADMIN_TOKEN` is configured on the room server.

## V1 Scope

- Werewolf is fully playable in local and room mode.
- Werewolf room mode supports host, player, and read-only stage clients.
- Room state is in-memory on the server. Rooms expire after 48 hours of inactivity, and a server restart clears active server-side room state.
- Browser-stored reconnect tokens, stage tokens, and local session tokens remain on the client until explicitly invalidated by the server or user, but may no longer map to an active room after expiry or restart.
- The Hub Session tab shows active host/player rooms known to the current browser by validating stored local tokens with the room server; locally stored tokens can outlive the server-side room they belonged to.
- Local pass-and-play Werewolf persists its current game in `localStorage`.
- Privacy is enforced by snapshots: host snapshots can contain full game state, player snapshots only expose the requesting player's private role data and public table status, and stage snapshots expose only public room/game information.
- No placeholder role art is bundled for Werewolf. Icon fallbacks remain until real assets are added.

## Documentation Map

- `docs/architecture.md` - shared project architecture, game registry, runtime, tests, and extension boundaries.
- `docs/online-mode.md` - shared room lifecycle, WebSocket protocol, snapshots, tokens, and adapter responsibilities.
- `docs/styling-and-theming.md` - shared styling layers, theme tokens, and future-game styling guidance.
- `docs/games/README.md` - game documentation ownership and per-game doc set expectations.
- `docs/games/werewolf/README.md` - Werewolf-specific flow, role, room, Stage, and styling docs.
- `CONTRIBUTING.md` - contribution workflow and local verification expectations.
- `NOTICE.md` - project branding and attribution notice.
- `SECURITY.md` - supported scope and private vulnerability reporting guidance.

## Source Map

- `src/App.tsx` owns route parsing and decides which screen to render.
- `src/games/registry.ts` registers games and exposes playable game adapters.
- `src/games/types.ts` defines `GameDefinition`, theme tokens, and the room adapter contract, including optional stage snapshots.
- `src/games/werewolf/` contains the Werewolf definition, domain engine, room adapter, stage snapshot builder, components, i18n, theme, and game-specific CSS.
- `src/online/` contains client-side WebSocket message types, room session storage helpers, and the room socket hook.
- `server/` contains the in-memory WebSocket room runtime.
- `test/` contains Vitest coverage for domain behavior, room behavior, i18n, registry, clipboard, and UI rendering.

## Public Release Notes

This repository is intended to be shared as source code, not published as an npm package. `package.json` keeps `"private": true` to prevent accidental package publication.

The source code is licensed under the GNU Affero General Public License v3.0 only. See `LICENSE`.

The TableGather name, logo, and branding are not licensed for reuse without prior written permission. See `NOTICE.md`.

Please read `CONTRIBUTING.md` before opening changes and use `SECURITY.md` for vulnerability reports.

## Verification Notes

Run the full check set after behavior, room, role, UI, i18n, or documentation changes:

```bash
npm run lint
npm run test
npm run build
```

On this Windows sandbox, `npm run test` or `npm run build` can fail with `spawn EPERM` while loading native Vite/Tailwind bindings. If the failure is only that native binding error, rerun the same command outside the sandbox.
