export const ROOM_CODE_LENGTH = 6;

export function normalizeRoomCode(code: string) {
  return code.trim().toUpperCase();
}

export function normalizeRoomCodeInput(value: string) {
  const routeMatch = value.match(/(?:^|\/)room\/([^/?#]*)/i);
  if (routeMatch) return sanitizeRoomCodeInput(routeMatch[1]);
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return "";

  return sanitizeRoomCodeInput(value);
}

function sanitizeRoomCodeInput(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, ROOM_CODE_LENGTH);
}

export function isCompleteRoomCode(code: string) {
  return normalizeRoomCode(code).length === ROOM_CODE_LENGTH;
}
