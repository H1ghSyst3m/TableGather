# Room Mode

Room mode lets people sitting together at one physical table use their own phones while one host runs the game. It is not remote matchmaking, chat, or distributed decision-making. The host owns setup, role assignment, game decisions, and progression. Games can optionally expose a read-only Stage mode link for a TV, projector, or second screen.

## Runtime Overview

```text
Browser host/player/stage UI
  -> src/online/useRoomSocket.ts
  -> WebSocket /ws
  -> server/index.ts
  -> RoomManager
  -> GameRoomAdapter
  -> game domain engine
```

The WebSocket server is generic. Game-specific behavior enters through each game's `GameRoomAdapter`. Werewolf-specific room and Stage details live in `docs/games/werewolf/room-and-stage.md`.

## Server Endpoints

| Endpoint | Purpose |
| --- | --- |
| `GET /health` | Health check, expired-room cleanup, room count, and room protocol information. |
| `GET /admin/rooms` | Protected admin room overview when `TABLEGATHER_ADMIN_TOKEN` is configured. Requires `Authorization: Bearer <token>`, returns all current rooms with inactive rooms flagged, and omits room tokens, player names, role assignments, and game state. |
| `WS /ws` | Room creation, joining, reconnecting, host commands, player commands, snapshots, and close/kick/transfer events. |

The room server uses `InMemoryRoomStore`. Rooms expire after 48 hours of inactivity, and a server restart clears active in-memory room state. Reconnect tokens, stage tokens, and browser/localStorage session tokens can remain on the client until explicitly invalidated by the server or user, but those tokens may no longer map to an active server-side room after expiry or restart.

The `/admin` browser route reads the admin token from `#token=...`, stores it in `sessionStorage`, removes it from the URL fragment, and fetches `/admin/rooms` with a bearer token. The admin summary flags inactive rooms when the host is offline or the room has had no activity for at least 30 minutes, and separates active preparation rooms from currently running rooms.

## Production Runtime

`npm run server:start` loads `.env`, `.env.local`, `.env.production`, and `.env.production.local` before starting the room server. Use `.env` for local defaults and `.env.production.local` for private production values such as `TABLEGATHER_ADMIN_TOKEN`.

When `NODE_ENV=production`, the room server serves the built `dist/` frontend by default. This lets a production reverse proxy forward every request to the same Node process: `/` and SPA routes serve the app shell, `/ws` handles WebSocket upgrades, `/health` returns health JSON, and `/admin/rooms` stays the protected admin API. `TABLEGATHER_SERVE_STATIC=false` disables this static serving for split deployments.

Production admin access defaults to same-origin requests. If `/admin` is intentionally served from a different origin than `/admin/rooms`, set `TABLEGATHER_ADMIN_ALLOWED_ORIGINS` to a comma-separated list of exact `http(s)` origins allowed to call the admin API.

## Room Lifecycle

```text
Host creates room
  -> server creates code and host token
  -> host receives full host snapshot

Players join by code/name
  -> server returns player token
  -> host and players receive updated snapshots

Host opens Game Settings
  -> room moves from lobby to setup
  -> new player joins are blocked
  -> role counts and options are host-owned

Host assigns roles
  -> room moves from setup to assignment
  -> assignment drafts are host-only

Host starts role reveal
  -> players privately reveal their own role
  -> players send markRoleSeen
  -> host sees ready/waiting status

Host runs play
  -> host sends game-specific host commands
  -> player snapshots stay privacy-filtered
  -> optional stage snapshots show public state only

Game ends or host resets
  -> host can reset to lobby
  -> host can close the room

Room expires
  -> server removes the room after 48 hours without meaningful activity
  -> active host/player/stage clients receive roomClosed
```

Room codes are six characters from the server token alphabet. Player names are whitespace-normalized and capped at 32 characters server-side before a join is accepted.

Meaningful activity refreshes `lastActivityAt`: create, join, resume, stage join, leave, disconnect, host commands, and player commands. Passive lookups such as `inspectRoom` and `inspectRoomSession` do not refresh expiry.

