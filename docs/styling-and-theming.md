# Styling And Theming

Styling is split between shared app layers and game-specific overrides so future games can add their own visual design without breaking global UI defaults.

## Styling Layers

The app has two CSS layers:

1. `src/styles.css`
   - global reset and base app styles;
   - hub styles;
   - reusable controls such as `.primary-action`, `.secondary-button`, `.text-button`, `.icon-button`;
   - shared panels, forms, player tables, modals, and generic game-flow styles.
2. `src/games/werewolf/styles.css`
   - current game-specific stylesheet example;
   - game shell/layout, setup, play, room, stage, modal, and theme overrides;
   - overrides scoped to `.game-theme-werewolf` or Werewolf-specific classes.

Import order in `src/main.tsx` is intentional:

```ts
import "./styles.css";
import "./games/werewolf/styles.css";
```

Game-specific CSS must come after global CSS so it can override shared defaults.

## Theme Tokens

Theme tokens are defined by `GameThemeTokens` in `src/games/types.ts` and resolved by `src/games/theme.ts`.

The resolver produces CSS variables:

- `--accent`
- `--accent-strong`
- `--accent-soft`
- `--surface`
- `--surface-tint`
- `--app-bg`
- `--card-bg`
- `--text`
- `--muted`
- `--border`
- `--danger`
- `--shadow`

Game tokens live in each game module, for example `src/games/werewolf/theme.ts`.

`gameThemeClassName(game)` adds:

- `.game-theme-<gameId>`
- `.game-mood-<mood>`

Werewolf currently renders with `.game-theme-werewolf` and `game-mood-sleek-night`.

## Global Styles vs Game Overrides

Keep reusable structure global:

- app frame defaults;
- hub layout;
- shared buttons;
- shared panels;
- shared player rows;
- shared modals/dialogs;
- generic `GameFlowLayout` styles for future games.

Keep game personality and game-specific layout in the game stylesheet:

- game shell classes;
- game setup controls;
- game-specific reveal, play, room, and stage surfaces;
- game-specific modal sheet overrides;
- game-specific colors, borders, mood, and assets.

Do not move global styles into one game's CSS just because that game currently uses them. Future games should be able to reuse global defaults and then override them through their own `.game-theme-*` class.

## Game-Specific Styling Docs

Keep detailed visual direction, game-shell contracts, Stage display rules, portal modal notes, and browser QA scenarios in `docs/games/<gameId>/`.

Current game-specific styling notes:

- `docs/games/werewolf/styling.md`

## Future Game Styling Guidance

When adding a new playable game:

1. Add theme tokens in that game's module.
2. Register the theme in the game definition.
3. Add a game stylesheet under `src/games/<gameId>/styles.css`.
4. Import that stylesheet after global styles.
5. Scope overrides to `.game-theme-<gameId>` and game-specific component classes.
6. Reuse global controls where they fit.
7. Override only what gives the game a distinct visual identity or fixes a game-specific layout need.

Avoid:

- changing global styles to solve a single game's visual issue;
- adding fixed/sticky overlay footers for game flows;
- using one game stylesheet to style another game;
- relying on placeholder assets;
- introducing CSS Modules or a new styling system unless the project adopts it.

## Browser QA Checklist

For game styling changes, check the relevant game-specific QA doc plus shared UI basics:

- setup screens with many players/options;
- reveal or private-information screens at narrow mobile sizes;
- primary action footer/body layout;
- room host/player screens when room mode is supported;
- Stage routes when public display is supported;
- settings, role/rule info, logs, and overview modals;
- no horizontal overflow;
- footer does not overlap body content;
- readable disabled, selected, good, evil, danger, and muted states.

Run:

```bash
npm run lint
npm run test
npm run build
```
