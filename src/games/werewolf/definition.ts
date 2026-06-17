import type { GameDefinition } from "../types";
import { werewolfHostCommandTypes, werewolfPlayerCommandTypes } from "./commands";
import { werewolfDe } from "./i18n/de";
import { werewolfEn } from "./i18n/en";
import { createWerewolfSetupState, werewolfRoomAdapter } from "./roomAdapter";
import { werewolfTheme } from "./theme";

export const werewolfDefinition = {
  id: "werewolf",
  titleKey: "games.werewolf",
  descriptionKey: "hub.werewolfDescription",
  status: "playable",
  icon: "shield",
  supportedModes: ["room", "pass-and-play"],
  playerRange: "5+",
  playerConstraints: { min: 5, default: 5 },
  duration: "20-40 min",
  difficultyKey: "games.medium",
  setup: {
    createInitialState: createWerewolfSetupState,
  },
  hostCommands: werewolfHostCommandTypes,
  playerCommands: werewolfPlayerCommandTypes,
  reducer: "werewolfRoomAdapter",
  roomAdapter: werewolfRoomAdapter,
  components: {
    localPlay: "werewolf.localPlay",
    roomHost: "werewolf.roomHost",
    roomPlayer: "werewolf.roomPlayer",
    stage: "werewolf.stage",
  },
  i18n: {
    en: werewolfEn,
    de: werewolfDe,
  },
  theme: werewolfTheme,
} satisfies GameDefinition;
