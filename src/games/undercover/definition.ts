import type { GameDefinition } from "../types";

export const undercoverDefinition = {
  id: "undercover",
  titleKey: "games.undercover",
  descriptionKey: "hub.undercoverDescription",
  status: "coming-soon",
  icon: "spy",
  supportedModes: ["room", "pass-and-play"],
  playerRange: "4-20",
  playerConstraints: { min: 4, default: 4, max: 20 },
  duration: "10-30 min",
  difficultyKey: "games.easy",
  setup: {
    createInitialState: () => ({}),
  },
  hostCommands: [],
  playerCommands: [],
  reducer: "unavailable",
  components: {},
  i18n: {},
} satisfies GameDefinition;
