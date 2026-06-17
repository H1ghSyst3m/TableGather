import { describe, expect, it } from "vitest";
import { games, requirePlayableGame, requireRoomAdapter } from "../src/games/registry";
import { gameThemeStyle, hubDarkTheme, hubDefaultTheme, resolveGameTheme } from "../src/games/theme";
import type { GameDefinition } from "../src/games/types";

describe("game registry", () => {
  it("registers Werewolf as the only playable V1 game", () => {
    expect(requirePlayableGame("werewolf").id).toBe("werewolf");
    expect(games.filter((game) => game.status === "playable").map((game) => game.id)).toEqual(["werewolf"]);
    expect(requireRoomAdapter("werewolf")).toBeTruthy();
  });

  it("keeps future games visible but unavailable", () => {
    expect(games.find((game) => game.id === "imposter")?.status).toBe("coming-soon");
    expect(games.find((game) => game.id === "undercover")?.status).toBe("coming-soon");
    expect(() => requirePlayableGame("imposter")).toThrow("not playable");
    expect(() => requireRoomAdapter("undercover")).toThrow("not playable");
  });

  it("exposes numeric player constraints for every registered game", () => {
    const expectedConstraints = {
      werewolf: { min: 5, default: 5 },
      imposter: { min: 4, default: 4, max: 12 },
      undercover: { min: 4, default: 4, max: 20 },
    } satisfies Record<string, GameDefinition["playerConstraints"]>;

    expect(games).toHaveLength(Object.keys(expectedConstraints).length);
    for (const [gameId, playerConstraints] of Object.entries(expectedConstraints)) {
      expect(games.find((game) => game.id === gameId)?.playerConstraints).toEqual(playerConstraints);
    }
  });

  it("falls back to the hub theme for games without custom theme tokens", () => {
    const imposter = games.find((game) => game.id === "imposter");
    const werewolf = games.find((game) => game.id === "werewolf");

    expect(resolveGameTheme(imposter).accent).toBe(hubDefaultTheme.accent);
    expect(resolveGameTheme(werewolf).mood).toBe("sleek night");
  });

  it("exposes extended hub and dark theme tokens", () => {
    expect(hubDefaultTheme.text).toBe("#0c1b22");
    expect(hubDarkTheme.background).toBe("#071114");
    expect(gameThemeStyle(null)).toMatchObject({
      "--text": hubDefaultTheme.text,
      "--card-bg": hubDefaultTheme.cardBackground,
      "--danger": hubDefaultTheme.danger,
    });
  });

  it("merges game assets after theme assets", () => {
    const themedGame = {
      theme: {
        accent: "#111111",
        assets: {
          logo: "/theme-logo.svg",
          icon: "/theme-icon.svg",
          roleIcons: {
            seer: "/theme-seer.svg",
          },
        },
      },
      assets: {
        icon: "/game-icon.svg",
        roleIcons: {
          werewolf: "/game-wolf.svg",
        },
      },
    } satisfies Pick<GameDefinition, "theme" | "assets">;

    const theme = resolveGameTheme(themedGame);

    expect(theme.accent).toBe("#111111");
    expect(theme.assets.logo).toBe("/theme-logo.svg");
    expect(theme.assets.icon).toBe("/game-icon.svg");
    expect(theme.assets.roleIcons).toEqual({
      seer: "/theme-seer.svg",
      werewolf: "/game-wolf.svg",
    });
  });
});
