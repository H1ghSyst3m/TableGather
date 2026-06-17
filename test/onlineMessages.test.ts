import { describe, expect, it } from "vitest";
import { parseClientMessage } from "../src/online/messages";

describe("online messages", () => {
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
