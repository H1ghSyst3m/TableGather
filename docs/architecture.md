# TableGather Hub Architecture

TableGather Hub is a React + TypeScript browser app with a small in-memory WebSocket server for room play. The architecture is game-module based: the hub owns routing, registry, i18n context, generic UI primitives, and online transport; each game module owns its definition, domain behavior, room adapter, components, translations, theme tokens, and game-specific styles.

## Runtime Shape

| Area | Source |
| --- | --- |
| App routing | `src/App.tsx` parses `/`, `/play/:gameId`, `/room/create/:gameId`, `/room/:code`, and `/stage/:code/:token`; `src/games/routeComponents.tsx` maps playable games to client-only route screens. |
| Game registry | `src/games/registry.ts` registers Werewolf, Imposter, and Undercover. Werewolf is the only playable V1 game. |
| Game contract | `src/games/types.ts` defines `GameDefinition`, `GameRoomAdapter`, setup slots, theme tokens, and i18n bundles. |
| Generic frontend | `src/audio/`, `src/components/`, `src/i18n/`, `src/online/`, `src/stage/`, `src/styles.css`, and `src/pwa.ts`. |
| Game modules | `src/games/<gameId>/` contains each game's definition, domain behavior, room adapter, components, i18n, theme, and styles. |
| Room server | `server/index.ts`, `server/roomManager.ts`, and `server/roomStore.ts`. |
| Tests | `test/` covers domain logic, room manager/server, UI rendering, i18n, registry, and clipboard. |

## Application Routing

`src/App.tsx` keeps routing simple. It derives a route from `window.location.pathname`, resolves the matching game route component through `src/games/routeComponents.tsx`, and uses `history.pushState` for navigation.

- `/` renders `HubScreen` with game/mode selection and a device-local Session tab.
- `/play/:gameId` renders the registered local pass-and-play screen for a playable game inside `GameThemeFrame`.
- `/room/create/:gameId` renders the registered room host screen for a playable game without a room code so it creates a room.
- `/room/<CODE>` first resolves the room's game id through `inspectRoomSession` for stored host/player tokens or `inspectRoom` without a token, then renders the registered host or player room UI.
- `/stage/<CODE>/<TOKEN>` first resolves the stage link through `inspectStage`, then renders the registered stage screen as a read-only public display client.

`GameThemeFrame` applies `gameThemeClassName(game)` and `gameThemeStyle(game)` so generic CSS variables and game-specific CSS can style the screen.

## Game Registry And Definitions

Every game is represented by a `GameDefinition` from `src/games/types.ts`.

Important fields:

- `id`, `titleKey`, `descriptionKey`, `status`, `icon`, and metadata drive the hub.
- `supportedModes` controls whether room and/or pass-and-play are exposed.
- `playerConstraints` provides numeric min/default/max player counts for setup initialization and generic room capacity checks; `playerRange` remains the human-readable hub label.
- `setup.createInitialState` gives the room server a game-specific initial setup state.
- `hostCommands` and `playerCommands` list the commands the game accepts in room mode.
- `roomAdapter` bridges generic room runtime state to game-specific logic. It validates game-specific host/player command payloads before applying them and may expose `stageSnapshot` when the game can safely deliver a public stage view.
- `components` lists symbolic route component slots; the actual React imports live in the client-only route component registry so the server registry stays UI-free.
- `i18n` registers bundled game translations.
- `theme` and `assets` feed the theme resolver and optional visual assets.

Werewolf's definition lives in `src/games/werewolf/definition.ts`. Imposter and Undercover are registered as coming-soon modules with definitions only.

## Game Modules

Each playable game should keep game-specific behavior inside its own `src/games/<gameId>/` module and game-specific documentation inside `docs/games/<gameId>/`. Werewolf is the current complete example; its detailed flow, role, room, Stage, and styling docs live in `docs/games/werewolf/`.

A complete game module is split by responsibility:

| Area | Files | Responsibility |
| --- | --- | --- |
| Definition and commands | `definition.ts`, `commands.ts` | Game registration and room command type lists. |
| Domain model | `domain/*.ts` | Game-specific state, phases, validation, rules, reducers, and derived helpers. |
| Room adapter | `roomAdapter.ts`, `roomTypes.ts`, optional `stage.ts` | Host/player/stage snapshots, command validation and routing, setup normalization, and privacy filtering. |
| React screens | `components/*.tsx` | Local, host, player, setup, play, and optional Stage surfaces. |
| Text and theme | `i18n/en.ts`, `i18n/de.ts`, `theme.ts`, `styles.css` | Game copy, theme tokens, game-specific CSS, and optional assets. |
| Optional Stage presentation | `stageAudio.ts`, `assets/audio/*` | Client-only track definitions, phase resolution, cues, and bundled presentation assets. |

