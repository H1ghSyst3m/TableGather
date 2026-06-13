# Room Mode

Room mode lets people sitting together at one physical table use their own phones while one host runs the game. It is not remote matchmaking, chat, or distributed decision-making. The host owns setup, role assignment, night/day decisions, and game progression. Werewolf rooms can also create a read-only Stage mode link for a TV, projector, or second screen.

## Runtime Overview

```text
Browser host/player/stage UI
  -> src/online/useRoomSocket.ts
  -> WebSocket /ws
  -> server/index.ts
  -> RoomManager
  -> GameRoomAdapter
  -> Werewolf domain engine
```

The WebSocket server is generic. Werewolf-specific behavior enters through `werewolfRoomAdapter`.

## Server Endpoints

| Endpoint | Purpose |
| --- | --- |
| `GET /health` | Health check, expired-room cleanup, room count, and room protocol information. |
| `GET /admin/rooms` | Protected admin room overview when `TABLEGATHER_ADMIN_TOKEN` is configured. Requires `Authorization: Bearer <token>`, returns all current rooms with inactive rooms flagged, and omits room tokens, player names, role assignments, and game state. |
| `WS /ws` | Room creation, joining, reconnecting, host commands, player commands, snapshots, and close/kick/transfer events. |

The room server uses `InMemoryRoomStore`. Rooms expire after 48 hours of inactivity, and a server restart clears active in-memory room state. Reconnect tokens, stage tokens, and browser/localStorage session tokens can remain on the client until explicitly invalidated by the server or user, but those tokens may no longer map to an active server-side room after expiry or restart.

The `/admin` browser route reads the admin token from `#token=...`, stores it in `sessionStorage`, removes it from the URL fragment, and fetches `/admin/rooms` with a bearer token. The admin summary treats a room as started when it is no longer in `lobby`, and inactive when the host is offline or the room has had no activity for at least 30 minutes.

## Room Lifecycle

```text
Host creates room
  -> server creates code and host token
  -> host receives full host snapshot

Players join by code/name
  -> server returns player token
  -> host and players receive updated snapshots

Host configures Werewolf
  -> role counts and options are host-owned
  -> assignment drafts are host-only

Host starts role reveal
  -> players privately reveal their own role
  -> players send markRoleSeen
  -> host sees ready/waiting status

Host runs play
  -> host sends Werewolf host commands
  -> player snapshots stay role-filtered
  -> optional stage snapshots show public state only

Game ends or host resets
  -> host can reset to lobby
  -> host can close the room

Room expires
  -> server removes the room after 48 hours without meaningful activity
  -> active host/player/stage clients receive roomClosed
```

Meaningful activity refreshes `lastActivityAt`: create, join, resume, stage join, leave, disconnect, host commands, and player commands. Passive lookups such as `inspectRoom` and `inspectRoomSession` do not refresh expiry.

## Stage Lifecycle

Stage mode is a third room client type for public display:

