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
- `TABLEGATHER_SERVE_STATIC` controls whether the room server serves the built `dist/` frontend. It defaults to enabled when `NODE_ENV=production` and disabled otherwise.
- `VITE_WS_URL` overrides the browser WebSocket URL. It accepts `ws://`, `wss://`, `http://`, or `https://`; HTTP(S) values are converted to WS(S). In production, leave it empty for a same-origin `/ws` endpoint behind your reverse proxy.
- For phone/tablet testing on the same local network, run `npm run dev:all`, open the Vite URL from the host machine's LAN address, and make sure the room server port is reachable from the other devices.

## Production Deployment

The recommended production setup is one Node/PM2 room server that also serves the built frontend, with Nginx only handling TLS and reverse proxying to that process.

Example `.env.production.local`:

```bash
NODE_ENV=production
PORT=9097
TABLEGATHER_ADMIN_TOKEN=replace-with-a-long-random-token
```

Build and reload:

```bash
cd /var/www/TableGather
git pull --ff-only
npm ci --include=dev
npm run build -- --base=/
pm2 startOrReload ecosystem.config.cjs --only tablegather-ws --update-env
pm2 save
pm2 status tablegather-ws
```

The PM2 app should run `npm run server:start`; the private `.env.production.local` file provides the port and admin token at runtime.

Minimal Nginx shape:

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    '' close;
}

server {
    listen 443 ssl http2;
    server_name example.com;

    location / {
        proxy_pass http://127.0.0.1:9097;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

With this setup, `/`, `/ws`, `/health`, and `/admin/rooms` all go to the same TableGather server, so no separate Nginx location for the admin API is needed.

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

- `docs/architecture.md` - project architecture, game registry, runtime, tests, and extension boundaries.
- `docs/game-flow.md` - Werewolf local/room flow and UI behavior.
- `docs/online-mode.md` - room lifecycle, WebSocket protocol, snapshots, tokens, and persistence.
- `docs/werewolf-role-parity-matrix.md` - role behavior matrix and cross-role invariants.
- `docs/werewolf-development-guide.md` - checklist for adding or changing Werewolf roles.
- `docs/styling-and-theming.md` - global styles, game-specific theme overrides, Werewolf shell, and future-game styling guidance.
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
