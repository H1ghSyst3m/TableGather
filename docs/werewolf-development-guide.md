# Werewolf Development Guide

Use this guide when adding, changing, or debugging Werewolf roles. The goal is to keep local pass-and-play, room mode, role reveal, i18n, UI, and tests aligned.

## Rule Of Thumb

Do not start in React UI. Start with the domain model:

1. define the role and state shape;
2. define setup/target rules;
3. implement engine behavior;
4. expose room commands/snapshots and public stage events if needed;
5. render UI for the existing engine state;
6. add translations;
7. add tests.

The domain engine owns behavior. UI should render state and dispatch actions; it should not duplicate game rules.

## Table-Only vs App-Handled Roles

Every role in `roleDefinitions` has `handledByApp`.

- `handledByApp: true` means the app automates some part of the role: setup, night step, target selection, conversion, result reveal, death effect, win check, or snapshot behavior.
- `handledByApp: false` means the role can be selected and documented, but the table handles its behavior physically. Current example: Little Girl.

For a new role, decide this first. If a role is table-only, avoid adding engine state, night steps, commands, or hidden snapshot fields. Add role metadata, copy, setup availability, and tests that it does not create automated behavior.

## Add A New Role Checklist

### 1. Domain Types

Update `src/games/werewolf/domain/types.ts`:

- add the role id to `RoleId`;
- add state fields only if the role needs persistent choices, one-time-use flags, delayed effects, hidden alignment, or result reveal flags;
- add a `NightStepId` only if the role has an app-handled night step or info/reminder step;
- add `WerewolfLogType` only if the role creates a new log category that cannot reuse existing log types.

Keep state minimal. Prefer derived helpers for values that can be computed from players/options/current step.

### 2. Role Metadata

Update `src/games/werewolf/domain/roles.ts`:

- add a `roleDefinitions[roleId]` entry;
- set `nameKey` and `descriptionKey`;
- set `ruleKeys` used by role rules/info modals;
- choose `team`, `category`, and `group`;
- choose an icon id supported by `roleIconMap` in `RoleCountEditor`;
- set `unique` when the role should be limited to one;
- set `handledByApp` accurately;
- insert the role in `roleOrder` and `selectableRoleOrder` order.

Use `villager` only as the autofill role. Do not add Villager to selectable setup order.

### 3. Setup Defaults And Validation

Check `src/games/werewolf/domain/setup.ts`:

- update `createDefaultRoleCounts` only if the role should be part of default setup;
- make sure `autoFillVillagers` still fills correctly;
- ensure unique-role expectations are compatible with `RoleCountEditor`;
- add validation tests if the new role changes role count rules.

Most roles do not need custom setup validation beyond uniqueness and role total.

### 4. Alignment And Effective Role

Check `src/games/werewolf/domain/alignment.ts`:

- update `effectiveRoleId` if the role can transform or masquerade as another role;
- update `playerTeamInState` or `isWolfAligned` if the role has hidden alignment, temporary team changes, or custom team logic;
- verify Seer, Aura Seer, Detective, wolf targets, and win checks should use the new effective behavior.

Avoid scattering team checks in UI components. Put team logic here.

### 5. Target Validity

Update `src/games/werewolf/domain/targets.ts` if the role has app-handled targeting:

- add a `NightTargetAction` if a new selector type is needed;
- add `getValidTargets` rules;
- add `isNightStepActive` rules;
- keep engine commands defensive even if UI filters targets.

Target rules should be deterministic and should not mutate state.

### 6. Engine Behavior

Update `src/games/werewolf/domain/engine.ts`:

- initialize any new state in `createWerewolfState`;
- include the night step in `buildNightSteps` when relevant;
- add setter functions for reversible choices;
- clear stale selections when advancing from the role's step;
- apply effects at the correct resolution point;
- add or update `WerewolfPublicEvent` output when the role creates a public reveal, death, Hunter prompt, or follow-up chain;
- insert info/reminder steps only when the host needs to see them;
- clear or carry state when starting the next night;
- update `checkWin` only if the role changes win conditions;
- add log entries only for host-visible events.

Important engine patterns:

- Night selections are reversible until step advance or resolution.
- Wolf-attack-related effects must preserve the current pipeline order.
- Direct effects bypass Protector/Night Guest.
- Hunter queues must resolve before normal win checks continue.
- Wild Child conversion happens only after handled resolution points.

### 7. Room Commands And Adapter

If the role needs host input in room mode, update:

- `src/games/werewolf/commands.ts` with host/player command type;
- `werewolfHostCommandTypes` or `werewolfPlayerCommandTypes`;
- `src/games/werewolf/roomAdapter.ts` command routing;
- `roomTypes.ts` only if snapshot shape needs typed additions.
- `src/games/werewolf/stage.ts` if the role affects public Stage scenes or reveal data.

