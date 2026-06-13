export function resolveWsUrl() {
  const configured = import.meta.env.VITE_WS_URL as string | undefined;
  if (configured) {
    return configured.replace(/^http:/, "ws:").replace(/^https:/, "wss:");
  }

  const location = browserLocation();
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${location.hostname}:8787/ws`;
}

export function resolveRoomServerHttpUrl(path: string) {
  const url = new URL(resolveWsUrl(), browserLocation().href);
  url.protocol = url.protocol === "wss:" ? "https:" : "http:";
  url.pathname = resolveRoomServerHttpPath(url.pathname, path);
  url.search = "";
  url.hash = "";
  return url.toString();
}

function resolveRoomServerHttpPath(wsPath: string, path: string) {
  const trimmedWsPath = wsPath.replace(/\/+$/, "");
  const parentPath = trimmedWsPath.replace(/\/[^/]*$/, "");
  const normalizedParent = parentPath === "/" ? "" : parentPath;
  const normalizedPath = `/${path.replace(/^\/+/, "")}`;
  return `${normalizedParent}${normalizedPath}`;
}

function browserLocation() {
  return (globalThis as unknown as { window: { location: { protocol: string; hostname: string; href: string } } }).window.location;
}
