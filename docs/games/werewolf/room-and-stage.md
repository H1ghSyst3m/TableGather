# Werewolf Room And Stage

Read this with `../../online-mode.md`. The top-level room doc owns generic WebSocket lifecycle, tokens, sessions, and adapter boundaries; this file owns Werewolf-specific room commands, snapshots, privacy rules, and Stage behavior.

## Room Adapter

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

## Room Flow

```text
Host creates room
  -> lobby with room code, link, QR, player status, host transfer
  -> role setup
  -> assignment mode and draft
  -> start role reveal
  -> wait until players mark roles seen
  -> host runs night/day play surface
  -> optional stage link mirrors public state
```

The host keeps full authority. Players do not submit night actions, day votes, or role choices. The host records table decisions on the host device.

## Werewolf Phases

Room phases are generic, but Werewolf game phases inside `WerewolfState` are separate:

- `roleReveal`
- `night`
- `day`
- `ended`

Do not confuse room phase with game phase. A Werewolf room can be in generic room phase `playing` while the Werewolf game phase is `night`, `day`, or `ended`.

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
- role counts/options during setup or assignment;
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

## Host Commands

Werewolf host commands include:

- setup/assignment: `beginSetup`, `updateSetup`, `returnToPlayerLobby`, `prepareAssignment`, `returnToGameSettings`, `setAssignMode`, `shuffleRoles`, `setManualAssignment`, `startGame`;
- night targets: `setProtectedPlayer`, `setNightGuestHost`, `setWildChildModel`, `setCupidTargets`, `setInspectedPlayer`, `setAuraTarget`, `setDetectiveTargets`, `setWolfTarget`, `setAlphaWolfTransform`, `setWitchHealTonight`, `setWitchPoisonTarget`;
- explicit reveals and progression: `revealNightResult`, `advanceNightStep`, `resolveNight`, `startDay`, `startNextNight`;
- public reveal queue: `advancePublicEvent`;
- day timer controls: `setDayTimerDuration`, `startDayTimer`, `pauseDayTimer`, `resetDayTimer`;
- day/hunter resolution: `eliminateByVote`, `resolveHunterShot`;
- host safety: `undoStep` restores the one most recent committed play step.

Nullable target commands are used for clear/undo while a step is still reversible.

`undoStep` is host-only, server-side, one-step deep, and captures only committed Werewolf play progression such as night-step advance, night/day resolution, public reveal advance, day vote, Hunter shot, and starting the next phase. It does not capture target selection, result reveal, assignment, stage-link, room management, or day timer controls. Player and Stage snapshots never expose the private undo state; host snapshots expose only `canUndo`.

## Player Commands

Players send only:

- `markRoleSeen`

## Stage Reveal Rules

Stage mode is read-only. It cannot send host or player commands.

Werewolf Stage reveal rules:

- night deaths are grouped and never reveal cause, team, or role;
- day vote, day lover death, and day Hunter shot events follow `revealMode`;
- Hunter prompts reveal the Hunter role because the public action pauses there;
- prompts and system states should not appear as elimination-history entries.

Privacy expectations are covered by `test/roomManager.test.ts` and `test/roomServer.test.ts`.
