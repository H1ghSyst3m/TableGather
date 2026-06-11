import type { CSSProperties } from "react";
import type { GameAssetSlots, GameDefinition, GameThemeTokens } from "./types";

export type ResolvedGameTheme = Required<Omit<GameThemeTokens, "dark">> & {
  dark?: Omit<GameThemeTokens, "dark">;
};

const hubDefaultAssets: GameAssetSlots = {};

export const hubDefaultTheme = {
  name: "Hub",
  mood: "table",
  accent: "#00615d",
  accentStrong: "#004d49",
  accentSoft: "#dcefed",
  surface: "#ffffff",
  background: "#f8f7f4",
  appBackground: "rgba(255, 255, 255, 0.96)",
  cardBackground: "#ffffff",
  text: "#0c1b22",
  muted: "#62717d",
  border: "#ddd8cf",
  danger: "#d95d45",
  shadow: "0 14px 36px rgba(10, 28, 35, 0.08)",
  assets: hubDefaultAssets,
} satisfies ResolvedGameTheme;

export const hubDarkTheme = {
  ...hubDefaultTheme,
  name: "Hub Dark",
  accent: "#34d2c6",
  accentStrong: "#8bf0e8",
  accentSoft: "rgba(52, 210, 198, 0.16)",
  surface: "#102126",
  background: "#071114",
  appBackground: "rgba(8, 18, 21, 0.98)",
  cardBackground: "#102126",
  text: "#eef8f7",
  muted: "#9fb2b8",
  border: "rgba(180, 204, 208, 0.22)",
  danger: "#ff8b72",
  shadow: "0 18px 42px rgba(0, 0, 0, 0.28)",
} satisfies ResolvedGameTheme;

export function resolveGameTheme(game?: Pick<GameDefinition, "theme" | "assets"> | null) {
  const themeAssets = game?.theme?.assets ?? {};
  const gameAssets = game?.assets ?? {};

  return {
    ...hubDefaultTheme,
    ...(game?.theme ?? {}),
    assets: {
      ...hubDefaultTheme.assets,
      ...themeAssets,
      ...gameAssets,
      roleIcons: {
        ...(hubDefaultTheme.assets.roleIcons ?? {}),
        ...(themeAssets.roleIcons ?? {}),
        ...(gameAssets.roleIcons ?? {}),
      },
    },
  } satisfies ResolvedGameTheme;
}

export function gameThemeStyle(game?: Pick<GameDefinition, "theme" | "assets"> | null): CSSProperties {
  const theme = resolveGameTheme(game);

  return {
    "--accent": theme.accent,
    "--accent-strong": theme.accentStrong,
    "--accent-soft": theme.accentSoft,
    "--surface": theme.surface,
    "--surface-tint": theme.background,
    "--app-bg": theme.appBackground,
    "--card-bg": theme.cardBackground,
    "--text": theme.text,
    "--muted": theme.muted,
    "--border": theme.border,
    "--danger": theme.danger,
    "--shadow": theme.shadow,
  } as CSSProperties;
}

export function gameThemeClassName(game?: Pick<GameDefinition, "id" | "theme" | "assets"> | null) {
  const theme = resolveGameTheme(game);
  const idClass = game && "id" in game ? `game-theme-${game.id}` : "game-theme-hub";

  return `${idClass} game-mood-${theme.mood.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
}
