import type { GameThemeTokens } from "../types";

const werewolfMark = new URL("./assets/werewolf-mark.png", import.meta.url).href;

export const werewolfTheme = {
  name: "Werewolf",
  mood: "sleek night",
  accent: "#3bd7f0",
  accentStrong: "#84efff",
  accentSoft: "rgba(59, 215, 240, 0.14)",
  surface: "#071626",
  background: "#020a13",
  appBackground: "#04111f",
  cardBackground: "#0b1b2d",
  text: "#f4f9ff",
  muted: "#8fa8c2",
  border: "rgba(123, 181, 218, 0.22)",
  danger: "#e45d7a",
  shadow: "0 10px 26px rgba(0, 0, 0, 0.2)",
  assets: {
    icon: werewolfMark,
    logo: werewolfMark,
  },
} satisfies GameThemeTokens;
