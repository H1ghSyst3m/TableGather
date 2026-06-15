import type { ComponentProps, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createWerewolfGameFromAssignments, markRoleSeen } from "../src/games/werewolf/domain/engine";
import type { WerewolfState } from "../src/games/werewolf/domain/types";
import { AdminDashboardView, AdminScreen, AdminStatePanel, AdminTokenForm } from "../src/components/AdminScreen";
import { GameConfirmDialog } from "../src/components/GameConfirmDialog";
import { HubScreen, HubSessionPanel } from "../src/components/HubScreen";
import { LocalWerewolfApp } from "../src/games/werewolf/components/LocalWerewolfApp";
import { WerewolfRoomPlayerScreen } from "../src/games/werewolf/components/WerewolfRoomPlayerScreen";
import { RoleRulesModal } from "../src/games/werewolf/components/RoleRulesModal";
import { RoleRevealScreen } from "../src/games/werewolf/components/RoleRevealScreen";
import { StageSettingsDialog } from "../src/games/werewolf/components/WerewolfRoomHostScreen";
import { WerewolfStageView } from "../src/games/werewolf/components/WerewolfStageScreen";
import { StageLinkPanel } from "../src/games/werewolf/components/StageLinkPanel";
import { GameLog, PlayerOverviewSheet, WerewolfPlaySurface } from "../src/games/werewolf/components/WerewolfPlaySurface";
import type { WerewolfStageRoomSnapshot } from "../src/games/werewolf/roomTypes";
import { I18nContext } from "../src/i18n/context";
import { translate } from "../src/i18n/translations";
import type { AdminRoomsSummary } from "../src/online/admin";
import { submitAdminTokenInput } from "../src/online/adminToken";
import { hasDuplicatePlayerName, normalizePlayerName } from "../src/playerNames";

const previousSessionStorage = globalThis.sessionStorage;
const localWerewolfStorageKey = "tablegather-werewolf-local";

const actions: ComponentProps<typeof WerewolfPlaySurface>["actions"] = {
  setProtectedPlayer: () => undefined,
  setNightGuestHost: () => undefined,
  setWildChildModel: () => undefined,
  setCupidTargets: () => undefined,
  setInspectedPlayer: () => undefined,
  setAuraTarget: () => undefined,
  setDetectiveTargets: () => undefined,
  revealNightResult: () => undefined,
  setWolfTarget: () => undefined,
  setAlphaWolfTransform: () => undefined,
  setDoctorHealTonight: () => undefined,
  setWitchHealTonight: () => undefined,
  setWitchPoisonTarget: () => undefined,
  advanceNightStep: () => undefined,
  advancePublicEvent: () => undefined,
  resolveNight: () => undefined,
  resolveHunterShot: () => undefined,
  eliminateByVote: () => undefined,
  startDay: () => undefined,
  setDayTimerDuration: () => undefined,
  startDayTimer: () => undefined,
  pauseDayTimer: () => undefined,
  resetDayTimer: () => undefined,
  startNextNight: () => undefined,
  undoStep: () => undefined,
  reset: () => undefined,
};

afterEach(() => {
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: previousSessionStorage,
  });
  vi.restoreAllMocks();
});

