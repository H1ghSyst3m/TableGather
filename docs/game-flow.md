# Werewolf Game Flow

Werewolf behavior lives in `src/games/werewolf/domain/engine.ts`; this guide describes how the UI exposes that behavior in local pass-and-play and room mode.

## Entry Points

```text
Hub
  -> Pass-and-play
       /play/werewolf
  -> Room mode
       /room/create/werewolf
       /room/<CODE>
       /stage/<CODE>/<TOKEN>
```

Only Werewolf is playable in V1. Imposter and Undercover remain visible as coming-soon games.

Interactive Werewolf host/player/local screens are rendered inside `WerewolfFlowShell`, which provides:

- compact header with Back, screen title, and contextual icon actions;
- one scrollable body area;
- reserved bottom action bar for primary flow actions;
- settings modal access;
- game-specific dark Werewolf theme from `src/games/werewolf/styles.css`.

The footer is not an overlay. It is a reserved grid row so body content scrolls above it and is not hidden on mobile.

Stage mode uses a separate TV/projector layout in `WerewolfStageScreen`. It has no host or player controls and renders only public state from the stage snapshot.

## Pass-And-Play Setup

`LocalWerewolfApp` owns local setup and persists active games in `localStorage` under `tablegather-werewolf-local`. Restored games pass through `normalizeSavedGame`; when the Werewolf state shape changes, new persisted `WerewolfState` or `WerewolfPlayer` fields need defaults there so older local sessions remain safe.

### Preparation Steps

Local pass-and-play and room host setup both use three preparation steps:

1. Player Lobby
2. Game Settings
3. Role Assignment

In room mode, only the Player Lobby accepts new joins. Moving to Game Settings stores setup server-side and blocks new player joins; returning to Player Lobby reopens joins. Existing players stay in the room and continue seeing status/waiting screens.

### Player Lobby

The Player Lobby manages table membership:

- add a player by name;
- remove players from the player list;
- clear the list;

Room mode also shows room code/QR, player status, Stage controls, and Host Transfer in this step.

### Game Settings

Game Settings owns the role and rule setup:

- configure role counts in `RoleCountEditor`;
- auto-fill Villagers for open role slots;
- open Game rules inside the role setup card;
- switch between Classic and Special role categories.

Validation is domain-driven:

- minimum players are defined by `minimumWerewolfPlayers`;
- role total must match the player count after villager autofill;
- unique roles cannot exceed one;
- role count defaults come from `createDefaultRoleCounts`.

Primary setup actions live in the bottom action bar. Setup body buttons remain contextual, for example player add/remove; room-link copy is room-mode only. In room mode, Game Settings changes are sent through `updateSetup` so the server snapshot stays authoritative.

### Assignment

After setup, the host chooses role assignment:

- **Random assignment** shuffles the selected role pool and previews the result.
- **Manual assignment** lets the host assign each role by hand while quota badges show remaining counts.

The preview is visible only to the host/local device. In room mode, assignment drafts are host-only snapshots.

## Role Reveal

`RoleRevealScreen` is shared by local pass-and-play and room player role reveal.

Current behavior:

- one player is shown at a time;
- the card uses a stable 5:7 playing-card aspect ratio;
- the player must drag upward or press Enter/tap to reveal;
- the footer stays compact and contains only the primary next action plus the role-info icon after reveal;
- role description opens as a small footer-side icon button after reveal;
- progress dots and "Card for {name}" live in the body, not in the footer.

In local pass-and-play, `advanceRoleReveal` moves through all players and then starts the first night. In room mode, each player marks only their own role as seen with the `markRoleSeen` player command; the host sees ready/waiting player status.

## Night Flow

`WerewolfPlaySurface` renders night, day, hunter-shot, report, and game-over surfaces. The engine supplies the current `nightSteps` and `nightStepIndex`.

Night step order is built by `buildNightSteps(players, round)`:

