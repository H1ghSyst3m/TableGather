export const ADMIN_TOKEN_STORAGE_KEY = "tablegather.adminToken";

type AdminTokenWindow = {
  location: { href: string; hash: string };
  history: { replaceState: (state: unknown, title: string, url?: string | URL | null) => void };
};

export function readInitialAdminToken() {
  return readUrlAdminToken() ?? readStoredAdminToken();
}

export function readUrlAdminToken() {
  const browserWindow = adminTokenWindow();
  if (!browserWindow) return null;
  const token = adminTokenHashParams(browserWindow.location.hash).get("token")?.trim();
  return token || null;
}

export function clearUrlAdminToken() {
  const browserWindow = adminTokenWindow();
  if (!browserWindow) return;
  const url = new URL(browserWindow.location.href);
  const params = adminTokenHashParams(url.hash);
  if (!params.has("token")) return;
  params.delete("token");
  const nextHash = params.toString();
  browserWindow.history.replaceState({}, "", `${url.pathname}${url.search}${nextHash ? `#${nextHash}` : ""}`);
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

function adminTokenHashParams(hash: string) {
  return new URLSearchParams(hash.replace(/^#/, ""));
}

function adminTokenWindow() {
  return (globalThis as unknown as { window?: AdminTokenWindow }).window ?? null;
}
