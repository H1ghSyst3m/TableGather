import { describe, expect, it } from "vitest";
import { RoomManager } from "../server/roomManager";
import { InMemoryRoomStore, type Room } from "../server/roomStore";
import { createWerewolfGameFromAssignments } from "../src/games/werewolf/domain/engine";
import type { RoleCounts, WerewolfState } from "../src/games/werewolf/domain/types";
import type { WerewolfHostRoomSnapshot, WerewolfPlayerRoomSnapshot, WerewolfStageRoomSnapshot } from "../src/games/werewolf/roomTypes";
import type { HostCommand } from "../src/online/messages";

const counts: RoleCounts = { werewolf: 1, seer: 1, protector: 1, hunter: 0, villager: 2 };
type WerewolfRoom = Room & { gameState: WerewolfState | null };

function asWerewolfRoom(room: Room | undefined): WerewolfRoom {
  if (!room) throw new Error("Expected room.");
  return room as WerewolfRoom;
}

function werewolfHostSnapshot(manager: RoomManager, room: Room): WerewolfHostRoomSnapshot {
  return manager.hostSnapshot(room) as WerewolfHostRoomSnapshot;
}

function werewolfPlayerSnapshot(manager: RoomManager, room: Room, token: string): WerewolfPlayerRoomSnapshot {
  return manager.playerSnapshot(room, token) as WerewolfPlayerRoomSnapshot;
}

function werewolfStageSnapshot(manager: RoomManager, room: Room): WerewolfStageRoomSnapshot {
  if (!room.stageToken) throw new Error("Expected stage token.");
  return manager.stageSnapshot(room, room.stageToken) as WerewolfStageRoomSnapshot;
}

