import { describe, expect, it } from "vitest";
import {
  advanceNightStep,
  advancePublicEvent,
  advanceRoleReveal,
  buildNightSteps,
  canAlphaWolfTransformTarget,
  canDoctorHealWolfTarget,
  canWitchHealWolfTarget,
  checkWin,
  createWerewolfGame,
  createWerewolfGameFromAssignments,
  eliminateByVote,
  markCurrentRoleSeen,
  pauseDayTimer,
  revealNightResult,
  resetDayTimer,
  resolveHunterShot,
  resolveNight,
  setCupidTargets,
  setAlphaWolfTransform,
  setAuraTarget,
  setDetectiveTargets,
  setDoctorHealTonight,
  setDayTimerDuration,
  setInspectedPlayer,
  setNightGuestHost,
  setProtectedPlayer,
  setWildChildModel,
  setWitchHealTonight,
  setWitchPoisonTarget,
  setWolfTarget,
  startDay,
  startDayTimer,
  startNextNight,
} from "../src/games/werewolf/domain/engine";
import { playerTeam } from "../src/games/werewolf/domain/alignment";
import { getNightStepActors, getValidTargets, isNightStepActive } from "../src/games/werewolf/domain/targets";
import { createDefaultRoleCounts, validateRoleCounts } from "../src/games/werewolf/domain/setup";
import { roleIds, roleOrder, selectableRoleOrder } from "../src/games/werewolf/domain/roles";
import { dayTimerRemainingSeconds } from "../src/games/werewolf/domain/timer";
import { loadWerewolfHostOptions, saveWerewolfHostOptionsPatch } from "../src/games/werewolf/hostOptionsStorage";
import type { RoleCounts, WerewolfOptions, WerewolfPlayer } from "../src/games/werewolf/domain/types";

const names = ["Alex", "Sam", "Jordan", "Taylor", "Morgan"];
const counts: RoleCounts = { werewolf: 1, seer: 1, protector: 1, hunter: 0, villager: 2 };
const hostOptionsStorageKey = "tablegather-werewolf-host-options";

