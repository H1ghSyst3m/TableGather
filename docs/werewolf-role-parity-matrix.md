# Werewolf Role Parity Matrix

This matrix tracks TableGather Werewolf behavior against the WerwolfMasterCompanion-style rule model. TableGather keeps its own UI, code structure, room privacy model, and dark Werewolf theme.

## Reference Files

Use these files before changing role behavior:

| Concern | Source |
| --- | --- |
| Role ids, game phases, state fields | `src/games/werewolf/domain/types.ts` |
| Role names, descriptions, rules, category, group, icon, uniqueness, app/table-only flag | `src/games/werewolf/domain/roles.ts` |
| Default options, role counts, villager autofill, validation | `src/games/werewolf/domain/setup.ts` |
| Effective role/team and hidden Alpha Wolf alignment | `src/games/werewolf/domain/alignment.ts` |
| Night target validity and active/inactive step logic | `src/games/werewolf/domain/targets.ts` |
| Assignment, role reveal, night/day reducer logic, effects, hunter queues, win checks | `src/games/werewolf/domain/engine.ts` |
| Host/player/stage room commands and snapshots | `src/games/werewolf/commands.ts`, `src/games/werewolf/roomAdapter.ts`, `src/games/werewolf/roomTypes.ts`, `src/games/werewolf/stage.ts` |
| Host UI, footer actions, public reveal steps, night result cards, day vote, game log, player overview | `src/games/werewolf/components/WerewolfPlaySurface.tsx` |
| Stage public display | `src/games/werewolf/components/WerewolfStageScreen.tsx`, `src/games/werewolf/components/StageLinkPanel.tsx` |
| Setup UI and role rules UI | `src/games/werewolf/components/RoleCountEditor.tsx`, `src/games/werewolf/components/RoleRulesModal.tsx`, `src/games/werewolf/components/RoleInfoModal.tsx` |
| Local and room entrypoints | `LocalWerewolfApp.tsx`, `WerewolfRoomHostScreen.tsx`, `WerewolfRoomPlayerScreen.tsx` |
| Role copy and rule copy | `src/games/werewolf/i18n/en.ts`, `src/games/werewolf/i18n/de.ts` |
| Behavior tests | `test/werewolf.test.ts`, `test/roomManager.test.ts`, `test/roomServer.test.ts`, `test/werewolfUi.test.tsx` |

## Cross-Role Invariants

| Area | TableGather rule |
| --- | --- |
| Commit point | Night selections are reversible until the GM advances or resolves the step. Day-vote elimination uses selected player plus footer action. No-vote and Hunter skip use confirmation dialogs. |
| Wolf attack pipeline | Protector and away Night Guest are checked before Cursed, Alpha Wolf, Tough Guy, Infected, and Night Guest collateral. |
| Direct effects | Witch poison, day vote, Hunter shot, lover death, and special wins are not blocked by Protector or Night Guest. |
| Infected trigger | Wolves skip only when the Infected is the main wolf target and actually dies from that wolf attack. |
| Tough Guy wound | A wound is created only by an unprotected, unhealed, non-infecting wolf hit and is cleared if the Tough Guy dies by any other cause. |
| Hunter queue | Hunter deaths from the same resolution are queued and resolved sequentially before normal win checks continue. |
| Wild Child conversion | Conversion happens only after handled resolution points where the model is newly dead: night report, day vote, Hunter/lover follow-up. |
| Effective role/team | Seer, Aura Seer, Detective, wolf targeting, win checks, and displays use current roles after Cursed/Wild Child transformations and Alpha Wolf hidden alignment overlays. |
| Result reveal | Seer, Aura Seer, and Detective results appear only after the host presses "Show result"; the UI renders the result in the bottom action area with good/evil tone. |
| Room privacy | Host snapshots may include full game state and a host-only `canUndo` flag; player snapshots expose only public status plus the requesting player's private role/hidden alignment when visible. |
| Stage privacy | Stage snapshots expose only public room/game state and public reveal events. They must not expose assignment drafts, target selections, GM logs, hidden queues, or private player role data. |
| Public reveal queue | `publicEvents` plus `publicEventIndex` controls host and Stage public reveal order. `advancePublicEvent` moves between public events; `hunterPending` is resolved by `resolveHunterShot`. |
| Table-only roles | Little Girl is documented and selectable but has no automated night step, target state, or death effect. |
| Room assignment | Room host owns role counts and random/manual assignment drafts before role reveal; player snapshots do not expose drafts or role tables. |

## Role Matrix

