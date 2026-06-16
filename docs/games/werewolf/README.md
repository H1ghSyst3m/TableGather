# Werewolf Documentation

Werewolf is the playable V1 game and owns its detailed game-specific documentation here. Read the shared docs first for platform boundaries, then use these files for Werewolf flow, roles, room behavior, Stage behavior, and styling.

## Start Here

- `flow.md` - local pass-and-play, room host/player flow, night/day flow, public events, and Stage scenes.
- `development-guide.md` - checklist and Definition of Done for adding or changing Werewolf roles.
- `role-parity-matrix.md` - role behavior matrix, cross-role invariants, and test coverage map.
- `room-and-stage.md` - Werewolf room adapter, host/player commands, snapshot privacy, and Stage reveal rules.
- `styling.md` - Werewolf shell, footer, visual direction, portal modals, Stage styling, and browser QA.

## Shared References

- `../../architecture.md` - shared app architecture and game-module contract.
- `../../online-mode.md` - generic room runtime, protocol, and snapshot ownership.
- `../../styling-and-theming.md` - shared styling layers, theme tokens, and future-game styling guidance.

## Change Guidance

- For role behavior, start with `development-guide.md` and verify the behavior against `role-parity-matrix.md`.
- For room or Stage changes, read `../../online-mode.md` first, then `room-and-stage.md`.
- For flow or UI behavior, read `flow.md`; for visual styling, read `styling.md`.
- If a change makes any of these docs inaccurate, update the docs in the same change.
