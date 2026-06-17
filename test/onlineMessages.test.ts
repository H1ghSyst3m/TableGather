import { describe, expect, it } from "vitest";
import { parseClientMessage } from "../src/online/messages";

describe("online messages", () => {
  it("parses valid room lifecycle messages", () => {
    expect(parseClientMessage({ type: "createRoom", requestId: "create-1", payload: { gameId: "werewolf" } })).toEqual({
      type: "createRoom",
      requestId: "create-1",
      payload: { gameId: "werewolf" },
    });
    expect(parseClientMessage({ type: "joinRoom", requestId: "join-1", roomCode: "abcd", payload: { name: "Alex" } })).toEqual({
      type: "joinRoom",
      requestId: "join-1",
      roomCode: "abcd",
      payload: { name: "Alex" },
    });
    expect(parseClientMessage({ type: "resumeRoom", roomCode: "ABCD", clientToken: "TOKEN123" })).toEqual({
      type: "resumeRoom",
      roomCode: "ABCD",
      clientToken: "TOKEN123",
    });
    expect(parseClientMessage({ type: "leaveRoom", requestId: "leave-1", roomCode: "ABCD", clientToken: "TOKEN123" })).toEqual({
      type: "leaveRoom",
      requestId: "leave-1",
      roomCode: "ABCD",
      clientToken: "TOKEN123",
    });
  });

  it("rejects invalid room lifecycle message envelopes", () => {
    for (const message of [
      null,
      [],
      { type: 1 },
      { type: "createRoom", requestId: 1, payload: { gameId: "werewolf" } },
      { type: "createRoom" },
      { type: "createRoom", payload: null },
      { type: "createRoom", payload: { gameId: 123 } },
      { type: "joinRoom", payload: { name: "Alex" } },
      { type: "joinRoom", roomCode: 1234, payload: { name: "Alex" } },
      { type: "joinRoom", roomCode: "ABCD" },
      { type: "joinRoom", roomCode: "ABCD", payload: null },
      { type: "joinRoom", roomCode: "ABCD", payload: { name: 123 } },
      { type: "resumeRoom", clientToken: "TOKEN123" },
      { type: "resumeRoom", roomCode: "ABCD" },
      { type: "resumeRoom", roomCode: 1234, clientToken: "TOKEN123" },
      { type: "resumeRoom", roomCode: "ABCD", clientToken: 123 },
      { type: "leaveRoom", clientToken: "TOKEN123" },
      { type: "leaveRoom", roomCode: "ABCD" },
      { type: "leaveRoom", roomCode: 1234, clientToken: "TOKEN123" },
      { type: "leaveRoom", roomCode: "ABCD", clientToken: 123 },
    ]) {
      expect(parseClientMessage(message)).toBeNull();
    }
  });

  it("parses command envelopes for runtime command validation", () => {
    const hostCommand = {
      type: "hostCommand",
      requestId: "host-1",
      roomCode: "ABCD",
      clientToken: "TOKEN123",
      payload: { type: "setCupidTargets", playerIds: ["p1", "p2"] },
    };
    const playerCommand = {
      type: "playerCommand",
      requestId: "player-1",
      roomCode: "ABCD",
      clientToken: "TOKEN456",
      payload: { type: "markRoleSeen", extra: true },
    };

    expect(parseClientMessage(hostCommand)).toEqual(hostCommand);
    expect(parseClientMessage(playerCommand)).toEqual(playerCommand);
  });

  it("rejects invalid command envelopes", () => {
    for (const message of [
      { type: "hostCommand", requestId: 1, roomCode: "ABCD", clientToken: "TOKEN123", payload: { type: "resetToLobby" } },
      { type: "hostCommand", clientToken: "TOKEN123", payload: { type: "resetToLobby" } },
      { type: "hostCommand", roomCode: "ABCD", payload: { type: "resetToLobby" } },
      { type: "hostCommand", roomCode: 1234, clientToken: "TOKEN123", payload: { type: "resetToLobby" } },
      { type: "hostCommand", roomCode: "ABCD", clientToken: 123, payload: { type: "resetToLobby" } },
      { type: "hostCommand", roomCode: "ABCD", clientToken: "TOKEN123", payload: null },
      { type: "hostCommand", roomCode: "ABCD", clientToken: "TOKEN123", payload: { type: 123 } },
      { type: "playerCommand", requestId: 1, roomCode: "ABCD", clientToken: "TOKEN123", payload: { type: "markRoleSeen" } },
      { type: "playerCommand", clientToken: "TOKEN123", payload: { type: "markRoleSeen" } },
      { type: "playerCommand", roomCode: "ABCD", payload: { type: "markRoleSeen" } },
      { type: "playerCommand", roomCode: 1234, clientToken: "TOKEN123", payload: { type: "markRoleSeen" } },
      { type: "playerCommand", roomCode: "ABCD", clientToken: 123, payload: { type: "markRoleSeen" } },
      { type: "playerCommand", roomCode: "ABCD", clientToken: "TOKEN123", payload: [] },
      { type: "playerCommand", roomCode: "ABCD", clientToken: "TOKEN123", payload: { type: 123 } },
    ]) {
      expect(parseClientMessage(message)).toBeNull();
    }
  });

  it("parses valid room inspection messages", () => {
    expect(parseClientMessage({ type: "inspectRoom", roomCode: "abcd" })).toEqual({ type: "inspectRoom", roomCode: "abcd" });
    expect(parseClientMessage({ type: "inspectRoom", requestId: "lookup-1", roomCode: "ABCD" })).toEqual({
      type: "inspectRoom",
      requestId: "lookup-1",
      roomCode: "ABCD",
    });
  });

  it("rejects invalid room inspection messages", () => {
    expect(parseClientMessage({ type: "inspectRoom" })).toBeNull();
    expect(parseClientMessage({ type: "inspectRoom", roomCode: 1234 })).toBeNull();
    expect(parseClientMessage({ type: "inspectRoom", requestId: 1, roomCode: "ABCD" })).toBeNull();
  });

  it("parses valid room session inspection messages", () => {
    expect(parseClientMessage({ type: "inspectRoomSession", roomCode: "abcd", clientToken: "TOKEN123" })).toEqual({
      type: "inspectRoomSession",
      roomCode: "abcd",
      clientToken: "TOKEN123",
    });
    expect(parseClientMessage({ type: "inspectRoomSession", requestId: "session-1", roomCode: "ABCD", clientToken: "TOKEN123" })).toEqual({
      type: "inspectRoomSession",
      requestId: "session-1",
      roomCode: "ABCD",
      clientToken: "TOKEN123",
    });
  });

  it("rejects invalid room session inspection messages", () => {
    expect(parseClientMessage({ type: "inspectRoomSession", clientToken: "TOKEN123" })).toBeNull();
    expect(parseClientMessage({ type: "inspectRoomSession", roomCode: "ABCD" })).toBeNull();
    expect(parseClientMessage({ type: "inspectRoomSession", roomCode: 1234, clientToken: "TOKEN123" })).toBeNull();
    expect(parseClientMessage({ type: "inspectRoomSession", roomCode: "ABCD", clientToken: 123 })).toBeNull();
    expect(parseClientMessage({ type: "inspectRoomSession", requestId: 1, roomCode: "ABCD", clientToken: "TOKEN123" })).toBeNull();
  });

  it("parses valid stage inspection messages", () => {
    expect(parseClientMessage({ type: "inspectStage", roomCode: "ABCD", stageToken: "TOKEN123" })).toEqual({
      type: "inspectStage",
      roomCode: "ABCD",
      stageToken: "TOKEN123",
    });
    expect(parseClientMessage({ type: "inspectStage", requestId: "stage-lookup-1", roomCode: "ABCD", stageToken: "TOKEN123" })).toEqual({
      type: "inspectStage",
      requestId: "stage-lookup-1",
      roomCode: "ABCD",
      stageToken: "TOKEN123",
    });
  });

  it("rejects invalid stage inspection messages", () => {
    expect(parseClientMessage({ type: "inspectStage", stageToken: "TOKEN123" })).toBeNull();
    expect(parseClientMessage({ type: "inspectStage", roomCode: "ABCD" })).toBeNull();
    expect(parseClientMessage({ type: "inspectStage", roomCode: 1234, stageToken: "TOKEN123" })).toBeNull();
    expect(parseClientMessage({ type: "inspectStage", roomCode: "ABCD", stageToken: 123 })).toBeNull();
    expect(parseClientMessage({ type: "inspectStage", requestId: 123, roomCode: "ABCD", stageToken: "TOKEN123" })).toBeNull();
  });

  it("parses valid stage join messages", () => {
    expect(parseClientMessage({ type: "joinStage", roomCode: "ABCD", stageToken: "TOKEN123" })).toEqual({
      type: "joinStage",
      roomCode: "ABCD",
      stageToken: "TOKEN123",
    });
    expect(parseClientMessage({ type: "joinStage", requestId: "stage-1", roomCode: "ABCD", stageToken: "TOKEN123" })).toEqual({
      type: "joinStage",
      requestId: "stage-1",
      roomCode: "ABCD",
      stageToken: "TOKEN123",
    });
  });

  it("rejects invalid stage join messages", () => {
    expect(parseClientMessage({ type: "joinStage", stageToken: "TOKEN123" })).toBeNull();
    expect(parseClientMessage({ type: "joinStage", roomCode: "ABCD" })).toBeNull();
    expect(parseClientMessage({ type: "joinStage", roomCode: "ABCD", stageToken: 123 })).toBeNull();
    expect(parseClientMessage({ type: "joinStage", requestId: 123, roomCode: "ABCD", stageToken: "TOKEN123" })).toBeNull();
  });
});