## Stage Lifecycle

Stage mode is a third room client type for public display:

```text
Host creates or rotates stage link
  -> RoomManager creates stageToken if the adapter supports stageSnapshot
  -> host snapshot exposes the token so the host can copy the link or show QR

Stage client opens /stage/<CODE>/<TOKEN>
  -> browser asks inspectStage to resolve the game id for the stage link
  -> client sends joinStage
  -> server records role "stage"
  -> server sends StageRoomSnapshot only

Host rotates or disables stage link
  -> active stage sessions receive roomClosed
  -> old tokens stop working
```

Stage mode is read-only. It cannot send host or player commands.

Room phases are defined in `src/types.ts`:

- `lobby`
- `setup`
- `assignment`
- `roleReveal`
- `playing`
- `ended`

Game modules may define their own internal game phases separately from the generic room phases. Do not confuse room phase with game phase. A room can be in `playing` while the game state is in any game-specific active phase. Only `lobby` accepts new joins; `setup`, `assignment`, and `roleReveal` keep already connected clients in preparation/status views and are counted as waiting in admin summaries.

## Tokens And Reconnect

Room sessions are token-based:

- the host receives a host token;
- each player receives a player token;
- each active stage link has a stage token;
- host and player browser clients store their tokens in `localStorage`;
- reconnect uses `resumeRoom` with the stored token;
- mounted host/player/stage clients automatically retry dropped WebSocket connections and resend their `resumeRoom` or `joinStage` handshake while the screen stays open;
- disconnecting marks clients as disconnected but keeps the room/player while the server process lives.

Browser storage keys are implementation details centralized in `src/online/roomSessionStorage.ts`, including:

- `tablegather-room-<CODE>-host`
- `tablegather-room-<CODE>-player`
- `tablegather-current-host-room`

The Hub Session tab scans those local host/player tokens, validates them through `inspectRoomSession`, and lists only active sessions for the current browser. Invalid validated sessions are removed locally. Offline or unreachable server states do not remove local tokens.

Host transfer promotes a connected lobby player to host by moving that player's token into the host slot and removing them from the player list. Transfer is only available in the lobby.

Stage tokens are not stored as host or player sessions. They are copied from the host-created stage link and are valid only while the in-memory room and current `stageToken` exist.

## Client Messages

`src/online/messages.ts` defines client messages:

- `createRoom`
- `inspectRoom`
- `inspectRoomSession`
- `inspectStage`
- `joinStage`
- `joinRoom`
- `resumeRoom`
- `hostCommand`
- `playerCommand`
- `leaveRoom`

Common host commands:

- `kickPlayer`
- `transferHost`
- `createStageLink`
- `setStageLocale`
- `disableStageLink`
- `closeRoom`
- `resetToLobby`

`inspectRoom` returns joinability and public room status before a player submits a name. `inspectRoomSession` validates a stored host/player token without resuming the client or extending room expiry. `inspectStage` validates a stage token enough to resolve the room's game id before the browser mounts the game-specific Stage UI; it does not join the stage session or extend room expiry. The server allows 60 room lookup requests (`inspectRoom`, `inspectRoomSession`, or `inspectStage`) and 20 failed `joinRoom` attempts per rate-limit key in each 60,000 ms window. Game-specific host/player commands are defined in each game module.

## Server Messages

The server sends:

- `connected` with role, room code, client token, and server info;
- `roomStatus` with `exists`, `joinable`, game id, phase, and player count when available;
- `roomSessionStatus` with validity, role, game id, phase, player count, activity timestamps, expiry, and player name when available;
- `stageStatus` with validity, game id, phase, and player count when the stage token is valid;
- `snapshot` with a host, player, or stage snapshot;
- `roomClosed`;
- `hostTransferred`;
- `kicked`;
- `leftRoom`;
- `error`.

Snapshots are the main data channel. UI components render from snapshots rather than assuming local server state.