Game domain code owns behavior. UI components should send commands or call domain functions; they should not duplicate game rules.

## Room Runtime

The room server is game-agnostic:

- `RoomManager` creates, joins, resumes, transfers, kicks, closes, resets, and snapshots rooms.
- `RoomManager` tracks `createdAt` and `lastActivityAt`, expires inactive rooms after the room TTL, and can inspect host/player sessions without resuming them.
- `RoomStore` abstracts storage. V1 uses `InMemoryRoomStore`.
- `GameRoomAdapter` handles game-specific setup, commands, public player shape, host snapshots, player snapshots, and optional stage snapshots.
- `src/online/messages.ts` defines client/server message shapes.
- `src/online/roomSessionStorage.ts` centralizes browser `localStorage` keys for host/player reconnect tokens and Hub session discovery.
- `src/online/useRoomSocket.ts` manages the browser WebSocket connection and message dispatch.

The server never knows Werewolf rules directly. It delegates game-specific commands to `werewolfRoomAdapter`.

Room audiences are defined in `src/types.ts` as `host`, `player`, and `stage`. Stage sessions use their own `stageToken`, join through `joinStage`, and are accepted only for adapters that implement `stageSnapshot`.

The Hub Session tab is not a matchmaking or account feature. It scans only host/player tokens stored on the current device, asks the server to validate those tokens through `inspectRoomSession`, and shows active rooms that still exist in memory and have not expired.

## Client Stage Audio

`src/audio/` owns the reusable browser-only Stage audio runtime. `StageAudioDefinition` configures typed ambience and cue tracks, mix values, crossfade timing, default volume, and the versioned preference key. `StageAudioEngine` handles retryable loading, decoding, cross-browser Web Audio unlock, buses, playback, and cleanup; `useStageAudio` connects that runtime to React Stage components. A browser-blocked context remains available for another user gesture instead of restarting the same first-attempt cycle, while asset loads stay deduplicated. The shared `StageAudioControl` lives in `src/components/`.

Each game opts in from its client Stage implementation. It keeps its track URLs and phase/cue rules inside `src/games/<gameId>/`, resolving bundled files with `new URL(..., import.meta.url).href`. Audio definitions deliberately do not belong to `GameDefinition`, the room adapter, snapshots, or WebSocket messages: the server imports the game registry, while browser audio assets and Web Audio must stay client-only.

## Client Stage Display Controls

`src/stage/` owns reusable browser-only Stage display state. `StageDisplayController` manages the Fullscreen and Screen Wake Lock APIs, their lifecycle events, retryable failures, and cleanup. `useStageDisplay` connects one controller instance to a mounted React Stage, while the shared `StageDisplayControl` lives in `src/components/`.

Games opt in from their client Stage component and provide only game-specific placement and styling. Display state starts disabled after every page load, is activated on the Stage device, and is never copied into `GameDefinition`, room adapters, snapshots, host settings, or WebSocket messages. A requested screen wake lock is reacquired after the Stage returns from a temporarily hidden tab; rejected requests and unsupported APIs remain local, visible UI states and never block the public Stage snapshot.

## Styling Architecture

Global styles in `src/styles.css` define app defaults and reusable UI primitives. Game-specific styles live under each game module, for example `src/games/werewolf/styles.css`, and are imported after global styles in `src/main.tsx`.

The order matters:

```ts
import "./styles.css";
import "./games/werewolf/styles.css";
```

Game screens use `.game-theme-<gameId>` and optional game-specific shell components for their visual system. Future games should keep their own game-specific CSS under their game folder and override global defaults through their own game theme class.

## I18n

The app uses bundled translation objects:

- Common and hub strings live under `src/i18n/`.
- Game bundles live under each game module, for example `src/games/werewolf/i18n/en.ts` and `src/games/werewolf/i18n/de.ts`.
- Tests keep English and German locale keys aligned.

Do not hardcode user-facing strings in components. Add keys to both language bundles.

## Verification

Use these checks after changes:

```bash
npm run lint
npm run test
npm run build
```

Relevant test files:

- `test/werewolf.test.ts` for domain behavior and role interactions.
- `test/werewolfUi.test.tsx` for rendered Werewolf UI structure.
- `test/stageAudio.test.ts` for the shared Stage audio runtime and preferences.
- `test/stageDisplay.test.ts` for shared fullscreen and Screen Wake Lock lifecycle behavior.
- `test/werewolfStageAudio.test.ts` for Werewolf timer cue behavior.
- `test/roomManager.test.ts` and `test/roomServer.test.ts` for room behavior and privacy.
- `test/i18n.test.ts` for translation coverage and locale key alignment.
- `test/registry.test.ts` for game registration and theme resolution.
