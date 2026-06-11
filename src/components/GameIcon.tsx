import { Shield, UserRoundSearch, VenetianMask } from "lucide-react";
import { gameThemeStyle, resolveGameTheme } from "../games/theme";
import type { GameDefinition } from "../games/types";

export function GameIcon({ game, size = "normal" }: { game: GameDefinition; size?: "normal" | "large" }) {
  const Icon = game.icon === "shield" ? Shield : game.icon === "mask" ? VenetianMask : UserRoundSearch;
  const theme = resolveGameTheme(game);

  return (
    <span className={`game-icon game-icon-${game.id} game-icon-${size}`} style={gameThemeStyle(game)} aria-hidden="true">
      {theme.assets.icon ? <img src={theme.assets.icon} alt="" /> : <Icon />}
    </span>
  );
}