The room protocol advertises room lookup, Session tab support, expiry, and Stage support through feature flags in `src/online/protocol.ts`, including `roomLookup`, `roomSessions`, `roomExpiry`, `stageMode`, `stageLookup`, and `stageLocaleControl`.

## RoomManager Responsibilities

`server/roomManager.ts` owns generic room lifecycle:

- create room codes and tokens;
- track room creation, last activity, and expiry timestamps;
- join/rejoin/leave rooms;
- mark disconnects;
- validate host/player tokens;
- inspect host/player sessions without resuming them;
- inspect stage links without joining or refreshing activity;
- transfer host;
- create, rotate, validate, localize, and disable stage links;
- kick players;
- close rooms;
- prune expired rooms;
- reset to lobby through the game adapter;
- route game-specific commands through the adapter;
- build host, player, and stage snapshots.

The manager should stay game-agnostic. If a new game needs custom setup or command behavior, implement it in that game's `GameRoomAdapter`. Stage support is detected through the optional `adapter.stageSnapshot` function; non-stage-capable adapters cannot create or accept stage links.

## Game Adapter Responsibilities

Each `GameRoomAdapter` is the bridge between generic room state and one game's behavior.

Adapters own:

- initial setup state;
- lobby reset behavior;
- game-specific host and player command routing;
- setup, assignment, or preparation state normalization;
- host snapshot shape;
- player snapshot privacy filtering;
- optional stage snapshot shape and public reveal events;
- public player status.

The adapter is the correct place to add room-mode support for game-specific state or commands. Document game-specific commands, snapshot fields, and privacy rules under `docs/games/<gameId>/`.

## Snapshot Privacy

Host snapshots may include:

- room code, phase, game id;
- `serverTime` for synchronized host-side display where needed;
- public player list;
- game setup/options;
- game assignment or preparation drafts;
- full game state when the adapter intentionally exposes it to the host.

Player snapshots may include:

- room code, phase, game id;
- public player list;
- the requesting player's own public status;
- the requesting player's own private game data only when visible;
- winner when ended.

Player snapshots must not expose:

- host-only setup or assignment drafts;
- other players' hidden roles, cards, choices, or private state;
- host logs or adjudication details;
- target selections or pending hidden queues;
- host tooling state unless it is explicitly player-facing.

Stage snapshots include only public display data, such as:

- room code, phase, game id;
- public player list and alive/ready-style status where relevant;
- current public scene or round;
- public timers where the game exposes them;
- active public event, past public events, or public event queues;
- winner when ended.

Stage snapshots must not expose:

- host tokens, player tokens, or private client sessions;
- setup drafts, assignment drafts, hidden cards, or role tables;
- full game state or host logs;
- target selections, private step data, or hidden queues;
- another player's hidden role/alignment/card data unless public reveal rules explicitly reveal it.

Room-mode timer sync should use server timestamps in host and stage snapshots. Clients count down locally between snapshots instead of receiving per-second WebSocket broadcasts.

Privacy expectations are covered by `test/roomManager.test.ts` and `test/roomServer.test.ts`.

## Game-Specific Commands

Common room commands cover lifecycle actions such as kicking players, transferring host, Stage link management, closing rooms, and resetting to lobby. Gameplay commands belong to each game module and must be listed in that game's `hostCommands` and `playerCommands`.

Document game-specific commands under `docs/games/<gameId>/`, including which audience can send them, what state they can mutate, whether they are reversible, and which snapshot fields must stay private.

## Persistence Limits

V1 persistence is lightweight:

- server rooms exist only while the Node server process lives and for at most 48 hours after their last meaningful activity;
- host/player reconnect and stage links work only while the in-memory room store still exists and the room has not expired;
- local pass-and-play game persistence is browser-local only;
- the Hub Session tab is browser-local and shows only validated host/player tokens stored on the current device;
- no account, database, or cross-device long-term storage exists.

If persistent rooms are added later, implement a new `RoomStore` and update this document with storage guarantees, token lifecycle, cleanup rules, and migration behavior.
