import {
  BadgeHelp,
  Bed,
  Biohazard,
  Cross,
  Dumbbell,
  Eye,
  EyeOff,
  FlaskConical,
  Heart,
  Home,
  Link2,
  Moon,
  PartyPopper,
  Search,
  Shield,
  Skull,
  Sparkles,
  Sprout,
  Sun,
  Target,
  type LucideIcon,
} from "lucide-react";
import { roleDefinitions } from "../domain/roles";
import type { RoleId } from "../domain/types";
import { resolveGameTheme } from "../../theme";
import { werewolfTheme } from "../theme";

export type WerewolfActionIconId =
  | "aura"
  | "dawn"
  | "detective"
  | "evil"
  | "good"
  | "heal"
  | "info"
  | "inspect"
  | "kill"
  | "noDeath"
  | "poison"
  | "protect"
  | "sleep"
  | "transform";

export type WerewolfStatusIconId = "alive" | "connected" | "disconnected" | "eliminated" | "lover" | "ready" | "waiting";

const roleIconMap: Record<string, LucideIcon> = {
  "badge-help": BadgeHelp,
  bed: Bed,
  biohazard: Biohazard,
  cross: Cross,
  dumbbell: Dumbbell,
  eye: Eye,
  "eye-off": EyeOff,
  flask: FlaskConical,
  heart: Heart,
  home: Home,
  link: Link2,
  moon: Moon,
  "moon-star": Moon,
  "party-popper": PartyPopper,
  search: Search,
  shield: Shield,
  sparkles: Sparkles,
  sprout: Sprout,
  target: Target,
};

const actionIconMap: Record<WerewolfActionIconId, LucideIcon> = {
  aura: Sparkles,
  dawn: Sun,
  detective: Search,
  evil: Skull,
  good: Shield,
  heal: Heart,
  info: BadgeHelp,
  inspect: Eye,
  kill: Skull,
  noDeath: Shield,
  poison: FlaskConical,
  protect: Shield,
  sleep: Moon,
  transform: Moon,
};

const statusIconMap: Record<WerewolfStatusIconId, LucideIcon> = {
  alive: Heart,
  connected: Link2,
  disconnected: Cross,
  eliminated: Skull,
  lover: Heart,
  ready: Shield,
  waiting: EyeOff,
};

const werewolfAssets = resolveGameTheme({ theme: werewolfTheme }).assets;

export function RoleIconChip({ roleId, className = "" }: { roleId: RoleId; className?: string }) {
  const role = roleDefinitions[roleId] ?? roleDefinitions.villager;
  const Icon = roleIconMap[role.icon] ?? Shield;
  const roleAsset = werewolfAssets.roleIcons?.[roleId];

  return (
    <span className={["role-icon-chip", className].filter(Boolean).join(" ")} aria-hidden="true">
      {roleAsset ? <img src={roleAsset} alt="" /> : <Icon />}
    </span>
  );
}

export function ActionIconChip({ icon, className = "" }: { icon: WerewolfActionIconId; className?: string }) {
  const Icon = actionIconMap[icon];

  return (
    <span className={["werewolf-action-icon", className].filter(Boolean).join(" ")} aria-hidden="true">
      <Icon />
    </span>
  );
}

export function StatusIconChip({ icon, className = "" }: { icon: WerewolfStatusIconId; className?: string }) {
  const Icon = statusIconMap[icon];

  return (
    <span className={["werewolf-status-icon", className].filter(Boolean).join(" ")} aria-hidden="true">
      <Icon />
    </span>
  );
}