1. `sleep`
2. `cupid` and `lovers` on round 1 when Cupid is present
3. `wildChild` on round 1 when Wild Child is present
4. `nightGuest`
5. `protector`
6. `wolves`
7. `cursedInfo` when inserted after a conversion
8. `alphaWolf`
9. `alphaWolfInfo` when inserted after an infection
10. `seer`
11. `auraSeer`
12. `detective`
13. `witch`
14. `toughGuyInfo` when inserted after a real wound
15. `dawn`

Inactive rhythm steps are still rendered for roles that were in the game but are no longer active. This keeps the host rhythm stable without exposing extra actions.

### Night Targeting

Target validity is centralized in `src/games/werewolf/domain/targets.ts`. UI selectors should render valid targets from `getValidTargets` and let engine functions defend against invalid commands.

Common night UI patterns:

- `PlayerSelector` for one target.
- `MultiPlayerSelector` for Cupid and Detective.
- `AlphaWolfPanel` for the one-time transform decision.
- `WitchPanel` for heal and poison decisions.
- `StepNote` and `GmOnlyInfo` for non-player or hidden information steps.

Night selections are reversible until the host advances or resolves the relevant step.

### Night Results

Seer, Aura Seer, and Detective use explicit result reveal:

- before reveal, the footer primary action says "Show result";
- after reveal, the result appears in the bottom action area above the primary button;
- the result is not rendered under the player grid, so the host does not need to scroll back down;
- result cards use `good` or `evil` tone:
  - Seer result tone follows the inspected player's effective team;
  - Aura Seer result tone follows good/evil;
  - Detective result tone is good for same team and evil for different teams.

The result viewmodel is UI-only. The engine stores only revealed flags and selected targets.

## Night Resolution And Dawn Report

`resolveNight` applies the wolf attack pipeline and direct effects. Depending on the outcome, the host sees public reveal steps before day starts.

The first public night step is always the night report. It can include:

- night deaths;
- no-death result;

The public night report never reveals cause, team, or role. If a Hunter trigger is pending, the next public step is the Hunter prompt. The host advances public steps with `advancePublicEvent`; a `hunterPending` step must be resolved with `resolveHunterShot`.

## Day Flow

Day starts after night report or direct night transition.

The day screen shows a day timer above the vote player grid. Each new day prepares the timer in `idle` state, preserving the selected duration where possible and defaulting to 5 minutes. The host can choose 2, 3, 5, 7, or 10 minutes while the timer is idle or paused. Only the host can start, pause/resume, or reset it.

When the timer reaches `0:00`, the UI shows the localized `werewolf.dayTimerExpired` message, but the engine does not automatically advance to voting, vote reveal, or night. Voting, no-vote night start, and all phase transitions remain explicit host actions.

Current day vote UX:

- the body contains the day vote player grid;
- tapping a living player selects or unselects them;
- selecting a player does not open a confirm dialog;
- the footer button changes to `Eliminate {name}`;
- tapping that footer action eliminates the selected player;
- `Begin night without a vote` remains a direct skip action and still opens a confirmation dialog.

This gives player elimination a two-step confirmation through selection plus footer action, while no-vote remains protected by a dialog because it has no selected target.

Day vote reveal behavior follows `WerewolfOptions.revealMode`:

- `hidden` shows only the public elimination.
- `team` reveals good/evil for public day events.
- `role` reveals the exact current role for public day events.

Day public reveal order is host-controlled through the public event queue:

1. vote death;
2. lover death follow-ups caused by the vote;
3. Hunter prompt when a killed Hunter must shoot;
4. Hunter shot or skip;
5. lover death follow-ups caused by the Hunter shot;
6. later Hunter prompts in the same chain;
7. winner when the game ends.

## Hunter Queue

Hunter deaths can occur from night attacks, day votes, lover chains, or previous Hunter shots. The engine queues pending Hunter shots and resolves them sequentially:

