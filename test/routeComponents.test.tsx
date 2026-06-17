import { describe, expect, it } from "vitest";
import { games } from "../src/games/registry";
import {
  resolveLocalPlayRouteComponent,
  resolveRoomHostRouteComponent,
  resolveRoomPlayerRouteComponent,
  resolveStageRouteComponent,
} from "../src/games/routeComponents";

describe("game route components", () => {
  it("keeps route components aligned with playable game capabilities", () => {
    for (const game of games) {
      const playable = game.status === "playable";
      const supportsLocalPlay = game.supportedModes.includes("pass-and-play");
      const supportsRoom = game.supportedModes.includes("room");
      const supportsStage = Boolean(game.roomAdapter?.stageSnapshot);

      expect(Boolean(resolveLocalPlayRouteComponent(game.id))).toBe(playable && supportsLocalPlay && Boolean(game.components.localPlay));
      expect(Boolean(resolveRoomHostRouteComponent(game.id))).toBe(playable && supportsRoom && Boolean(game.components.roomHost) && Boolean(game.roomAdapter));
      expect(Boolean(resolveRoomPlayerRouteComponent(game.id))).toBe(playable && supportsRoom && Boolean(game.components.roomPlayer) && Boolean(game.roomAdapter));
      expect(Boolean(resolveStageRouteComponent(game.id))).toBe(playable && supportsRoom && supportsStage && Boolean(game.components.stage));
    }
  });

  it("does not resolve route components for coming-soon games", () => {
    expect(resolveLocalPlayRouteComponent("undercover")).toBeNull();
    expect(resolveRoomHostRouteComponent("undercover")).toBeNull();
    expect(resolveRoomPlayerRouteComponent("imposter")).toBeNull();
    expect(resolveStageRouteComponent("undercover")).toBeNull();
  });
});
