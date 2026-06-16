import { describe, expect, it, vi } from "vitest";
import { RoomManager } from "../server/roomManager";
import { InMemoryRoomStore, type Room } from "../server/roomStore";
import { createWerewolfGameFromAssignments } from "../src/games/werewolf/domain/engine";
import type { RoleCounts, WerewolfState } from "../src/games/werewolf/domain/types";
import type { WerewolfHostRoomSnapshot, WerewolfPlayerRoomSnapshot, WerewolfStageRoomSnapshot } from "../src/games/werewolf/roomTypes";
import { ADMIN_INACTIVE_ACTIVITY_MS } from "../src/online/admin";
import type { HostCommand } from "../src/online/messages";
import { ROOM_CODE_LENGTH } from "../src/online/roomCodes";
import { MAX_PLAYER_NAME_LENGTH } from "../src/playerNames";

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

  it("creates room, player, and stage tokens without Math.random", () => {
    const randomSpy = vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("Math.random should not generate room tokens.");
    });

    try {
      const manager = new RoomManager(new InMemoryRoomStore());
      const { room, clientToken: hostToken } = manager.createRoom("host-1", "werewolf");
      const joined = manager.joinRoom(room.code, "Alex", "player-1");

      manager.applyHostCommand(room.code, hostToken, { type: "createStageLink" });

      const activeRoom = manager.getRoom(room.code);
      const roomTokenPattern = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{18}$/;

      expect(room.code).toMatch(new RegExp(`^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{${ROOM_CODE_LENGTH}}$`));
      expect(hostToken).toMatch(roomTokenPattern);
      expect(joined.clientToken).toMatch(roomTokenPattern);
      expect(joined.player.id).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
      expect(activeRoom?.stageToken).toMatch(roomTokenPattern);
    } finally {
      randomSpy.mockRestore();
    }
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

  it("enforces the central player name length limit when joining", () => {
    const manager = new RoomManager(new InMemoryRoomStore());
    const { room } = manager.createRoom("host-1", "werewolf");
    const maxLengthName = "A".repeat(MAX_PLAYER_NAME_LENGTH);
    const tooLongName = "B".repeat(MAX_PLAYER_NAME_LENGTH + 1);

    expect(manager.joinRoom(room.code, maxLengthName, "player-1").player.name).toBe(maxLengthName);
    expect(() => manager.joinRoom(room.code, tooLongName, "player-2")).toThrow("Name is too long.");
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

  it("rejects invalid game settings before leaving the player lobby", () => {
    const manager = new RoomManager(new InMemoryRoomStore());
    const { room, clientToken: hostToken } = manager.createRoom("host-1", "werewolf");

    ["Alex", "Sam", "Jordan", "Taylor", "Morgan"].forEach((name, index) => manager.joinRoom(room.code, name, `player-${index}`));

    expect(() =>
      manager.applyHostCommand(room.code, hostToken, {
        type: "beginSetup",
        roleCounts: { werewolf: 6 },
      }),
    ).toThrow("Invalid role counts: sum");
    expect(manager.getRoom(room.code)?.phase).toBe("lobby");
    expect(manager.inspectRoom(room.code)).toMatchObject({ exists: true, joinable: true, phase: "lobby" });
  });

  it("locks joins during game settings and reopens them in the player lobby", () => {
    const manager = new RoomManager(new InMemoryRoomStore());
    const { room, clientToken: hostToken } = manager.createRoom("host-1", "werewolf");

    ["Alex", "Sam", "Jordan", "Taylor", "Morgan"].forEach((name, index) => manager.joinRoom(room.code, name, `player-${index}`));

    manager.applyHostCommand(room.code, hostToken, {
      type: "beginSetup",
      roleCounts: { werewolf: 1, villager: 4 },
      options: { winMode: "standard", revealMode: "team", roleReveal: true },
    });

    const setupRoom = asWerewolfRoom(manager.getRoom(room.code));
    expect(setupRoom.phase).toBe("setup");
    expect(manager.inspectRoom(room.code)).toMatchObject({ exists: true, joinable: false, phase: "setup" });
    expect(() => manager.joinRoom(room.code, "Late", "late-player")).toThrow("The room is already in game.");

    manager.applyHostCommand(room.code, hostToken, {
      type: "updateSetup",
      roleCounts: { werewolf: 1, seer: 1, villager: 3 },
      options: { winMode: "extended", revealMode: "hidden", roleReveal: false },
    });
    expect(werewolfHostSnapshot(manager, setupRoom)).toMatchObject({
      roleCounts: { werewolf: 1, seer: 1, villager: 3 },
      options: { winMode: "extended", revealMode: "hidden", roleReveal: true },
    });

    manager.applyHostCommand(room.code, hostToken, { type: "returnToPlayerLobby" });
    expect(manager.getRoom(room.code)?.phase).toBe("lobby");
    expect(manager.inspectRoom(room.code)).toMatchObject({ exists: true, joinable: true, phase: "lobby" });
    expect(manager.joinRoom(room.code, "Late", "late-player").player.name).toBe("Late");

    manager.applyHostCommand(room.code, hostToken, { type: "beginSetup", roleCounts: { werewolf: 1, seer: 1, villager: 4 } });
    manager.applyHostCommand(room.code, hostToken, { type: "prepareAssignment", roleCounts: { werewolf: 1, seer: 1, villager: 4 } });
    manager.applyHostCommand(room.code, hostToken, { type: "setAssignMode", assignMode: "random" });
    expect(asWerewolfRoom(manager.getRoom(room.code)).assignment).toHaveLength(6);

    manager.applyHostCommand(room.code, hostToken, { type: "returnToGameSettings" });
    const returnedRoom = asWerewolfRoom(manager.getRoom(room.code));
    expect(returnedRoom.phase).toBe("setup");
    expect(returnedRoom.assignment).toEqual([]);
    expect(werewolfHostSnapshot(manager, returnedRoom).assignMode).toBeNull();
    expect(manager.inspectRoom(room.code)).toMatchObject({ exists: true, joinable: false, phase: "setup" });
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
        { id: "doctor", name: "Doctor", roleId: "doctor" },
        { id: "witch", name: "Witch", roleId: "witch" },
        { id: "seer", name: "Seer", roleId: "seer" },
        { id: "villager", name: "Villager", roleId: "villager" },
        { id: "hunter", name: "Hunter", roleId: "hunter" },
      ],
      { winMode: "standard", revealMode: "role", roleReveal: false },
    );

    manager.applyHostCommand(room.code, hostToken, { type: "setWolfTarget", playerId: "villager" });
    expect(asWerewolfRoom(manager.getRoom(room.code)).gameState?.wolfTargetId).toBe("villager");
    manager.applyHostCommand(room.code, hostToken, { type: "setDoctorHealTonight", value: true });
    expect(asWerewolfRoom(manager.getRoom(room.code)).gameState?.doctorHealTonight).toBe(true);
    manager.applyHostCommand(room.code, hostToken, { type: "setDoctorHealTonight", value: false });
    expect(asWerewolfRoom(manager.getRoom(room.code)).gameState?.doctorHealTonight).toBe(false);
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

  it("keeps undo host-only and does not capture reversible target selections", () => {
    const manager = new RoomManager(new InMemoryRoomStore());
    const { room, clientToken: hostToken } = manager.createRoom("host-1", "werewolf");
    const joined = ["Wolf", "Seer", "Witch", "Doctor", "Villager", "Hunter"].map((name, index) =>
      manager.joinRoom(room.code, name, `player-${index}`),
    );

    manager.applyHostCommand(room.code, hostToken, { type: "createStageLink" });
    const activeRoom = asWerewolfRoom(manager.getRoom(room.code));
    activeRoom.phase = "playing";
    activeRoom.gameState = createWerewolfGameFromAssignments(
      [
        { id: joined[0].player.id, name: "Wolf", roleId: "werewolf" },
        { id: joined[1].player.id, name: "Seer", roleId: "seer" },
        { id: joined[2].player.id, name: "Witch", roleId: "witch" },
        { id: joined[3].player.id, name: "Doctor", roleId: "doctor" },
        { id: joined[4].player.id, name: "Villager", roleId: "villager" },
        { id: joined[5].player.id, name: "Hunter", roleId: "hunter" },
      ],
      { winMode: "standard", revealMode: "role", roleReveal: false },
    );

    manager.applyHostCommand(room.code, hostToken, { type: "setWolfTarget", playerId: joined[4].player.id });
    manager.applyHostCommand(room.code, hostToken, { type: "setDoctorHealTonight", value: true });

    const hostView = werewolfHostSnapshot(manager, activeRoom);
    const playerView = werewolfPlayerSnapshot(manager, activeRoom, joined[1].clientToken);
    const stageView = werewolfStageSnapshot(manager, activeRoom);
    const playerJson = JSON.stringify(playerView);
    const stageJson = JSON.stringify(stageView);

    expect(hostView.canUndo).toBe(false);
    expect(hostView.gameState?.wolfTargetId).toBe(joined[4].player.id);
    expect(hostView.gameState?.doctorHealTonight).toBe(true);
    expect(playerJson).not.toContain("canUndo");
    expect(playerJson).not.toContain("undoState");
    expect(playerJson).not.toContain("wolfTargetId");
    expect(playerJson).not.toContain("doctorHealTonight");
    expect(stageJson).not.toContain("canUndo");
    expect(stageJson).not.toContain("undoState");
    expect(stageJson).not.toContain("wolfTargetId");
    expect(stageJson).not.toContain("doctorHealTonight");
  });

  it("undoes one committed room step and clears the undo slot", () => {
    const manager = new RoomManager(new InMemoryRoomStore());
    const { room, clientToken: hostToken } = manager.createRoom("host-1", "werewolf");
    const activeRoom = asWerewolfRoom(manager.getRoom(room.code));
    activeRoom.phase = "playing";
    activeRoom.gameState = createWerewolfGameFromAssignments(
      [
        { id: "wolf", name: "Wolf", roleId: "werewolf" },
        { id: "seer", name: "Seer", roleId: "seer" },
        { id: "witch", name: "Witch", roleId: "witch" },
        { id: "villager", name: "Villager", roleId: "villager" },
        { id: "hunter", name: "Hunter", roleId: "hunter" },
      ],
      { winMode: "standard", revealMode: "role", roleReveal: false },
    );

    manager.applyHostCommand(room.code, hostToken, { type: "setWolfTarget", playerId: "villager" });
    expect(werewolfHostSnapshot(manager, activeRoom).canUndo).toBe(false);
    const committedLogLength = activeRoom.gameState!.log.length;

    manager.applyHostCommand(room.code, hostToken, { type: "resolveNight" });
    let gameState = asWerewolfRoom(manager.getRoom(room.code)).gameState!;

    expect(werewolfHostSnapshot(manager, activeRoom).canUndo).toBe(true);
    expect(gameState.log.length).toBeGreaterThan(committedLogLength);
    expect(gameState.nightResolved).toBe(true);
    expect(gameState.lastNightDeaths).toEqual(["villager"]);
    expect(gameState.players.find((player) => player.id === "villager")?.alive).toBe(false);

    manager.applyHostCommand(room.code, hostToken, { type: "undoStep" });
    gameState = asWerewolfRoom(manager.getRoom(room.code)).gameState!;

    expect(werewolfHostSnapshot(manager, activeRoom).canUndo).toBe(false);
    expect(gameState.phase).toBe("night");
    expect(gameState.nightResolved).toBe(false);
    expect(gameState.wolfTargetId).toBe("villager");
    expect(gameState.lastNightDeaths).toEqual([]);
    expect(gameState.log).toHaveLength(committedLogLength);
    expect(gameState.players.find((player) => player.id === "villager")?.alive).toBe(true);

    manager.applyHostCommand(room.code, hostToken, { type: "undoStep" });
    expect(asWerewolfRoom(manager.getRoom(room.code)).gameState?.wolfTargetId).toBe("villager");
    expect(werewolfHostSnapshot(manager, activeRoom).canUndo).toBe(false);
  });

  it("does not capture undo for equivalent room state updates", () => {
    const manager = new RoomManager(new InMemoryRoomStore());
    const { room, clientToken: hostToken } = manager.createRoom("host-1", "werewolf");
    const activeRoom = asWerewolfRoom(manager.getRoom(room.code));
    activeRoom.phase = "playing";
    activeRoom.gameState = createWerewolfGameFromAssignments(
      [
        { id: "wolf", name: "Wolf", roleId: "werewolf" },
        { id: "seer", name: "Seer", roleId: "seer" },
        { id: "witch", name: "Witch", roleId: "witch" },
        { id: "villager", name: "Villager", roleId: "villager" },
        { id: "hunter", name: "Hunter", roleId: "hunter" },
      ],
      { winMode: "standard", revealMode: "role", roleReveal: false },
    );
    activeRoom.gameState = {
      ...activeRoom.gameState,
      nightStepIndex: activeRoom.gameState.nightSteps.length - 1,
    };

    manager.applyHostCommand(room.code, hostToken, { type: "advanceNightStep" });

    expect(werewolfHostSnapshot(manager, activeRoom).canUndo).toBe(false);
    expect(asWerewolfRoom(manager.getRoom(room.code)).gameState?.nightStepIndex).toBe(activeRoom.gameState.nightSteps.length - 1);
  });

  it("rolls stage snapshots back after a host undo", () => {
    const manager = new RoomManager(new InMemoryRoomStore());
    const { room, clientToken: hostToken } = manager.createRoom("host-1", "werewolf");
    const joined = ["Wolf", "Alex", "Sam", "Jordan", "Taylor"].map((name, index) =>
      manager.joinRoom(room.code, name, `player-${index}`),
    );

    manager.applyHostCommand(room.code, hostToken, { type: "createStageLink" });
    const activeRoom = asWerewolfRoom(manager.getRoom(room.code));
    activeRoom.phase = "playing";
    activeRoom.gameState = createWerewolfGameFromAssignments(
      [
        { id: joined[0].player.id, name: "Wolf", roleId: "werewolf" },
        { id: joined[1].player.id, name: "Alex", roleId: "villager" },
        { id: joined[2].player.id, name: "Sam", roleId: "villager" },
        { id: joined[3].player.id, name: "Jordan", roleId: "villager" },
        { id: joined[4].player.id, name: "Taylor", roleId: "villager" },
      ],
      { winMode: "standard", revealMode: "hidden", roleReveal: false },
    );

    manager.applyHostCommand(room.code, hostToken, { type: "setWolfTarget", playerId: joined[1].player.id });
    manager.applyHostCommand(room.code, hostToken, { type: "resolveNight" });

    const reportView = werewolfStageSnapshot(manager, activeRoom);
    expect(reportView.scene).toBe("nightReport");
    expect(reportView.events).toEqual([{ type: "nightDeaths", source: "night", playerIds: [joined[1].player.id] }]);

    manager.applyHostCommand(room.code, hostToken, { type: "undoStep" });
    const rolledBackView = werewolfStageSnapshot(manager, activeRoom);

    expect(rolledBackView.scene).toBe("night");
    expect(rolledBackView.events).toEqual([]);
    expect(rolledBackView.activeEvent).toBeNull();
  });

  it("resets the restored day timer when undo returns to a day scene", () => {
    const manager = new RoomManager(new InMemoryRoomStore());
    const { room, clientToken: hostToken } = manager.createRoom("host-1", "werewolf");
    const activeRoom = asWerewolfRoom(manager.getRoom(room.code));
    activeRoom.phase = "playing";
    activeRoom.gameState = {
      ...createWerewolfGameFromAssignments(
        [
          { id: "wolf", name: "Wolf", roleId: "werewolf" },
          { id: "one", name: "One", roleId: "villager" },
          { id: "two", name: "Two", roleId: "villager" },
          { id: "three", name: "Three", roleId: "villager" },
          { id: "four", name: "Four", roleId: "villager" },
        ],
        { winMode: "standard", revealMode: "role", roleReveal: false },
      ),
      phase: "day",
      dayTimer: {
        durationSeconds: 120,
        status: "running",
        startedAt: 1_000,
        pausedRemainingSeconds: 90,
      },
    };

    manager.applyHostCommand(room.code, hostToken, { type: "startNextNight" });
    expect(werewolfHostSnapshot(manager, activeRoom).canUndo).toBe(true);
    expect(asWerewolfRoom(manager.getRoom(room.code)).gameState?.phase).toBe("night");

    manager.applyHostCommand(room.code, hostToken, { type: "undoStep" });
    const restored = asWerewolfRoom(manager.getRoom(room.code)).gameState!;

    expect(restored.phase).toBe("day");
    expect(restored.dayTimer).toEqual({
      durationSeconds: 120,
      status: "idle",
      startedAt: null,
      pausedRemainingSeconds: 120,
    });
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

  it("reports room sessions without refreshing activity", () => {
    let now = 1_000;
    const manager = new RoomManager(new InMemoryRoomStore(), { now: () => now, roomTtlMs: 100 });
    const { room, clientToken: hostToken } = manager.createRoom("host-1", "werewolf");
    const { clientToken: playerToken } = manager.joinRoom(room.code, "Alex", "player-1");
    const lastActivityAt = manager.getRoom(room.code)?.lastActivityAt;

    now = 1_050;

    expect(manager.inspectRoom(room.code)).toMatchObject({ roomCode: room.code, exists: true, joinable: true });
    expect(manager.inspectRoomSession(room.code, hostToken)).toMatchObject({
      roomCode: room.code,
      valid: true,
      role: "host",
      playerCount: 1,
      lastActivityAt,
      expiresAt: (lastActivityAt ?? 0) + 100,
    });
    expect(manager.inspectRoomSession(room.code, playerToken)).toMatchObject({
      roomCode: room.code,
      valid: true,
      role: "player",
      playerName: "Alex",
      lastActivityAt,
    });
    expect(manager.inspectRoomSession(room.code, "BADTOKEN")).toEqual({ roomCode: room.code, valid: false });
    expect(manager.getRoom(room.code)?.lastActivityAt).toBe(lastActivityAt);
  });

  it("persists passive disconnect state without refreshing activity", () => {
    let now = 1_000;
    const manager = new RoomManager(new InMemoryRoomStore(), { now: () => now, roomTtlMs: 500 });
    const { room } = manager.createRoom("host-1", "werewolf");

    now = 1_010;
    const joined = manager.joinRoom(room.code, "Alex", "player-1");
    const lastActivityAt = manager.getRoom(room.code)?.lastActivityAt;

    now = 1_020;
    const touched = manager.disconnectClient("player-1");
    const updated = manager.getRoom(room.code);

    expect(touched).toHaveLength(1);
    expect(updated?.players.find((player) => player.id === joined.player.id)).toMatchObject({
      clientId: null,
      connected: false,
    });
    expect(updated?.lastActivityAt).toBe(lastActivityAt);
  });

  it("refreshes room activity on successful room actions", () => {
    let now = 1_000;
    const manager = new RoomManager(new InMemoryRoomStore(), { now: () => now, roomTtlMs: 500 });
    const { room, clientToken: hostToken } = manager.createRoom("host-1", "werewolf");

    now = 1_010;
    const joined = ["Alex", "Sam", "Jordan", "Taylor", "Morgan"].map((name, index) => manager.joinRoom(room.code, name, `player-${index}`));
    expect(manager.getRoom(room.code)?.lastActivityAt).toBe(1_010);

    now = 1_020;
    manager.leaveRoom(room.code, joined[0].clientToken);
    expect(manager.getRoom(room.code)?.lastActivityAt).toBe(1_020);

    now = 1_030;
    manager.resumeRoom(room.code, joined[0].clientToken, "player-resumed");
    expect(manager.getRoom(room.code)?.lastActivityAt).toBe(1_030);

    now = 1_040;
    manager.applyHostCommand(room.code, hostToken, { type: "startGame", roleCounts: { werewolf: 1, villager: 4 } });
    expect(manager.getRoom(room.code)?.lastActivityAt).toBe(1_040);

    now = 1_050;
    manager.applyPlayerCommand(room.code, joined[0].clientToken, { type: "markRoleSeen" });
    expect(manager.getRoom(room.code)?.lastActivityAt).toBe(1_050);
  });

  it("summarizes admin room counts by game, phase, live status, and inactivity", () => {
    let now = 10_000_000;
    const manager = new RoomManager(new InMemoryRoomStore(), { now: () => now, roomTtlMs: 10 * ADMIN_INACTIVE_ACTIVITY_MS });
    const lobby = manager.createRoom("host-lobby", "werewolf").room;
    const running = manager.createRoom("host-running", "werewolf").room;
    const stale = manager.createRoom("host-stale", "werewolf").room;
    const offline = manager.createRoom("host-offline", "werewolf").room;
    const ended = manager.createRoom("host-ended", "werewolf").room;

    manager.joinRoom(lobby.code, "Alex", "player-lobby");
    manager.joinRoom(running.code, "Robin", "player-running");
    manager.joinRoom(stale.code, "Sam", "player-stale");
    manager.joinRoom(offline.code, "Jordan", "player-offline");

    running.phase = "roleReveal";

    stale.gameId = "imposter";
    stale.phase = "playing";
    stale.lastActivityAt = now - ADMIN_INACTIVE_ACTIVITY_MS;

    offline.phase = "roleReveal";
    offline.hostClientId = null;
    offline.lastActivityAt = now - 1_000;

    ended.gameId = "undercover";
    ended.phase = "ended";

    now += 1_000;
    const summary = manager.adminRoomsSummary();

    expect(summary.totals).toEqual({ total: 5, active: 3, running: 1, waiting: 3, inactive: 2, ended: 1 });
    expect(summary.byGame.werewolf).toEqual({ total: 3, active: 2, running: 0, waiting: 3, inactive: 1, ended: 0 });
    expect(summary.byGame.imposter).toEqual({ total: 1, active: 0, running: 1, waiting: 0, inactive: 1, ended: 0 });
    expect(summary.byGame.undercover).toEqual({ total: 1, active: 1, running: 0, waiting: 0, inactive: 0, ended: 1 });
    expect(summary.byPhase).toMatchObject({ lobby: 1, setup: 0, playing: 1, roleReveal: 2, assignment: 0, ended: 1 });
    expect(summary.rooms.every((room) => room.active === !room.inactive)).toBe(true);

    expect(summary.rooms.find((room) => room.code === lobby.code)).toMatchObject({
      started: false,
      active: true,
      running: false,
      waiting: true,
      progressStatus: "waiting",
      inactive: false,
      inactiveReasons: [],
      playerCount: 1,
      connectedPlayerCount: 1,
      hostConnected: true,
    });
    expect(summary.rooms.find((room) => room.code === running.code)).toMatchObject({
      started: false,
      active: true,
      running: false,
      waiting: true,
      progressStatus: "waiting",
      inactive: false,
      inactiveReasons: [],
      hostConnected: true,
    });
    expect(summary.rooms.find((room) => room.code === stale.code)).toMatchObject({
      started: true,
      active: false,
      running: true,
      waiting: false,
      progressStatus: "running",
      inactive: true,
      inactiveReasons: ["staleActivity"],
      hostConnected: true,
    });
    expect(summary.rooms.find((room) => room.code === offline.code)).toMatchObject({
      started: false,
      active: false,
      running: false,
      waiting: true,
      progressStatus: "waiting",
      inactive: true,
      inactiveReasons: ["hostOffline"],
      hostConnected: false,
    });
    expect(summary.rooms.find((room) => room.code === ended.code)).toMatchObject({
      started: true,
      active: true,
      running: false,
      waiting: false,
      progressStatus: "ended",
      inactive: false,
      inactiveReasons: [],
      hostConnected: true,
    });
  });

  it("marks admin rooms inactive with both reasons and omits sensitive room data", () => {
    let now = 10_000_000;
    const manager = new RoomManager(new InMemoryRoomStore(), { now: () => now, roomTtlMs: 10 * ADMIN_INACTIVE_ACTIVITY_MS });
    const { room, clientToken: hostToken } = manager.createRoom("host-1", "werewolf");
    const { clientToken: playerToken } = manager.joinRoom(room.code, "Alex", "player-1");
    room.phase = "playing";
    room.hostClientId = null;
    room.lastActivityAt = now - ADMIN_INACTIVE_ACTIVITY_MS;
    room.gameState = createWerewolfGameFromAssignments(
      [
        { id: "wolf", name: "Wolf", roleId: "werewolf" },
        { id: "alex", name: "Alex", roleId: "villager" },
        { id: "sam", name: "Sam", roleId: "villager" },
        { id: "jordan", name: "Jordan", roleId: "villager" },
        { id: "taylor", name: "Taylor", roleId: "villager" },
      ],
      { winMode: "standard", revealMode: "role", roleReveal: false },
    );

    now += 1_000;
    const summary = manager.adminRoomsSummary();
    const adminRoom = summary.rooms.find((item) => item.code === room.code);
    const serializedSummary = JSON.stringify(summary);

    expect(adminRoom).toMatchObject({
      active: false,
      running: true,
      waiting: false,
      progressStatus: "running",
      inactive: true,
      inactiveReasons: ["hostOffline", "staleActivity"],
      playerCount: 1,
      connectedPlayerCount: 1,
    });
    expect(serializedSummary).not.toContain(hostToken);
    expect(serializedSummary).not.toContain(playerToken);
    expect(serializedSummary).not.toContain("Alex");
    expect(serializedSummary).not.toContain("hostToken");
    expect(serializedSummary).not.toContain("gameState");
    expect(serializedSummary).not.toContain("\"assignment\":[");
  });

  it("prunes expired rooms and treats expired sessions as invalid", () => {
    let now = 1_000;
    const manager = new RoomManager(new InMemoryRoomStore(), { now: () => now, roomTtlMs: 100 });
    const { room, clientToken } = manager.createRoom("host-1", "werewolf");

    now = 1_099;
    expect(manager.getRoom(room.code)).toBeTruthy();

    now = 1_100;
    expect(manager.inspectRoomSession(room.code, clientToken)).toEqual({ roomCode: room.code, valid: false });
    expect(manager.inspectRoom(room.code)).toMatchObject({ roomCode: room.code, exists: false, joinable: false });
    expect(manager.getRoom(room.code)).toBeUndefined();

    const { room: pruneRoom } = manager.createRoom("host-2", "werewolf");
    now += 100;
    expect(manager.pruneExpiredRooms().map((expired) => expired.code)).toEqual([pruneRoom.code]);
    expect(manager.listRooms()).toEqual([]);
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
