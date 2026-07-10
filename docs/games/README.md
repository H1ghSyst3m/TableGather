# Game Documentation

This directory contains game-specific documentation. Top-level files in `docs/` describe shared TableGather systems; each playable game should own its detailed flow, rules, room behavior, and styling notes under `docs/games/<gameId>/`.

## Shared vs Game-Specific Docs

Use shared docs for platform behavior that applies across games:

- `docs/architecture.md` for app structure, game registry boundaries, i18n, and verification.
- `docs/architecture.md#client-stage-audio` for the reusable client-only Stage audio runtime and opt-in boundary.
- `docs/online-mode.md` for generic room lifecycle, WebSocket messages, sessions, snapshots, and adapter responsibilities.
- `docs/styling-and-theming.md` for global CSS layers, theme tokens, and reusable styling rules.

Use game docs for behavior that depends on one game:

- game flow, phases, screens, rules, and player/host responsibilities;
- role or rule implementation guides;
- game-specific room commands, snapshot fields, Stage behavior, and privacy details;
- game-specific Stage audio tracks, phase resolution, cue rules, and mix values;
- game-specific visual direction, shells, components, and browser QA scenarios.

## Adding A Game Doc Set

Create `docs/games/<gameId>/` once a game has real gameplay, room behavior, custom styling, or implementation guidance. A complete game doc set should include:

- `README.md` as the game documentation index;
- `flow.md` for user-facing flow and screen behavior;
- implementation guides for game-specific rules or roles;
- room/stage notes when the game supports room mode or public display;
- styling notes when the game has custom theme, CSS, or layout rules.

Keep links from `README.md`, `CONTRIBUTING.md`, and `AGENTS.md` current when adding or moving game docs.

## Current Games

- `werewolf/` documents the playable Werewolf implementation.
