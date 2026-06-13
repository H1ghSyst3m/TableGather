export function resolveWsUrl() {
  const configured = import.meta.env.VITE_WS_URL as string | undefined;
  if (configured) {
    return configured.replace(/^http:/, "ws:").replace(/^https:/, "wss:");
  }

  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.hostname}:8787/ws`;
}

export function resolveRoomServerHttpUrl(path: string) {
  const url = new URL(resolveWsUrl(), window.location.href);
  url.protocol = url.protocol === "wss:" ? "https:" : "http:";
  url.pathname = path;
  url.search = "";
  url.hash = "";
  return url.toString();
}