Shared non-role day state, such as the day timer, follows the same ownership boundaries: initialize it in domain state, route host-owned actions through room commands when room mode needs them, and expose only host-safe or public stage-safe snapshots. Player snapshots should not receive shared host tooling state unless it is explicitly player-facing.

Room privacy rules:

- host snapshots may include full game state;
- player snapshots must expose only the requesting player's private information;
- stage snapshots must expose only public room/game information;
- do not expose target selections, assignment drafts, hidden queues, or other players' role/alignment data.

Public Stage reveal rules:

- night deaths are grouped and never reveal cause, team, or role;
- public day events follow `revealMode`;
- Hunter prompts may reveal the Hunter role because the public action pauses there;
- prompts and system states should not appear as elimination-history entries.

### 8. UI Surfaces

Update `src/games/werewolf/components/WerewolfPlaySurface.tsx` for app-handled role interactions:

- add night-step title/description copy mapping;
- add the body control for the step;
- add footer action behavior if the step needs confirmation/progression;
- use `PlayerSelector`, `MultiPlayerSelector`, `InlinePlayerSelector`, `StepNote`, or a small role-specific panel;
- keep primary actions in `WerewolfFlowShell` footer;
- keep role result cards in the footer when they are immediate host results.
- update public reveal surfaces when the role adds a new public event type or changes event ordering.

Update setup-related UI when needed:

- `RoleCountEditor` for role icon mapping or grouping behavior;
- `RoleInfoModal` and `RoleRulesModal` only through role metadata/rule keys when possible.

Do not add a second toolbar row for host tools. Game Log and Players Overview stay header icon actions.

### 9. Role Reveal And Private Player View

Check `RoleRevealScreen` and `WerewolfRoomPlayerScreen` if the role affects private role display:

- transformed roles should use `effectiveRoleId` where current identity matters;
- former-role text should remain visible where exact identity is shown;
- hidden Alpha Wolf infection-style private flags must be visible only to the affected player and host.

If adding a new hidden private status, update room player snapshots and tests.

### 10. I18n

Update both:

- `src/games/werewolf/i18n/en.ts`
- `src/games/werewolf/i18n/de.ts`

Required copy:

- `roles.<roleId>.name`;
- `roles.<roleId>.description`;
- every `ruleKeys` entry for role info/rules;
- night-step labels/descriptions if app-handled;
- command/result/log text if UI needs new copy.

Run i18n tests after changes. English and German keys must stay aligned.

### 11. Tests

Add tests where the behavior lives:

- `test/werewolf.test.ts` for domain behavior, target validity, conversions, deaths, wins, and edge cases;
- `test/roomManager.test.ts` for room commands, host/player/stage snapshots, assignment, and privacy;
- `test/roomServer.test.ts` for WebSocket-level room behavior;
- `test/werewolfUi.test.tsx` for rendered UI contracts;
- `test/i18n.test.ts` for role/rule copy coverage.

Prefer focused tests over broad snapshots. Tests should cover:

- valid setup counts;
- active/inactive night step behavior;
- reversible selections;
- resolution effects;
- room privacy;
- stage public event order and privacy when public deaths/reveals change;
- current UI placement for primary action/results.

## Common Role Patterns

### Night Action Role

Use when a role wakes and selects one or more targets.

Typical changes:

- add `NightStepId`;
- add state field for target(s);
- add target action in `targets.ts`;
- add setter in `engine.ts`;
- add command and room adapter routing;
- render selector in `WerewolfPlaySurface`;
- clear stale targets when advancing;
- add tests for target validity and room command clear/undo.

### Info/Reminder Role

Use when the host needs a non-target step after a hidden event, such as Cursed conversion or Tough Guy wound.

Typical changes:

- add info `NightStepId`;
- insert step from engine only when the event occurs;
- render `GmOnlyInfo` or `StepNote`;
- keep player snapshots private.

### Transformation Role

Use when a player's current role/team can change.

Typical changes:

- preserve `originalRoleId`;
- update current `roleId` or add hidden alignment overlay;
- update `effectiveRoleId` and/or `playerTeamInState`;
- update room player self snapshot if affected player should know;
- test Seer/Aura/Detective/wolf target/win behavior.

### Special Win Role

Use when normal winner checks are interrupted.

Typical changes:

- update `Winner` if needed;
- update `checkWin` or the resolution function that triggers the special win;
- add log/game-over copy;
- test ordering against deaths, Hunter queue, and lovers.

## Verification Checklist

After role changes:

```bash
npm run lint
npm run test
npm run build
```

Manual browser QA for app-handled roles:

- setup with the role selected;
- local role reveal;
- relevant night/day step;
- room host setup and assignment;
- room player private role view;
- Game Log and Players Overview;
- mobile footer/body layout.
