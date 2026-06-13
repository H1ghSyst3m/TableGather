export const ADMIN_TOKEN_STORAGE_KEY = "tablegather.adminToken";

export function readInitialAdminToken() {
  return readUrlAdminToken() ?? readStoredAdminToken();
}

export function readUrlAdminToken() {
  if (typeof window === "undefined") return null;
  const token = new URLSearchParams(window.location.search).get("token")?.trim();
  return token || null;
}

export function clearUrlAdminToken() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has("token")) return;
  url.searchParams.delete("token");
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

export function readStoredAdminToken() {
  if (typeof sessionStorage === "undefined") return null;
  try {
    return sessionStorage.getItem(ADMIN_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveAdminToken(token: string) {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token);
  } catch {
    // Session storage is only a convenience for the admin view.
  }
}

export function forgetAdminToken() {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
  } catch {
    // Session storage is only a convenience for the admin view.
  }
}

export function normalizeAdminTokenInput(value: string) {
  const token = value.trim();
  return token || null;
}

export function submitAdminTokenInput(value: string, onTokenAccepted: (token: string) => void) {
  const token = normalizeAdminTokenInput(value);
  if (!token) return false;

  saveAdminToken(token);
  onTokenAccepted(token);
  return true;
}
