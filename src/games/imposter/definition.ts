import type { GameDefinition } from "../types";

export const imposterDefinition = {
  id: "imposter",
  titleKey: "games.imposter",
  descriptionKey: "hub.imposterDescription",
  status: "coming-soon",
  icon: "mask",
  supportedModes: ["room", "pass-and-play"],
  playerRange: "4-12",
  duration: "10-20 min",
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
