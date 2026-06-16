export const MAX_PLAYER_NAME_LENGTH = 32;

export function normalizePlayerName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export type PlayerNameValidationError = "required" | "tooLong";

export function validatePlayerName(value: string): { name: string; error: PlayerNameValidationError | null } {
  const name = normalizePlayerName(value);
  if (!name) return { name, error: "required" };
  if (name.length > MAX_PLAYER_NAME_LENGTH) return { name, error: "tooLong" };
  return { name, error: null };
}

export function playerNameKey(value: string) {
  return normalizePlayerName(value).toLowerCase();
}

export function hasDuplicatePlayerName(names: readonly string[], candidate: string) {
  const key = playerNameKey(candidate);
  return Boolean(key) && names.some((name) => playerNameKey(name) === key);
}