| Role | Timing | Targets and exclusions | Commit and interactions | Visibility |
| --- | --- | --- | --- | --- |
| Werewolf | Every night while any wolf-aligned player exists. Weakened wolves still get a rhythm step with no victim. | Any living non-wolf effective team player. Alpha Wolf infected players are treated as wolf-aligned. | Main wolf attack drives Protector, Night Guest, Cursed, Alpha Wolf, Tough Guy, Infected, Witch heal, and Night Guest collateral interactions. | GM sees wolf actors and chosen victim. Player clients do not see target state. |
| Villager | No night action. | None. | Can die from normal public/direct causes. Auto-filled villagers cover unused role slots. | Role card, reveal summary, and GM overview where exact roles are visible. |
| Seer | Night step if Seer was in the game; inactive rhythm step if dead. | One living other player. | Result reveal is explicit. Shows current effective role plus hidden Alpha Wolf alignment status where applicable. | GM sees result in footer result card. Player clients do not see target/result. |
| Witch | Night step while alive and at least one potion remains. | Heal only a truly healable wolf victim. Poison any other living player, including protected or away wolf targets where no wolf death occurs. | Heal/poison choices are reversible during Witch step and spent on night resolution. Poison is a direct effect. | GM sees potion state and targets. Players do not. |
| Hunter | No night step. Triggers on death from any cause. | One living player other than the dead Hunter, or pass. | Trigger queue resolves Hunter and lover-chain Hunters sequentially before win checks. Skip is confirmation-protected. | GM gets Hunter shot surface. Players do not see hidden queue data. |
| Cupid | First night only when present. | Any two living players; Cupid may include themself. | Lovers are committed when two targets are selected and the step advances. Lover death chains from all death causes. | GM overview shows lover status. Player snapshots do not expose pair details. |
| Fool | No night action. | Day vote only. | If voted out during day, wins immediately before normal kill/win logic. | Game over reveals Fool win. |
| Village Idiot | No night action. | Day vote only. | If voted out on day 1, wins immediately. If they survive day 1, they become Villager at the next night start. | Current role display shows Villager with former role where exact roles are visible. |
| Aura Seer | Night step if present; inactive rhythm step if dead. | One living other player. | Result reveal is explicit and uses effective team. | GM sees good/evil result in footer. |
| Detective | Night step if present; inactive rhythm step if dead. | Two living players, not the Detective. | Result reveal is explicit and compares effective teams. Same team is good tone; different teams are evil tone. | GM sees comparison result in footer. |
| Alpha Wolf | Night step if present; inactive after used or dead. | Current wolf victim only, if the wolf attack normally reaches that target. | Infection does not spend when blocked by Protector, away Night Guest, Cursed conversion, or missing victim. Victim survives, keeps role/actions, and becomes secretly wolf-aligned immediately. | GM gets info step. Affected private role card shows original role plus hidden wolf-aligned status. Other player snapshots do not expose it. |
| Night Guest | Night step if present; inactive rhythm step if dead. | One living other player. | Direct wolf attack misses while away. Host wolf attack hits host plus guest. Host protection protects both. Non-wolf deaths ignore the visit. | GM sees host choice. Players do not. |
| Protector | Night step if present; inactive rhythm step if dead. | One living other player, not same target as previous night. | Blocks only the wolf attack before Cursed, Alpha Wolf, Tough Guy, Infected, and Night Guest collateral. | GM sees current and previous protection state. |
| Wild Child | First night only when present. | One living other player. | Converts to Werewolf only after the chosen model is newly dead at a handled resolution point. | GM/player exact-role views show Werewolf with former Wild Child after conversion. |
| Cursed | No active night action; secret info step after successful conversion. | None. | Direct unprotected wolf attack converts instead of killing. Non-wolf causes kill normally. | GM gets secret info step. Player private role card updates. |
| Infected | No active night action. | None. | Wolves skip next night only if Infected is main wolf target and dies from that main wolf attack. | Skip is GM-only state. Player snapshots do not expose it. |
| Little Girl | No app-handled night step. | Table-only. | Table handles peeking/risk physically. TableGather does not automate kills or checks. | Documented in role rules only. |
| Tough Guy | No active target step; GM info step after real wound. | None. | A wolf hit wounds instead of killing unless blocked, healed, or replaced by Alpha infection. Old wound death resolves later and cannot be healed by later protection/heal. | GM sees wound notification. Player snapshots do not expose wound state. |

## UI Behavior Notes

- `WerewolfPlaySurface` keeps primary flow actions in the `WerewolfFlowShell` footer.
- Seer/Aura Seer/Detective result cards use `.night-result-card.good` or `.night-result-card.evil`.
- Day vote uses body selection plus footer action `Eliminate {name}`; selecting the same player again clears the pending vote.
- `Begin night without a vote` remains confirmation-protected.
- Game Log and Players Overview are header icon actions, not a second toolbar row.
- Player overview and game log are host-only modal sheets.

## Room And Local Checks

- Local pass-and-play and room host mode call the same domain engine functions.
- Room mode has a host-only assignment phase before player-owned role reveal.
- Nullable target commands are used for clear/undo in room mode.
- Player devices receive private role cards and public player status only.
- Player devices never receive GM log, target selections, role/team tables, assignment drafts, or another player's hidden Alpha Wolf infection status.
- Stage devices receive public snapshots only. Night deaths are grouped without cause, team, or role. Public day events reveal team or role only according to `revealMode`, except Hunter prompts reveal the Hunter role because the public action pauses there.

## Test Coverage Map

- Add or update role behavior tests in `test/werewolf.test.ts`.
- Add or update room privacy/command tests in `test/roomManager.test.ts` or `test/roomServer.test.ts`.
- Add or update rendered UI expectations in `test/werewolfUi.test.tsx`.
- Add or update Stage event-order and privacy tests when changing public deaths, Hunter chains, lover chains, or reveal rules.
- Add or update translation coverage in `test/i18n.test.ts` when adding role rules/copy.