```text
Host creates or rotates stage link
  -> RoomManager creates stageToken if the adapter supports stageSnapshot
  -> host snapshot exposes the token so the host can copy the link or show QR

Stage client opens /stage/<CODE>/<TOKEN>
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
- `assignment`
- `roleReveal`
- `playing`
- `ended`

Werewolf game phases inside `WerewolfState` are separate:

- `roleReveal`
- `night`
- `day`
- `ended`

Do not confuse room phase with game phase. A room can be in `playing` while the Werewolf game phase is `night`, `day`, or `ended`.

## Tokens And Reconnect

Room sessions are token-based:

- the host receives a host token;
- each player receives a player token;
- each active stage link has a stage token;
- host and player browser clients store their tokens in `localStorage`;
- reconnect uses `resumeRoom` with the stored token;
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

`inspectRoom` returns joinability and public room status before a player submits a name. `inspectRoomSession` validates a stored host/player token without resuming the client or extending room expiry. Werewolf host/player commands are defined in `src/games/werewolf/commands.ts`.

## Server Messages

The server sends:

- `connected` with role, room code, client token, and server info;
- `roomStatus` with `exists`, `joinable`, game id, phase, and player count when available;
- `roomSessionStatus` with validity, role, game id, phase, player count, activity timestamps, expiry, and player name when available;
- `snapshot` with a host, player, or stage snapshot;
- `roomClosed`;
- `hostTransferred`;
- `kicked`;
- `leftRoom`;
- `error`.

Snapshots are the main data channel. UI components render from snapshots rather than assuming local server state.

The room protocol advertises room lookup, Session tab support, expiry, and Stage support through feature flags in `src/online/protocol.ts`, including `roomLookup`, `roomSessions`, `roomExpiry`, `stageMode`, and `stageLocaleControl`.

## RoomManager Responsibilities

`server/roomManager.ts` owns generic room lifecycle:

- create room codes and tokens;
- track room creation, last activity, and expiry timestamps;
- join/rejoin/leave rooms;
- mark disconnects;
- validate host/player tokens;
- inspect host/player sessions without resuming them;
- transfer host;
- create, rotate, validate, localize, and disable stage links;
- kick players;
- close rooms;
- prune expired rooms;
- reset to lobby through the game adapter;
- route game-specific commands through the adapter;
- build host, player, and stage snapshots.

The manager should stay game-agnostic. If a new game needs custom setup or command behavior, implement it in that game's `GameRoomAdapter`. Stage support is detected through the optional `adapter.stageSnapshot` function; non-stage-capable adapters cannot create or accept stage links.

## Werewolf Room Adapter

`src/games/werewolf/roomAdapter.ts` is the bridge between generic room state and Werewolf behavior.

It owns:

- initial setup state from player count;
- lobby reset;
- host command routing to engine functions;
- player command routing for `markRoleSeen`;
- role assignment drafts;
- random and manual assignment normalization;
- room role count normalization;
- host snapshot shape;
- player snapshot privacy filtering;
- stage snapshot shape and public reveal events;
- public player status.

The adapter is the correct place to add room-mode support for new Werewolf role state or commands.

## Snapshot Privacy

Host snapshots include:

- room code, phase, game id;
- `serverTime` for synchronized host-side timer display;
- public player list;
- role counts and options;
- assignment mode and assignment draft;
- full Werewolf game state when started.

Player snapshots include:

- room code, phase, game id;
- public player list;
- the requesting player's own public status;
- the requesting player's own `roleId`, `originalRoleId`, and `alphaWolfInfected` only when visible;
- winner when ended.

Player snapshots must not expose:

- assignment drafts before role reveal;
- role counts/options during assignment;
- other players' roles;
- GM log details;
- target selections;
- day timer state;
- pending Hunter queue data;
- another player's hidden Alpha Wolf infection status.

Stage snapshots include only public display data:

- room code, phase, game id;
- public player list and alive/ready-style status where relevant;
- current stage scene and round;
- public `dayTimer` data typed as `WerewolfDayTimerPublicSnapshot` on the `day` scene only;
- active public event, past public events, and the full public event queue;
- winner when ended.

Stage snapshots must not expose:

- host tokens, player tokens, or private client sessions;
- assignment drafts or role tables;
- full game state or GM logs;
- target selections, potion state, night-step private data, or Hunter queues;
- another player's hidden role/alignment unless the public reveal rules explicitly reveal it.

Room-mode day timer sync uses server timestamps in host and stage snapshots. Clients count down locally between snapshots instead of receiving per-second WebSocket broadcasts.

Privacy expectations are covered by `test/roomManager.test.ts` and `test/roomServer.test.ts`.

## Host Commands In Werewolf

Werewolf host commands include:

- setup/assignment: `prepareAssignment`, `setAssignMode`, `shuffleRoles`, `setManualAssignment`, `startGame`;
- night targets: `setProtectedPlayer`, `setNightGuestHost`, `setWildChildModel`, `setCupidTargets`, `setInspectedPlayer`, `setAuraTarget`, `setDetectiveTargets`, `setWolfTarget`, `setAlphaWolfTransform`, `setWitchHealTonight`, `setWitchPoisonTarget`;
- explicit reveals and progression: `revealNightResult`, `advanceNightStep`, `resolveNight`, `startDay`, `startNextNight`;
- public reveal queue: `advancePublicEvent`;
- day timer controls: `setDayTimerDuration`, `startDayTimer`, `pauseDayTimer`, `resetDayTimer`;
- day/hunter resolution: `eliminateByVote`, `resolveHunterShot`;
- host safety: `undoStep` restores the one most recent committed play step.

Nullable target commands are used for clear/undo while a step is still reversible.
`undoStep` is different: it is host-only, server-side, one-step deep, and captures only committed Werewolf play progression such as night-step advance, night/day resolution, public reveal advance, day vote, Hunter shot, and starting the next phase. It does not capture target selection, result reveal, assignment, stage-link, room management, or day timer controls. Player and Stage snapshots never expose the private undo state; host snapshots expose only `canUndo`.

## Player Commands In Werewolf

Players send only:

- `markRoleSeen`

Players do not submit night actions, day votes, or role choices. The host records those decisions on the host device.

## Persistence Limits

V1 persistence is lightweight:

- server rooms exist only while the Node server process lives and for at most 48 hours after their last meaningful activity;
- host/player reconnect and stage links work only while the in-memory room store still exists and the room has not expired;
- local pass-and-play game persistence is browser-local only;
- the Hub Session tab is browser-local and shows only validated host/player tokens stored on the current device;
- no account, database, or cross-device long-term storage exists.

If persistent rooms are added later, implement a new `RoomStore` and update this document with storage guarantees, token lifecycle, cleanup rules, and migration behavior.