describe("werewolf play surface", () => {
  it("renders inactive Night Guest and Detective notes with separated title and hint", () => {
    const inactiveTitle = translate("de", "werewolf.inactiveStep");
    const inactiveHint = translate("de", "werewolf.inactiveStepHint");

    for (const stepId of ["nightGuest", "detective"] as const) {
      const game = createWerewolfGameFromAssignments(
        [
          { id: "wolf", name: "Wolf", roleId: "werewolf" },
          { id: "guest", name: "Nachtgast", roleId: "nightGuest" },
          { id: "detective", name: "Detektiv", roleId: "detective" },
          { id: "villager-1", name: "Dorfi 1", roleId: "villager" },
          { id: "villager-2", name: "Dorfi 2", roleId: "villager" },
        ],
        { winMode: "standard", revealMode: "role", roleReveal: false },
      );
      const state = {
        ...game,
        nightStepIndex: game.nightSteps.indexOf(stepId),
        players: game.players.map((player) =>
          player.roleId === (stepId === "nightGuest" ? "nightGuest" : "detective") ? { ...player, alive: false } : player,
        ),
      };
      const html = renderGame(state);

      expect(html).toContain("inactive-step-panel");
      expect(html).toContain("werewolf-action-icon");
      expect(html).toContain(inactiveTitle);
      expect(html).toContain(inactiveHint);
    }
  });

  it("renders weakened wolves once in the action area while the header keeps normal wolves context", () => {
    const game = createWerewolfGameFromAssignments(
      [
        { id: "wolf", name: "Wolf", roleId: "werewolf" },
        { id: "infected", name: "Verseuchter", roleId: "infected" },
        { id: "villager-1", name: "Dorfi 1", roleId: "villager" },
        { id: "villager-2", name: "Dorfi 2", roleId: "villager" },
        { id: "villager-3", name: "Dorfi 3", roleId: "villager" },
      ],
      { winMode: "standard", revealMode: "role", roleReveal: false },
    );
    const state = { ...game, nightStepIndex: game.nightSteps.indexOf("wolves"), wolvesSkipNextNight: true };
    const html = renderGame(state);
    const skipText = translate("de", "werewolf.wolvesSkipTonight");

    expect(html).toContain(translate("de", "werewolf.stepWolvesDescription"));
    expect(html.split(skipText).length - 1).toBe(1);
  });

  it("renders night result reveal as the primary bottom action", () => {
    const game = createWerewolfGameFromAssignments(
      [
        { id: "wolf", name: "Wolf", roleId: "werewolf" },
        { id: "seer", name: "Seher", roleId: "seer" },
        { id: "one", name: "Eins", roleId: "villager" },
        { id: "two", name: "Zwei", roleId: "villager" },
        { id: "three", name: "Drei", roleId: "villager" },
      ],
      { winMode: "standard", revealMode: "role", roleReveal: false },
    );
    const state = {
      ...game,
      nightStepIndex: game.nightSteps.indexOf("seer"),
      inspectedPlayerId: "one",
      seerResultRevealed: false,
    };
    const html = renderGame(state);

    expect(html).toContain("werewolf-flow-footer");
    expect(html).toContain(translate("de", "werewolf.showNightResult"));
    expect(html).not.toContain(`>${translate("de", "werewolf.nextStep")}</button>`);
  });

  it("renders revealed seer results in the footer instead of below the player grid", () => {
    const game = createNightResultGame();
    const state = {
      ...game,
      nightStepIndex: game.nightSteps.indexOf("seer"),
      inspectedPlayerId: "villager",
      seerResultRevealed: true,
    };
    const html = renderGame(state);
    const resultText = translate("de", "werewolf.inspectResult", {
      name: "Dorfi",
      role: translate("de", "roles.villager.name"),
    });
    const bodyHtml = html.slice(html.indexOf('class="werewolf-flow-body"'), html.indexOf('class="werewolf-flow-footer"'));
    const footerHtml = renderFooterHtml(html);

    expect(bodyHtml).not.toContain(resultText);
    expect(footerHtml).toContain(resultText);
    expect(footerHtml).toContain('class="night-result-card good"');
    expect(footerHtml).toContain("night-result-icon");
    expect(footerHtml).toContain('role="status"');
    expect(footerHtml).toContain('aria-live="polite"');
  });

  it("colors revealed night results by their outcome", () => {
    const game = createNightResultGame();
    const cases: Array<{ state: WerewolfState; tone: "good" | "evil"; text: string; icon: string }> = [
      {
        state: {
          ...game,
          nightStepIndex: game.nightSteps.indexOf("seer"),
          inspectedPlayerId: "wolf",
          seerResultRevealed: true,
        },
        tone: "evil",
        text: translate("de", "werewolf.inspectResult", {
          name: "Wolf",
          role: translate("de", "roles.werewolf.name"),
        }),
        icon: "lucide-eye",
      },
      {
        state: {
          ...game,
          nightStepIndex: game.nightSteps.indexOf("auraSeer"),
          auraTargetId: "wolf",
          auraResultRevealed: true,
        },
        tone: "evil",
        text: translate("de", "werewolf.auraResult", {
          name: "Wolf",
          team: translate("de", "werewolf.teamEvil"),
        }),
        icon: "lucide-sparkles",
      },
      {
        state: {
          ...game,
          nightStepIndex: game.nightSteps.indexOf("detective"),
          detectiveTargetIds: ["seer", "villager"],
          detectiveResultRevealed: true,
        },
        tone: "good",
        text: translate("de", "werewolf.detectiveSameTeam", {
          first: "Seher",
          second: "Dorfi",
        }),
        icon: "lucide-search",
      },
      {
        state: {
          ...game,
          nightStepIndex: game.nightSteps.indexOf("detective"),
          detectiveTargetIds: ["wolf", "villager"],
          detectiveResultRevealed: true,
        },
        tone: "evil",
        text: translate("de", "werewolf.detectiveDifferentTeam", {
          first: "Wolf",
          second: "Dorfi",
        }),
        icon: "lucide-search",
      },
    ];

    for (const item of cases) {
      const footerHtml = renderFooterHtml(renderGame(item.state));

      expect(footerHtml).toContain(`class="night-result-card ${item.tone}"`);
      expect(footerHtml).toContain(item.text);
      expect(footerHtml).toContain(item.icon);
    }
  });

  it("renders witch actions as flat icon action blocks without nested potion cards", () => {
    const game = createWerewolfGameFromAssignments(
      [
        { id: "wolf", name: "Wolf", roleId: "werewolf" },
        { id: "witch", name: "Hexe", roleId: "witch" },
        { id: "one", name: "Eins", roleId: "villager" },
        { id: "two", name: "Zwei", roleId: "villager" },
        { id: "three", name: "Drei", roleId: "villager" },
      ],
      { winMode: "standard", revealMode: "role", roleReveal: false },
    );
    const state = {
      ...game,
      nightStepIndex: game.nightSteps.indexOf("witch"),
      wolfTargetId: "one",
    };
    const html = renderGame(state);

    expect(html).toContain("witch-heal-action");
    expect(html).toContain("witch-poison-action");
    expect(html).toContain("werewolf-action-icon");
    expect(html).not.toContain("witch-potion-card");
  });

  it("renders the doctor heal action as a single flat icon action block", () => {
    const game = createWerewolfGameFromAssignments(
      [
        { id: "wolf", name: "Wolf", roleId: "werewolf" },
        { id: "doctor", name: "Doktor", roleId: "doctor" },
        { id: "one", name: "Eins", roleId: "villager" },
        { id: "two", name: "Zwei", roleId: "villager" },
        { id: "three", name: "Drei", roleId: "villager" },
      ],
      { winMode: "standard", revealMode: "role", roleReveal: false },
    );
    const state = {
      ...game,
      nightStepIndex: game.nightSteps.indexOf("doctor"),
      wolfTargetId: "one",
    };
    const html = renderGame(state);

    expect(html).toContain("doctor-heal-action");
    expect(html).toContain("werewolf-action-icon");
    expect(html).toContain(translate("de", "werewolf.doctorTreatment"));
    expect(countOccurrences(html, translate("de", "werewolf.doctorTreatment"))).toBe(1);
    expect(html).toContain(translate("de", "werewolf.doctorTarget"));
    expect(html).toContain(translate("de", "werewolf.stepDoctorDescription"));
    expect(html).not.toContain("bevor die Hexe handelt");
    expect(html).not.toContain("witch-poison-action");
    expect(html).not.toContain("witch-potion-card");
  });

  it("renders the night report as icon event rows with role and team badges", () => {
    const game = createWerewolfGameFromAssignments(
      [
        { id: "wolf", name: "Wolf", roleId: "werewolf" },
        { id: "hunter", name: "Jäger", roleId: "hunter" },
        { id: "villager", name: "Dorfi", roleId: "villager" },
        { id: "one", name: "Eins", roleId: "villager" },
        { id: "two", name: "Zwei", roleId: "villager" },
      ],
      { winMode: "standard", revealMode: "role", roleReveal: false },
    );
    const state = {
      ...game,
      nightResolved: true,
      lastNightDeaths: ["hunter"],
      players: game.players.map((player) => (player.id === "hunter" ? { ...player, alive: false } : player)),
    };
    const html = renderGame(state);

    expect(html).toContain("night-report-list");
    expect(html).toContain("night-report-row good");
    expect(html).toContain("night-report-role-icon");
    expect(html).toContain("night-report-team-badge good");
    expect(html).toContain(translate("de", "roles.hunter.name"));
    expect(html).not.toContain("night-report-panel");
  });

  it("shows the night report before the hunter shot gate", () => {
    const game = createWerewolfGameFromAssignments(
      [
        { id: "wolf", name: "Wolf", roleId: "werewolf" },
        { id: "hunter", name: "Jäger", roleId: "hunter" },
        { id: "villager", name: "Dorfi", roleId: "villager" },
        { id: "one", name: "Eins", roleId: "villager" },
        { id: "two", name: "Zwei", roleId: "villager" },
      ],
      { winMode: "standard", revealMode: "role", roleReveal: false },
    );
    const state = {
      ...game,
      phase: "night" as const,
      nightResolved: true,
      lastNightDeaths: ["hunter"],
      pendingHunterId: "hunter",
      pendingHunterSource: "night" as const,
      publicEvents: [
        { type: "nightDeaths" as const, playerIds: ["hunter"], source: "night" as const },
        { type: "hunterPending" as const, playerId: "hunter", source: "night" as const },
      ],
      publicEventIndex: 0,
      players: game.players.map((player) => (player.id === "hunter" ? { ...player, alive: false } : player)),
    };
    const reportHtml = renderGame(state);
    const hunterHtml = renderGame({ ...state, publicEventIndex: 1 });

    expect(reportHtml).toContain(translate("de", "werewolf.nightSummary"));
    expect(reportHtml).toContain(translate("de", "werewolf.hunterLastShot"));
    expect(reportHtml).not.toContain(translate("de", "werewolf.hunterSkip"));
    expect(hunterHtml).toContain(translate("de", "werewolf.hunterShotPrompt", { name: "Jäger" }));
    expect(hunterHtml).toContain(translate("de", "werewolf.hunterSkip"));
  });

  it("renders live Werewolf play inside the Werewolf mobile shell with compact header tools and a primary action area", () => {
    const game = createWerewolfGameFromAssignments(
      [
        { id: "wolf", name: "Wolf", roleId: "werewolf" },
        { id: "seer", name: "Seher", roleId: "seer" },
        { id: "one", name: "Eins", roleId: "villager" },
        { id: "two", name: "Zwei", roleId: "villager" },
        { id: "three", name: "Drei", roleId: "villager" },
      ],
      { winMode: "standard", revealMode: "role", roleReveal: false },
    );
    const state = { ...game, nightStepIndex: game.nightSteps.indexOf("wolves"), wolfTargetId: "one" };
    const html = renderShellGame(state);

    expect(html).toContain("app-frame werewolf-flow-shell");
    expect(html).toContain("werewolf-flow-header");
    expect(html).toContain("werewolf-flow-body");
    expect(html).toContain("werewolf-flow-footer");
    expect(html).toContain(`aria-label="${translate("de", "werewolf.gameLog")}"`);
    expect(html).toContain(`aria-label="${translate("de", "werewolf.playersOverview")}"`);
    expect(html).toContain(translate("de", "werewolf.nextStep"));
    expect(html).not.toContain("game-flow-status");
    expect(html).not.toContain("game-flow-tool-row");
    expect(html).not.toContain("<footer");
  });

  it("renders structured and legacy game log entries", () => {
    const game = createWerewolfGameFromAssignments(
      [
        { id: "wolf", name: "Wolf", roleId: "werewolf" },
        { id: "malik", name: "Malik", roleId: "cupid" },
        { id: "dennis", name: "Dennis", roleId: "villager" },
        { id: "jasmin", name: "Jasmin", roleId: "seer" },
        { id: "spare", name: "Spare", roleId: "villager" },
      ],
      { winMode: "standard", revealMode: "role", roleReveal: false },
    );
    const state: WerewolfState = {
      ...game,
      log: [
        {
          id: "structured",
          type: "roleAction" as const,
          privacy: "sensitive" as const,
          phase: "night" as const,
          round: 1,
          stepId: "cupid" as const,
          actorRoleId: "cupid" as const,
          actorIds: ["malik"],
          targetIds: ["dennis", "jasmin"],
          targetRoleIds: ["villager", "seer"],
          result: "selectedLovers" as const,
          publicSummary: { type: "roleAction" as const, actorRoleId: "cupid" as const, targetCount: 2, result: "selectedLovers" as const },
        },
        { id: "legacy", type: "nightDeath" as const, playerName: "Altspieler" },
      ],
    };

    const html = renderWithI18n(<GameLog state={state} entries={state.log} />);

    expect(html).toContain(translate("de", "log.sectionNight", { round: 1 }));
    expect(html).toContain(translate("de", "roles.cupid.name"));
    expect(html).toContain(translate("de", "log.titleSelectedLovers"));
    expect(html).toContain("Malik");
    expect(html).toContain("Dennis");
    expect(html).toContain("Jasmin");
    expect(html).toContain(translate("de", "roles.villager.name"));
    expect(html).toContain(translate("de", "roles.seer.name"));
    expect(html).toContain(translate("de", "log.sensitive"));
    expect(html).not.toContain("Amor (Malik)");
    expect(html).not.toContain("Dennis (Dorfbewohner)");
    expect(html).toContain(translate("de", "log.nightDeath", { name: "Altspieler" }));
  });

  it("groups game log entries into sections and combines witch actions in one step group", () => {
    const game = createWerewolfGameFromAssignments(
      [
        { id: "wolf", name: "Wolf", roleId: "werewolf" },
        { id: "witch", name: "Sofia", roleId: "witch" },
        { id: "dennis", name: "Dennis", roleId: "villager" },
        { id: "malik", name: "Malik", roleId: "hunter" },
        { id: "spare", name: "Spare", roleId: "villager" },
      ],
      { winMode: "standard", revealMode: "role", roleReveal: false },
    );
    const state: WerewolfState = {
      ...game,
      log: [
        { id: "start", type: "gameStarted" as const, privacy: "public" as const, phase: "setup" as const },
        { id: "seen", type: "roleRevealDone" as const, privacy: "public" as const, phase: "setup" as const },
        {
          id: "heal",
          type: "roleAction" as const,
          privacy: "sensitive" as const,
          phase: "night" as const,
          round: 1,
          stepId: "witch" as const,
          actorRoleId: "witch" as const,
          actorIds: ["witch"],
          targetIds: ["dennis"],
          targetRoleIds: ["villager"],
          result: "witchHealed" as const,
        },
        {
          id: "poison",
          type: "roleAction" as const,
          privacy: "sensitive" as const,
          phase: "night" as const,
          round: 1,
          stepId: "witch" as const,
          actorRoleId: "witch" as const,
          actorIds: ["witch"],
          targetIds: ["malik"],
          targetRoleIds: ["hunter"],
          result: "witchPoisoned" as const,
        },
        { id: "no-vote", type: "noDayElimination" as const, privacy: "public" as const, phase: "day" as const, round: 1 },
      ],
    };

    const html = renderWithI18n(<GameLog state={state} entries={state.log} />);

    expect(html).toContain(translate("de", "log.sectionSetup"));
    expect(html).toContain(translate("de", "log.sectionNight", { round: 1 }));
    expect(html).toContain(translate("de", "log.sectionDay", { round: 1 }));
    expect(countOccurrences(stepHeadingText(html), translate("de", "roles.witch.name"))).toBe(1);
    expect(html).toContain(translate("de", "log.titleWitchHealed"));
    expect(html).toContain(translate("de", "log.titleWitchPoisoned"));
    expect(html).toContain("Sofia");
    expect(html).toContain("Dennis");
    expect(html).toContain("Malik");
    expect(html).not.toContain("Sofia (Hexe)");
    expect(html).not.toContain("Dennis (Dorfbewohner)");
  });

  it("renders legacy hunter log entries with a fallback actor", () => {
    const game = createWerewolfGameFromAssignments(
      [
        { id: "wolf", name: "Wolf", roleId: "werewolf" },
        { id: "hunter", name: "Jäger", roleId: "hunter" },
        { id: "dennis", name: "Dennis", roleId: "villager" },
        { id: "one", name: "Eins", roleId: "villager" },
        { id: "two", name: "Zwei", roleId: "villager" },
      ],
      { winMode: "standard", revealMode: "role", roleReveal: false },
    );
    const state: WerewolfState = {
      ...game,
      log: [
        { id: "legacy-shot", type: "hunterShot" as const, privacy: "sensitive" as const, playerName: "Jäger" },
        { id: "legacy-skip", type: "hunterSkipped" as const, privacy: "public" as const, playerName: "Jäger" },
      ],
    };

    const html = renderWithI18n(<GameLog state={state} entries={state.log} />);

    expect(html).toContain(translate("de", "log.hunterShot", { actor: "Jäger", name: "Jäger" }));
    expect(html).toContain(translate("de", "log.hunterSkipped", { actor: "Jäger" }));
  });

  it("renders the shared actor role on every multi-actor log chip", () => {
    const game = createWerewolfGameFromAssignments(
      [
        { id: "wolf", name: "Wolf", roleId: "werewolf" },
        { id: "alpha", name: "Alpha", roleId: "alphaWolf" },
        { id: "dennis", name: "Dennis", roleId: "villager" },
        { id: "one", name: "Eins", roleId: "villager" },
        { id: "two", name: "Zwei", roleId: "villager" },
      ],
      { winMode: "standard", revealMode: "role", roleReveal: false },
    );
    const state: WerewolfState = {
      ...game,
      log: [
        {
          id: "wolf-attack",
          type: "roleAction" as const,
          privacy: "sensitive" as const,
          phase: "night" as const,
          round: 1,
          stepId: "wolves" as const,
          actorRoleId: "werewolf" as const,
          actorIds: ["wolf", "alpha"],
          targetIds: ["dennis"],
          targetRoleIds: ["villager"],
          result: "attacked" as const,
        },
      ],
    };

    const html = renderWithI18n(<GameLog state={state} entries={state.log} />);

    expect(html).toContain("Wolf");
    expect(html).toContain("Alpha");
    expect(countOccurrences(html, translate("de", "roles.werewolf.name"))).toBe(2);
    expect(html).not.toContain(translate("de", "roles.alphaWolf.name"));
  });

  it("groups tough guy wounds with dawn outcomes", () => {
    const game = createWerewolfGameFromAssignments(
      [
        { id: "wolf", name: "Wolf", roleId: "werewolf" },
        { id: "tough", name: "Hart", roleId: "toughGuy" },
        { id: "one", name: "Eins", roleId: "villager" },
        { id: "two", name: "Zwei", roleId: "villager" },
        { id: "three", name: "Drei", roleId: "villager" },
      ],
      { winMode: "standard", revealMode: "role", roleReveal: false },
    );
    const state: WerewolfState = {
      ...game,
      log: [
        {
          id: "wound",
          type: "toughGuyWounded" as const,
          privacy: "sensitive" as const,
          phase: "night" as const,
          round: 1,
          targetIds: ["tough"],
          targetRoleIds: ["toughGuy"],
        },
      ],
    };

    const html = renderWithI18n(<GameLog state={state} entries={state.log} />);

    expect(stepHeadingText(html)).toContain(translate("de", "log.groupDawn"));
    expect(html).toContain(translate("de", "log.titleToughGuyWounded"));
  });

  it("renders winner log icons by winning side", () => {
    const game = createWerewolfGameFromAssignments(
      [
        { id: "wolf", name: "Wolf", roleId: "werewolf" },
        { id: "one", name: "Eins", roleId: "villager" },
        { id: "two", name: "Zwei", roleId: "villager" },
        { id: "three", name: "Drei", roleId: "villager" },
        { id: "four", name: "Vier", roleId: "villager" },
      ],
      { winMode: "standard", revealMode: "role", roleReveal: false },
    );
    const werewolvesHtml = renderWithI18n(<GameLog state={game} entries={[{ id: "wolves", type: "werewolvesWin" as const, phase: "ended" as const }]} />);
    const villagersHtml = renderWithI18n(<GameLog state={game} entries={[{ id: "village", type: "villagersWin" as const, phase: "ended" as const }]} />);

    expect(werewolvesHtml).toContain("lucide-skull");
    expect(werewolvesHtml).not.toContain("lucide-shield");
    expect(villagersHtml).toContain("lucide-shield");
    expect(villagersHtml).not.toContain("lucide-skull");
  });

  it("renders undo as a compact footer action without replacing header navigation", () => {
    const game = createWerewolfGameFromAssignments(
      [
        { id: "wolf", name: "Wolf", roleId: "werewolf" },
        { id: "seer", name: "Seher", roleId: "seer" },
        { id: "one", name: "Eins", roleId: "villager" },
        { id: "two", name: "Zwei", roleId: "villager" },
        { id: "three", name: "Drei", roleId: "villager" },
      ],
      { winMode: "standard", revealMode: "role", roleReveal: false },
    );
    const unavailableHtml = renderWithI18n(<WerewolfPlaySurface state={game} actions={actions} onBack={() => undefined} />);
    const availableHtml = renderWithI18n(<WerewolfPlaySurface state={game} actions={actions} canUndo onBack={() => undefined} />);
    const html = availableHtml;
    const headerHtml = html.slice(html.indexOf('class="werewolf-flow-header"'), html.indexOf('class="werewolf-flow-body"'));
    const footerHtml = renderFooterHtml(html);
    const unavailableFooterHtml = renderFooterHtml(unavailableHtml);

    expect(headerHtml).toContain(translate("de", "common.back"));
    expect(headerHtml).not.toContain(translate("de", "werewolf.undoStep"));
    expect(footerHtml).toContain(translate("de", "werewolf.nextStep"));
    expect(footerHtml).toContain("werewolf-flow-footer-action-row");
    expect(footerHtml).toContain(translate("de", "werewolf.undoStep"));
    expect(footerHtml).toContain("werewolf-undo-action");
    expect(footerHtml).toContain("secondary-button compact werewolf-undo-action");
    expect(buttonHtmlForClass(footerHtml, "werewolf-undo-action")).toContain(`aria-label="${translate("de", "werewolf.undoStep")}"`);
    expect(buttonHtmlForClass(footerHtml, "werewolf-undo-action")).not.toContain(translate("de", "common.back"));
    expect(buttonHtmlForClass(footerHtml, "werewolf-undo-action")).not.toContain("disabled");
    expect(unavailableFooterHtml).toContain(translate("de", "werewolf.undoStep"));
    expect(unavailableFooterHtml).toContain("werewolf-undo-action");
    expect(buttonHtmlForClass(unavailableFooterHtml, "werewolf-undo-action")).toContain("disabled");
  });

  it("renders player overview rows as compact icon rows with clickable role chips", () => {
    const game = createWerewolfGameFromAssignments(
      [
        { id: "wolf", name: "Wolf", roleId: "werewolf" },
        { id: "seer", name: "Seher", roleId: "seer" },
        { id: "one", name: "Eins", roleId: "villager" },
        { id: "two", name: "Zwei", roleId: "villager" },
        { id: "three", name: "Drei", roleId: "villager" },
      ],
      { winMode: "standard", revealMode: "role", roleReveal: false },
    );
    const html = renderWithI18n(
      <PlayerOverviewSheet
        state={{
          ...game,
          phase: "roleReveal",
          players: game.players.map((player) => (player.id === "seer" ? { ...player, seenRole: false } : player)),
        }}
        roomPlayers={[
          { id: "wolf", name: "Wolf", connected: true, seenRole: true },
          { id: "seer", name: "Seher", connected: false, seenRole: false },
        ]}
        onRoleInfo={() => undefined}
        onClose={() => undefined}
      />,
    );

    expect(html).toContain("gm-player-overview-role-icon");
    expect(html).toContain("gm-player-overview-statuses");
    expect(html).toContain("gm-player-status-chip ok");
    expect(html).toContain("gm-player-status-chip muted");
    expect(html).toContain("werewolf-status-icon");
    expect(html).toContain(`class="gm-role-button evil"`);
    expect(html).toContain(`class="gm-role-button good"`);
    expect(html).toContain(`title="${translate("de", "roles.werewolf.name")}"`);
    expect(html).toContain(translate("de", "common.connected"));
    expect(html).toContain(translate("de", "common.disconnected"));
    expect(html).toContain(translate("de", "common.ready"));
    expect(html).toContain(translate("de", "common.waiting"));
  });

  it("hides role-reveal readiness chips after role reveal is over", () => {
    const game = createWerewolfGameFromAssignments(
      [
        { id: "wolf", name: "Wolf", roleId: "werewolf" },
        { id: "seer", name: "Seher", roleId: "seer" },
        { id: "one", name: "Eins", roleId: "villager" },
        { id: "two", name: "Zwei", roleId: "villager" },
        { id: "three", name: "Drei", roleId: "villager" },
      ],
      { winMode: "standard", revealMode: "role", roleReveal: false },
    );
    const html = renderWithI18n(
      <PlayerOverviewSheet state={game} roomPlayers={[]} onRoleInfo={() => undefined} onClose={() => undefined} />,
    );

    expect(html).toContain(translate("de", "common.alive"));
    expect(html).not.toContain(translate("de", "common.ready"));
    expect(html).not.toContain(translate("de", "common.waiting"));
  });

  it("marks no-vote and hunter-skip actions as confirmation dialog triggers", () => {
    const dayGame = createWerewolfGameFromAssignments(
      [
        { id: "wolf", name: "Wolf", roleId: "werewolf" },
        { id: "hunter", name: "Jäger", roleId: "hunter" },
        { id: "one", name: "Eins", roleId: "villager" },
        { id: "two", name: "Zwei", roleId: "villager" },
        { id: "three", name: "Drei", roleId: "villager" },
      ],
      { winMode: "standard", revealMode: "role", roleReveal: false },
    );
    const dayHtml = renderGame({ ...dayGame, phase: "day" });
    const hunterHtml = renderGame({
      ...dayGame,
      phase: "day",
      pendingHunterId: "hunter",
      pendingHunterSource: "day",
    });

    expect(dayHtml).toContain(translate("de", "werewolf.startNightWithoutVote"));
    expect(dayHtml).toContain('aria-haspopup="dialog"');
    expect(dayHtml).not.toContain(translate("de", "werewolf.confirmNoVoteNightTitle"));
    expect(dayHtml).not.toContain(translate("de", "werewolf.confirmEliminationDescription"));
    expect(hunterHtml).toContain(translate("de", "werewolf.hunterSkip"));
    expect(hunterHtml).toContain('aria-haspopup="dialog"');
    expect(hunterHtml).not.toContain(translate("de", "werewolf.confirmHunterSkipTitle"));
  });

  it("renders host day timer controls above the day vote", () => {
    const dayGame = createWerewolfGameFromAssignments(
      [
        { id: "wolf", name: "Wolf", roleId: "werewolf" },
        { id: "one", name: "Eins", roleId: "villager" },
        { id: "two", name: "Zwei", roleId: "villager" },
        { id: "three", name: "Drei", roleId: "villager" },
        { id: "four", name: "Vier", roleId: "villager" },
      ],
      { winMode: "standard", revealMode: "role", roleReveal: false },
    );
    const html = renderGame(
      {
        ...dayGame,
        phase: "day",
        dayTimer: { durationSeconds: 120, status: "running", startedAt: 1_000, pausedRemainingSeconds: 120 },
      },
      61_000,
    );

    expect(html).toContain('class="day-timer-panel running');
    expect(html).toContain(translate("de", "werewolf.dayTimer"));
    expect(html).toContain("1:00");
    expect(html).toContain(translate("de", "werewolf.dayTimerPause"));
    expect(html).not.toContain(translate("de", "werewolf.dayTimerStart"));
    expect(html).toContain(translate("de", "werewolf.dayTimerMinutes", { minutes: 10 }));
    expect(html.indexOf(translate("de", "werewolf.dayTimer"))).toBeLessThan(html.indexOf(translate("de", "werewolf.voteTitle")));

    const idleHtml = renderGame({ ...dayGame, phase: "day" });
    expect(idleHtml).toContain(translate("de", "werewolf.dayTimerStart"));
    expect(idleHtml).not.toContain(translate("de", "werewolf.dayTimerPause"));
  });

  it("renders shared game confirmations as modal sheets", () => {
    const html = renderToStaticMarkup(
      <GameConfirmDialog
        title={translate("de", "werewolf.confirmNoVoteNightTitle")}
        description={translate("de", "werewolf.confirmNoVoteNightDescription")}
        cancelLabel={translate("de", "common.cancel")}
        confirmLabel={translate("de", "werewolf.startNightWithoutVote")}
        onCancel={() => undefined}
        onConfirm={() => undefined}
      />,
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain("game-confirm-sheet");
    expect(html).toContain(translate("de", "werewolf.confirmNoVoteNightTitle"));
  });

  it("renders Pass-and-Play player lobby before role setup and assignment", () => {
    const html = renderWithStorage(<LocalWerewolfApp navigate={() => undefined} />);

    expect(html).toContain(translate("de", "werewolf.playerLobbyTitle"));
    expect(html).toContain(translate("de", "werewolf.playerList"));
    expect(html).not.toContain(translate("de", "werewolf.roleSetup"));
    expect(html).toContain("1 / 3");
    expect(html).toContain(translate("de", "werewolf.minPlayers"));
    expect(html).not.toContain(translate("de", "werewolf.addSamplePlayers"));
    expect(html).not.toContain(translate("de", "werewolf.nextRoles"));
  });

  it("restores old local doctor games without doctor state fields", () => {
    const game = createWerewolfGameFromAssignments(
      [
        { id: "wolf", name: "Wolf", roleId: "werewolf" },
        { id: "doctor", name: "Doktor", roleId: "doctor" },
        { id: "one", name: "Eins", roleId: "villager" },
        { id: "two", name: "Zwei", roleId: "villager" },
        { id: "three", name: "Drei", roleId: "villager" },
      ],
      { winMode: "standard", revealMode: "role", roleReveal: false },
    );
    const savedGame: Partial<WerewolfState> = {
      ...game,
      nightStepIndex: game.nightSteps.indexOf("doctor"),
      wolfTargetId: "one",
    };
    delete savedGame.doctorHealUsed;
    delete savedGame.doctorHealTonight;

    const html = renderWithStorage(<LocalWerewolfApp navigate={() => undefined} />, JSON.stringify(savedGame));

    expect(html).toContain("doctor-heal-action");
    expect(html).toContain(translate("de", "werewolf.doctorTreatment"));
    expect(html).toContain(translate("de", "werewolf.healAction"));
  });

  it("renders only the selected general game rules", () => {
    const html = renderWithI18n(
      <RoleRulesModal
        options={{ winMode: "extended", revealMode: "hidden", roleReveal: true }}
        onClose={() => undefined}
      />,
    );

    expect(html).toContain(translate("de", "werewolf.winExtendedHint"));
    expect(html).not.toContain(translate("de", "werewolf.winStandardHint"));
    expect(html).toContain(translate("de", "werewolf.revealHiddenHint"));
    expect(html).not.toContain(translate("de", "werewolf.revealTeamHint"));
    expect(html).not.toContain(translate("de", "werewolf.revealRoleHint"));
  });

  it("keeps the role reveal footer compact before the card is revealed", () => {
    const html = renderWithI18n(
      <RoleRevealScreen
        players={[{ id: "one", name: "Alex", roleId: "seer" }]}
        showRoleInfo
        onDone={() => undefined}
      />,
    );
    const footerHtml = html.slice(html.indexOf("role-reveal-inline-actions"));

    expect(footerHtml).toContain("primary-action compact");
    expect(footerHtml).not.toContain("reveal-info-icon-button");
    expect(footerHtml).not.toContain(translate("de", "werewolf.continueAfterReveal"));
    expect(html).not.toContain("reveal-info-icon-button");
    expect(html).not.toContain("role-reveal-body-actions");
    expect(html).not.toContain(translate("de", "werewolf.continueAfterReveal"));
    expect(html).not.toContain("reveal-footer");
  });

  it("renders Werewolf role reveal with icon fallbacks until real assets are provided", () => {
    const html = renderWithI18n(
      <RoleRevealScreen
        players={[{ id: "one", name: "Alex", roleId: "werewolf" }]}
        onDone={() => undefined}
      />,
    );

    expect(html).toContain("cover-card-mark");
    expect(html).not.toContain("role-layer-icon");
    expect(html).not.toContain("cover-card-image");
    expect(html).not.toContain("/games/werewolf/");
    expect(html).not.toContain("<footer");
  });

  it("keeps the Hub frame and current game preview on hub visuals", () => {
    const html = renderWithI18n(<HubScreen navigate={() => undefined} />);

    expect(html).toContain("--app-bg:rgba(255, 255, 255, 0.96)");
    expect(html).toContain("hub-screen-body");
    expect(html).toContain("hub-action-footer");
    expect(html).toContain("hub-action-footer-actions");
    expect(html).toContain("game-icon game-icon-werewolf game-icon-large");
    expect(html).toContain("werewolf-mark.png");
    expect(html).toContain(translate("de", "hub.joinRoomByCode"));
    expect(html).not.toContain(`class="segmented-tabs" aria-label="${translate("de", "common.session")}"`);
    expect(buttonHtmlForClass(html, "hub-join-room-action")).not.toContain("disabled");
    expect(html).not.toContain("sticky-action");
    expect(html).not.toContain('class="current-game-logo"');
  });

  it("keeps the Hub join room action available in pass-and-play mode", () => {
    const html = renderWithI18n(<HubScreen initialMode="pass-and-play" navigate={() => undefined} />);
    const joinActionHtml = buttonHtmlForClass(html, "hub-join-room-action");

    expect(html).toContain(translate("de", "hub.passAndPlay"));
    expect(joinActionHtml).toContain(translate("de", "hub.joinRoomByCode"));
    expect(joinActionHtml).not.toContain("disabled");
    expect(html).toContain(translate("de", "hub.startGame", { game: translate("de", "games.werewolf") }));
  });

  it("renders the Hub session tab empty state", () => {
    const html = renderWithI18n(<HubScreen initialTab="session" navigate={() => undefined} />);

    expect(html).toContain(translate("de", "hub.sessionTitle"));
    expect(html).toContain(translate("de", "hub.sessionEmptyTitle"));
    expect(html).toContain(translate("de", "hub.sessionRefresh"));
    expect(html).not.toContain("hub-action-footer");
    expect(html).not.toContain(translate("de", "hub.startGame", { game: translate("de", "games.werewolf") }));
  });

  it("renders active Hub session room cards", () => {
    const html = renderWithI18n(
      <HubSessionPanel
        cards={[
          {
            roomCode: "ABCD",
            role: "host",
            gameId: "werewolf",
            phase: "playing",
            playerCount: 5,
            createdAt: Date.now(),
            lastActivityAt: Date.now(),
            expiresAt: Date.now() + 3 * 60 * 60 * 1000,
          },
          {
            roomCode: "WXYZ",
            role: "player",
            gameId: "werewolf",
            phase: "lobby",
            playerCount: 2,
            playerName: "Alex",
            createdAt: Date.now(),
            lastActivityAt: Date.now() - 1_000,
            expiresAt: Date.now() + 2 * 60 * 60 * 1000,
          },
          {
            roomCode: "SETU",
            role: "host",
            gameId: "werewolf",
            phase: "setup",
            playerCount: 5,
            createdAt: Date.now(),
            lastActivityAt: Date.now() - 2_000,
            expiresAt: Date.now() + 2 * 60 * 60 * 1000,
          },
        ]}
        error={null}
        loading={false}
        navigate={() => undefined}
        onRefresh={() => undefined}
      />,
    );

    expect(html).toContain("session-room-card");
    expect(html).toContain("ABCD");
    expect(html).toContain("WXYZ");
    expect(html).toContain("SETU");
    expect(html).toContain(translate("de", "hub.sessionRoleHost"));
    expect(html).toContain(translate("de", "hub.sessionRolePlayer"));
    expect(html).toContain(translate("de", "hub.sessionPhasePlaying"));
    expect(html).toContain(translate("de", "hub.sessionPhaseLobby"));
    expect(html).toContain(translate("de", "hub.sessionPhaseSetup"));
    expect(html).toContain(translate("de", "hub.sessionPlayerName", { name: "Alex" }));
  });

  it("renders admin room overview counts, breakdowns, and detailed rows", () => {
    const summary = createAdminSummary();
    const html = renderAdminDashboard(summary);

    expect(html).toContain(translate("de", "admin.totalRooms"));
    expect(html).toContain(translate("de", "admin.activeRooms"));
    expect(html).toContain(translate("de", "admin.runningRooms"));
    expect(html).toContain(translate("de", "admin.waitingRooms"));
    expect(html).toContain(translate("de", "admin.inactiveRooms"));
    expect(html).toContain(translate("de", "admin.gamesBreakdown"));
    expect(html).toContain(translate("de", "admin.phasesBreakdown"));
    expect(html).toContain("ABCD");
    expect(html).toContain("WXYZ");
    expect(html).toContain(translate("de", "admin.connectedPlayers", { connected: 3, total: 5 }));
    expect(html).toContain(translate("de", "admin.hostOffline"));
    expect(html).toContain(translate("de", "admin.reasonStaleActivity"));
    expect(html).toContain(translate("de", "admin.statusRunning"));
    expect(html).toContain(translate("de", "admin.statusWaiting"));
    expect(html).toContain(translate("de", "admin.statusInactive"));
    expect(html).not.toContain("Alex");
  });

  it("filters admin rooms by separate activity and progress status", () => {
    const summary = createAdminSummary();
    const runningHtml = renderAdminDashboard(summary, "all", "running");
    const activeRunningHtml = renderAdminDashboard(summary, "active", "running");
    const inactiveRunningHtml = renderAdminDashboard(summary, "inactive", "running");
    const activeWaitingHtml = renderAdminDashboard(summary, "active", "waiting");

    expect(runningHtml).not.toContain("ABCD");
    expect(runningHtml).toContain("WXYZ");
    expect(runningHtml).not.toContain("LOBB");
    expect(activeRunningHtml).not.toContain("ABCD");
    expect(activeRunningHtml).not.toContain("WXYZ");
    expect(activeRunningHtml).not.toContain("LOBB");
    expect(inactiveRunningHtml).toContain("WXYZ");
    expect(inactiveRunningHtml).not.toContain("ABCD");
    expect(inactiveRunningHtml).not.toContain("LOBB");
    expect(activeWaitingHtml).toContain("ABCD");
    expect(activeWaitingHtml).toContain("LOBB");
    expect(activeWaitingHtml).not.toContain("WXYZ");
  });

  it("renders admin token, error, and empty states", () => {
    const screenHtml = renderWithI18n(<AdminScreen />);
    const tokenHtml = renderWithI18n(
      <AdminStatePanel icon={null} title={translate("de", "admin.tokenRequiredTitle")} description={translate("de", "admin.tokenRequiredDescription")}>
        <AdminTokenForm value="" onChange={() => undefined} onSubmit={() => undefined} />
      </AdminStatePanel>,
    );
    const errorHtml = renderWithI18n(
      <AdminStatePanel icon={null} title={translate("de", "admin.unavailableTitle")} description={translate("de", "admin.unauthorizedDescription")}>
        <AdminTokenForm value="bad-token" onChange={() => undefined} onSubmit={() => undefined} />
      </AdminStatePanel>,
    );
    const emptyHtml = renderWithI18n(
      <AdminDashboardView
        summary={createEmptyAdminSummary()}
        activityFilter="all"
        progressFilter="all"
        onActivityFilterChange={() => undefined}
        onProgressFilterChange={() => undefined}
      />,
    );

    expect(screenHtml).toContain(`<p class="section-label">${translate("de", "admin.sectionLabel")}</p>`);
    expect(tokenHtml).toContain(translate("de", "admin.tokenRequiredTitle"));
    expect(tokenHtml).toContain(translate("de", "admin.tokenRequiredDescription"));
    expect(tokenHtml).toContain(translate("de", "admin.tokenFieldLabel"));
    expect(tokenHtml).toContain("type=\"password\"");
    expect(tokenHtml).toContain("disabled=\"\"");
    expect(errorHtml).toContain(translate("de", "admin.unavailableTitle"));
    expect(errorHtml).toContain(translate("de", "admin.unauthorizedDescription"));
    expect(errorHtml).toContain(translate("de", "admin.tokenSubmit"));
    expect(emptyHtml).toContain(translate("de", "admin.emptyDescription"));
    expect(emptyHtml).toContain("Werwolf<strong>0</strong>");
    expect(emptyHtml).toContain("Lobby<strong>0</strong>");
    expect(emptyHtml).toContain(`${translate("de", "hub.sessionPhaseSetup")}<strong>0</strong>`);
  });

  it("stores trimmed admin token submissions and rejects empty values", () => {
    const storage = createMemoryStorage();
    const onTokenAccepted = vi.fn();
    useSessionStorage(storage);

    expect(submitAdminTokenInput("  admin-test-token  ", onTokenAccepted)).toBe(true);
    expect(storage.getItem("tablegather.adminToken")).toBe("admin-test-token");
    expect(onTokenAccepted).toHaveBeenCalledWith("admin-test-token");

    expect(submitAdminTokenInput("   ", onTokenAccepted)).toBe(false);
    expect(onTokenAccepted).toHaveBeenCalledTimes(1);
  });

  it("renders the shared room join screen with code and name fields", () => {
    const html = renderWithI18n(<WerewolfRoomPlayerScreen navigate={() => undefined} />);

    expect(html).toContain("room-code-entry-screen");
    expect(html).toContain("werewolf-player-join-form");
    expect(html).toContain("werewolf-mark.png");
    expect(html).toContain(translate("de", "werewolf.enterRoomCodeTitle"));
    expect(html).toContain(translate("de", "werewolf.enterRoomCodeAndNamePrompt"));
    expect(html).toContain(translate("de", "common.name"));
  });

  it("renders invite-link joins through the same branded flat form", () => {
    const html = renderWithI18n(<WerewolfRoomPlayerScreen code="G5KQ" navigate={() => undefined} />);

    expect(html).toContain("player-join-screen");
    expect(html).toContain("room-code-entry-screen");
    expect(html).toContain("werewolf-brand-mark");
    expect(html).toContain("werewolf-mark.png");
    expect(html).toContain("player-join-form");
    expect(html).toContain('value="G5KQ"');
    expect(html).toContain(translate("de", "werewolf.roomChecking"));
    expect(html).not.toContain("add-player-form");
  });

  it("renders host stage language controls in the stage link panel", () => {
    const html = renderWithI18n(
      <StageLinkPanel
        stageLink="https://example.test/stage/ABCD/TOKEN"
        qr={null}
        stageLocale="de"
        onCreate={() => undefined}
        onDisable={() => undefined}
        onStageLocaleChange={() => undefined}
      />,
    );

    expect(html).toContain(translate("de", "werewolf.stageLanguage"));
    expect(html).toContain("DE");
    expect(html).toContain("EN");
    expect(html.indexOf(translate("de", "common.english"))).toBeLessThan(html.indexOf(translate("de", "common.german")));
    expect(html).toContain('aria-pressed="true"');
  });

  it("renders host stage controls in a dedicated settings dialog", () => {
    const html = renderWithI18n(
      <StageSettingsDialog
        stageLink="https://example.test/stage/ABCD/TOKEN"
        stageLocale="de"
        onClose={() => undefined}
        onCreateStageLink={() => undefined}
        onDisableStageLink={() => undefined}
        onStageLocaleChange={() => undefined}
      />,
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain(translate("de", "werewolf.stageMode"));
    expect(html).toContain('value="https://example.test/stage/ABCD/TOKEN"');
    expect(html).toContain('class="room-link-input stage-settings-link-input"');
    expect(html).toContain(translate("de", "werewolf.stageLanguage"));
    expect(html).toContain("DE");
    expect(html).toContain("EN");
    expect(html.indexOf(translate("de", "common.english"))).toBeLessThan(html.indexOf(translate("de", "common.german")));
    expect(html).toContain(translate("de", "common.copy"));
    expect(html).toContain(translate("de", "werewolf.rotateStageLink"));
    expect(html).toContain(translate("de", "werewolf.disableStageLink"));
  });

  it("renders the host stage settings dialog create state without an active link", () => {
    const html = renderWithI18n(
      <StageSettingsDialog
        stageLink=""
        stageLocale="de"
        onClose={() => undefined}
        onCreateStageLink={() => undefined}
        onDisableStageLink={() => undefined}
        onStageLocaleChange={() => undefined}
      />,
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain(translate("de", "werewolf.createStageLink"));
    expect(html).toContain('class="secondary-button full"');
    expect(html).not.toContain('class="primary-action compact"');
    expect(html).toContain(translate("de", "werewolf.stageLinkHint"));
    expect(html).not.toContain(translate("de", "werewolf.disableStageLink"));
    expect(html).not.toContain(translate("de", "werewolf.rotateStageLink"));
  });

  it("normalizes player names before duplicate checks", () => {
    expect(normalizePlayerName("  Alex   Stone ")).toBe("Alex Stone");
    expect(hasDuplicatePlayerName(["Alex Stone"], " alex   stone ")).toBe(true);
  });

  it("marks individual Pass-and-Play role reveal players as seen", () => {
    const game = createWerewolfGameFromAssignments(
      [
        { id: "wolf", name: "Wolf", roleId: "werewolf" },
        { id: "seer", name: "Seher", roleId: "seer" },
        { id: "one", name: "Eins", roleId: "villager" },
        { id: "two", name: "Zwei", roleId: "villager" },
        { id: "three", name: "Drei", roleId: "villager" },
      ],
      { winMode: "standard", revealMode: "role", roleReveal: true },
    );
    const updated = markRoleSeen(game, "wolf");

    expect(game.players.filter((player) => player.seenRole)).toHaveLength(0);
    expect(updated.players.filter((player) => player.seenRole)).toHaveLength(1);
    expect(updated.players.find((player) => player.id === "wolf")?.seenRole).toBe(true);
    expect(updated.phase).toBe("roleReveal");
  });
});

describe("werewolf stage", () => {
  it("renders lobby, night report, and vote reveal scenes without private controls", () => {
    const lobby = renderStage({ scene: "lobby", phase: "lobby", round: null, events: [] });
    expect(lobby).toContain(translate("de", "werewolf.stageMode"));
    expect(lobby).toContain(`<h1>${translate("de", "werewolf.stagePreparation")}</h1>`);
    expect(lobby).toContain(translate("de", "werewolf.stageLobbyHint"));
    expect(lobby).toContain("ABCD");
    expect(countOccurrences(lobby, translate("de", "werewolf.stageMode"))).toBe(1);
    expect(lobby).not.toContain(`<h1>${translate("de", "werewolf.stageMode")}</h1>`);

    const setup = renderStage({ scene: "setup", phase: "setup", round: null, events: [] });
    expect(setup).toContain(`<h1>${translate("de", "werewolf.stagePreparation")}</h1>`);
    expect(setup).toContain(translate("de", "werewolf.stageSetupHint"));
    expect(setup).toContain(`${translate("de", "werewolf.roomCode")}: ABCD`);
    expect(setup).not.toContain(translate("de", "werewolf.stageLobbyHint"));
    expect(setup).not.toContain(translate("de", "werewolf.joinRoom"));

    const assignment = renderStage({ scene: "assignment", phase: "assignment", round: null, events: [] });
    expect(assignment).toContain(translate("de", "werewolf.stageSetupHint"));
    expect(assignment).not.toContain(translate("de", "werewolf.stageLobbyHint"));
    expect(assignment).not.toContain(translate("de", "werewolf.joinRoom"));

    const roleReveal = renderStage({ scene: "roleReveal", phase: "roleReveal", round: null, events: [] });
    expect(roleReveal).toContain(`<h1>${translate("de", "werewolf.roleReveal")}</h1>`);
    expect(countOccurrences(roleReveal, translate("de", "werewolf.roleReveal"))).toBe(1);

    const nightReport = renderStage({
      scene: "nightReport",
      phase: "playing",
      round: 2,
      events: [{ type: "nightDeaths", source: "night", playerIds: ["alex", "sam"] }],
    });
    expect(nightReport).toContain(translate("de", "werewolf.stageDawn"));
    expect(nightReport).toContain(translate("de", "werewolf.stageEliminatedTonight"));
    expect(nightReport).toContain("werewolf-stage-player-tile nightDeaths");
    expect(nightReport).toContain("Alex");
    expect(nightReport).toContain("Sam");
    expect(nightReport).not.toContain(translate("de", "werewolf.nightDeaths", { names: "Alex, Sam" }));

    const voteReveal = renderStage({
      scene: "voteReveal",
      phase: "playing",
      round: 2,
      revealMode: "role",
      events: [{ type: "voteDeath", source: "day", playerId: "jordan", reveal: { mode: "role", team: "good", roleId: "villager" } }],
    });
    expect(voteReveal).toContain(translate("de", "werewolf.stageVoteExecutionTitle"));
    expect(voteReveal).not.toContain(translate("de", "werewolf.dayExecutionResult", { names: "Jordan" }));
    expect(countOccurrences(activeStageHtml(voteReveal), "Jordan")).toBe(1);
    expect(voteReveal).toContain(translate("de", "werewolf.stageRevealRole"));
    expect(voteReveal).toContain(translate("de", "roles.villager.name"));
    expect(voteReveal).toContain("werewolf-stage-reveal-badge good");
    expect(voteReveal).toContain("role-icon-chip werewolf-stage-reveal-role-icon");
    expect(voteReveal).toContain("DE");
    expect(voteReveal).toContain("EN");

    expect(`${lobby}${nightReport}${voteReveal}`).not.toContain("wolfTargetId");
    expect(`${lobby}${nightReport}${voteReveal}`).not.toContain(translate("de", "werewolf.eliminatePlayer"));
  });

  it("keeps night report and hunter prompt as separate stage moments", () => {
    const nightEvent = { type: "nightDeaths" as const, source: "night" as const, playerIds: ["sam"] };
    const hunterEvent = { type: "hunterPending" as const, source: "night" as const, playerId: "sam", reveal: { mode: "role" as const, team: "good" as const, roleId: "hunter" as const } };
    const report = renderStage({
      scene: "nightReport",
      phase: "playing",
      round: 1,
      activeEvent: nightEvent,
      events: [nightEvent, hunterEvent],
    });
    const hunter = renderStage({
      scene: "hunter",
      phase: "playing",
      round: 1,
      activeEvent: hunterEvent,
      pastEvents: [nightEvent],
      events: [nightEvent, hunterEvent],
    });

    expect(report).toContain(translate("de", "werewolf.stageEliminatedTonight"));
    expect(report).toContain("Sam");
    expect(report).not.toContain(translate("de", "werewolf.hunterShotPrompt", { name: "Sam" }));
    expect(hunter).toContain(`<h1>${translate("de", "werewolf.nightTitle", { round: 1 })}</h1>`);
    expect(hunter).toContain(translate("de", "werewolf.stageHunterPromptHeadline"));
    expect(hunter).toContain(translate("de", "werewolf.stageHunterPromptSubtitle"));
    expect(hunter).not.toContain(translate("de", "werewolf.stageHunterPromptTitle", { name: "Sam" }));
    expect(hunter).not.toContain(translate("de", "werewolf.hunterShotPrompt", { name: "Sam" }));
    expect(countOccurrences(activeStageHtml(hunter), "Sam")).toBe(1);
    expect(hunter).toContain("role-icon-chip werewolf-stage-reveal-role-icon");
    expect(hunter).toContain(translate("de", "roles.hunter.name"));
  });

  it("renders active stage reveal player names only once in the focus area", () => {
    const cases: Array<{ name: string; snapshot: Partial<WerewolfStageRoomSnapshot>; forbidden: string }> = [
      {
        name: "Jordan",
        snapshot: {
          scene: "voteReveal",
          phase: "playing",
          round: 1,
          activeEvent: { type: "voteDeath", source: "day", playerId: "jordan" },
          events: [{ type: "voteDeath", source: "day", playerId: "jordan" }],
        },
        forbidden: translate("de", "werewolf.dayExecutionResult", { names: "Jordan" }),
      },
      {
        name: "Alex",
        snapshot: {
          scene: "voteReveal",
          phase: "playing",
          round: 1,
          activeEvent: { type: "loverDeath", source: "day", playerId: "alex" },
          events: [{ type: "loverDeath", source: "day", playerId: "alex" }],
        },
        forbidden: translate("de", "werewolf.stageLoverDeathNamed", { name: "Alex" }),
      },
      {
        name: "Sam",
        snapshot: {
          scene: "hunter",
          phase: "playing",
          round: 1,
          activeEvent: { type: "hunterPending", source: "day", playerId: "sam", reveal: { mode: "role", team: "good", roleId: "hunter" } },
          events: [{ type: "hunterPending", source: "day", playerId: "sam", reveal: { mode: "role", team: "good", roleId: "hunter" } }],
        },
        forbidden: translate("de", "werewolf.stageHunterPromptTitle", { name: "Sam" }),
      },
      {
        name: "Jordan",
        snapshot: {
          scene: "voteReveal",
          phase: "playing",
          round: 1,
          activeEvent: { type: "hunterShot", source: "day", hunterId: "sam", playerId: "jordan" },
          events: [{ type: "hunterShot", source: "day", hunterId: "sam", playerId: "jordan" }],
        },
        forbidden: translate("de", "werewolf.stageHunterShotNamed", { name: "Jordan" }),
      },
    ];

    for (const item of cases) {
      const html = renderStage(item.snapshot);
      const focusHtml = activeStageHtml(html);

      expect(focusHtml).toContain(item.name);
      expect(countOccurrences(focusHtml, item.name)).toBe(1);
      expect(focusHtml).not.toContain(item.forbidden);
    }
  });

  it("uses team-specific stage reveal icons for team reveals", () => {
    const html = renderStage({
      scene: "voteReveal",
      phase: "playing",
      round: 2,
      revealMode: "team",
      events: [{ type: "voteDeath", source: "day", playerId: "jordan", reveal: { mode: "team", team: "evil" } }],
    });

    expect(html).toContain(translate("de", "werewolf.stageRevealTeam"));
    expect(html).toContain(translate("de", "werewolf.teamEvil"));
    expect(html).toContain("werewolf-stage-reveal-badge evil");
    expect(html).toContain("werewolf-action-icon werewolf-stage-reveal-team-icon");
    expect(html).not.toContain("role-icon-chip werewolf-stage-reveal-role-icon");
  });

  it("keeps hunter prompts out of the elimination rail", () => {
    const voteEvent = { type: "voteDeath" as const, source: "day" as const, playerId: "alex" };
    const hunterPrompt = {
      type: "hunterPending" as const,
      source: "day" as const,
      playerId: "sam",
      reveal: { mode: "role" as const, team: "good" as const, roleId: "hunter" as const },
    };
    const hunterShot = { type: "hunterShot" as const, source: "day" as const, hunterId: "sam", playerId: "jordan" };
    const html = renderStage({
      scene: "voteReveal",
      phase: "playing",
      round: 1,
      activeEvent: hunterShot,
      pastEvents: [voteEvent, hunterPrompt],
      events: [voteEvent, hunterPrompt, hunterShot],
    });

    expect(html).toContain(`<h1>${translate("de", "werewolf.dayTitle", { round: 1 })}</h1>`);
    expect(html).toContain(translate("de", "werewolf.voteTitle"));
    expect(html).toContain("werewolf-stage-timeline single count-1");
    expect(html).toContain("werewolf-stage-timeline-heading");
    expect(html).toContain("werewolf-stage-timeline-step voteDeath");
    expect(html).toContain("werewolf-stage-timeline-participant voteDeath");
    expect(html).toContain("Alex");
    expect(html).not.toContain(translate("de", "werewolf.hunterShotPrompt", { name: "Sam" }));
  });

  it("renders night death history as one grouped timeline step", () => {
    const nightEvent = { type: "nightDeaths" as const, source: "night" as const, playerIds: ["alex", "sam", "jordan"] };
    const hunterShot = { type: "hunterShot" as const, source: "night" as const, hunterId: "sam", playerId: "jordan" };
    const html = renderStage({
      scene: "voteReveal",
      phase: "playing",
      round: 1,
      activeEvent: hunterShot,
      pastEvents: [nightEvent],
      events: [nightEvent, hunterShot],
    });
    const railHtml = html.slice(html.indexOf('class="werewolf-stage-elimination-rail"'));

    expect(railHtml).toContain(translate("de", "werewolf.nightSummary"));
    expect(railHtml).toContain("werewolf-stage-timeline single count-1");
    expect(railHtml).toContain("werewolf-stage-timeline-step nightDeaths");
    expect(railHtml).toContain("werewolf-stage-timeline-participant nightDeaths");
    expect(railHtml).toContain("werewolf-stage-timeline-name");
    expect(railHtml).toContain("Alex");
    expect(railHtml).toContain("Sam");
    expect(railHtml).toContain("Jordan");
    expect(railHtml).not.toContain("werewolf-stage-player-tile nightDeaths compact");
    expect(railHtml).not.toContain(translate("de", "werewolf.stageRevealRole"));
    expect(railHtml).not.toContain(translate("de", "werewolf.stageRevealTeam"));
  });

  it("keeps timeline reveal badges bound to their player row", () => {
    const voteEvent = { type: "voteDeath" as const, source: "day" as const, playerId: "jordan", reveal: { mode: "role" as const, team: "evil" as const, roleId: "werewolf" as const } };
    const html = renderStage({
      scene: "voteReveal",
      phase: "playing",
      round: 1,
      activeEvent: { type: "hunterShot", source: "day", hunterId: "sam", playerId: "alex" },
      pastEvents: [voteEvent],
      events: [voteEvent],
    });
    const railHtml = html.slice(html.indexOf('class="werewolf-stage-elimination-rail"'));

    expect(railHtml).toContain("werewolf-stage-timeline-participant voteDeath");
    expect(railHtml).toContain("Jordan");
    expect(railHtml).toContain("werewolf-stage-reveal-badge evil compact");
    expect(railHtml.indexOf("Jordan")).toBeLessThan(railHtml.indexOf("werewolf-stage-reveal-badge evil compact"));
  });

  it("uses timeline count classes for multiple visible eliminations", () => {
    const voteEvent = { type: "voteDeath" as const, source: "day" as const, playerId: "jordan" };
    const loverEvent = { type: "loverDeath" as const, source: "day" as const, playerId: "alex" };
    const hunterShot = { type: "hunterShot" as const, source: "day" as const, hunterId: "sam", playerId: "taylor" };

    const pairHtml = renderStage({
      scene: "voteReveal",
      phase: "playing",
      round: 1,
      activeEvent: hunterShot,
      pastEvents: [voteEvent, loverEvent],
      events: [voteEvent, loverEvent, hunterShot],
    });
    expect(pairHtml).toContain("werewolf-stage-timeline pair count-2");

    const manyHtml = renderStage({
      scene: "voteReveal",
      phase: "playing",
      round: 1,
      activeEvent: { type: "hunterPending", source: "day", playerId: "sam" },
      pastEvents: [voteEvent, loverEvent, hunterShot],
      events: [voteEvent, loverEvent, hunterShot],
    });
    expect(manyHtml).toContain("werewolf-stage-timeline many count-many");
  });

  it("can render the stage in English from the local locale", () => {
    const html = renderStage(
      {
        scene: "day",
        phase: "playing",
        round: 3,
      },
      "en",
    );

    expect(html).toContain(`<h1>${translate("en", "werewolf.dayTitle", { round: 3 })}</h1>`);
    expect(html).toContain(translate("en", "werewolf.dayDiscussionTitle"));
    expect(html).toContain('aria-label="German"');
    expect(html).toContain('aria-label="English"');
  });

  it("renders the day timer on the stage day scene only", () => {
    const dayHtml = renderStage(
      {
        scene: "day",
        phase: "playing",
        round: 3,
        dayTimer: { durationSeconds: 300, status: "idle", startedAt: null, remainingSeconds: 300, serverTime: 10_000 },
      },
      "en",
    );
    const nightHtml = renderStage(
      {
        scene: "night",
        phase: "playing",
        round: 3,
        dayTimer: { durationSeconds: 300, status: "idle", startedAt: null, remainingSeconds: 300, serverTime: 10_000 },
      },
      "en",
    );

    expect(dayHtml).toContain("werewolf-stage-day-timer idle");
    expect(dayHtml).toContain(translate("en", "werewolf.dayTimer"));
    expect(dayHtml).toContain("5:00");
    expect(dayHtml).toContain(translate("en", "werewolf.dayTimerWaiting"));
    expect(nightHtml).not.toContain("werewolf-stage-day-timer");
    expect(nightHtml).not.toContain(translate("en", "werewolf.dayTimer"));
  });

  it("renders the stage from the host-controlled room locale", () => {
    const html = renderStage(
      {
        scene: "day",
        phase: "playing",
        round: 3,
        stageLocale: "en",
      },
      "de",
    );

    expect(html).toContain(`<h1>${translate("en", "werewolf.dayTitle", { round: 3 })}</h1>`);
    expect(html).toContain(translate("en", "werewolf.dayDiscussionTitle"));
    expect(html).not.toContain(`<h1>${translate("de", "werewolf.dayTitle", { round: 3 })}</h1>`);
    expect(html).not.toContain('aria-label="Deutsch"');
  });
});

function renderGame(state: WerewolfState, serverTime?: number, canUndo = false) {
  return renderToStaticMarkup(
    <I18nContext.Provider
      value={{
        locale: "de",
        setLocale: () => undefined,
        t: (key, values) => translate("de", key, values),
      }}
    >
      <WerewolfPlaySurface state={state} actions={actions} serverTime={serverTime} canUndo={canUndo} />
    </I18nContext.Provider>,
  );
}

function renderShellGame(state: WerewolfState) {
  return renderToStaticMarkup(
    <I18nContext.Provider
      value={{
        locale: "de",
        setLocale: () => undefined,
        t: (key, values) => translate("de", key, values),
      }}
    >
      <WerewolfPlaySurface state={state} actions={actions} />
    </I18nContext.Provider>,
  );
}

function createNightResultGame() {
  return createWerewolfGameFromAssignments(
    [
      { id: "wolf", name: "Wolf", roleId: "werewolf" },
      { id: "seer", name: "Seher", roleId: "seer" },
      { id: "aura", name: "Aura", roleId: "auraSeer" },
      { id: "detective", name: "Detektiv", roleId: "detective" },
      { id: "villager", name: "Dorfi", roleId: "villager" },
    ],
    { winMode: "standard", revealMode: "role", roleReveal: false },
  );
}

function renderFooterHtml(html: string) {
  return html.slice(html.indexOf('class="werewolf-flow-footer"'));
}

function createAdminSummary(): AdminRoomsSummary {
  const serverTime = 1_700_000_000_000;
  return {
    serverTime,
    inactiveActivityMs: 30 * 60 * 1000,
    totals: { total: 3, active: 2, running: 1, waiting: 2, inactive: 1, ended: 0 },
    byGame: {
      werewolf: { total: 3, active: 2, running: 1, waiting: 2, inactive: 1, ended: 0 },
      imposter: { total: 0, active: 0, running: 0, waiting: 0, inactive: 0, ended: 0 },
      undercover: { total: 0, active: 0, running: 0, waiting: 0, inactive: 0, ended: 0 },
    },
    byPhase: {
      lobby: 1,
      setup: 0,
      assignment: 0,
      roleReveal: 1,
      playing: 1,
      ended: 0,
    },
    rooms: [
      {
        code: "ABCD",
        gameId: "werewolf",
        phase: "roleReveal",
        playerCount: 5,
        connectedPlayerCount: 5,
        hostConnected: true,
        createdAt: serverTime - 20 * 60 * 1000,
        lastActivityAt: serverTime - 2 * 60 * 1000,
        expiresAt: serverTime + 47 * 60 * 60 * 1000,
        started: false,
        active: true,
        running: false,
        waiting: true,
        progressStatus: "waiting",
        inactive: false,
        inactiveReasons: [],
      },
      {
        code: "WXYZ",
        gameId: "werewolf",
        phase: "playing",
        playerCount: 5,
        connectedPlayerCount: 3,
        hostConnected: false,
        createdAt: serverTime - 3 * 60 * 60 * 1000,
        lastActivityAt: serverTime - 45 * 60 * 1000,
        expiresAt: serverTime + 45 * 60 * 60 * 1000,
        started: true,
        active: false,
        running: true,
        waiting: false,
        progressStatus: "running",
        inactive: true,
        inactiveReasons: ["hostOffline", "staleActivity"],
      },
      {
        code: "LOBB",
        gameId: "werewolf",
        phase: "lobby",
        playerCount: 2,
        connectedPlayerCount: 2,
        hostConnected: true,
        createdAt: serverTime - 4 * 60 * 1000,
        lastActivityAt: serverTime - 1 * 60 * 1000,
        expiresAt: serverTime + 48 * 60 * 60 * 1000,
        started: false,
        active: true,
        running: false,
        waiting: true,
        progressStatus: "waiting",
        inactive: false,
        inactiveReasons: [],
      },
    ],
  };
}

function createEmptyAdminSummary(): AdminRoomsSummary {
  const emptyCounts = createAdminCounts();

  return {
    ...createAdminSummary(),
    totals: emptyCounts,
    byGame: {
      werewolf: createAdminCounts(),
      imposter: createAdminCounts(),
      undercover: createAdminCounts(),
    },
    byPhase: {
      lobby: 0,
      setup: 0,
      assignment: 0,
      roleReveal: 0,
      playing: 0,
      ended: 0,
    },
    rooms: [],
  };
}

function createAdminCounts() {
  return { total: 0, active: 0, running: 0, waiting: 0, inactive: 0, ended: 0 };
}

function renderAdminDashboard(
  summary: AdminRoomsSummary,
  activityFilter: "all" | "active" | "inactive" = "all",
  progressFilter: "all" | "running" | "waiting" | "ended" = "all",
) {
  return renderWithI18n(
    <AdminDashboardView
      summary={summary}
      activityFilter={activityFilter}
      progressFilter={progressFilter}
      onActivityFilterChange={() => undefined}
      onProgressFilterChange={() => undefined}
    />,
  );
}

function buttonHtmlForClass(html: string, className: string) {
  const classIndex = html.indexOf(className);
  if (classIndex === -1) return "";
  const buttonStart = html.lastIndexOf("<button", classIndex);
  const buttonEnd = html.indexOf("</button>", classIndex);
  return buttonStart >= 0 && buttonEnd >= 0 ? html.slice(buttonStart, buttonEnd) : "";
}

function renderWithI18n(node: ReactNode, locale: "de" | "en" = "de") {
  return renderToStaticMarkup(
    <I18nContext.Provider
      value={{
        locale,
        setLocale: () => undefined,
        t: (key, values) => translate(locale, key, values),
      }}
    >
      {node}
    </I18nContext.Provider>,
  );
}

function useSessionStorage(storage: Storage) {
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: storage,
  });
}

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();

  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

function renderStage(overrides: Partial<WerewolfStageRoomSnapshot>, locale: "de" | "en" = "de") {
  const snapshot: WerewolfStageRoomSnapshot = {
    audience: "stage",
    code: "ABCD",
    phase: "lobby",
    gameId: "werewolf",
    scene: "lobby",
    round: null,
    revealMode: "hidden",
    players: [
      { id: "alex", name: "Alex", connected: true, seenRole: true, alive: true },
      { id: "sam", name: "Sam", connected: true, seenRole: true, alive: false },
      { id: "jordan", name: "Jordan", connected: true, seenRole: true, alive: false },
    ],
    activeEvent: null,
    pastEvents: [],
    events: [],
    dayTimer: null,
    winner: null,
    ...overrides,
  };

  return renderWithI18n(<WerewolfStageView snapshot={snapshot} joinQr={null} />, locale);
}

function countOccurrences(value: string, search: string) {
  return value.split(search).length - 1;
}

function stepHeadingText(html: string) {
  return [
    ...html.matchAll(
      /<div\b(?=[^>]*\bclass\s*=\s*(["'])(?:game-log-step-heading(?:\s[^"']*)?|[^"']*\sgame-log-step-heading(?:\s[^"']*)?)\1)[^>]*>([\s\S]*?)<\/div>/g,
    ),
  ]
    .map((match) => match[2].replace(/<[^>]*>/g, ""))
    .join("\n");
}

function activeStageHtml(html: string) {
  const start = html.indexOf('class="werewolf-stage-center');
  if (start === -1) return "";

  const rail = html.indexOf('class="werewolf-stage-elimination-rail"', start);
  return rail > start ? html.slice(start, rail) : html.slice(start);
}

function renderWithStorage(node: ReactNode, initialValue: string | null = null) {
  const previousStorage = globalThis.localStorage;
  const values = new Map<string, string>();
  if (initialValue !== null) values.set(localWerewolfStorageKey, initialValue);

  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => {
        values.delete(key);
      },
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    },
  });

  try {
    return renderWithI18n(node);
  } finally {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: previousStorage,
    });
  }
}
