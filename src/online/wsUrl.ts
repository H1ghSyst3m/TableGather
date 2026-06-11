export function resolveWsUrl() {
  const configured = import.meta.env.VITE_WS_URL as string | undefined;
  if (configured) {
    return configured.replace(/^http:/, "ws:").replace(/^https:/, "wss:");
  }

  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.hostname}:8787/ws`;
}
