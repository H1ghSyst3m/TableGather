export function normalizePlayerName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function playerNameKey(value: string) {
  return normalizePlayerName(value).toLowerCase();
}

export function hasDuplicatePlayerName(names: readonly string[], candidate: string) {
  const key = playerNameKey(candidate);
  return Boolean(key) && names.some((name) => playerNameKey(name) === key);
}