describe("werewolf domain", () => {
  it("creates valid default role counts for a table", () => {
    const defaults = createDefaultRoleCounts(7);
    expect(validateRoleCounts(7, defaults)).toEqual({ valid: true, playerCount: 7, roleTotal: 7, reason: "ok" });
    expect(defaults.werewolf).toBe(1);
    expect(defaults.villager).toBe(6);
    expect(defaults.seer ?? 0).toBe(0);
    expect(defaults.protector ?? 0).toBe(0);
    expect(defaults.hunter ?? 0).toBe(0);
  });

  it("keeps the role catalog order exhaustive", () => {
    const selectableSet = new Set(selectableRoleOrder);
    const orderedRoleSet = new Set(roleOrder);

    expect(roleOrder).toHaveLength(roleIds.length);
    expect(orderedRoleSet).toEqual(new Set(roleIds));
    expect(selectableRoleOrder).toHaveLength(roleIds.length - 1);
    expect(selectableSet).toEqual(new Set(roleIds.filter((roleId) => roleId !== "villager")));
    expect(selectableSet.has("villager")).toBe(false);
  });

  it("persists host-selected werewolf options", () => {
    withMockStorage(JSON.stringify({ winMode: "extended", revealMode: "hidden", roleReveal: false }), (readStorage) => {
      expect(loadWerewolfHostOptions()).toEqual({ winMode: "extended", revealMode: "hidden", roleReveal: false });

      saveWerewolfHostOptionsPatch({ revealMode: "team" });

      expect(JSON.parse(readStorage()) as WerewolfOptions).toEqual({
        winMode: "extended",
        revealMode: "team",
        roleReveal: false,
      });
    });
  });

  it("rejects invalid role totals", () => {
    expect(validateRoleCounts(5, { werewolf: 3, seer: 2, protector: 1 }).valid).toBe(false);
  });

  it("assigns exactly one role to each player", () => {
    const game = createWerewolfGame(names, counts, () => 0.5);
    expect(game.players).toHaveLength(names.length);
    expect(game.players.every((player) => player.roleId)).toBe(true);
  });

  it("prepares a default day timer and lets the host control it", () => {
    let game = startDay({ ...createWerewolfGame(names, { werewolf: 1, villager: 4 }, () => 0.5, undefined, { winMode: "standard", revealMode: "role", roleReveal: false }), nightResolved: true });

    expect(game.dayTimer).toMatchObject({ durationSeconds: 300, status: "idle", startedAt: null, pausedRemainingSeconds: 300 });

    game = setDayTimerDuration(game, 120);
    expect(game.dayTimer).toMatchObject({ durationSeconds: 120, status: "idle", pausedRemainingSeconds: 120 });

    game = startDayTimer(game, 1_000);
    expect(game.dayTimer).toMatchObject({ status: "running", startedAt: 1_000, pausedRemainingSeconds: 120 });
    expect(dayTimerRemainingSeconds(game.dayTimer, 61_000)).toBe(60);

    game = pauseDayTimer(game, 61_000);
    expect(game.dayTimer).toMatchObject({ status: "paused", startedAt: null, pausedRemainingSeconds: 60 });

    game = startDayTimer(game, 70_000);
    expect(dayTimerRemainingSeconds(game.dayTimer, 130_000)).toBe(0);
    expect(game.phase).toBe("day");

    game = pauseDayTimer(game, 130_000);
    expect(game.dayTimer).toMatchObject({ status: "paused", startedAt: null, pausedRemainingSeconds: 0 });

    game = startDayTimer(game, 131_000);
    expect(game.dayTimer).toMatchObject({ status: "running", startedAt: 131_000, pausedRemainingSeconds: 0 });
    expect(dayTimerRemainingSeconds(game.dayTimer, 132_000)).toBe(0);

    game = resetDayTimer(game);
    expect(game.dayTimer).toMatchObject({ durationSeconds: 120, status: "idle", startedAt: null, pausedRemainingSeconds: 120 });
  });

  it("validates day timer durations and resets when discussion leaves the day", () => {
    let game = startDay({ ...createWerewolfGame(names, { werewolf: 1, villager: 4 }, () => 0.5, undefined, { winMode: "standard", revealMode: "role", roleReveal: false }), nightResolved: true });

    expect(() => setDayTimerDuration(game, 240)).toThrow("Invalid day timer duration.");

    game = startDayTimer(setDayTimerDuration(game, 180), 1_000);
    const target = game.players.find((player) => player.roleId !== "werewolf")!;
    game = eliminateByVote(game, target.id);

    expect(game.dayTimer).toMatchObject({ durationSeconds: 180, status: "idle", startedAt: null, pausedRemainingSeconds: 180 });

    game = startNextNight(game);
    expect(game.phase).toBe("night");
    expect(game.dayTimer.status).toBe("idle");
  });

  it("keeps night rhythm steps for roles that were in the game", () => {
    const players = [
      player("1", "werewolf"),
      player("2", "seer"),
      player("3", "protector"),
      player("4", "villager"),
      player("5", "villager"),
    ];

    expect(buildNightSteps(players)).toEqual(["sleep", "protector", "wolves", "seer", "dawn"]);
    expect(buildNightSteps(players.map((item) => (item.roleId === "protector" ? { ...item, alive: false } : item)))).toEqual([
      "sleep",
      "protector",
      "wolves",
      "seer",
      "dawn",
    ]);
  });

  it("places the doctor directly before the witch in night order", () => {
    const steps = buildNightSteps([
      player("wolf", "werewolf"),
      player("alpha", "alphaWolf"),
      player("seer", "seer"),
      player("aura", "auraSeer"),
      player("detective", "detective"),
      player("doctor", "doctor"),
      player("witch", "witch"),
      player("villager", "villager"),
    ]);

    expect(steps).toEqual(["sleep", "wolves", "alphaWolf", "seer", "auraSeer", "detective", "doctor", "witch", "dawn"]);
  });

  it("filters invalid self targets and defends engine commands", () => {
    let game = createWerewolfGameFromAssignments(
      [
        { id: "wolf", name: "Wolf", roleId: "werewolf" },
        { id: "seer", name: "Seer", roleId: "seer" },
        { id: "aura", name: "Aura", roleId: "auraSeer" },
        { id: "detective", name: "Detective", roleId: "detective" },
        { id: "protector", name: "Protector", roleId: "protector" },
        { id: "guest", name: "Guest", roleId: "nightGuest" },
        { id: "witch", name: "Witch", roleId: "witch" },
        { id: "villager", name: "Villager", roleId: "villager" },
      ],
      { winMode: "standard", revealMode: "role", roleReveal: false },
    );

    expect(getValidTargets(game, "seer").map((item) => item.id)).not.toContain("seer");
    expect(getValidTargets(game, "auraSeer").map((item) => item.id)).not.toContain("aura");
    expect(getValidTargets(game, "detective").map((item) => item.id)).not.toContain("detective");
    expect(getValidTargets(game, "protector").map((item) => item.id)).not.toContain("protector");
    expect(getValidTargets(game, "nightGuest").map((item) => item.id)).not.toContain("guest");
    expect(getValidTargets(game, "witchPoison").map((item) => item.id)).not.toContain("witch");
    expect(getValidTargets(game, "wolves").map((item) => item.id)).not.toContain("wolf");

    game = setInspectedPlayer(game, "seer");
    game = setAuraTarget(game, "aura");
    game = setDetectiveTargets(game, ["detective", "villager"]);
    game = setProtectedPlayer(game, "protector");
    game = setNightGuestHost(game, "guest");
    game = setWitchPoisonTarget(game, "witch");
    game = setWolfTarget(game, "wolf");

    expect(game.inspectedPlayerId).toBeNull();
    expect(game.auraTargetId).toBeNull();
    expect(game.detectiveTargetIds).toEqual(["villager"]);
    expect(game.protectedPlayerId).toBeNull();
    expect(game.nightGuestHostId).toBeNull();
    expect(game.witchPoisonTargetId).toBeNull();
    expect(game.wolfTargetId).toBeNull();
  });

  it("clears reversible night selections before a step is committed", () => {
    let game = createWerewolfGameFromAssignments(
      [
        { id: "wolf", name: "Wolf", roleId: "werewolf" },
        { id: "seer", name: "Seer", roleId: "seer" },
        { id: "protector", name: "Protector", roleId: "protector" },
        { id: "guest", name: "Guest", roleId: "nightGuest" },
        { id: "witch", name: "Witch", roleId: "witch" },
        { id: "villager", name: "Villager", roleId: "villager" },
      ],
      { winMode: "standard", revealMode: "role", roleReveal: false },
    );

    game = setWolfTarget(game, "villager");
    game = setProtectedPlayer(game, "villager");
    game = setNightGuestHost(game, "villager");
    game = setInspectedPlayer(game, "villager");
    game = setWitchPoisonTarget(game, "villager");

    expect(game.wolfTargetId).toBe("villager");
    expect(game.protectedPlayerId).toBe("villager");
    expect(game.nightGuestHostId).toBe("villager");
    expect(game.inspectedPlayerId).toBe("villager");
    expect(game.witchPoisonTargetId).toBe("villager");

    game = setWolfTarget(game, null);
    game = setProtectedPlayer(game, null);
    game = setNightGuestHost(game, null);
    game = setInspectedPlayer(game, null);
    game = setWitchPoisonTarget(game, null);

    expect(game.wolfTargetId).toBeNull();
    expect(game.protectedPlayerId).toBeNull();
    expect(game.nightGuestHostId).toBeNull();
    expect(game.inspectedPlayerId).toBeNull();
    expect(game.witchPoisonTargetId).toBeNull();
  });

  it("reveals seer-style results only after the GM action", () => {
    let game = createWerewolfGameFromAssignments(
      [
        { id: "wolf", name: "Wolf", roleId: "werewolf" },
        { id: "seer", name: "Seer", roleId: "seer" },
        { id: "aura", name: "Aura", roleId: "auraSeer" },
        { id: "detective", name: "Detective", roleId: "detective" },
        { id: "villager", name: "Villager", roleId: "villager" },
      ],
      { winMode: "standard", revealMode: "role", roleReveal: false },
    );

    game = setInspectedPlayer(game, "villager");
    expect(game.seerResultRevealed).toBe(false);

    game = revealNightResult(game, "seer");
    expect(game.seerResultRevealed).toBe(true);

    game = advanceNightStep(game);
    expect(game.seerResultRevealed).toBe(false);
  });

  it("does not offer witch heal or tough guy info when the protector blocks the wolf attack", () => {
    let game = createWerewolfGameFromAssignments(
      [
        { id: "wolf", name: "Wolf", roleId: "werewolf" },
        { id: "protector", name: "Protector", roleId: "protector" },
        { id: "witch", name: "Witch", roleId: "witch" },
        { id: "tough", name: "Tough", roleId: "toughGuy" },
        { id: "villager", name: "Villager", roleId: "villager" },
      ],
      { winMode: "standard", revealMode: "role", roleReveal: false },
    );

    game = setProtectedPlayer(game, "tough");
    game = setWolfTarget(game, "tough");

    expect(canWitchHealWolfTarget(game)).toBe(false);
    expect(setWitchHealTonight(game, true).witchHealTonight).toBe(false);

    game = { ...game, nightStepIndex: game.nightSteps.indexOf("witch") };
    game = advanceNightStep(game);

    expect(game.nightSteps).not.toContain("toughGuyInfo");

    game = resolveNight(game);

    expect(game.phase).toBe("night");
    expect(game.nightResolved).toBe(true);
    expect(game.lastNightDeaths).toEqual([]);
    expect(game.toughGuyWoundedId).toBeNull();
    expect(game.witchHealUsed).toBe(false);
    expect(game.players.find((item) => item.id === "tough")?.alive).toBe(true);
  });

  it("inserts the tough guy info step only for a real unhealed wolf wound", () => {
    let game = createWerewolfGameFromAssignments(
      [
        { id: "wolf", name: "Wolf", roleId: "werewolf" },
        { id: "witch", name: "Witch", roleId: "witch" },
        { id: "tough", name: "Tough", roleId: "toughGuy" },
        { id: "villager-1", name: "Villager 1", roleId: "villager" },
        { id: "villager-2", name: "Villager 2", roleId: "villager" },
      ],
      { winMode: "standard", revealMode: "role", roleReveal: false },
    );

    game = setWolfTarget(game, "tough");
    game = { ...game, nightStepIndex: game.nightSteps.indexOf("witch") };
    game = advanceNightStep(game);

    expect(game.nightSteps[game.nightStepIndex]).toBe("toughGuyInfo");
    expect(game.toughGuyWoundedId).toBe("tough");
    expect(game.toughGuyWoundedTonightId).toBe("tough");

    game = advanceNightStep(game);
    expect(game.nightSteps[game.nightStepIndex]).toBe("dawn");

    game = resolveNight(game);
    expect(game.phase).toBe("night");
    expect(game.nightResolved).toBe(true);
    expect(game.lastNightDeaths).toEqual([]);
    expect(game.players.find((item) => item.id === "tough")?.alive).toBe(true);
    expect(game.toughGuyWoundedId).toBe("tough");
  });

  it("witch heal prevents a new tough guy wound", () => {
    let game = createWerewolfGameFromAssignments(
      [
        { id: "wolf", name: "Wolf", roleId: "werewolf" },
        { id: "witch", name: "Witch", roleId: "witch" },
        { id: "tough", name: "Tough", roleId: "toughGuy" },
        { id: "villager-1", name: "Villager 1", roleId: "villager" },
        { id: "villager-2", name: "Villager 2", roleId: "villager" },
      ],
      { winMode: "standard", revealMode: "role", roleReveal: false },
    );

    game = setWolfTarget(game, "tough");
    expect(canWitchHealWolfTarget(game)).toBe(true);
    game = setWitchHealTonight(game, true);
    game = { ...game, nightStepIndex: game.nightSteps.indexOf("witch") };
    game = advanceNightStep(game);

    expect(game.nightSteps).not.toContain("toughGuyInfo");

    game = resolveNight(game);
    expect(game.phase).toBe("night");
    expect(game.nightResolved).toBe(true);
    expect(game.lastNightDeaths).toEqual([]);
    expect(game.toughGuyWoundedId).toBeNull();
    expect(game.witchHealUsed).toBe(true);
    expect(game.players.find((item) => item.id === "tough")?.alive).toBe(true);
  });

  it("lets the doctor heal the main wolf victim once and blocks witch double-heal", () => {
    let game = createWerewolfGameFromAssignments(
      [
        { id: "wolf", name: "Wolf", roleId: "werewolf" },
        { id: "doctor", name: "Doctor", roleId: "doctor" },
        { id: "witch", name: "Witch", roleId: "witch" },
        { id: "target", name: "Target", roleId: "villager" },
        { id: "villager", name: "Villager", roleId: "villager" },
      ],
      { winMode: "standard", revealMode: "role", roleReveal: false },
    );

    game = setWolfTarget(game, "target");
    expect(canDoctorHealWolfTarget(game)).toBe(true);
    game = setDoctorHealTonight(game, true);

    expect(game.doctorHealTonight).toBe(true);
    expect(canWitchHealWolfTarget(game)).toBe(false);
    expect(setWitchHealTonight(game, true).witchHealTonight).toBe(false);

    game = { ...game, nightStepIndex: game.nightSteps.indexOf("doctor") };
    game = advanceNightStep(game);
    expect(game.log.at(-1)).toMatchObject({ type: "roleAction", stepId: "doctor", result: "doctorHealed", targetIds: ["target"] });

    game = resolveNight(game);
    expect(game.lastNightDeaths).toEqual([]);
    expect(game.players.find((item) => item.id === "target")?.alive).toBe(true);
    expect(game.doctorHealUsed).toBe(true);
    expect(game.doctorHealTonight).toBe(false);
    expect(game.witchHealUsed).toBe(false);

    const nextAttempt = setWolfTarget({ ...game, nightResolved: false }, "villager");
    expect(canDoctorHealWolfTarget(nextAttempt)).toBe(false);
    expect(setDoctorHealTonight(nextAttempt, true).doctorHealTonight).toBe(false);
  });

  it("requires living healers for doctor and witch heals", () => {
    let doctorGame = createWerewolfGameFromAssignments(
      [
        { id: "wolf", name: "Wolf", roleId: "werewolf" },
        { id: "doctor", name: "Doctor", roleId: "doctor" },
        { id: "target", name: "Target", roleId: "villager" },
        { id: "villager-1", name: "Villager 1", roleId: "villager" },
        { id: "villager-2", name: "Villager 2", roleId: "villager" },
      ],
      { winMode: "standard", revealMode: "role", roleReveal: false },
    );
    doctorGame = setWolfTarget(doctorGame, "target");
    doctorGame = {
      ...doctorGame,
      players: doctorGame.players.map((item) => (item.id === "doctor" ? { ...item, alive: false } : item)),
    };

    expect(canDoctorHealWolfTarget(doctorGame)).toBe(false);
    expect(setDoctorHealTonight(doctorGame, true).doctorHealTonight).toBe(false);

    const resolvedDoctorGame = resolveNight({ ...doctorGame, doctorHealTonight: true });
    expect(resolvedDoctorGame.players.find((item) => item.id === "target")?.alive).toBe(false);
    expect(resolvedDoctorGame.doctorHealUsed).toBe(false);

    let witchGame = createWerewolfGameFromAssignments(
      [
        { id: "wolf", name: "Wolf", roleId: "werewolf" },
        { id: "witch", name: "Witch", roleId: "witch" },
        { id: "target", name: "Target", roleId: "villager" },
        { id: "villager-1", name: "Villager 1", roleId: "villager" },
        { id: "villager-2", name: "Villager 2", roleId: "villager" },
      ],
      { winMode: "standard", revealMode: "role", roleReveal: false },
    );
    witchGame = setWolfTarget(witchGame, "target");
    witchGame = {
      ...witchGame,
      players: witchGame.players.map((item) => (item.id === "witch" ? { ...item, alive: false } : item)),
    };

    expect(canWitchHealWolfTarget(witchGame)).toBe(false);
    expect(setWitchHealTonight(witchGame, true).witchHealTonight).toBe(false);

    const resolvedWitchGame = resolveNight({ ...witchGame, witchHealTonight: true });
    expect(resolvedWitchGame.players.find((item) => item.id === "target")?.alive).toBe(false);
    expect(resolvedWitchGame.witchHealUsed).toBe(false);
  });

  it("doctor heal prevents tough guy wounds and infected wolf-skip", () => {
    let toughGame = createWerewolfGameFromAssignments(
      [
        { id: "wolf", name: "Wolf", roleId: "werewolf" },
        { id: "doctor", name: "Doctor", roleId: "doctor" },
        { id: "tough", name: "Tough", roleId: "toughGuy" },
        { id: "villager-1", name: "Villager 1", roleId: "villager" },
        { id: "villager-2", name: "Villager 2", roleId: "villager" },
      ],
      { winMode: "standard", revealMode: "role", roleReveal: false },
    );

    toughGame = setWolfTarget(toughGame, "tough");
    toughGame = setDoctorHealTonight(toughGame, true);
    toughGame = { ...toughGame, nightStepIndex: toughGame.nightSteps.indexOf("doctor") };
    toughGame = advanceNightStep(toughGame);

    expect(toughGame.nightSteps).not.toContain("toughGuyInfo");

    toughGame = resolveNight(toughGame);
    expect(toughGame.lastNightDeaths).toEqual([]);
    expect(toughGame.toughGuyWoundedId).toBeNull();
    expect(toughGame.players.find((item) => item.id === "tough")?.alive).toBe(true);

    let infectedGame = createWerewolfGameFromAssignments(
      [
        { id: "wolf", name: "Wolf", roleId: "werewolf" },
        { id: "doctor", name: "Doctor", roleId: "doctor" },
        { id: "infected", name: "Infected", roleId: "infected" },
        { id: "villager-1", name: "Villager 1", roleId: "villager" },
        { id: "villager-2", name: "Villager 2", roleId: "villager" },
      ],
      { winMode: "standard", revealMode: "role", roleReveal: false },
    );

    infectedGame = setWolfTarget(infectedGame, "infected");
    infectedGame = setDoctorHealTonight(infectedGame, true);
    infectedGame = resolveNight(infectedGame);

    expect(infectedGame.lastNightDeaths).toEqual([]);
    expect(infectedGame.players.find((item) => item.id === "infected")?.alive).toBe(true);
    expect(infectedGame.wolvesSkipNextNight).toBe(false);
  });

  it("only lets the doctor heal a normal unblocked wolf kill", () => {
    let protectedGame = createWerewolfGameFromAssignments(
      [
        { id: "wolf", name: "Wolf", roleId: "werewolf" },
        { id: "doctor", name: "Doctor", roleId: "doctor" },
        { id: "protector", name: "Protector", roleId: "protector" },
        { id: "target", name: "Target", roleId: "villager" },
        { id: "villager", name: "Villager", roleId: "villager" },
      ],
      { winMode: "standard", revealMode: "role", roleReveal: false },
    );
    protectedGame = setProtectedPlayer(protectedGame, "target");
    protectedGame = setWolfTarget(protectedGame, "target");
    expect(canDoctorHealWolfTarget(protectedGame)).toBe(false);
    expect(setDoctorHealTonight(protectedGame, true).doctorHealTonight).toBe(false);

    let cursedGame = createWerewolfGameFromAssignments(
      [
        { id: "wolf", name: "Wolf", roleId: "werewolf" },
        { id: "doctor", name: "Doctor", roleId: "doctor" },
        { id: "cursed", name: "Cursed", roleId: "cursed" },
        { id: "villager-1", name: "Villager 1", roleId: "villager" },
        { id: "villager-2", name: "Villager 2", roleId: "villager" },
      ],
      { winMode: "standard", revealMode: "role", roleReveal: false },
    );
    cursedGame = setWolfTarget(cursedGame, "cursed");
    expect(canDoctorHealWolfTarget(cursedGame)).toBe(false);
    cursedGame = { ...cursedGame, nightStepIndex: cursedGame.nightSteps.indexOf("wolves") };
    cursedGame = advanceNightStep(cursedGame);
    expect(cursedGame.cursedConvertedTonightId).toBe("cursed");
    expect(canDoctorHealWolfTarget(cursedGame)).toBe(false);

    let alphaGame = createWerewolfGameFromAssignments(
      [
        { id: "alpha", name: "Alpha", roleId: "alphaWolf" },
        { id: "doctor", name: "Doctor", roleId: "doctor" },
        { id: "target", name: "Target", roleId: "villager" },
        { id: "villager-1", name: "Villager 1", roleId: "villager" },
        { id: "villager-2", name: "Villager 2", roleId: "villager" },
      ],
      { winMode: "standard", revealMode: "role", roleReveal: false },
    );
    alphaGame = setWolfTarget(alphaGame, "target");
    alphaGame = setAlphaWolfTransform(alphaGame, true);
    expect(canDoctorHealWolfTarget(alphaGame)).toBe(false);
    expect(setDoctorHealTonight(alphaGame, true).doctorHealTonight).toBe(false);

    let awayGuestGame = createWerewolfGameFromAssignments(
      [
        { id: "wolf", name: "Wolf", roleId: "werewolf" },
        { id: "doctor", name: "Doctor", roleId: "doctor" },
        { id: "guest", name: "Guest", roleId: "nightGuest" },
        { id: "host", name: "Host", roleId: "villager" },
        { id: "villager", name: "Villager", roleId: "villager" },
      ],
      { winMode: "standard", revealMode: "role", roleReveal: false },
    );
    awayGuestGame = setNightGuestHost(awayGuestGame, "host");
    awayGuestGame = setWolfTarget(awayGuestGame, "guest");
    expect(canDoctorHealWolfTarget(awayGuestGame)).toBe(false);
    expect(setDoctorHealTonight(awayGuestGame, true).doctorHealTonight).toBe(false);
  });

  it("doctor heal does not prevent night guest collateral deaths", () => {
    let game = createWerewolfGameFromAssignments(
      [
        { id: "wolf", name: "Wolf", roleId: "werewolf" },
        { id: "doctor", name: "Doctor", roleId: "doctor" },
        { id: "guest", name: "Guest", roleId: "nightGuest" },
        { id: "host", name: "Host", roleId: "villager" },
        { id: "villager", name: "Villager", roleId: "villager" },
      ],
      { winMode: "standard", revealMode: "role", roleReveal: false },
    );

    game = setNightGuestHost(game, "host");
    game = setWolfTarget(game, "host");
    expect(canDoctorHealWolfTarget(game)).toBe(true);
    game = setDoctorHealTonight(game, true);
    game = resolveNight(game);

    expect(game.lastNightDeaths).toEqual(["guest"]);
    expect(game.players.find((item) => item.id === "host")?.alive).toBe(true);
    expect(game.players.find((item) => item.id === "guest")?.alive).toBe(false);
    expect(game.doctorHealUsed).toBe(true);
  });

  it("converts the cursed only when the wolf attack really reaches them", () => {
    let protectedGame = createWerewolfGameFromAssignments(
      [
        { id: "wolf", name: "Wolf", roleId: "werewolf" },
        { id: "protector", name: "Protector", roleId: "protector" },
        { id: "cursed", name: "Cursed", roleId: "cursed" },
        { id: "villager-1", name: "Villager 1", roleId: "villager" },
        { id: "villager-2", name: "Villager 2", roleId: "villager" },
      ],
      { winMode: "standard", revealMode: "role", roleReveal: false },
    );
    protectedGame = setProtectedPlayer(protectedGame, "cursed");
    protectedGame = setWolfTarget(protectedGame, "cursed");
    protectedGame = { ...protectedGame, nightStepIndex: protectedGame.nightSteps.indexOf("wolves") };
    protectedGame = advanceNightStep(protectedGame);

    expect(protectedGame.nightSteps).not.toContain("cursedInfo");
    expect(protectedGame.players.find((item) => item.id === "cursed")?.roleId).toBe("cursed");

    let convertedGame = createWerewolfGameFromAssignments(
      [
        { id: "wolf", name: "Wolf", roleId: "werewolf" },
        { id: "cursed", name: "Cursed", roleId: "cursed" },
        { id: "seer", name: "Seer", roleId: "seer" },
        { id: "villager-1", name: "Villager 1", roleId: "villager" },
        { id: "villager-2", name: "Villager 2", roleId: "villager" },
      ],
      { winMode: "standard", revealMode: "role", roleReveal: false },
    );
    convertedGame = setWolfTarget(convertedGame, "cursed");
    convertedGame = { ...convertedGame, nightStepIndex: convertedGame.nightSteps.indexOf("wolves") };
    convertedGame = advanceNightStep(convertedGame);

    expect(convertedGame.nightSteps[convertedGame.nightStepIndex]).toBe("cursedInfo");
    expect(convertedGame.cursedConvertedTonightId).toBe("cursed");
    expect(convertedGame.players.find((item) => item.id === "cursed")?.roleId).toBe("werewolf");

    convertedGame = resolveNight({ ...convertedGame, nightStepIndex: convertedGame.nightSteps.indexOf("dawn") });
    expect(convertedGame.phase).toBe("night");
    expect(convertedGame.nightResolved).toBe(true);
    expect(convertedGame.lastNightDeaths).toEqual([]);
    expect(convertedGame.players.find((item) => item.id === "cursed")?.alive).toBe(true);
  });

  it("handles night guest misses and protected host attacks without false deaths", () => {
    let directGuestAttack = createWerewolfGameFromAssignments(
      [
        { id: "wolf", name: "Wolf", roleId: "werewolf" },
        { id: "guest", name: "Guest", roleId: "nightGuest" },
        { id: "host", name: "Host", roleId: "villager" },
        { id: "witch", name: "Witch", roleId: "witch" },
        { id: "villager", name: "Villager", roleId: "villager" },
      ],
      { winMode: "standard", revealMode: "role", roleReveal: false },
    );
    directGuestAttack = setNightGuestHost(directGuestAttack, "host");
    directGuestAttack = setWolfTarget(directGuestAttack, "guest");

    expect(canWitchHealWolfTarget(directGuestAttack)).toBe(false);

    directGuestAttack = resolveNight(directGuestAttack);
    expect(directGuestAttack.phase).toBe("night");
    expect(directGuestAttack.nightResolved).toBe(true);
    expect(directGuestAttack.lastNightDeaths).toEqual([]);
    expect(directGuestAttack.players.find((item) => item.id === "guest")?.alive).toBe(true);

    let healedHostAttack = createWerewolfGameFromAssignments(
      [
        { id: "wolf", name: "Wolf", roleId: "werewolf" },
        { id: "guest", name: "Guest", roleId: "nightGuest" },
        { id: "host", name: "Host", roleId: "villager" },
        { id: "witch", name: "Witch", roleId: "witch" },
        { id: "villager", name: "Villager", roleId: "villager" },
      ],
      { winMode: "standard", revealMode: "role", roleReveal: false },
    );
    healedHostAttack = setNightGuestHost(healedHostAttack, "host");
    healedHostAttack = setWolfTarget(healedHostAttack, "host");
    expect(canWitchHealWolfTarget(healedHostAttack)).toBe(true);
    healedHostAttack = setWitchHealTonight(healedHostAttack, true);
    healedHostAttack = resolveNight(healedHostAttack);

    expect(healedHostAttack.phase).toBe("night");
    expect(healedHostAttack.nightResolved).toBe(true);
    expect(healedHostAttack.lastNightDeaths).toEqual(["guest"]);
    expect(healedHostAttack.players.find((item) => item.id === "guest")?.alive).toBe(false);
    expect(healedHostAttack.players.find((item) => item.id === "host")?.alive).toBe(true);
    expect(healedHostAttack.witchHealUsed).toBe(true);

    let protectedHostAttack = createWerewolfGameFromAssignments(
      [
        { id: "wolf", name: "Wolf", roleId: "werewolf" },
        { id: "guest", name: "Guest", roleId: "nightGuest" },
        { id: "host", name: "Host", roleId: "villager" },
        { id: "protector", name: "Protector", roleId: "protector" },
        { id: "villager", name: "Villager", roleId: "villager" },
      ],
      { winMode: "standard", revealMode: "role", roleReveal: false },
    );
    protectedHostAttack = setNightGuestHost(protectedHostAttack, "host");
    protectedHostAttack = setProtectedPlayer(protectedHostAttack, "host");
    protectedHostAttack = setWolfTarget(protectedHostAttack, "host");
    protectedHostAttack = resolveNight(protectedHostAttack);

    expect(protectedHostAttack.phase).toBe("night");
    expect(protectedHostAttack.nightResolved).toBe(true);
    expect(protectedHostAttack.lastNightDeaths).toEqual([]);
    expect(protectedHostAttack.players.find((item) => item.id === "guest")?.alive).toBe(true);
    expect(protectedHostAttack.players.find((item) => item.id === "host")?.alive).toBe(true);
  });

  it("lets the witch poison the night guest when a direct wolf attack misses them", () => {
    let game = createWerewolfGameFromAssignments(
      [
        { id: "wolf", name: "Wolf", roleId: "werewolf" },
        { id: "guest", name: "Guest", roleId: "nightGuest" },
        { id: "host", name: "Host", roleId: "villager" },
        { id: "witch", name: "Witch", roleId: "witch" },
        { id: "villager", name: "Villager", roleId: "villager" },
      ],
      { winMode: "standard", revealMode: "role", roleReveal: false },
    );

    game = setNightGuestHost(game, "host");
    game = setWolfTarget(game, "guest");

    expect(canWitchHealWolfTarget(game)).toBe(false);
    expect(getValidTargets(game, "witchPoison").map((item) => item.id)).toContain("guest");

    game = setWitchPoisonTarget(game, "guest");
    game = resolveNight(game);

    expect(game.lastNightDeaths).toEqual(["guest"]);
    expect(game.players.find((item) => item.id === "guest")?.alive).toBe(false);
    expect(game.witchPoisonUsed).toBe(true);
  });

  it("lets witch poison bypass protector protection as a direct effect", () => {
    let game = createWerewolfGameFromAssignments(
      [
        { id: "wolf", name: "Wolf", roleId: "werewolf" },
        { id: "protector", name: "Protector", roleId: "protector" },
        { id: "witch", name: "Witch", roleId: "witch" },
        { id: "target", name: "Target", roleId: "villager" },
        { id: "villager", name: "Villager", roleId: "villager" },
      ],
      { winMode: "standard", revealMode: "role", roleReveal: false },
    );

    game = setProtectedPlayer(game, "target");
    game = setWolfTarget(game, "target");

    expect(canWitchHealWolfTarget(game)).toBe(false);
    expect(getValidTargets(game, "witchPoison").map((item) => item.id)).toContain("target");

    game = setWitchPoisonTarget(game, "target");
    game = resolveNight(game);

    expect(game.lastNightDeaths).toEqual(["target"]);
    expect(game.players.find((item) => item.id === "target")?.alive).toBe(false);
    expect(game.players.find((item) => item.id === "protector")?.alive).toBe(true);
  });

  it("only weakens wolves when the infected is truly killed by the main wolf attack", () => {
    let protectedGame = createWerewolfGameFromAssignments(
      [
        { id: "wolf", name: "Wolf", roleId: "werewolf" },
        { id: "protector", name: "Protector", roleId: "protector" },
        { id: "infected", name: "Infected", roleId: "infected" },
        { id: "villager-1", name: "Villager 1", roleId: "villager" },
        { id: "villager-2", name: "Villager 2", roleId: "villager" },
      ],
      { winMode: "standard", revealMode: "role", roleReveal: false },
    );
    protectedGame = setProtectedPlayer(protectedGame, "infected");
    protectedGame = setWolfTarget(protectedGame, "infected");
    protectedGame = resolveNight(protectedGame);
    expect(protectedGame.phase).toBe("night");
    expect(protectedGame.nightResolved).toBe(true);
    expect(protectedGame.wolvesSkipNextNight).toBe(false);

    let poisonedProtectedGame = createWerewolfGameFromAssignments(
      [
        { id: "wolf", name: "Wolf", roleId: "werewolf" },
        { id: "protector", name: "Protector", roleId: "protector" },
        { id: "witch", name: "Witch", roleId: "witch" },
        { id: "infected", name: "Infected", roleId: "infected" },
        { id: "villager", name: "Villager", roleId: "villager" },
      ],
      { winMode: "standard", revealMode: "role", roleReveal: false },
    );
    poisonedProtectedGame = setProtectedPlayer(poisonedProtectedGame, "infected");
    poisonedProtectedGame = setWolfTarget(poisonedProtectedGame, "infected");
    expect(getValidTargets(poisonedProtectedGame, "witchPoison").map((item) => item.id)).toContain("infected");
    poisonedProtectedGame = setWitchPoisonTarget(poisonedProtectedGame, "infected");
    poisonedProtectedGame = resolveNight(poisonedProtectedGame);
    expect(poisonedProtectedGame.lastNightDeaths).toEqual(["infected"]);
    expect(poisonedProtectedGame.wolvesSkipNextNight).toBe(false);

    let healedGame = createWerewolfGameFromAssignments(
      [
        { id: "wolf", name: "Wolf", roleId: "werewolf" },
        { id: "witch", name: "Witch", roleId: "witch" },
        { id: "infected", name: "Infected", roleId: "infected" },
        { id: "villager-1", name: "Villager 1", roleId: "villager" },
        { id: "villager-2", name: "Villager 2", roleId: "villager" },
      ],
      { winMode: "standard", revealMode: "role", roleReveal: false },
    );
    healedGame = setWolfTarget(healedGame, "infected");
    expect(canWitchHealWolfTarget(healedGame)).toBe(true);
    healedGame = setWitchHealTonight(healedGame, true);
    healedGame = resolveNight(healedGame);
    expect(healedGame.lastNightDeaths).toEqual([]);
    expect(healedGame.players.find((item) => item.id === "infected")?.alive).toBe(true);
    expect(healedGame.wolvesSkipNextNight).toBe(false);

    let eatenGame = createWerewolfGameFromAssignments(
      [
        { id: "wolf", name: "Wolf", roleId: "werewolf" },
        { id: "infected", name: "Infected", roleId: "infected" },
        { id: "villager-1", name: "Villager 1", roleId: "villager" },
        { id: "villager-2", name: "Villager 2", roleId: "villager" },
        { id: "villager-3", name: "Villager 3", roleId: "villager" },
      ],
      { winMode: "standard", revealMode: "role", roleReveal: false },
    );
    eatenGame = setWolfTarget(eatenGame, "infected");
    eatenGame = resolveNight(eatenGame);
    expect(eatenGame.phase).toBe("night");
    expect(eatenGame.nightResolved).toBe(true);
    expect(eatenGame.lastNightDeaths).toEqual(["infected"]);
    expect(eatenGame.wolvesSkipNextNight).toBe(true);
  });

  it("ignores stale witch poison targets that are no longer valid", () => {
    let game = createWerewolfGameFromAssignments(
      [
        { id: "wolf", name: "Wolf", roleId: "werewolf" },
        { id: "witch", name: "Witch", roleId: "witch" },
        { id: "target", name: "Target", roleId: "villager" },
        { id: "villager-1", name: "Villager 1", roleId: "villager" },
        { id: "villager-2", name: "Villager 2", roleId: "villager" },
      ],
      { winMode: "extended", revealMode: "role", roleReveal: false },
    );

    game = setWitchPoisonTarget(game, "target");
    expect(game.witchPoisonTargetId).toBe("target");
    game = setWolfTarget(game, "target");

    expect(game.witchPoisonTargetId).toBeNull();

    const staleGame = resolveNight({ ...game, witchPoisonTargetId: "target" });
    expect(staleGame.lastNightDeaths).toEqual(["target"]);
    expect(staleGame.witchPoisonUsed).toBe(false);
  });

  it("blocks alpha wolf transforms when protection or cursed conversion prevents a normal hit", () => {
    let protectedGame = createWerewolfGameFromAssignments(
      [
        { id: "alpha", name: "Alpha", roleId: "alphaWolf" },
        { id: "protector", name: "Protector", roleId: "protector" },
        { id: "target", name: "Target", roleId: "villager" },
        { id: "villager-1", name: "Villager 1", roleId: "villager" },
        { id: "villager-2", name: "Villager 2", roleId: "villager" },
      ],
      { winMode: "standard", revealMode: "role", roleReveal: false },
    );
    protectedGame = setProtectedPlayer(protectedGame, "target");
    protectedGame = setWolfTarget(protectedGame, "target");
    expect(canAlphaWolfTransformTarget(protectedGame)).toBe(false);
    expect(setAlphaWolfTransform(protectedGame, true).alphaWolfTransform).toBeNull();

    let transformGame = createWerewolfGameFromAssignments(
      [
        { id: "alpha", name: "Alpha", roleId: "alphaWolf" },
        { id: "target", name: "Target", roleId: "villager" },
        { id: "villager-1", name: "Villager 1", roleId: "villager" },
        { id: "villager-2", name: "Villager 2", roleId: "villager" },
        { id: "villager-3", name: "Villager 3", roleId: "villager" },
      ],
      { winMode: "standard", revealMode: "role", roleReveal: false },
    );
    transformGame = setWolfTarget(transformGame, "target");
    transformGame = setAlphaWolfTransform(transformGame, true);
    expect(transformGame.alphaWolfTransform).toBe(true);
    transformGame = resolveNight(transformGame);

    expect(transformGame.phase).toBe("night");
    expect(transformGame.nightResolved).toBe(true);
    expect(transformGame.lastNightDeaths).toEqual([]);
    expect(transformGame.players.find((item) => item.id === "target")?.roleId).toBe("villager");
    expect(transformGame.players.find((item) => item.id === "target")?.alphaWolfInfected).toBe(true);
    expect(transformGame.alphaWolfUsed).toBe(true);
  });

  it("does not spend the alpha wolf transform on an away night guest", () => {
    let game = createWerewolfGameFromAssignments(
      [
        { id: "alpha", name: "Alpha", roleId: "alphaWolf" },
        { id: "guest", name: "Guest", roleId: "nightGuest" },
        { id: "host", name: "Host", roleId: "villager" },
        { id: "villager-1", name: "Villager 1", roleId: "villager" },
        { id: "villager-2", name: "Villager 2", roleId: "villager" },
      ],
      { winMode: "standard", revealMode: "role", roleReveal: false },
    );

    game = setNightGuestHost(game, "host");
    game = setWolfTarget(game, "guest");

    expect(canAlphaWolfTransformTarget(game)).toBe(false);
    expect(setAlphaWolfTransform(game, true).alphaWolfTransform).toBeNull();

    game = resolveNight(game);

    expect(game.players.find((item) => item.id === "guest")?.alive).toBe(true);
    expect(game.players.find((item) => item.id === "guest")?.roleId).toBe("nightGuest");
    expect(game.alphaWolfUsed).toBe(false);
  });

  it("infects Witch, Seer, and Detective without removing their original night actions", () => {
    const roleSteps = {
      witch: "witch",
      seer: "seer",
      detective: "detective",
    } as const;

    for (const [roleId, stepId] of Object.entries(roleSteps)) {
      let game = createWerewolfGameFromAssignments(
        [
          { id: "alpha", name: "Alpha", roleId: "alphaWolf" },
          { id: "target", name: "Target", roleId: roleId as WerewolfPlayer["roleId"] },
          { id: "villager-1", name: "Villager 1", roleId: "villager" },
          { id: "villager-2", name: "Villager 2", roleId: "villager" },
          { id: "villager-3", name: "Villager 3", roleId: "villager" },
        ],
        { winMode: "standard", revealMode: "role", roleReveal: false },
      );

      game = setWolfTarget(game, "target");
      game = { ...game, nightStepIndex: game.nightSteps.indexOf("alphaWolf") };
      game = setAlphaWolfTransform(game, true);
      game = advanceNightStep(game);

      const infectedTarget = game.players.find((item) => item.id === "target");
      expect(game.nightSteps[game.nightStepIndex]).toBe("alphaWolfInfo");
      expect(infectedTarget?.roleId).toBe(roleId);
      expect(infectedTarget?.alphaWolfInfected).toBe(true);
      expect(infectedTarget?.alive).toBe(true);
      expect(getNightStepActors(game, stepId).map((item) => item.id)).toContain("target");
      expect(isNightStepActive(game, stepId)).toBe(true);
    }
  });

  it("treats alpha wolf infected players as wolf-aligned for teams, wins, and wolf targets", () => {
    const infectedWitch = { ...player("witch", "witch"), alphaWolfInfected: true };
    expect(playerTeam(infectedWitch)).toBe("werewolves");
    expect(checkWin([infectedWitch, player("villager", "villager")])).toBe("werewolves");
    expect(
      checkWin([infectedWitch, player("villager", "villager")], {
        winMode: "extended",
        witchHealUsed: false,
        witchPoisonUsed: false,
      }),
    ).toBe("werewolves");

    const game = createWerewolfGameFromAssignments(
      [
        { id: "alpha", name: "Alpha", roleId: "alphaWolf" },
        { id: "witch", name: "Witch", roleId: "witch" },
        { id: "villager-1", name: "Villager 1", roleId: "villager" },
        { id: "villager-2", name: "Villager 2", roleId: "villager" },
        { id: "villager-3", name: "Villager 3", roleId: "villager" },
      ],
      { winMode: "standard", revealMode: "role", roleReveal: false },
    );
    const infectedGame = {
      ...game,
      players: game.players.map((item) => (item.id === "witch" ? { ...item, alphaWolfInfected: true } : item)),
    };

    expect(getValidTargets(infectedGame, "wolves").map((item) => item.id)).not.toContain("witch");
  });

  it("adds an infected alpha wolf target to the next wolf wake phase, not the current one", () => {
    let game = createWerewolfGameFromAssignments(
      [
        { id: "alpha", name: "Alpha", roleId: "alphaWolf" },
        { id: "seer", name: "Seer", roleId: "seer" },
        { id: "villager-1", name: "Villager 1", roleId: "villager" },
        { id: "villager-2", name: "Villager 2", roleId: "villager" },
        { id: "villager-3", name: "Villager 3", roleId: "villager" },
      ],
      { winMode: "standard", revealMode: "role", roleReveal: false },
    );

    game = setWolfTarget(game, "seer");
    game = { ...game, nightStepIndex: game.nightSteps.indexOf("alphaWolf") };
    game = setAlphaWolfTransform(game, true);
    game = advanceNightStep(game);

    expect(game.nightSteps.filter((step) => step === "wolves")).toHaveLength(1);
    expect(game.nightSteps[game.nightStepIndex]).toBe("alphaWolfInfo");

    game = resolveNight({ ...game, nightStepIndex: game.nightSteps.indexOf("dawn") });
    expect(game.lastNightDeaths).toEqual([]);
    expect(game.players.find((item) => item.id === "seer")?.alphaWolfInfected).toBe(true);

    game = startDay(game);
    game = startNextNight(game);
    expect(getNightStepActors(game, "wolves").map((item) => item.id)).toEqual(["alpha", "seer"]);
  });

  it("keeps night guest collateral when a host is transformed or wounded by wolves", () => {
    let transformedHost = createWerewolfGameFromAssignments(
      [
        { id: "alpha", name: "Alpha", roleId: "alphaWolf" },
        { id: "guest", name: "Guest", roleId: "nightGuest" },
        { id: "host", name: "Host", roleId: "villager" },
        { id: "villager-1", name: "Villager 1", roleId: "villager" },
        { id: "villager-2", name: "Villager 2", roleId: "villager" },
      ],
      { winMode: "standard", revealMode: "role", roleReveal: false },
    );
    transformedHost = setNightGuestHost(transformedHost, "host");
    transformedHost = setWolfTarget(transformedHost, "host");
    transformedHost = setAlphaWolfTransform(transformedHost, true);
    transformedHost = resolveNight(transformedHost);

    expect(transformedHost.players.find((item) => item.id === "host")?.roleId).toBe("villager");
    expect(transformedHost.players.find((item) => item.id === "host")?.alphaWolfInfected).toBe(true);
    expect(transformedHost.players.find((item) => item.id === "host")?.alive).toBe(true);
    expect(transformedHost.players.find((item) => item.id === "guest")?.alive).toBe(false);
    expect(transformedHost.lastNightDeaths).toEqual(["guest"]);

    let toughHost = createWerewolfGameFromAssignments(
      [
        { id: "wolf", name: "Wolf", roleId: "werewolf" },
        { id: "guest", name: "Guest", roleId: "nightGuest" },
        { id: "tough", name: "Tough", roleId: "toughGuy" },
        { id: "villager-1", name: "Villager 1", roleId: "villager" },
        { id: "villager-2", name: "Villager 2", roleId: "villager" },
      ],
      { winMode: "extended", revealMode: "role", roleReveal: false },
    );
    toughHost = setNightGuestHost(toughHost, "tough");
    toughHost = setWolfTarget(toughHost, "tough");
    toughHost = resolveNight(toughHost);

    expect(toughHost.players.find((item) => item.id === "tough")?.alive).toBe(true);
    expect(toughHost.toughGuyWoundedId).toBe("tough");
    expect(toughHost.players.find((item) => item.id === "guest")?.alive).toBe(false);
    expect(toughHost.lastNightDeaths).toEqual(["guest"]);
  });

  it("converts the wild child when the role model dies at a resolution point", () => {
    let game = createWerewolfGameFromAssignments(
      [
        { id: "wolf", name: "Wolf", roleId: "werewolf" },
        { id: "wild", name: "Wild", roleId: "wildChild" },
        { id: "model", name: "Model", roleId: "villager" },
        { id: "villager-1", name: "Villager 1", roleId: "villager" },
        { id: "villager-2", name: "Villager 2", roleId: "villager" },
        { id: "villager-3", name: "Villager 3", roleId: "villager" },
      ],
      { winMode: "standard", revealMode: "role", roleReveal: false },
    );

    game = setWildChildModel(game, "model");
    game = setWolfTarget(game, "model");
    game = resolveNight(game);

    expect(game.phase).toBe("night");
    expect(game.nightResolved).toBe(true);
    expect(game.players.find((item) => item.id === "wild")?.roleId).toBe("werewolf");
    expect(game.players.find((item) => item.id === "wild")?.originalRoleId).toBe("wildChild");
    expect(game.log.find((entry) => entry.result === "wildChildConverted")).toMatchObject({
      type: "roleConverted",
      actorIds: [],
      targetIds: ["wild"],
      targetRoleIds: ["wildChild"],
    });
  });

  it("converts the wild child after a day vote kills the role model", () => {
    let game = createWerewolfGameFromAssignments(
      [
        { id: "wolf", name: "Wolf", roleId: "werewolf" },
        { id: "wild", name: "Wild", roleId: "wildChild" },
        { id: "model", name: "Model", roleId: "villager" },
        { id: "villager-1", name: "Villager 1", roleId: "villager" },
        { id: "villager-2", name: "Villager 2", roleId: "villager" },
        { id: "villager-3", name: "Villager 3", roleId: "villager" },
      ],
      { winMode: "standard", revealMode: "role", roleReveal: false },
    );

    game = setWildChildModel(game, "model");
    game = { ...game, phase: "day" };
    game = eliminateByVote(game, "model");

    expect(game.players.find((item) => item.id === "wild")?.roleId).toBe("werewolf");
    expect(game.players.find((item) => item.id === "wild")?.originalRoleId).toBe("wildChild");
  });

  it("does not add an automated little girl night step", () => {
    const game = createWerewolfGameFromAssignments(
      [
        { id: "wolf", name: "Wolf", roleId: "werewolf" },
        { id: "little", name: "Little Girl", roleId: "littleGirl" },
        { id: "seer", name: "Seer", roleId: "seer" },
        { id: "villager-1", name: "Villager 1", roleId: "villager" },
        { id: "villager-2", name: "Villager 2", roleId: "villager" },
      ],
      { winMode: "standard", revealMode: "role", roleReveal: false },
    );

    expect(game.nightSteps).not.toContain("littleGirl" as never);
  });

  it("demotes the village idiot after surviving the first day", () => {
    let game = createWerewolfGameFromAssignments(
      [
        { id: "wolf", name: "Wolf", roleId: "werewolf" },
        { id: "idiot", name: "Idiot", roleId: "villageIdiot" },
        { id: "villager-1", name: "Villager 1", roleId: "villager" },
        { id: "villager-2", name: "Villager 2", roleId: "villager" },
        { id: "villager-3", name: "Villager 3", roleId: "villager" },
      ],
      { winMode: "standard", revealMode: "hidden", roleReveal: false },
    );
    game = { ...game, phase: "day" };
    game = startNextNight(game);

    expect(game.round).toBe(2);
    expect(game.players.find((item) => item.id === "idiot")?.roleId).toBe("villager");
    expect(game.players.find((item) => item.id === "idiot")?.originalRoleId).toBe("villageIdiot");
  });

  it("moves from reveal into the first night", () => {
    let game = createWerewolfGame(names, counts, () => 0.5);
    for (let index = 0; index < names.length; index += 1) {
      game = advanceRoleReveal(markCurrentRoleSeen(game));
    }

    expect(game.phase).toBe("night");
    expect(game.players.every((item) => item.seenRole)).toBe(true);
  });

  it("prevents a protected night target from dying", () => {
    let game = createWerewolfGame(names, counts, () => 0.5);
    game = { ...game, phase: "night" };
    const target = game.players.find((item) => item.roleId !== "werewolf")!;

    game = setProtectedPlayer(game, target.id);
    game = setWolfTarget(game, target.id);
    game = resolveNight(game);

    expect(game.lastNightDeaths).toEqual([]);
    expect(game.players.find((item) => item.id === target.id)?.alive).toBe(true);
  });

  it("shows a night report before day after a normal wolf kill", () => {
    let game = createWerewolfGameFromAssignments(
      [
        { id: "wolf", name: "Wolf", roleId: "werewolf" },
        { id: "seer", name: "Seer", roleId: "seer" },
        { id: "villager-1", name: "Villager 1", roleId: "villager" },
        { id: "villager-2", name: "Villager 2", roleId: "villager" },
        { id: "villager-3", name: "Villager 3", roleId: "villager" },
      ],
      { winMode: "standard", revealMode: "role", roleReveal: false },
    );

    game = setWolfTarget(game, "villager-1");
    game = resolveNight(game);

    expect(game.phase).toBe("night");
    expect(game.nightResolved).toBe(true);
    expect(game.lastNightDeaths).toEqual(["villager-1"]);
    expect(game.players.find((item) => item.id === "villager-1")?.alive).toBe(false);

    game = startDay(game);
    expect(game.phase).toBe("day");
    expect(game.nightResolved).toBe(false);
    expect(game.lastNightDeaths).toEqual([]);
  });

  it("pauses for hunter shot when wolves kill the hunter", () => {
    let game = createWerewolfGameFromAssignments(
      [
        { id: "wolf", name: "Wolf", roleId: "werewolf" },
        { id: "hunter", name: "Hunter", roleId: "hunter" },
        { id: "villager-1", name: "Villager 1", roleId: "villager" },
        { id: "villager-2", name: "Villager 2", roleId: "villager" },
        { id: "villager-3", name: "Villager 3", roleId: "villager" },
      ],
      { winMode: "standard", revealMode: "role", roleReveal: false },
    );

    game = setWolfTarget(game, "hunter");
    game = resolveNight(game);

    expect(game.phase).toBe("night");
    expect(game.nightResolved).toBe(true);
    expect(game.pendingHunterId).toBe("hunter");
    expect(game.lastNightDeaths).toEqual(["hunter"]);
    expect(game.publicEventIndex).toBe(0);
    expect(game.publicEvents).toEqual([
      { type: "nightDeaths", playerIds: ["hunter"], source: "night" },
      { type: "hunterPending", playerId: "hunter", source: "night" },
    ]);

    game = advancePublicEvent(game);
    expect(game.publicEventIndex).toBe(1);
    game = resolveHunterShot(game, null);
    expect(game.pendingHunterId).toBeNull();
    expect(game.phase).toBe("night");
    expect(game.nightResolved).toBe(true);
    expect(game.publicEvents).toEqual([
      { type: "nightDeaths", playerIds: ["hunter"], source: "night" },
      { type: "hunterPending", playerId: "hunter", source: "night" },
      { type: "hunterSkipped", hunterId: "hunter", source: "night" },
    ]);
  });

  it("keeps an old tough guy wound fatal even if a later wolf victim is healed", () => {
    let game = createWerewolfGameFromAssignments(
      [
        { id: "wolf", name: "Wolf", roleId: "werewolf" },
        { id: "witch", name: "Witch", roleId: "witch" },
        { id: "tough", name: "Tough", roleId: "toughGuy" },
        { id: "target", name: "Target", roleId: "villager" },
        { id: "villager-1", name: "Villager 1", roleId: "villager" },
        { id: "villager-2", name: "Villager 2", roleId: "villager" },
      ],
      { winMode: "extended", revealMode: "role", roleReveal: false },
    );

    game = setWolfTarget(game, "tough");
    game = resolveNight(game);
    expect(game.toughGuyWoundedId).toBe("tough");
    expect(game.lastNightDeaths).toEqual([]);

    game = startDay(game);
    game = startNextNight(game);
    game = setWolfTarget(game, "target");
    game = setWitchHealTonight(game, true);
    game = resolveNight(game);

    expect(game.lastNightDeaths).toEqual(["tough"]);
    expect(game.players.find((item) => item.id === "target")?.alive).toBe(true);
    expect(game.players.find((item) => item.id === "tough")?.alive).toBe(false);
    expect(game.toughGuyWoundedId).toBeNull();
    expect(game.witchHealUsed).toBe(true);
  });

  it("clears tough guy wounds when non-wolf deaths kill the wounded player", () => {
    let votedGame = createWerewolfGameFromAssignments(
      [
        { id: "wolf", name: "Wolf", roleId: "werewolf" },
        { id: "tough", name: "Tough", roleId: "toughGuy" },
        { id: "villager-1", name: "Villager 1", roleId: "villager" },
        { id: "villager-2", name: "Villager 2", roleId: "villager" },
        { id: "villager-3", name: "Villager 3", roleId: "villager" },
      ],
      { winMode: "extended", revealMode: "role", roleReveal: false },
    );
    votedGame = setWolfTarget(votedGame, "tough");
    votedGame = resolveNight(votedGame);
    votedGame = startDay(votedGame);
    votedGame = eliminateByVote(votedGame, "tough");

    expect(votedGame.players.find((item) => item.id === "tough")?.alive).toBe(false);
    expect(votedGame.toughGuyWoundedId).toBeNull();

    let shotGame = createWerewolfGameFromAssignments(
      [
        { id: "wolf", name: "Wolf", roleId: "werewolf" },
        { id: "hunter", name: "Hunter", roleId: "hunter" },
        { id: "tough", name: "Tough", roleId: "toughGuy" },
        { id: "villager-1", name: "Villager 1", roleId: "villager" },
        { id: "villager-2", name: "Villager 2", roleId: "villager" },
        { id: "villager-3", name: "Villager 3", roleId: "villager" },
      ],
      { winMode: "extended", revealMode: "role", roleReveal: false },
    );
    shotGame = setWolfTarget(shotGame, "tough");
    shotGame = resolveNight(shotGame);
    shotGame = startDay(shotGame);
    shotGame = eliminateByVote(shotGame, "hunter");
    shotGame = advancePublicEvent(shotGame);
    shotGame = resolveHunterShot(shotGame, "tough");

    expect(shotGame.players.find((item) => item.id === "tough")?.alive).toBe(false);
    expect(shotGame.toughGuyWoundedId).toBeNull();
  });

  it("can end immediately after a decisive wolf kill", () => {
    let game = createWerewolfGameFromAssignments(
      [
        { id: "wolf-1", name: "Wolf 1", roleId: "werewolf" },
        { id: "wolf-2", name: "Wolf 2", roleId: "werewolf" },
        { id: "villager-1", name: "Villager 1", roleId: "villager" },
        { id: "villager-2", name: "Villager 2", roleId: "villager" },
        { id: "villager-3", name: "Villager 3", roleId: "villager" },
      ],
      { winMode: "standard", revealMode: "role", roleReveal: false },
    );

    game = setWolfTarget(game, "villager-1");
    game = resolveNight(game);

    expect(game.phase).toBe("ended");
    expect(game.winner).toBe("werewolves");
    expect(game.lastNightDeaths).toEqual(["villager-1"]);
  });

  it("checks village and werewolf win conditions", () => {
    expect(checkWin([player("1", "werewolf", false), player("2", "villager")])).toBe("villagers");
    expect(checkWin([player("1", "werewolf"), player("2", "villager")])).toBe("werewolves");
  });

  it("checks lovers and extended win blockers", () => {
    expect(
      checkWin([
        { ...player("wolf", "werewolf"), loverId: "villager" },
        { ...player("villager", "villager"), loverId: "wolf" },
      ]),
    ).toBe("lovers");

    expect(checkWin([player("wolf", "werewolf"), player("hunter", "hunter")], { winMode: "extended" })).toBeNull();
    expect(
      checkWin([player("wolf", "werewolf"), player("witch", "witch")], {
        winMode: "extended",
        witchHealUsed: true,
        witchPoisonUsed: false,
      }),
    ).toBeNull();
    expect(checkWin([player("wolf", "werewolf"), player("doctor", "doctor")], { winMode: "extended", doctorHealUsed: false })).toBeNull();
    expect(checkWin([player("wolf", "werewolf"), player("doctor", "doctor")], { winMode: "extended", doctorHealUsed: true })).toBe("werewolves");
    expect(
      checkWin([player("wolf", "werewolf"), player("witch", "witch")], {
        winMode: "extended",
        witchHealUsed: true,
        witchPoisonUsed: true,
      }),
    ).toBe("werewolves");
  });

  it("ends immediately for fool and first-round village idiot votes", () => {
    let foolGame = createWerewolfGameFromAssignments(
      [
        { id: "wolf", name: "Wolf", roleId: "werewolf" },
        { id: "fool", name: "Fool", roleId: "fool" },
        { id: "villager-1", name: "Villager 1", roleId: "villager" },
        { id: "villager-2", name: "Villager 2", roleId: "villager" },
        { id: "villager-3", name: "Villager 3", roleId: "villager" },
      ],
      { winMode: "standard", revealMode: "role", roleReveal: false },
    );
    foolGame = { ...foolGame, phase: "day" };
    foolGame = eliminateByVote(foolGame, "fool");
    expect(foolGame.phase).toBe("ended");
    expect(foolGame.winner).toBe("fool");
    expect(foolGame.log.filter((entry) => entry.type === "specialWin")).toHaveLength(1);

    let idiotGame = createWerewolfGameFromAssignments(
      [
        { id: "wolf", name: "Wolf", roleId: "werewolf" },
        { id: "idiot", name: "Idiot", roleId: "villageIdiot" },
        { id: "villager-1", name: "Villager 1", roleId: "villager" },
        { id: "villager-2", name: "Villager 2", roleId: "villager" },
        { id: "villager-3", name: "Villager 3", roleId: "villager" },
      ],
      { winMode: "standard", revealMode: "role", roleReveal: false },
    );
    idiotGame = { ...idiotGame, phase: "day" };
    idiotGame = eliminateByVote(idiotGame, "idiot");
    expect(idiotGame.phase).toBe("ended");
    expect(idiotGame.winner).toBe("villageIdiot");
    expect(idiotGame.log.filter((entry) => entry.type === "specialWin")).toHaveLength(1);
  });

  it("keeps public vote death visible even when reveal details are hidden", () => {
    let game = createWerewolfGame(names, counts, () => 0.5);
    game = { ...game, phase: "day", options: { ...game.options, revealMode: "hidden" } };
    const target = game.players.find((item) => item.roleId !== "werewolf")!;
    game = eliminateByVote(game, target.id);

    expect(game.phase).toBe("day");
    expect(game.players.find((item) => item.id === target.id)?.alive).toBe(false);
    expect(game.publicEvents).toEqual([{ type: "voteDeath", playerId: target.id, source: "day" }]);
  });

  it("keeps the host on day reveal when execution reveal is enabled", () => {
    let game = createWerewolfGame(names, counts, () => 0.5, undefined, {
      winMode: "standard",
      revealMode: "role",
      roleReveal: true,
    });
    game = { ...game, phase: "day" };
    const target = game.players.find((item) => item.roleId !== "werewolf" && item.roleId !== "hunter")!;
    game = eliminateByVote(game, target.id);

    expect(game.phase).toBe("day");
    expect(game.lastDayDeaths).toContain(target.id);
  });

  it("keeps the host on day result when execution reveal details are hidden", () => {
    let game = createWerewolfGame(names, counts, () => 0.5, undefined, {
      winMode: "standard",
      revealMode: "hidden",
      roleReveal: true,
    });
    game = { ...game, phase: "day" };
    const target = game.players.find((item) => item.roleId !== "werewolf" && item.roleId !== "hunter")!;
    game = eliminateByVote(game, target.id);

    expect(game.phase).toBe("day");
    expect(game.lastDayDeaths).toEqual([target.id]);
    expect(game.publicEvents).toEqual([{ type: "voteDeath", playerId: target.id, source: "day" }]);
  });

  it("pauses for a hunter shot before continuing", () => {
    let game = createWerewolfGame(names, { werewolf: 1, hunter: 1, villager: 3 }, () => 0.5);
    game = { ...game, phase: "day" };
    const hunter = game.players.find((item) => item.roleId === "hunter")!;
    const target = game.players.find((item) => item.alive && item.roleId === "werewolf")!;

    game = eliminateByVote(game, hunter.id);
    expect(game.pendingHunterId).toBe(hunter.id);

    game = advancePublicEvent(game);
    game = resolveHunterShot(game, target.id);
    expect(game.pendingHunterId).toBeNull();
    expect(game.players.find((item) => item.id === target.id)?.alive).toBe(false);
  });

  it("queues hunter triggers created by lover deaths", () => {
    let game = createWerewolfGameFromAssignments(
      [
        { id: "wolf", name: "Wolf", roleId: "werewolf" },
        { id: "hunter-1", name: "Hunter 1", roleId: "hunter" },
        { id: "hunter-2", name: "Hunter 2", roleId: "hunter" },
        { id: "villager-1", name: "Villager 1", roleId: "villager" },
        { id: "villager-2", name: "Villager 2", roleId: "villager" },
      ],
      { winMode: "extended", revealMode: "role", roleReveal: false },
    );
    game = {
      ...game,
      phase: "day",
      players: game.players.map((item) =>
        item.id === "hunter-1"
          ? { ...item, loverId: "hunter-2" }
          : item.id === "hunter-2"
            ? { ...item, loverId: "hunter-1" }
            : item,
      ),
    };

    game = eliminateByVote(game, "hunter-1");
    expect(game.pendingHunterId).toBe("hunter-1");
    expect(game.pendingHunterQueue).toEqual(["hunter-2"]);
    expect(game.publicEvents).toEqual([
      { type: "voteDeath", playerId: "hunter-1", source: "day" },
      { type: "loverDeath", playerId: "hunter-2", source: "day" },
      { type: "hunterPending", playerId: "hunter-1", source: "day" },
    ]);

    game = advancePublicEvent(advancePublicEvent(game));
    game = resolveHunterShot(game, null);
    expect(game.pendingHunterId).toBe("hunter-2");
    expect(game.pendingHunterQueue).toEqual([]);
    expect(game.publicEvents.at(-1)).toEqual({ type: "hunterPending", playerId: "hunter-2", source: "day" });

    game = advancePublicEvent(game);
    game = resolveHunterShot(game, null);
    expect(game.pendingHunterId).toBeNull();
    expect(game.pendingHunterQueue).toEqual([]);
  });

  it("models stage events when a voted lover kills the hunter partner", () => {
    let game = createWerewolfGameFromAssignments(
      [
        { id: "wolf", name: "Wolf", roleId: "werewolf" },
        { id: "hunter", name: "Hunter", roleId: "hunter" },
        { id: "lover", name: "Lover", roleId: "villager" },
        { id: "target", name: "Target", roleId: "villager" },
        { id: "spare-1", name: "Spare 1", roleId: "villager" },
        { id: "spare-2", name: "Spare 2", roleId: "villager" },
      ],
      { winMode: "extended", revealMode: "role", roleReveal: false },
    );
    game = {
      ...game,
      phase: "day",
      players: game.players.map((item) =>
        item.id === "hunter" ? { ...item, loverId: "lover" } : item.id === "lover" ? { ...item, loverId: "hunter" } : item,
      ),
    };

    game = eliminateByVote(game, "lover");
    const dayEliminationLog = game.log.find((entry) => entry.type === "dayElimination");
    expect(game.lastDayDeaths).toEqual(["hunter", "lover"]);
    expect(dayEliminationLog).toMatchObject({
      privacy: "sensitive",
      phase: "day",
      targetIds: game.lastDayDeaths,
      targetRoleIds: game.lastDayDeaths.map((id) => game.players.find((item) => item.id === id)?.roleId),
      publicSummary: { type: "dayElimination", targetCount: game.lastDayDeaths.length },
    });
    expect(game.publicEvents).toEqual([
      { type: "voteDeath", playerId: "lover", source: "day" },
      { type: "loverDeath", playerId: "hunter", source: "day" },
      { type: "hunterPending", playerId: "hunter", source: "day" },
    ]);

    game = advancePublicEvent(advancePublicEvent(game));
    game = resolveHunterShot(game, "target");
    expect(game.publicEvents).toEqual([
      { type: "voteDeath", playerId: "lover", source: "day" },
      { type: "loverDeath", playerId: "hunter", source: "day" },
      { type: "hunterPending", playerId: "hunter", source: "day" },
      { type: "hunterShot", hunterId: "hunter", playerId: "target", source: "day" },
    ]);
  });

  it("models stage events when the voted hunter kills before lover fallout continues", () => {
    let game = createWerewolfGameFromAssignments(
      [
        { id: "wolf", name: "Wolf", roleId: "werewolf" },
        { id: "hunter", name: "Hunter", roleId: "hunter" },
        { id: "lover", name: "Lover", roleId: "villager" },
        { id: "target", name: "Target", roleId: "villager" },
        { id: "spare-1", name: "Spare 1", roleId: "villager" },
        { id: "spare-2", name: "Spare 2", roleId: "villager" },
      ],
      { winMode: "extended", revealMode: "role", roleReveal: false },
    );
    game = {
      ...game,
      phase: "day",
      players: game.players.map((item) =>
        item.id === "hunter" ? { ...item, loverId: "lover" } : item.id === "lover" ? { ...item, loverId: "hunter" } : item,
      ),
    };

    game = eliminateByVote(game, "hunter");
    expect(game.publicEvents).toEqual([
      { type: "voteDeath", playerId: "hunter", source: "day" },
      { type: "loverDeath", playerId: "lover", source: "day" },
      { type: "hunterPending", playerId: "hunter", source: "day" },
    ]);

    game = advancePublicEvent(advancePublicEvent(game));
    game = resolveHunterShot(game, "target");
    expect(game.publicEvents).toEqual([
      { type: "voteDeath", playerId: "hunter", source: "day" },
      { type: "loverDeath", playerId: "lover", source: "day" },
      { type: "hunterPending", playerId: "hunter", source: "day" },
      { type: "hunterShot", hunterId: "hunter", playerId: "target", source: "day" },
    ]);
  });

  it("queues a second hunter when the first hunter shoots them", () => {
    let game = createWerewolfGameFromAssignments(
      [
        { id: "wolf", name: "Wolf", roleId: "werewolf" },
        { id: "hunter-1", name: "Hunter 1", roleId: "hunter" },
        { id: "hunter-2", name: "Hunter 2", roleId: "hunter" },
        { id: "villager-1", name: "Villager 1", roleId: "villager" },
        { id: "villager-2", name: "Villager 2", roleId: "villager" },
      ],
      { winMode: "extended", revealMode: "role", roleReveal: false },
    );

    game = setWolfTarget(game, "hunter-1");
    game = resolveNight(game);
    expect(game.pendingHunterId).toBe("hunter-1");

    game = advancePublicEvent(game);
    game = resolveHunterShot(game, "hunter-2");
    expect(game.pendingHunterId).toBe("hunter-2");
    expect(game.players.find((item) => item.id === "hunter-2")?.alive).toBe(false);

    game = advancePublicEvent(game);
    game = resolveHunterShot(game, null);
    expect(game.pendingHunterId).toBeNull();
  });

  it("logs night role choices only when the host commits the step", () => {
    let game = createWerewolfGameFromAssignments(
      [
        { id: "wolf", name: "Wolf", roleId: "werewolf" },
        { id: "malik", name: "Malik", roleId: "cupid" },
        { id: "dennis", name: "Dennis", roleId: "villager" },
        { id: "jasmin", name: "Jasmin", roleId: "seer" },
        { id: "spare", name: "Spare", roleId: "villager" },
      ],
      { winMode: "standard", revealMode: "role", roleReveal: false },
    );
    game = { ...game, nightStepIndex: game.nightSteps.indexOf("cupid") };
    const initialLogLength = game.log.length;

    game = setCupidTargets(game, ["dennis", "jasmin"]);
    expect(game.log).toHaveLength(initialLogLength);

    game = advanceNightStep(game);
    expect(game.log.at(-1)).toMatchObject({
      type: "roleAction",
      privacy: "sensitive",
      phase: "night",
      round: 1,
      stepId: "cupid",
      actorRoleId: "cupid",
      actorIds: ["malik"],
      targetIds: ["dennis", "jasmin"],
      targetRoleIds: ["villager", "seer"],
      result: "selectedLovers",
      publicSummary: { type: "roleAction", actorRoleId: "cupid", targetCount: 2, result: "selectedLovers" },
    });
  });

  it("logs revealed seer results at step commit instead of result reveal", () => {
    let game = createWerewolfGameFromAssignments(
      [
        { id: "wolf", name: "Wolf", roleId: "werewolf" },
        { id: "seer", name: "Seer", roleId: "seer" },
        { id: "target", name: "Target", roleId: "villager" },
        { id: "one", name: "One", roleId: "villager" },
        { id: "two", name: "Two", roleId: "villager" },
      ],
      { winMode: "standard", revealMode: "role", roleReveal: false },
    );
    game = { ...game, nightStepIndex: game.nightSteps.indexOf("seer") };
    game = setInspectedPlayer(game, "target");
    const selectedLogLength = game.log.length;

    game = revealNightResult(game, "seer");
    expect(game.log).toHaveLength(selectedLogLength);

    game = advanceNightStep(game);
    expect(game.log.at(-1)).toMatchObject({
      type: "roleAction",
      privacy: "sensitive",
      phase: "night",
      stepId: "seer",
      actorRoleId: "seer",
      actorIds: ["seer"],
      targetIds: ["target"],
      targetRoleIds: ["villager"],
      result: "inspectedRole",
      resultRoleId: "villager",
    });
  });

  it("logs witch heal and poison choices as sensitive committed role actions", () => {
    let game = createWerewolfGameFromAssignments(
      [
        { id: "wolf", name: "Wolf", roleId: "werewolf" },
        { id: "witch", name: "Witch", roleId: "witch" },
        { id: "dennis", name: "Dennis", roleId: "villager" },
        { id: "malik", name: "Malik", roleId: "hunter" },
        { id: "spare", name: "Spare", roleId: "villager" },
      ],
      { winMode: "standard", revealMode: "role", roleReveal: false },
    );
    game = setWolfTarget(game, "dennis");
    game = setWitchHealTonight(game, true);
    game = setWitchPoisonTarget(game, "malik");
    game = { ...game, nightStepIndex: game.nightSteps.indexOf("witch") };

    game = advanceNightStep(game);
    expect(game.log.slice(-2)).toMatchObject([
      {
        type: "roleAction",
        privacy: "sensitive",
        phase: "night",
        stepId: "witch",
        actorRoleId: "witch",
        actorIds: ["witch"],
        targetIds: ["dennis"],
        targetRoleIds: ["villager"],
        result: "witchHealed",
      },
      {
        type: "roleAction",
        privacy: "sensitive",
        phase: "night",
        stepId: "witch",
        actorRoleId: "witch",
        actorIds: ["witch"],
        targetIds: ["malik"],
        targetRoleIds: ["hunter"],
        result: "witchPoisoned",
      },
    ]);
  });

  it("logs sensitive night outcomes with safe public summaries", () => {
    let game = createWerewolfGameFromAssignments(
      [
        { id: "wolf", name: "Wolf", roleId: "werewolf" },
        { id: "infected", name: "Infected", roleId: "infected" },
        { id: "one", name: "One", roleId: "villager" },
        { id: "two", name: "Two", roleId: "villager" },
        { id: "three", name: "Three", roleId: "villager" },
      ],
      { winMode: "extended", revealMode: "role", roleReveal: false },
    );

    game = setWolfTarget(game, "infected");
    game = resolveNight(game);

    expect(game.log.find((entry) => entry.type === "wolvesWeakened")).toMatchObject({
      privacy: "sensitive",
      phase: "night",
      stepId: "wolves",
      actorRoleId: "werewolf",
      actorIds: ["wolf"],
      targetIds: ["infected"],
      targetRoleIds: ["infected"],
    });
    expect(game.log.find((entry) => entry.type === "nightDeath")).toMatchObject({
      privacy: "sensitive",
      phase: "night",
      targetIds: ["infected"],
      targetRoleIds: ["infected"],
      publicSummary: { type: "nightDeath", targetCount: 1 },
    });
    expect(game.log.find((entry) => entry.type === "nightDeath")?.targetRoleIds).toEqual(
      game.lastNightDeaths.map((id) => game.players.find((item) => item.id === id)?.roleId),
    );
  });

  it("logs no-vote night starts without adding an undo meta entry", () => {
    let game = createWerewolfGameFromAssignments(
      [
        { id: "wolf", name: "Wolf", roleId: "werewolf" },
        { id: "one", name: "One", roleId: "villager" },
        { id: "two", name: "Two", roleId: "villager" },
        { id: "three", name: "Three", roleId: "villager" },
        { id: "four", name: "Four", roleId: "villager" },
      ],
      { winMode: "standard", revealMode: "role", roleReveal: false },
    );
    game = { ...game, phase: "day" };

    game = startNextNight(game);
    expect(game.log.at(-1)).toMatchObject({
      type: "noDayElimination",
      privacy: "public",
      phase: "day",
      publicSummary: { type: "noDayElimination" },
    });
    expect(game.log.some((entry) => String(entry.type).toLowerCase().includes("undo"))).toBe(false);
  });
});

function player(id: string, roleId: WerewolfPlayer["roleId"], alive = true): WerewolfPlayer {
  return { id, name: id, roleId, originalRoleId: roleId, alphaWolfInfected: false, alive, seenRole: false, loverId: null };
}

function withMockStorage(initialValue: string | null, run: (readStorage: () => string) => void) {
  const previousStorage = globalThis.localStorage;
  const values = new Map<string, string>();
  if (initialValue !== null) values.set(hostOptionsStorageKey, initialValue);

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
    run(() => values.get(hostOptionsStorageKey) ?? "");
  } finally {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: previousStorage,
    });
  }
}
