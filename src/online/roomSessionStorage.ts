export type StoredRoomSessionRole = "host" | "player";

export interface StoredRoomSession {
  roomCode: string;
  role: StoredRoomSessionRole;
  token: string;
}

const currentHostRoomKey = "tablegather-current-host-room";
const roomSessionKeyPattern = /^tablegather-room-([A-Z0-9]{4})-(host|player)$/;
const roleSortOrder: Record<StoredRoomSessionRole, number> = {
  host: 0,
  player: 1,
};

type StorageErrorLogger = (error: unknown) => void;

export function getStoredHostRoomToken(code: string) {
  const storage = readStorage();
  return storage ? safeGet(storage, hostRoomStorageKey(code)) : null;
}

export function getStoredPlayerRoomToken(code: string) {
  const storage = readStorage();
  return storage ? safeGet(storage, playerRoomStorageKey(code)) : null;
}

export function saveHostRoomSession(code: string, token: string) {
  const storage = readStorage();
  if (!storage) return;
  const roomCode = normalizeRoomCode(code);
  if (!safeSet(storage, hostRoomStorageKey(roomCode), token)) return;
  safeRemove(storage, playerRoomStorageKey(roomCode));
  safeSet(storage, currentHostRoomKey, roomCode);
}

export function savePlayerRoomSession(code: string, token: string) {
  const storage = readStorage();
  if (!storage) return;
  safeSet(storage, playerRoomStorageKey(code), token);
}

export function removeHostRoomSession(code: string) {
  const storage = readStorage();
  if (!storage) return;
  const roomCode = normalizeRoomCode(code);
  safeRemove(storage, hostRoomStorageKey(roomCode));
  if (safeGet(storage, currentHostRoomKey) === roomCode) safeRemove(storage, currentHostRoomKey);
}

export function removePlayerRoomSession(code: string) {
  const storage = readStorage();
  if (!storage) return;
  safeRemove(storage, playerRoomStorageKey(code));
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

export function listStoredRoomSessionCandidates() {
  const storage = readStorage();
  if (!storage) return [];

  const length = safeLength(storage);
  if (length === null) return [];

  const sessions: StoredRoomSession[] = [];
  for (let index = 0; index < length; index += 1) {
    const key = safeKey(storage, index);
    if (!key) continue;

    const match = key.match(roomSessionKeyPattern);
    if (!match) continue;

    const [, roomCode, role] = match as [string, string, StoredRoomSessionRole];
    const token = safeGet(storage, key);
    if (!token) continue;

    sessions.push({ roomCode, role, token });
  }

  return sortStoredSessions(sessions);
}

export function listStoredRoomSessions() {
  const byRoom = new Map<string, StoredRoomSession>();
  for (const session of listStoredRoomSessionCandidates()) {
    const { roomCode, role } = session;
    const existing = byRoom.get(roomCode);
    if (existing?.role === "host") continue;
    if (role === "player" && existing) continue;
    byRoom.set(roomCode, session);
  }

  return sortStoredSessions(Array.from(byRoom.values()));
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

function sortStoredSessions(sessions: StoredRoomSession[]) {
  return [...sessions].sort((first, second) => {
    const roomOrder = first.roomCode.localeCompare(second.roomCode);
    return roomOrder === 0 ? roleSortOrder[first.role] - roleSortOrder[second.role] : roomOrder;
  });
}

function safeGet(storage: Storage, key: string, onError?: StorageErrorLogger) {
  try {
    return storage.getItem(key);
  } catch (error) {
    onError?.(error);
    return null;
  }
}

function safeSet(storage: Storage, key: string, value: string, onError?: StorageErrorLogger) {
  try {
    storage.setItem(key, value);
    return true;
  } catch (error) {
    onError?.(error);
    return false;
  }
}

function safeRemove(storage: Storage, key: string, onError?: StorageErrorLogger) {
  try {
    storage.removeItem(key);
    return true;
  } catch (error) {
    onError?.(error);
    return false;
  }
}

function safeKey(storage: Storage, index: number, onError?: StorageErrorLogger) {
  try {
    return storage.key(index);
  } catch (error) {
    onError?.(error);
    return null;
  }
}

function safeLength(storage: Storage, onError?: StorageErrorLogger) {
  try {
    return storage.length;
  } catch (error) {
    onError?.(error);
    return null;
  }
}

function readStorage(onError?: StorageErrorLogger) {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch (error) {
    onError?.(error);
    return null;
  }
}
