# Werewolf Room And Stage

Read this with `../../online-mode.md`. The top-level room doc owns generic WebSocket lifecycle, tokens, sessions, and adapter boundaries; this file owns Werewolf-specific room commands, snapshots, privacy rules, and Stage behavior.

## Room Adapter

`src/games/werewolf/roomAdapter.ts` is the bridge between generic room state and Werewolf behavior.

It owns:

- initial setup state from player count;
- host-only role/rule preparation step state;
- host and player command payload validation;
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
  -> role selection
  -> game rules
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
- host-only `preparationStep` (`roles` or `rules`);
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
- the host-only preparation step;
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

- setup/assignment: `beginSetup`, `updateSetup`, `continueToRules`, `returnToRoleSelection`, `returnToPlayerLobby`, `prepareAssignment`, `returnToRules`, `setAssignMode`, `shuffleRoles`, `setManualAssignment`, `startGame`;
- night targets: `setProtectedPlayer`, `setNightGuestHost`, `setWildChildModel`, `setCupidTargets`, `setInspectedPlayer`, `setAuraTarget`, `setDetectiveTargets`, `setWolfTarget`, `setAlphaWolfTransform`, `setDoctorHealTonight`, `setWitchHealTonight`, `setWitchPoisonTarget`;
- explicit reveals and progression: `revealNightResult`, `advanceNightStep`, `resolveNight`, `startDay`, `startNextNight`;
- public reveal queue: `advancePublicEvent`;
- day timer controls: `setDayTimerDuration`, `startDayTimer`, `pauseDayTimer`, `resetDayTimer`;
- day/hunter resolution: `eliminateByVote`, `resolveHunterShot`;
- host safety: `undoStep` restores the one most recent committed play step.

Nullable target commands are used for clear/undo while a step is still reversible.

Werewolf command payloads are runtime-validated by the adapter before they are applied. Required IDs, role counts, manual assignments, options, reveal steps, and day timer durations must match the command schema; unknown command types, missing fields, wrong field types, and extra fields are rejected.

`prepareAssignment` and `startGame` are payload-free progression commands. The adapter accepts them only after Game Rules and after a complete random or manual assignment respectively, so room clients cannot bypass the four-step preparation order.

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

## Stage Display Controls

Fullscreen and Screen Wake Lock are local presentation state on the opened Stage device. `WerewolfStageScreen` opts into the shared controller and control from `src/stage/` and `src/components/`; it does not add host commands, player commands, snapshot fields, or Stage settings.

Both features start disabled after every open or reload and require an action on the Stage device. Fullscreen follows browser-driven exits such as Escape. A requested screen wake lock is reacquired when the Stage becomes visible after a temporary tab switch; unsupported APIs, rejected requests, and system releases are shown as retryable local status without blocking Stage content or the other display feature.

## Stage Audio

Stage audio is local presentation state. It does not add room commands or snapshot fields, and the Stage remains a read-only room client.

`src/games/werewolf/stageAudio.ts` supplies the Werewolf-specific `StageAudioDefinition` and timer cue rules to the generic engine and hook in `src/audio/`. It resolves these bundled source assets with `new URL(..., import.meta.url).href`:

- `src/games/werewolf/assets/audio/stage-night.ogg`
- `src/games/werewolf/assets/audio/stage-day.ogg`
- `src/games/werewolf/assets/audio/timer-tick.wav`
- `src/games/werewolf/assets/audio/timer-gong.wav`

Vite emits those source files as hashed build assets. OGG ambience and WAV effects use the same `fetch` plus `AudioContext.decodeAudioData` path; any response with an `audio/*` MIME type is accepted. The ambience OGG files must already be cut as seamless loops. Each WAV file is one short one-shot sample.

Night and day ambience follow the same phase resolver as the Stage background and play only during active game scenes. Phase changes crossfade between loop-ready ambience files. Lobby, setup, assignment, role reveal, and ended scenes stay silent.

The public day timer drives one short tick sample at every second from 10 through 1, then one gong when it reaches zero. The client records emitted cues across pause/resume, clears them on timer reset, and does not replay missed cues after a hidden tab becomes visible. No per-second server messages are required.

Mute and master volume are stored locally under the versioned `tablegather-werewolf-stage-audio` preference configured by the definition. Browser autoplay policies still require a fresh user interaction after opening or reloading the Stage. Activation calls `AudioContext.resume()` directly inside the gesture before scheduling a one-frame silent unlock buffer and also accepts a delayed `running` state. Firefox can keep an initial resume promise pending until another accepted gesture; while activation is pending, the button therefore remains available and a repeated click resumes the same context instead of creating another first-attempt context. Activation warnings include context and document visibility state. Tracks load in parallel; successful buffers remain cached, while missing or invalid files are logged with their URL and failure cause and retried on the next activation. The remaining tracks and the Stage UI keep working after a partial failure. The integrated production server serves the bundled OGG and WAV files as `audio/ogg` and `audio/wav`.
