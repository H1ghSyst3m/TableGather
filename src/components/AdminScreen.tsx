import { AlertTriangle, CheckCircle2, Clock3, Gamepad2, RefreshCw, ShieldAlert, ShieldCheck, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { games } from "../games/registry";
import { gameThemeStyle, hubDefaultTheme } from "../games/theme";
import { useI18n } from "../i18n/useI18n";
import type { TranslationKey } from "../i18n/translations";
import type { AdminInactiveReason, AdminRoomsSummary, AdminRoomSummary } from "../online/admin";
import { adminGameIds, adminRoomPhases } from "../online/admin";
import type { RoomServerInfo } from "../online/protocol";
import { resolveRoomServerHttpUrl } from "../online/wsUrl";
import type { GameId, RoomPhase } from "../types";
import { HeaderBar } from "./HeaderBar";

const ADMIN_TOKEN_STORAGE_KEY = "tablegather.adminToken";
const ADMIN_REFRESH_INTERVAL_MS = 15_000;

type AdminFilter = "all" | "inactive" | "started";
type AdminFetchErrorCode = "disabled" | "unauthorized" | "connection";
type AdminRoomsResponse = { ok: true } & AdminRoomsSummary & RoomServerInfo;

export function AdminScreen() {
  const { locale, t } = useI18n();
  const [token, setToken] = useState(readInitialAdminToken);
  const [summary, setSummary] = useState<AdminRoomsSummary | null>(null);
  const [filter, setFilter] = useState<AdminFilter>("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AdminFetchErrorCode | null>(null);
  const [lastLoadedAt, setLastLoadedAt] = useState<number | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const queryToken = readUrlAdminToken();
    if (!queryToken) return;

    saveAdminToken(queryToken);
    clearUrlAdminToken();
  }, []);

  const refresh = useCallback(async () => {
    if (!token) return;

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setError(null);

    try {
      const nextSummary = await fetchAdminRooms(token);
      if (requestIdRef.current !== requestId) return;
      setSummary(nextSummary);
      setLastLoadedAt(Date.now());
    } catch (fetchError) {
      if (requestIdRef.current !== requestId) return;
      const code = fetchError instanceof AdminFetchError ? fetchError.code : "connection";
      setError(code);
      if (code === "unauthorized" || code === "disabled") {
        forgetAdminToken();
        setToken(null);
      }
    } finally {
      if (requestIdRef.current === requestId) setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const timer = window.setTimeout(refresh, 0);
    return () => window.clearTimeout(timer);
  }, [refresh, token]);

  useEffect(() => {
    if (!token) return;
    const interval = window.setInterval(refresh, ADMIN_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [refresh, token]);

  const canRefresh = Boolean(token && !loading);

  return (
    <main className="app-frame admin-screen" style={gameThemeStyle({ theme: hubDefaultTheme })}>
      <HeaderBar />

      <section className="section-block admin-heading-section">
        <div className="admin-heading">
          <div>
            <p className="section-label">Admin</p>
            <h2>{t("admin.title")}</h2>
            <p>{t("admin.description")}</p>
            {lastLoadedAt && <p className="admin-updated">{t("admin.lastUpdated", { time: formatTime(lastLoadedAt, locale) })}</p>}
          </div>
          {token && (
            <button className="secondary-button compact" type="button" onClick={refresh} disabled={!canRefresh}>
              <RefreshCw /> {loading ? t("admin.refreshing") : t("admin.refresh")}
            </button>
          )}
        </div>
      </section>

      {!token && !error && !summary ? (
        <AdminStatePanel icon={<ShieldAlert />} title={t("admin.tokenRequiredTitle")} description={t("admin.tokenRequiredDescription")} />
      ) : error ? (
        <AdminStatePanel icon={<AlertTriangle />} title={t("admin.unavailableTitle")} description={adminErrorDescription(error, t)} />
      ) : summary ? (
        <AdminDashboardView summary={summary} filter={filter} onFilterChange={setFilter} />
      ) : (
        <AdminStatePanel icon={<RefreshCw />} title={t("admin.refreshing")} description={t("admin.description")} />
      )}
    </main>
  );
}

export function AdminDashboardView({
  summary,
  filter,
  onFilterChange,
}: {
  summary: AdminRoomsSummary;
  filter: AdminFilter;
  onFilterChange: (filter: AdminFilter) => void;
}) {
  const { locale, t } = useI18n();
  const rooms = useMemo(() => filterRooms(summary.rooms, filter), [filter, summary.rooms]);

  return (
    <>
      <section className="section-block admin-summary-section">
        <div className="admin-stat-grid">
          <AdminStat icon={<Users />} label={t("admin.totalRooms")} value={summary.totals.total} />
          <AdminStat icon={<CheckCircle2 />} label={t("admin.startedRooms")} value={summary.totals.started} />
          <AdminStat icon={<AlertTriangle />} label={t("admin.inactiveRooms")} value={summary.totals.inactive} tone={summary.totals.inactive > 0 ? "warning" : "default"} />
        </div>

        <div className="admin-breakdown-grid">
          <AdminBreakdown
            title={t("admin.gamesBreakdown")}
            icon={<Gamepad2 />}
            items={adminGameIds.map((gameId) => ({
              key: gameId,
              label: gameLabel(gameId, t),
              value: summary.byGame[gameId].total,
              attention: summary.byGame[gameId].inactive > 0,
            }))}
          />
          <AdminBreakdown
            title={t("admin.phasesBreakdown")}
            icon={<Clock3 />}
            items={adminRoomPhases.map((phase) => ({
              key: phase,
              label: roomPhaseLabel(phase, t),
              value: summary.byPhase[phase],
              attention: false,
            }))}
          />
        </div>
      </section>

      <section className="section-block admin-table-section">
        <div className="admin-table-heading">
          <div>
            <p className="section-label">{t("admin.roomsTable")}</p>
            <h3>{tableFilterTitle(filter, t)}</h3>
          </div>
          <div className="admin-filter-tabs" role="tablist" aria-label={t("admin.roomsTable")}>
            {(["all", "inactive", "started"] as const).map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={filter === item}
                className={filter === item ? "active" : ""}
                onClick={() => onFilterChange(item)}
              >
                {filterLabel(item, summary, t)}
              </button>
            ))}
          </div>
        </div>

        <div className="admin-table-wrap">
          <table className="admin-room-table">
            <thead>
              <tr>
                <th>{t("admin.roomCode")}</th>
                <th>{t("admin.game")}</th>
                <th>{t("admin.phase")}</th>
                <th>{t("admin.players")}</th>
                <th>{t("admin.host")}</th>
                <th>{t("admin.created")}</th>
                <th>{t("admin.lastActivity")}</th>
                <th>{t("admin.expires")}</th>
                <th>{t("admin.status")}</th>
              </tr>
            </thead>
            <tbody>
              {rooms.map((room) => (
                <tr className={room.inactive ? "inactive" : ""} key={room.code}>
                  <td>
                    <strong className="admin-room-code">{room.code}</strong>
                  </td>
                  <td>{gameLabel(room.gameId, t)}</td>
                  <td>{roomPhaseLabel(room.phase, t)}</td>
                  <td>
                    <span>{room.playerCount}</span>
                    <span className="admin-table-subtext">
                      {t("admin.connectedPlayers", { connected: room.connectedPlayerCount, total: room.playerCount })}
                    </span>
                  </td>
                  <td>
                    <span className={`admin-status-chip ${room.hostConnected ? "ok" : "warning"}`}>
                      {room.hostConnected ? <ShieldCheck /> : <ShieldAlert />}
                      {t(room.hostConnected ? "admin.hostOnline" : "admin.hostOffline")}
                    </span>
                  </td>
                  <td>{formatDateTime(room.createdAt, locale)}</td>
                  <td>
                    <time dateTime={new Date(room.lastActivityAt).toISOString()}>{formatDateTime(room.lastActivityAt, locale)}</time>
                    <span className="admin-table-subtext">{formatAge(room.lastActivityAt, summary.serverTime, t)}</span>
                  </td>
                  <td>{formatDateTime(room.expiresAt, locale)}</td>
                  <td>
                    <span className={`admin-status-chip ${room.inactive ? "warning" : "ok"}`}>
                      {room.inactive ? <AlertTriangle /> : <CheckCircle2 />}
                      {room.inactive ? t("admin.inactive") : t("admin.active")}
                    </span>
                    {room.inactiveReasons.length > 0 && <span className="admin-table-subtext">{inactiveReasonText(room.inactiveReasons, t)}</span>}
                  </td>
                </tr>
              ))}
              {rooms.length === 0 && (
                <tr>
                  <td className="admin-empty-row" colSpan={9}>
                    {summary.rooms.length === 0 ? t("admin.emptyDescription") : t("admin.noRoomsForFilter")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

export function AdminStatePanel({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <section className="section-block">
      <div className="panel admin-state-panel">
        <span className="admin-state-icon">{icon}</span>
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
      </div>
    </section>
  );
}

function AdminStat({ icon, label, value, tone = "default" }: { icon: ReactNode; label: string; value: number; tone?: "default" | "warning" }) {
  return (
    <article className={`admin-stat ${tone}`}>
      <span className="admin-stat-icon">{icon}</span>
      <span>
        <strong>{value}</strong>
        <span>{label}</span>
      </span>
    </article>
  );
}

function AdminBreakdown({
  title,
  icon,
  items,
}: {
  title: string;
  icon: ReactNode;
  items: Array<{ key: string; label: string; value: number; attention: boolean }>;
}) {
  return (
    <section className="admin-breakdown">
      <h3>
        {icon}
        {title}
      </h3>
      <div>
        {items.map((item) => (
          <span className={item.attention ? "attention" : ""} key={item.key}>
            {item.label}
            <strong>{item.value}</strong>
          </span>
        ))}
      </div>
    </section>
  );
}

function filterRooms(rooms: AdminRoomSummary[], filter: AdminFilter) {
  if (filter === "inactive") return rooms.filter((room) => room.inactive);
  if (filter === "started") return rooms.filter((room) => room.started);
  return rooms;
}

async function fetchAdminRooms(token: string): Promise<AdminRoomsResponse> {
  let response: Response;
  try {
    response = await fetch(resolveRoomServerHttpUrl("/admin/rooms"), {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch {
    throw new AdminFetchError("connection");
  }

  if (response.status === 401) throw new AdminFetchError("unauthorized");
  if (response.status === 404) throw new AdminFetchError("disabled");
  if (!response.ok) throw new AdminFetchError("connection");

  return (await response.json()) as AdminRoomsResponse;
}

class AdminFetchError extends Error {
  constructor(readonly code: AdminFetchErrorCode) {
    super(code);
  }
}

function readInitialAdminToken() {
  return readUrlAdminToken() ?? readStoredAdminToken();
}

function readUrlAdminToken() {
  if (typeof window === "undefined") return null;
  const token = new URLSearchParams(window.location.search).get("token")?.trim();
  return token || null;
}

function clearUrlAdminToken() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has("token")) return;
  url.searchParams.delete("token");
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

function readStoredAdminToken() {
  if (typeof sessionStorage === "undefined") return null;
  try {
    return sessionStorage.getItem(ADMIN_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function saveAdminToken(token: string) {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token);
  } catch {
    // Session storage is only a convenience for the admin view.
  }
}

function forgetAdminToken() {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
  } catch {
    // Session storage is only a convenience for the admin view.
  }
}

function adminErrorDescription(error: AdminFetchErrorCode, t: ReturnType<typeof useI18n>["t"]) {
  if (error === "disabled") return t("admin.disabledDescription");
  if (error === "unauthorized") return t("admin.unauthorizedDescription");
  return t("admin.connectionDescription");
}

function filterLabel(filter: AdminFilter, summary: AdminRoomsSummary, t: ReturnType<typeof useI18n>["t"]) {
  const count = filter === "inactive" ? summary.totals.inactive : filter === "started" ? summary.totals.started : summary.totals.total;
  const key = filter === "inactive" ? "admin.filterInactive" : filter === "started" ? "admin.filterStarted" : "admin.filterAll";
  return `${t(key)} (${count})`;
}

function tableFilterTitle(filter: AdminFilter, t: ReturnType<typeof useI18n>["t"]) {
  if (filter === "inactive") return t("admin.filterInactive");
  if (filter === "started") return t("admin.filterStarted");
  return t("admin.filterAll");
}

function gameLabel(gameId: GameId, t: ReturnType<typeof useI18n>["t"]) {
  const game = games.find((candidate) => candidate.id === gameId);
  return game ? t(game.titleKey as TranslationKey) : gameId;
}

function roomPhaseLabel(phase: RoomPhase, t: ReturnType<typeof useI18n>["t"]) {
  switch (phase) {
    case "lobby":
      return t("hub.sessionPhaseLobby");
    case "assignment":
      return t("hub.sessionPhaseAssignment");
    case "roleReveal":
      return t("hub.sessionPhaseRoleReveal");
    case "playing":
      return t("hub.sessionPhasePlaying");
    case "ended":
      return t("hub.sessionPhaseEnded");
    default:
      return t("common.unknown");
  }
}

function inactiveReasonText(reasons: AdminInactiveReason[], t: ReturnType<typeof useI18n>["t"]) {
  return reasons.map((reason) => t(reason === "hostOffline" ? "admin.reasonHostOffline" : "admin.reasonStaleActivity")).join(", ");
}

function formatDateTime(value: number, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function formatTime(value: number, locale: string) {
  return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(value);
}

function formatAge(value: number, serverTime: number, t: ReturnType<typeof useI18n>["t"]) {
  const ageMinutes = Math.max(0, Math.floor((serverTime - value) / 60_000));
  if (ageMinutes < 1) return t("admin.lessThanMinuteAgo");
  if (ageMinutes < 60) return t("admin.minutesAgo", { count: ageMinutes });
  return t("admin.hoursAgo", { count: Math.floor(ageMinutes / 60) });
}
