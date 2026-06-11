export type StoredRoomSessionRole = "host" | "player";

export interface StoredRoomSession {
  roomCode: string;
  role: StoredRoomSessionRole;
  token: string;
}

const currentHostRoomKey = "tablegather-current-host-room";
const roomSessionKeyPattern = /^tablegather-room-([A-Z0-9]{4})-(host|player)$/;

export function getStoredHostRoomToken(code: string) {
  return readStorage()?.getItem(hostRoomStorageKey(code)) ?? null;
}

export function getStoredPlayerRoomToken(code: string) {
  return readStorage()?.getItem(playerRoomStorageKey(code)) ?? null;
}

export function saveHostRoomSession(code: string, token: string) {
  const storage = readStorage();
  if (!storage) return;
  const roomCode = normalizeRoomCode(code);
  storage.setItem(hostRoomStorageKey(roomCode), token);
  storage.removeItem(playerRoomStorageKey(roomCode));
  storage.setItem(currentHostRoomKey, roomCode);
}

export function savePlayerRoomSession(code: string, token: string) {
  const storage = readStorage();
  if (!storage) return;
  storage.setItem(playerRoomStorageKey(code), token);
}

export function removeHostRoomSession(code: string) {
  const storage = readStorage();
  if (!storage) return;
  const roomCode = normalizeRoomCode(code);
  storage.removeItem(hostRoomStorageKey(roomCode));
  if (storage.getItem(currentHostRoomKey) === roomCode) storage.removeItem(currentHostRoomKey);
}

export function removePlayerRoomSession(code: string) {
  readStorage()?.removeItem(playerRoomStorageKey(code));
}

export function removeStoredRoomSession(session: StoredRoomSession) {
  if (session.role === "host") {
    removeHostRoomSession(session.roomCode);
    return;
  }

  removePlayerRoomSession(session.roomCode);
}

export function removeRoomSessions(code: string) {
  removeHostRoomSession(code);
  removePlayerRoomSession(code);
}

export function listStoredRoomSessions() {
  const storage = readStorage();
  if (!storage) return [];

  const byRoom = new Map<string, StoredRoomSession>();
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key) continue;

    const match = key.match(roomSessionKeyPattern);
    if (!match) continue;

    const [, roomCode, role] = match as [string, string, StoredRoomSessionRole];
    const token = storage.getItem(key);
    if (!token) continue;

    const existing = byRoom.get(roomCode);
    if (existing?.role === "host") continue;
    if (role === "player" && existing) continue;
    byRoom.set(roomCode, { roomCode, role, token });
  }

  return Array.from(byRoom.values()).sort((first, second) => first.roomCode.localeCompare(second.roomCode));
}

function hostRoomStorageKey(code: string) {
  return `tablegather-room-${normalizeRoomCode(code)}-host`;
}

function playerRoomStorageKey(code: string) {
  return `tablegather-room-${normalizeRoomCode(code)}-player`;
}

function normalizeRoomCode(code: string) {
  return code.trim().toUpperCase();
}

function readStorage() {
  return typeof localStorage === "undefined" ? null : localStorage;
}