- `pendingHunterId` is the current Hunter who may shoot;
- `pendingHunterQueue` stores later Hunter triggers;
- `pendingHunterSource` records night/day source context;
- `resolveHunterShot(playerId | null)` resolves a shot or skip.

The UI always uses a confirmation dialog for Hunter skip. Shooting a target is a concrete target action.

Public Hunter moments are explicit Stage/host reveal steps. The Hunter prompt can publicly name the Hunter, and the shot result is shown separately from the prompt.

## Stage Mode

Stage mode is a read-only Werewolf room client for a public display. The host creates, rotates, or disables a stage link from the room host screen. The stage route joins with `joinStage` and receives `WerewolfStageRoomSnapshot`.

Stage scenes:

- `lobby`: room code, player list, ready/status information, and player-join QR.
- `setup`: room code, player wall, and preparation status while the host edits roles/rules, without a player-join QR.
- `assignment`: room code, player wall, and preparation status while the host assigns roles, without a player-join QR.
- `roleReveal`: neutral progress screen while players view private roles.
- `night`: public night atmosphere only, with no role/action hints.
- `nightReport`: night deaths grouped together or no-death result.
- `hunter`: public Hunter prompt when a Hunter must shoot.
- `day`: discussion state, a large read-only day timer, and living players.
- `voteReveal`: vote, lover, Hunter shot, and Hunter skip public events.
- `ended`: winner display.

Stage reveal rules:

- night deaths are grouped and never reveal cause, team, or role;
- day vote, day lover death, and day Hunter shot events follow `revealMode`;
- Hunter prompts force the Hunter role reveal because the public action is paused on that player;
- history/timeline on Stage shows only real public eliminations, not prompts or system states.

## Game Over And Reset

`checkWin` determines winners after handled resolution points. Possible winners are:

- Villagers
- Werewolves
- Fool
- Village Idiot
- Lovers

Game over renders through `GameOverSurface` with a reset action. Local reset returns to setup. Room reset is a host command that sends the room back to lobby.

## Room Host Flow

Room host setup is similar to local setup but split around room lifecycle:

```text
Create room
  -> lobby with room code, link, QR, player status, host transfer
  -> role setup
  -> assignment mode and draft
  -> start role reveal
  -> wait until players mark roles seen
  -> host runs night/day play surface
  -> optional stage link mirrors public state
```

The host keeps full authority. Players do not submit night actions; the host records table decisions.

The room host can create a stage link at any point where a host snapshot is available. Rotating or disabling the link closes active stage sessions and invalidates old stage tokens.

## Room Player Flow

Room player screens are role-filtered:

- before game start, players see lobby/public status;
- during role reveal, each player sees only their own private role card;
- after marking role seen, they wait for the host;
- during play, player snapshots expose public status plus their own private role and hidden Alpha Wolf infection status when relevant;
- player screens never expose host log details, target selections, role tables, assignment drafts, or another player's role.

## Source Files

- Local setup and assignment: `src/games/werewolf/components/LocalWerewolfApp.tsx`
- Role setup controls: `src/games/werewolf/components/RoleCountEditor.tsx`
- Role/action/status icons: `src/games/werewolf/components/WerewolfIcons.tsx`
- Shared role reveal: `src/games/werewolf/components/RoleRevealScreen.tsx`
- Play flow surfaces: `src/games/werewolf/components/WerewolfPlaySurface.tsx`
- Room host/player screens: `src/games/werewolf/components/WerewolfRoomHostScreen.tsx`, `src/games/werewolf/components/WerewolfRoomPlayerScreen.tsx`
- Stage screen and link panel: `src/games/werewolf/components/WerewolfStageScreen.tsx`, `src/games/werewolf/components/StageLinkPanel.tsx`
- Domain engine: `src/games/werewolf/domain/engine.ts`
- Target validity: `src/games/werewolf/domain/targets.ts`
- Room adapter: `src/games/werewolf/roomAdapter.ts`
- Stage snapshot builder: `src/games/werewolf/stage.ts`