describe("room manager", () => {
  it("creates rooms and allows players to join by code", () => {
    const manager = new RoomManager(new InMemoryRoomStore());
    const { room } = manager.createRoom("host-1", "werewolf");
    manager.joinRoom(room.code, "Alex", "player-1");

    expect(manager.getRoom(room.code)?.players).toHaveLength(1);
  });

  it("rejects duplicate player names while preserving token resume", () => {
    const manager = new RoomManager(new InMemoryRoomStore());
    const { room } = manager.createRoom("host-1", "werewolf");
    const joined = manager.joinRoom(room.code, "Alex Stone", "player-1");

    expect(() => manager.joinRoom(room.code, " alex   stone ", "player-2")).toThrow("Name is already taken.");

    manager.leaveRoom(room.code, joined.clientToken);

    expect(() => manager.joinRoom(room.code, "ALEX STONE", "player-3")).toThrow("Name is already taken.");
    expect(manager.resumeRoom(room.code, joined.clientToken, "player-4")).toMatchObject({ role: "player" });
    expect(manager.getRoom(room.code)?.players.find((player) => player.name === "Alex Stone")?.connected).toBe(true);
  });

  it("reports room lookup status without joining", () => {
    const manager = new RoomManager(new InMemoryRoomStore());
    const { room } = manager.createRoom("host-1", "werewolf");

    expect(manager.inspectRoom(room.code)).toMatchObject({
      roomCode: room.code,
      exists: true,
      joinable: true,
      gameId: "werewolf",
      phase: "lobby",
      playerCount: 0,
    });
    expect(manager.inspectRoom("ZZZZ")).toMatchObject({ roomCode: "ZZZZ", exists: false, joinable: false });
  });

  it("normalizes room codes for lookup, join, resume, and leave", () => {
    const manager = new RoomManager(new InMemoryRoomStore());
    const { room } = manager.createRoom("host-1", "werewolf");
    const looseCode = ` ${room.code.toLowerCase()} `;

    expect(manager.inspectRoom(looseCode)).toMatchObject({ roomCode: room.code, exists: true, joinable: true });

    const joined = manager.joinRoom(looseCode, "Alex", "player-1");
    expect(manager.getRoom(looseCode)?.players).toHaveLength(1);

    manager.leaveRoom(looseCode, joined.clientToken);
    expect(manager.getRoom(room.code)?.players[0]?.connected).toBe(false);

    expect(manager.resumeRoom(looseCode, joined.clientToken, "player-2")).toMatchObject({ role: "player" });
    expect(manager.getRoom(room.code)?.players[0]?.connected).toBe(true);
  });

  it("routes host commands through the room game id", () => {
    const manager = new RoomManager(new InMemoryRoomStore());
    const { room, clientToken: hostToken } = manager.createRoom("host-1", "werewolf");

    room.gameId = "imposter";

    expect(() => manager.applyHostCommand(room.code, hostToken, { type: "startGame", roleCounts: counts })).toThrow(
      "Game imposter is not playable.",
    );
  });

  it("returns clear errors for unsupported game commands", () => {
    const manager = new RoomManager(new InMemoryRoomStore());
    const { room, clientToken: hostToken } = manager.createRoom("host-1", "werewolf");

    expect(() => manager.applyHostCommand(room.code, hostToken, { type: "notACommand" } as unknown as HostCommand)).toThrow(
      "Unsupported werewolf host command: notACommand",
    );
  });

  it("starts a game and keeps player snapshots role-filtered", () => {
    const manager = new RoomManager(new InMemoryRoomStore());
    const { room, clientToken: hostToken } = manager.createRoom("host-1", "werewolf");
    const tokens = ["Alex", "Sam", "Jordan", "Taylor", "Morgan"].map(
      (name, index) => manager.joinRoom(room.code, name, `player-${index}`).clientToken,
    );

    manager.applyHostCommand(room.code, hostToken, { type: "startGame", roleCounts: counts });
    const started = asWerewolfRoom(manager.getRoom(room.code));
    const playerSnapshot = werewolfPlayerSnapshot(manager, started, tokens[0]);
    const hostSnapshot = werewolfHostSnapshot(manager, started);

    expect(started.phase).toBe("roleReveal");
    expect(playerSnapshot.self.roleId).toBeTruthy();
    expect(hostSnapshot.gameState).toBeTruthy();
  });

  it("creates, rotates, and disables stage links", () => {
    const manager = new RoomManager(new InMemoryRoomStore());
    const { room, clientToken: hostToken } = manager.createRoom("host-1", "werewolf");

    expect(werewolfHostSnapshot(manager, room).stageToken).toBeNull();
    expect(() => manager.joinStage(room.code, "BADTOKEN")).toThrow("Stage link is not valid.");

    manager.applyHostCommand(room.code, hostToken, { type: "createStageLink" });
    const firstToken = manager.getRoom(room.code)?.stageToken;
    expect(firstToken).toBeTruthy();
    expect(manager.joinStage(room.code, firstToken ?? "")).toBe(manager.getRoom(room.code));
    expect(werewolfHostSnapshot(manager, asWerewolfRoom(manager.getRoom(room.code))).stageToken).toBe(firstToken);

    manager.applyHostCommand(room.code, hostToken, { type: "createStageLink" });
    const rotatedToken = manager.getRoom(room.code)?.stageToken;
    expect(rotatedToken).toBeTruthy();
    expect(rotatedToken).not.toBe(firstToken);
    expect(() => manager.joinStage(room.code, firstToken ?? "")).toThrow("Stage link is not valid.");

    manager.applyHostCommand(room.code, hostToken, { type: "disableStageLink" });
    expect(manager.getRoom(room.code)?.stageToken).toBeNull();
    expect(() => manager.joinStage(room.code, rotatedToken ?? "")).toThrow("Stage link is not valid.");
  });

  it("stores and exposes the host-controlled stage locale", () => {
    const manager = new RoomManager(new InMemoryRoomStore());
    const { room, clientToken: hostToken } = manager.createRoom("host-1", "werewolf");

    expect(werewolfHostSnapshot(manager, room).stageLocale).toBeNull();

    manager.applyHostCommand(room.code, hostToken, { type: "createStageLink", stageLocale: "de" });
    const firstStageRoom = asWerewolfRoom(manager.getRoom(room.code));
    const firstToken = firstStageRoom.stageToken;

    expect(firstStageRoom.stageLocale).toBe("de");
    expect(werewolfHostSnapshot(manager, firstStageRoom).stageLocale).toBe("de");
    expect(werewolfStageSnapshot(manager, firstStageRoom).stageLocale).toBe("de");

    manager.applyHostCommand(room.code, hostToken, { type: "setStageLocale", stageLocale: "en" });
    const changedRoom = asWerewolfRoom(manager.getRoom(room.code));

    expect(werewolfHostSnapshot(manager, changedRoom).stageLocale).toBe("en");
    expect(werewolfStageSnapshot(manager, changedRoom).stageLocale).toBe("en");

    manager.applyHostCommand(room.code, hostToken, { type: "disableStageLink" });
    expect(manager.getRoom(room.code)?.stageLocale).toBe("en");

    manager.applyHostCommand(room.code, hostToken, { type: "createStageLink" });
    const rotatedRoom = asWerewolfRoom(manager.getRoom(room.code));

    expect(rotatedRoom.stageToken).toBeTruthy();
    expect(rotatedRoom.stageToken).not.toBe(firstToken);
    expect(rotatedRoom.stageLocale).toBe("en");
  });

  it("rejects invalid stage locales", () => {
    const manager = new RoomManager(new InMemoryRoomStore());
    const { room, clientToken: hostToken } = manager.createRoom("host-1", "werewolf");

    expect(() =>
      manager.applyHostCommand(room.code, hostToken, { type: "createStageLink", stageLocale: "fr" } as unknown as HostCommand),
    ).toThrow("Invalid stage locale.");
    expect(manager.getRoom(room.code)?.stageToken).toBeNull();

    manager.applyHostCommand(room.code, hostToken, { type: "createStageLink", stageLocale: "de" });
    expect(() =>
      manager.applyHostCommand(room.code, hostToken, { type: "setStageLocale", stageLocale: "fr" } as unknown as HostCommand),
    ).toThrow("Invalid stage locale.");
    expect(manager.getRoom(room.code)?.stageLocale).toBe("de");
  });

  it("does not create or accept stage links for rooms without stage support", () => {
    const manager = new RoomManager(new InMemoryRoomStore());
    const { room, clientToken: hostToken } = manager.createRoom("host-1", "werewolf");
    room.gameId = "imposter";

    expect(() => manager.applyHostCommand(room.code, hostToken, { type: "createStageLink" })).toThrow(
      "Game imposter is not playable.",
    );
    expect(manager.getRoom(room.code)?.stageToken).toBeNull();

    room.stageToken = "STAGETOKEN";
    expect(() => manager.joinStage(room.code, "STAGETOKEN")).toThrow("Game imposter is not playable.");
  });

  it("returns stage snapshots without private room data", () => {
    const manager = new RoomManager(new InMemoryRoomStore());
    const { room, clientToken: hostToken } = manager.createRoom("host-1", "werewolf");
    const tokens = ["Alex", "Sam", "Jordan", "Taylor", "Morgan"].map((name, index) =>
      manager.joinRoom(room.code, name, `player-${index}`).clientToken,
    );

    manager.applyHostCommand(room.code, hostToken, { type: "createStageLink" });
    manager.applyHostCommand(room.code, hostToken, {
      type: "startGame",
      roleCounts: { werewolf: 1, seer: 1, witch: 1, hunter: 1, villager: 1 },
      options: { winMode: "extended", revealMode: "team", roleReveal: false },
    });
    tokens.forEach((token) => manager.applyPlayerCommand(room.code, token, { type: "markRoleSeen" }));
    const activeRoom = asWerewolfRoom(manager.getRoom(room.code));
    const state = activeRoom.gameState!;
    const victim = state.players.find((player) => player.roleId !== "werewolf" && player.roleId !== "hunter")!;
    manager.applyHostCommand(room.code, hostToken, { type: "setWolfTarget", playerId: victim.id });
    manager.applyHostCommand(room.code, hostToken, { type: "resolveNight" });

    const snapshot = werewolfStageSnapshot(manager, activeRoom);
    const serializedSnapshot = JSON.stringify(snapshot);

    expect(snapshot.audience).toBe("stage");
    expect(snapshot.scene).toBe("nightReport");
    expect(snapshot.events).toEqual([{ type: "nightDeaths", source: "night", playerIds: [victim.id] }]);
    expect(serializedSnapshot).not.toContain("gameState");
    expect(serializedSnapshot).not.toContain("\"assignment\":");
    expect(serializedSnapshot).not.toContain("roleCounts");
    expect(serializedSnapshot).not.toContain("wolfTargetId");
    expect(serializedSnapshot).not.toContain("pendingHunterQueue");
    expect(serializedSnapshot).not.toContain("log");
    expect(serializedSnapshot).not.toContain("seer");
    expect(serializedSnapshot).not.toContain("witch");
  });

  it("exposes host-controlled day timers to host and stage only", () => {
    const manager = new RoomManager(new InMemoryRoomStore());
    const { room, clientToken: hostToken } = manager.createRoom("host-1", "werewolf");
    const tokens = ["Alex", "Sam", "Jordan", "Taylor", "Morgan"].map((name, index) =>
      manager.joinRoom(room.code, name, `player-${index}`).clientToken,
    );

    manager.applyHostCommand(room.code, hostToken, { type: "createStageLink" });
    manager.applyHostCommand(room.code, hostToken, {
      type: "startGame",
      roleCounts: { werewolf: 1, villager: 4 },
      options: { winMode: "standard", revealMode: "role", roleReveal: false },
    });
    tokens.forEach((token) => manager.applyPlayerCommand(room.code, token, { type: "markRoleSeen" }));

    const activeRoom = asWerewolfRoom(manager.getRoom(room.code));
    activeRoom.gameState = { ...activeRoom.gameState!, nightResolved: true };
    manager.applyHostCommand(room.code, hostToken, { type: "startDay" });
    manager.applyHostCommand(room.code, hostToken, { type: "setDayTimerDuration", durationSeconds: 120 });
    manager.applyHostCommand(room.code, hostToken, { type: "startDayTimer" });

    const dayRoom = asWerewolfRoom(manager.getRoom(room.code));
    const hostView = werewolfHostSnapshot(manager, dayRoom);
    const stageView = werewolfStageSnapshot(manager, dayRoom);
    const playerView = werewolfPlayerSnapshot(manager, dayRoom, tokens[0]);
    const hostTimer = hostView.gameState!.dayTimer;

    expect(hostView.serverTime).toBeTypeOf("number");
    expect(hostTimer.durationSeconds).toBe(120);
    expect(hostTimer.status).toBe("running");
    expect(hostTimer.startedAt).toBeTypeOf("number");
    expect(stageView.scene).toBe("day");
    expect(stageView.dayTimer).toMatchObject({
      durationSeconds: 120,
      status: "running",
      startedAt: hostTimer.startedAt,
    });
    expect(stageView.dayTimer?.remainingSeconds).toBeGreaterThan(0);
    expect(stageView.dayTimer?.remainingSeconds).toBeLessThanOrEqual(120);
    expect(JSON.stringify(playerView)).not.toContain("dayTimer");
  });

  it("keeps room assignment drafts host-only until private role reveal starts", () => {
    const manager = new RoomManager(new InMemoryRoomStore());
    const { room, clientToken: hostToken } = manager.createRoom("host-1", "werewolf");
    const joined = ["Alex", "Sam", "Jordan", "Taylor", "Morgan"].map((name, index) =>
      manager.joinRoom(room.code, name, `player-${index}`),
    );
    const roleCounts: RoleCounts = { werewolf: 1, seer: 1, witch: 1, hunter: 1, villager: 1 };

    manager.applyHostCommand(room.code, hostToken, { type: "prepareAssignment", roleCounts });
    manager.applyHostCommand(room.code, hostToken, { type: "setAssignMode", assignMode: "manual" });
    manager.applyHostCommand(room.code, hostToken, {
      type: "setManualAssignment",
      assignment: {
        [joined[0].player.id]: "werewolf",
        [joined[1].player.id]: "seer",
        [joined[2].player.id]: "witch",
        [joined[3].player.id]: "hunter",
        [joined[4].player.id]: "villager",
      },
    });

    const assignmentRoom = asWerewolfRoom(manager.getRoom(room.code));
    const hostDraft = werewolfHostSnapshot(manager, assignmentRoom);
    const playerDraft = werewolfPlayerSnapshot(manager, assignmentRoom, joined[0].clientToken);
    const serializedPlayerDraft = JSON.stringify(playerDraft);

    expect(assignmentRoom.phase).toBe("assignment");
    expect(hostDraft.assignment).toHaveLength(5);
    expect(hostDraft.assignment.find((entry) => entry.playerId === joined[0].player.id)?.roleId).toBe("werewolf");
    expect(playerDraft.self.roleId).toBeUndefined();
    expect("assignment" in playerDraft).toBe(false);
    expect(serializedPlayerDraft).not.toContain("roleCounts");
    expect(serializedPlayerDraft).not.toContain("roleId");
    expect(serializedPlayerDraft).not.toContain("gameState");
    expect(serializedPlayerDraft).not.toContain("\"assignment\":");
    expect(serializedPlayerDraft).not.toContain("wolfTargetId");

    manager.applyHostCommand(room.code, hostToken, { type: "startGame" });
    const started = asWerewolfRoom(manager.getRoom(room.code));
    const gameState = started.gameState!;

    expect(started.phase).toBe("roleReveal");
    expect(gameState.players.find((player) => player.id === joined[0].player.id)?.roleId).toBe("werewolf");
    expect(gameState.players.find((player) => player.id === joined[1].player.id)?.roleId).toBe("seer");
    expect(werewolfPlayerSnapshot(manager, started, joined[0].clientToken).self.roleId).toBe("werewolf");
  });

  it("can shuffle room roles and start from the random assignment draft", () => {
    const manager = new RoomManager(new InMemoryRoomStore());
    const { room, clientToken: hostToken } = manager.createRoom("host-1", "werewolf");
    ["Alex", "Sam", "Jordan", "Taylor", "Morgan"].forEach((name, index) =>
      manager.joinRoom(room.code, name, `player-${index}`),
    );

    manager.applyHostCommand(room.code, hostToken, {
      type: "prepareAssignment",
      roleCounts: { werewolf: 1, seer: 1, villager: 3 },
    });
    manager.applyHostCommand(room.code, hostToken, { type: "shuffleRoles" });

    const assignment = asWerewolfRoom(manager.getRoom(room.code)).assignment;
    expect(assignment).toHaveLength(5);
    expect(assignment.every((entry) => entry.roleId)).toBe(true);
    expect(assignment.filter((entry) => entry.roleId === "werewolf")).toHaveLength(1);

    manager.applyHostCommand(room.code, hostToken, { type: "startGame" });
    const gameState = asWerewolfRoom(manager.getRoom(room.code)).gameState!;
    expect(gameState.players).toHaveLength(5);
    expect(gameState.players.filter((player) => player.roleId === "werewolf")).toHaveLength(1);
  });

  it("gives every player a role reveal snapshot in larger rooms", () => {
    const manager = new RoomManager(new InMemoryRoomStore());
    const { room, clientToken: hostToken } = manager.createRoom("host-1", "werewolf");
    const names = ["Alex", "Sam", "Jordan", "Taylor", "Morgan", "Casey", "Riley"];
    const tokens = names.map((name, index) => manager.joinRoom(room.code, name, `player-${index}`).clientToken);
    const roleCounts: RoleCounts = { werewolf: 2, seer: 1, witch: 1, hunter: 1, villager: 2 };

    manager.applyHostCommand(room.code, hostToken, { type: "startGame", roleCounts });
    const started = asWerewolfRoom(manager.getRoom(room.code));

    expect(tokens.map((token) => werewolfPlayerSnapshot(manager, started, token).self.roleId)).toHaveLength(7);
    expect(tokens.every((token) => werewolfPlayerSnapshot(manager, started, token).self.roleId)).toBe(true);

    tokens.forEach((token) => manager.applyPlayerCommand(room.code, token, { type: "markRoleSeen" }));
    expect(manager.getRoom(room.code)?.phase).toBe("playing");
  });

  it("passes room game options into the werewolf engine", () => {
    const manager = new RoomManager(new InMemoryRoomStore());
    const { room, clientToken: hostToken } = manager.createRoom("host-1", "werewolf");
    ["Alex", "Sam", "Jordan", "Taylor", "Morgan"].forEach((name, index) =>
      manager.joinRoom(room.code, name, `player-${index}`),
    );

    manager.applyHostCommand(room.code, hostToken, {
      type: "startGame",
      roleCounts: counts,
      options: { winMode: "extended", revealMode: "hidden", roleReveal: true },
    });

    const gameState = asWerewolfRoom(manager.getRoom(room.code)).gameState;
    expect(gameState?.options).toEqual({ winMode: "extended", revealMode: "hidden", roleReveal: true });
  });

  it("shows converted current role privately without exposing host-only state", () => {
    const manager = new RoomManager(new InMemoryRoomStore());
    const { room } = manager.createRoom("host-1", "werewolf");
    const joined = ["Wild", "Wolf", "Witch", "Seer", "Villager"].map((name, index) =>
      manager.joinRoom(room.code, name, `player-${index}`),
    );
    const activeRoom = asWerewolfRoom(manager.getRoom(room.code));
    activeRoom.phase = "playing";
    activeRoom.gameState = createWerewolfGameFromAssignments(
      [
        { id: joined[0].player.id, name: "Wild", roleId: "wildChild" },
        { id: joined[1].player.id, name: "Wolf", roleId: "werewolf" },
        { id: joined[2].player.id, name: "Witch", roleId: "witch" },
        { id: joined[3].player.id, name: "Seer", roleId: "seer" },
        { id: joined[4].player.id, name: "Villager", roleId: "villager" },
      ],
      { winMode: "standard", revealMode: "role", roleReveal: false },
    );
    activeRoom.gameState.players = activeRoom.gameState.players.map((player) =>
      player.id === joined[0].player.id ? { ...player, roleId: "werewolf" } : player,
    );
    activeRoom.gameState.wolfTargetId = joined[4].player.id;

    const playerSnapshot = werewolfPlayerSnapshot(manager, activeRoom, joined[0].clientToken);
    const serializedSnapshot = JSON.stringify(playerSnapshot);

    expect(playerSnapshot.self.roleId).toBe("werewolf");
    expect(playerSnapshot.self.originalRoleId).toBe("wildChild");
    expect("gameState" in playerSnapshot).toBe(false);
    expect(serializedSnapshot).not.toContain("\"assignment\":");
    expect(serializedSnapshot).not.toContain("roleCounts");
    expect(serializedSnapshot).not.toContain("wolfTargetId");
    expect(serializedSnapshot).not.toContain("Wildes Kind");
  });

  it("keeps alpha wolf infection private to the host and affected player", () => {
    const manager = new RoomManager(new InMemoryRoomStore());
    const { room, clientToken: hostToken } = manager.createRoom("host-1", "werewolf");
    const joined = ["Alpha", "Witch", "Seer", "Villager One", "Villager Two"].map((name, index) =>
      manager.joinRoom(room.code, name, `player-${index}`),
    );
    const activeRoom = asWerewolfRoom(manager.getRoom(room.code));
    activeRoom.phase = "playing";
    activeRoom.gameState = createWerewolfGameFromAssignments(
      [
        { id: joined[0].player.id, name: "Alpha", roleId: "alphaWolf" },
        { id: joined[1].player.id, name: "Witch", roleId: "witch" },
        { id: joined[2].player.id, name: "Seer", roleId: "seer" },
        { id: joined[3].player.id, name: "Villager One", roleId: "villager" },
        { id: joined[4].player.id, name: "Villager Two", roleId: "villager" },
      ],
      { winMode: "standard", revealMode: "role", roleReveal: false },
    );

    manager.applyHostCommand(room.code, hostToken, { type: "setWolfTarget", playerId: joined[1].player.id });
    activeRoom.gameState.nightStepIndex = activeRoom.gameState.nightSteps.indexOf("alphaWolf");
    manager.applyHostCommand(room.code, hostToken, { type: "setAlphaWolfTransform", value: true });
    manager.applyHostCommand(room.code, hostToken, { type: "advanceNightStep" });

    const hostSnapshot = werewolfHostSnapshot(manager, activeRoom);
    const hostGame = hostSnapshot.gameState as NonNullable<typeof activeRoom.gameState>;
    const affectedSnapshot = werewolfPlayerSnapshot(manager, activeRoom, joined[1].clientToken);
    const otherSnapshot = werewolfPlayerSnapshot(manager, activeRoom, joined[2].clientToken);

    expect(hostGame.players.find((player) => player.id === joined[1].player.id)?.alphaWolfInfected).toBe(true);
    expect(affectedSnapshot.self.roleId).toBe("witch");
    expect(affectedSnapshot.self.originalRoleId).toBe("witch");
    expect(affectedSnapshot.self.alphaWolfInfected).toBe(true);
    expect(JSON.stringify(otherSnapshot)).not.toContain("alphaWolfInfected");
  });

  it("lets room host commands select and clear reversible night targets", () => {
    const manager = new RoomManager(new InMemoryRoomStore());
    const { room, clientToken: hostToken } = manager.createRoom("host-1", "werewolf");
    const activeRoom = asWerewolfRoom(manager.getRoom(room.code));
    activeRoom.phase = "playing";
    activeRoom.gameState = createWerewolfGameFromAssignments(
      [
        { id: "wolf", name: "Wolf", roleId: "werewolf" },
        { id: "witch", name: "Witch", roleId: "witch" },
        { id: "seer", name: "Seer", roleId: "seer" },
        { id: "villager", name: "Villager", roleId: "villager" },
        { id: "hunter", name: "Hunter", roleId: "hunter" },
      ],
      { winMode: "standard", revealMode: "role", roleReveal: false },
    );

    manager.applyHostCommand(room.code, hostToken, { type: "setWolfTarget", playerId: "villager" });
    expect(asWerewolfRoom(manager.getRoom(room.code)).gameState?.wolfTargetId).toBe("villager");
    manager.applyHostCommand(room.code, hostToken, { type: "setWolfTarget", playerId: null });
    expect(asWerewolfRoom(manager.getRoom(room.code)).gameState?.wolfTargetId).toBeNull();

    manager.applyHostCommand(room.code, hostToken, { type: "setWitchPoisonTarget", playerId: "hunter" });
    expect(asWerewolfRoom(manager.getRoom(room.code)).gameState?.witchPoisonTargetId).toBe("hunter");
    manager.applyHostCommand(room.code, hostToken, { type: "setWitchPoisonTarget", playerId: null });
    expect(asWerewolfRoom(manager.getRoom(room.code)).gameState?.witchPoisonTargetId).toBeNull();

    activeRoom.gameState.witchPoisonTargetId = "witch";
    manager.applyHostCommand(room.code, hostToken, { type: "setWolfTarget", playerId: "villager" });
    expect(asWerewolfRoom(manager.getRoom(room.code)).gameState?.witchPoisonTargetId).toBeNull();
  });

  it("resolves hunter queues through room host commands", () => {
    const manager = new RoomManager(new InMemoryRoomStore());
    const { room, clientToken: hostToken } = manager.createRoom("host-1", "werewolf");
    const activeRoom = asWerewolfRoom(manager.getRoom(room.code));
    activeRoom.phase = "playing";
    activeRoom.gameState = createWerewolfGameFromAssignments(
      [
        { id: "wolf", name: "Wolf", roleId: "werewolf" },
        { id: "hunter-one", name: "Hunter One", roleId: "hunter" },
        { id: "hunter-two", name: "Hunter Two", roleId: "hunter" },
        { id: "villager-one", name: "Villager One", roleId: "villager" },
        { id: "villager-two", name: "Villager Two", roleId: "villager" },
      ],
      { winMode: "extended", revealMode: "role", roleReveal: false },
    );
    activeRoom.gameState.players = activeRoom.gameState.players.map((player) => {
      if (player.id === "hunter-one") return { ...player, loverId: "hunter-two" };
      if (player.id === "hunter-two") return { ...player, loverId: "hunter-one" };
      return player;
    });

    manager.applyHostCommand(room.code, hostToken, { type: "setWolfTarget", playerId: "hunter-one" });
    manager.applyHostCommand(room.code, hostToken, { type: "resolveNight" });

    let gameState = asWerewolfRoom(manager.getRoom(room.code)).gameState!;
    expect(gameState.pendingHunterId).toBe("hunter-one");
    expect(gameState.pendingHunterQueue).toEqual(["hunter-two"]);
    expect(gameState.pendingHunterSource).toBe("night");

    manager.applyHostCommand(room.code, hostToken, { type: "advancePublicEvent" });
    manager.applyHostCommand(room.code, hostToken, { type: "resolveHunterShot", playerId: null });
    gameState = asWerewolfRoom(manager.getRoom(room.code)).gameState!;
    expect(gameState.pendingHunterId).toBe("hunter-two");
    expect(gameState.pendingHunterQueue).toEqual([]);

    manager.applyHostCommand(room.code, hostToken, { type: "advancePublicEvent" });
    manager.applyHostCommand(room.code, hostToken, { type: "resolveHunterShot", playerId: null });
    gameState = asWerewolfRoom(manager.getRoom(room.code)).gameState!;
    expect(gameState.pendingHunterId).toBeNull();
    expect(gameState.nightResolved).toBe(true);
  });

  it("applies role parity edge cases through room host commands", () => {
    const manager = new RoomManager(new InMemoryRoomStore());
    const { room, clientToken: hostToken } = manager.createRoom("host-1", "werewolf");
    const activeRoom = asWerewolfRoom(manager.getRoom(room.code));
    activeRoom.phase = "playing";
    activeRoom.gameState = createWerewolfGameFromAssignments(
      [
        { id: "wolf", name: "Wolf", roleId: "werewolf" },
        { id: "protector", name: "Protector", roleId: "protector" },
        { id: "witch", name: "Witch", roleId: "witch" },
        { id: "infected", name: "Infected", roleId: "infected" },
        { id: "villager", name: "Villager", roleId: "villager" },
      ],
      { winMode: "standard", revealMode: "role", roleReveal: false },
    );

    manager.applyHostCommand(room.code, hostToken, { type: "setProtectedPlayer", playerId: "infected" });
    manager.applyHostCommand(room.code, hostToken, { type: "setWolfTarget", playerId: "infected" });
    manager.applyHostCommand(room.code, hostToken, { type: "setWitchPoisonTarget", playerId: "infected" });
    manager.applyHostCommand(room.code, hostToken, { type: "resolveNight" });

    const gameState = asWerewolfRoom(manager.getRoom(room.code)).gameState;
    expect(gameState?.lastNightDeaths).toEqual(["infected"]);
    expect(gameState?.wolvesSkipNextNight).toBe(false);
  });

  it("keeps room play in a night report until the host starts the day", () => {
    const manager = new RoomManager(new InMemoryRoomStore());
    const { room, clientToken: hostToken } = manager.createRoom("host-1", "werewolf");
    const tokens = ["Alex", "Sam", "Jordan", "Taylor", "Morgan"].map(
      (name, index) => manager.joinRoom(room.code, name, `player-${index}`).clientToken,
    );

    manager.applyHostCommand(room.code, hostToken, {
      type: "startGame",
      roleCounts: { werewolf: 1, villager: 4 },
      options: { winMode: "extended", revealMode: "role", roleReveal: false },
    });
    tokens.forEach((token) => manager.applyPlayerCommand(room.code, token, { type: "markRoleSeen" }));
    let gameState = asWerewolfRoom(manager.getRoom(room.code)).gameState!;
    const victim = gameState.players.find((player) => player.roleId !== "werewolf")!;

    manager.applyHostCommand(room.code, hostToken, { type: "setWolfTarget", playerId: victim.id });
    manager.applyHostCommand(room.code, hostToken, { type: "resolveNight" });

    gameState = asWerewolfRoom(manager.getRoom(room.code)).gameState!;
    expect(manager.getRoom(room.code)?.phase).toBe("playing");
    expect(gameState.phase).toBe("night");
    expect(gameState.nightResolved).toBe(true);
    expect(gameState.lastNightDeaths).toEqual([victim.id]);

    manager.applyHostCommand(room.code, hostToken, { type: "startDay" });
    gameState = asWerewolfRoom(manager.getRoom(room.code)).gameState!;
    expect(gameState.phase).toBe("day");
    expect(gameState.nightResolved).toBe(false);
    expect(gameState.lastNightDeaths).toEqual([]);
  });

  it("resumes known players while the in-memory store exists", () => {
    const manager = new RoomManager(new InMemoryRoomStore());
    const { room } = manager.createRoom("host-1", "werewolf");
    const { clientToken } = manager.joinRoom(room.code, "Alex", "player-1");
    const resumed = manager.resumeRoom(room.code, clientToken, "player-2");

    expect(resumed.role).toBe("player");
    expect(manager.getRoom(room.code)?.players[0].clientId).toBe("player-2");
  });

  it("resumes the host while the in-memory store exists", () => {
    const manager = new RoomManager(new InMemoryRoomStore());
    const { room, clientToken } = manager.createRoom("host-1", "werewolf");
    const resumed = manager.resumeRoom(room.code, clientToken, "host-2");

    expect(resumed.role).toBe("host");
    expect(manager.getRoom(room.code)?.hostClientId).toBe("host-2");
  });

  it("transfers the host to a connected lobby player", () => {
    const manager = new RoomManager(new InMemoryRoomStore());
    const { room, clientToken: hostToken } = manager.createRoom("host-1", "werewolf");
    const { player, clientToken: playerToken } = manager.joinRoom(room.code, "Alex", "player-1");

    const result = manager.applyHostCommand(room.code, hostToken, { type: "transferHost", playerId: player.id });
    const transferred = "transferred" in result ? result.transferred : null;

    expect(transferred?.token).toBe(playerToken);
    expect(manager.getRoom(room.code)?.hostToken).toBe(playerToken);
    expect(manager.getRoom(room.code)?.players).toHaveLength(0);
    expect(() => manager.resumeRoom(room.code, hostToken, "host-2")).toThrow("Session not found.");

    manager.joinRoom(room.code, "Former Host", "host-2");
    expect(manager.getRoom(room.code)?.players.map((item) => item.name)).toEqual(["Former Host"]);
  });

  it("rejects host transfer to a disconnected player", () => {
    const manager = new RoomManager(new InMemoryRoomStore());
    const { room, clientToken: hostToken } = manager.createRoom("host-1", "werewolf");
    const { player, clientToken: playerToken } = manager.joinRoom(room.code, "Alex", "player-1");
    manager.leaveRoom(room.code, playerToken);

    expect(() => manager.applyHostCommand(room.code, hostToken, { type: "transferHost", playerId: player.id })).toThrow(
      "Target player is not connected.",
    );
  });

  it("does not persist rooms across a fresh store", () => {
    const first = new RoomManager(new InMemoryRoomStore());
    const { room } = first.createRoom("host-1", "werewolf");
    const second = new RoomManager(new InMemoryRoomStore());

    expect(second.getRoom(room.code)).toBeUndefined();
  });

  it("lets the host kick and close lobby rooms", () => {
    const manager = new RoomManager(new InMemoryRoomStore());
    const { room, clientToken: hostToken } = manager.createRoom("host-1", "werewolf");
    const { player } = manager.joinRoom(room.code, "Alex", "player-1");

    manager.applyHostCommand(room.code, hostToken, { type: "kickPlayer", playerId: player.id });
    expect(manager.getRoom(room.code)?.players).toHaveLength(0);

    const closed = manager.applyHostCommand(room.code, hostToken, { type: "closeRoom" });
    expect(closed.closed).toBe(true);
    expect(manager.getRoom(room.code)).toBeUndefined();
  });
});
