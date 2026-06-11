import { useEffect, useRef, useState } from "react";

export function useSyncedNow(serverTime?: number, active = false) {
  const offsetRef = useRef(0);
  const [now, setNow] = useState(() => serverTime ?? Date.now());

  useEffect(() => {
    offsetRef.current = serverTime === undefined ? 0 : serverTime - Date.now();
  }, [serverTime]);

  useEffect(() => {
    if (!active) return;
    const syncNow = () => setNow(Date.now() + offsetRef.current);
    const timeout = setTimeout(syncNow, 0);
    const interval = setInterval(syncNow, 500);
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [active]);

  return now;
}
