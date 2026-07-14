# Werewolf Styling

Read this with `../../styling-and-theming.md`. The top-level styling doc owns shared CSS layers and theme-token rules; this file owns Werewolf-specific shell, layout, visual direction, Stage display, modal, and browser QA guidance.

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

The body has `overflow-y: auto` and `min-height: 0`. The footer is a normal grid row, not a fixed or sticky overlay. This prevents mobile content from being hidden under footer actions.

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

During the four preparation steps, the fixed header is the sole owner of the step title. `WerewolfPreparationShell` adds only progress, the compact preparation label, and a short description before the step-specific content. Do not repeat the step title in a setup hero or editor panel. Rule option cards keep their icon and copy centered across desktop and mobile layouts.

## Footer Height Contract

The Werewolf footer avoids uncapped dynamic safe-area padding in normal browser mode. Mobile browsers can change dynamic viewport and safe-area values when address bars show/hide, so the footer keeps stable content height.

Keep future footer edits aligned with:

- fixed button height around the existing action size;
- no extra informational text in the footer unless it is essential to the immediate action;
- result cards can appear above the button in a small stack;
- footer must remain a reserved layout row;
- body content must scroll behind neither header nor footer.

## Visual Direction

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

Stage header actions appear in this order: local display controls, audio, optional language control, and room code. `StageDisplayControl` and `.stage-display-control` provide the reusable fullscreen/Wake Lock markup, accessibility, pending states, and visible error status; `.werewolf-stage-display` supplies the Werewolf command-surface appearance. Keep its two icon buttons compact, show active state with the Stage accent, and let an error explanation wrap below the button pair without covering Stage content.

`StageAudioControl` and `.stage-audio-control` provide the reusable audio markup, accessibility, and layout structure; `.werewolf-stage-audio` supplies the Werewolf command-surface appearance and responsive sizing. Keep the group compact, with a speaker button and directly visible master-volume slider. Both Stage control groups must wrap with the existing header actions at narrow widths, preserve keyboard focus treatment, and use the established Stage borders, surfaces, accent, muted, and danger tokens.

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

## Browser QA Checklist

For Werewolf styling changes, check:

- `/play/werewolf` setup with many players;
- all four preparation steps, including centered rule cards on desktop and mobile;
- Role Reveal at 375x667 and 430x932;
- Night Seer/Aura/Detective result footer;
- Day Vote selection and footer action;
- Host day timer idle, running, paused, expired, and reset states;
- Room host screen with QR/copy/assignment;
- Room host screen with stage link create/copy/rotate/disable;
- Room player role reveal;
- Stage route `/stage/<CODE>/<TOKEN>` for lobby, day timer, night report, Hunter prompt, vote reveal, and ended scenes;
- Stage fullscreen and Screen Wake Lock activation, deactivation, browser-driven release, unsupported/rejected status, cleanup, and narrow-header layout;
- Stage audio activation, mute, volume, partial-load error, day/night crossfade, timer ticks, and timer gong;
- Settings, Role Info, Role Rules, Game Log, Players Overview;
- no horizontal overflow;
- footer does not overlap body content;
- readable disabled, selected, good, evil, danger, and muted states.

Timer panels and controls should stay visually consistent with the dark Werewolf command-surface style. Avoid introducing light generic panels inside the Werewolf play surface unless the whole surrounding surface uses that treatment.
