export const ROOM_CODE_LENGTH = 6;

export function normalizeRoomCode(code: string) {
  return code.trim().toUpperCase();
}

export function normalizeRoomCodeInput(value: string) {
  const upperValue = value.toUpperCase();
  const routeMatch = upperValue.match(new RegExp(`(?:^|/)ROOM/([A-Z0-9]{1,${ROOM_CODE_LENGTH}})(?:$|[/?#])`));
  if (routeMatch) return routeMatch[1];

  return upperValue.replace(/[^A-Z0-9]/g, "").slice(0, ROOM_CODE_LENGTH);
}

export function isCompleteRoomCode(code: string) {
  return normalizeRoomCode(code).length === ROOM_CODE_LENGTH;
}
