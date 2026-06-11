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
   - Werewolf-specific shell/layout;
   - Werewolf setup, role reveal, night/day, room, stage, modal, and theme overrides;
   - Sleek Night visual system;
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

Werewolf tokens live in `src/games/werewolf/theme.ts`.

`gameThemeClassName(game)` adds:

- `.game-theme-<gameId>`
- `.game-mood-<mood>`

Werewolf renders with `.game-theme-werewolf` and `game-mood-sleek-night`.

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

- `.werewolf-flow-*`;
- Werewolf setup role editor;
- Role Reveal card and interactions;
- Werewolf night/day cards;
- Werewolf room header/QR/copy controls;
- Werewolf stage display, reveal panels, and event timeline;
- Werewolf modal sheet overrides;
- Werewolf dark theme colors and borders.

Do not move global styles into Werewolf CSS just because Werewolf currently uses them. Future games should be able to reuse global defaults and then override them through their own `.game-theme-*` class.

## WerewolfFlowShell

`src/games/werewolf/components/WerewolfFlowShell.tsx` is the Werewolf screen chrome for interactive local, host, and player screens.

It provides:

- compact header;
- optional Back button;
- centered title;
- header icon actions;
- settings icon;
- one scrollable body;
- reserved bottom footer/action bar.

Layout contract:

```css
grid-template-rows: auto minmax(0, 1fr) auto;
```

The body has `overflow-y: auto` and `min-height: 0`. The footer is a normal grid row, not fixed/sticky overlay. This prevents mobile content from being hidden under footer actions.

Primary flow actions belong in the footer:

- Start game / next setup step;
- Next player / begin night;
- Show result / next step;
- Begin night;
- Eliminate selected player;
- Continue/reset actions.

Contextual body actions stay in the body:

- add/remove players;
- copy room link;
- stage link creation/copy/disable controls;
- role count steppers;
- Game rules options;
- manual assignment selectors.

## Footer Height Contract

The Werewolf footer avoids uncapped dynamic safe-area padding in normal browser mode. Mobile browsers can change dynamic viewport and safe-area values when address bars show/hide, so the footer keeps stable content height.

Keep future footer edits aligned with:

- fixed button height around the existing action size;
- no extra informational text in the footer unless it is essential to the immediate action;
- result cards can appear above the button in a small stack;
- footer must remain a reserved layout row;
- body content must scroll behind neither header nor footer.

## Current Werewolf Visual Direction

Werewolf uses a Sleek Night command-surface style:

- dark blue/graphite background;
- teal primary actions;
- burgundy danger/selection accents;
- off-white text;
- muted blue-gray secondary text;
- flat command surfaces with thin cyan dividers;
- restrained elevation and reserved outlines instead of hard 3D shadows;
- compact role rows, player cells, and rules cards that avoid a chunky card-in-card look.

Keep the Werewolf UI atmospheric but readable. Avoid reintroducing heavy text shadows, hard offset button shadows, dense glow stacks, or decorative effects that compete with the game flow.

The design does not use placeholder SVG images. Role art/assets can be added later through theme assets, but the app should not add fake placeholder art just to fill slots.

## Stage Screen Styling

`WerewolfStageScreen` is separate from `WerewolfFlowShell`. It is a public TV/projector surface, not a host or player control surface.

Stage styling should prioritize:

- large rem-based text that is readable from table distance;
- stable widths for reveal panels, player tiles, and the event timeline;
- no host/player actions or operational controls;
- clear day/night mood shifts without leaking private night-role context;
- visual player tiles instead of comma-separated name lists;
- role and team reveal badges that reuse Werewolf role/team icon components.

The Stage event timeline is context only. It should stay secondary to the active reveal, but it must remain readable on a TV. Single timeline entries should not stretch across the full stage width.

## Portal Modals

Some modal sheets are rendered through portals outside the `.game-theme-werewolf` subtree. Werewolf-specific classes are added where needed so the dark theme still applies:

- `.werewolf-settings-sheet`
- `.game-confirm-sheet`
- `.role-info-modal`
- `.role-rules-modal`
- `.player-overview-sheet`
- `.game-log-sheet`

When adding a new portal for Werewolf, either:

- render it inside the Werewolf theme subtree, or
- add a stable Werewolf-specific class and include it in the game stylesheet variable/theme override group.

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

For Werewolf styling changes, check:

- `/play/werewolf` setup with many players;
- Role Setup with Game rules open;
- Role Reveal at 375x667 and 430x932;
- Night Seer/Aura/Detective result footer;
- Day Vote selection and footer action;
- Host day timer idle, running, paused, expired, and reset states;
- Room host screen with QR/copy/assignment;
- Room host screen with stage link create/copy/rotate/disable;
- Room player role reveal;
- Stage route `/stage/<CODE>/<TOKEN>` for lobby, day timer, night report, Hunter prompt, vote reveal, and ended scenes;
- Settings, Role Info, Role Rules, Game Log, Players Overview;
- no horizontal overflow;
- footer does not overlap body content;
- readable disabled, selected, good, evil, danger, and muted states.

Timer panels and controls should stay visually consistent with the dark Werewolf command-surface style. Avoid introducing light generic panels inside the Werewolf play surface unless the whole surrounding surface uses that treatment.

Run:

```bash
npm run lint
npm run test
npm run build
```
