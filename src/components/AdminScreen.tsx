import { AlertTriangle, CheckCircle2, Clock3, Gamepad2, KeyRound, RefreshCw, ShieldAlert, ShieldCheck, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { games } from "../games/registry";
import { gameThemeStyle, hubDefaultTheme } from "../games/theme";
import { useI18n } from "../i18n/useI18n";
import type { TranslationKey } from "../i18n/translations";
import type { AdminInactiveReason, AdminProgressStatus, AdminRoomsResponse, AdminRoomsSummary, AdminRoomSummary } from "../online/admin";
import { adminGameIds, adminRoomPhases, isAdminRoomsResponse } from "../online/admin";
import {
  clearUrlAdminToken,
  forgetAdminToken,
  normalizeAdminTokenInput,
  readInitialAdminToken,
  readUrlAdminToken,
  saveAdminToken,
  submitAdminTokenInput,
} from "../online/adminToken";
import { resolveRoomServerHttpUrl } from "../online/wsUrl";
import type { GameId, RoomPhase } from "../types";
import { HeaderBar } from "./HeaderBar";

const ADMIN_REFRESH_INTERVAL_MS = 15_000;
const ADMIN_FETCH_TIMEOUT_MS = 10_000;

type AdminActivityFilter = "all" | "active" | "inactive";
type AdminProgressFilter = "all" | AdminProgressStatus;
type AdminFetchErrorCode = "disabled" | "unauthorized" | "connection" | "malformed";

export function AdminScreen() {
  const { locale, t } = useI18n();
  const [token, setToken] = useState(readInitialAdminToken);
  const [summary, setSummary] = useState<AdminRoomsSummary | null>(null);
  const [activityFilter, setActivityFilter] = useState<AdminActivityFilter>("all");
  const [progressFilter, setProgressFilter] = useState<AdminProgressFilter>("all");
  const [adminTokenInput, setAdminTokenInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AdminFetchErrorCode | null>(null);
  const [lastLoadedAt, setLastLoadedAt] = useState<number | null>(null);
  const requestIdRef = useRef(0);
  const requestControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const urlToken = readUrlAdminToken();
    if (!urlToken) return;

    saveAdminToken(urlToken);
    clearUrlAdminToken();
  }, []);

  const refresh = useCallback(async () => {
    if (!token || requestControllerRef.current) return;

    const requestId = requestIdRef.current + 1;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), ADMIN_FETCH_TIMEOUT_MS);
    requestIdRef.current = requestId;
    requestControllerRef.current = controller;
    setLoading(true);
    setError(null);

    try {
      const nextSummary = await fetchAdminRooms(token, controller.signal);
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
      window.clearTimeout(timeoutId);
      if (requestControllerRef.current === controller) requestControllerRef.current = null;
      if (requestIdRef.current === requestId) setLoading(false);
    }
  }, [token]);

  const handleTokenSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      submitAdminTokenInput(adminTokenInput, (nextToken) => {
        setToken(nextToken);
        setError(null);
        setSummary(null);
        setLastLoadedAt(null);
        setAdminTokenInput("");
      });
    },
    [adminTokenInput],
  );

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
        <AdminStatePanel icon={<ShieldAlert />} title={t("admin.tokenRequiredTitle")} description={t("admin.tokenRequiredDescription")}>
          <AdminTokenForm value={adminTokenInput} onChange={setAdminTokenInput} onSubmit={handleTokenSubmit} />
        </AdminStatePanel>
      ) : error ? (
        <AdminStatePanel icon={<AlertTriangle />} title={t("admin.unavailableTitle")} description={adminErrorDescription(error, t)}>
          {error === "unauthorized" && <AdminTokenForm value={adminTokenInput} onChange={setAdminTokenInput} onSubmit={handleTokenSubmit} />}
        </AdminStatePanel>
      ) : summary ? (
        <AdminDashboardView
          summary={summary}
          activityFilter={activityFilter}
          progressFilter={progressFilter}
          onActivityFilterChange={setActivityFilter}
          onProgressFilterChange={setProgressFilter}
        />
      ) : (
        <AdminStatePanel icon={<RefreshCw />} title={t("admin.refreshing")} description={t("admin.description")} />
      )}
    </main>
  );
}

export function AdminDashboardView({
  summary,
  activityFilter,
  progressFilter,
  onActivityFilterChange,
  onProgressFilterChange,
}: {
  summary: AdminRoomsSummary;
  activityFilter: AdminActivityFilter;
  progressFilter: AdminProgressFilter;
  onActivityFilterChange: (filter: AdminActivityFilter) => void;
  onProgressFilterChange: (filter: AdminProgressFilter) => void;
}) {
  const { locale, t } = useI18n();
  const rooms = useMemo(() => filterRooms(summary.rooms, activityFilter, progressFilter), [activityFilter, progressFilter, summary.rooms]);

  return (
    <>
      <section className="section-block admin-summary-section">
        <div className="admin-stat-grid">
          <AdminStat icon={<Users />} label={t("admin.totalRooms")} value={summary.totals.total} />
          <AdminStat icon={<ShieldCheck />} label={t("admin.activeRooms")} value={summary.totals.active} />
          <AdminStat icon={<AlertTriangle />} label={t("admin.inactiveRooms")} value={summary.totals.inactive} tone={summary.totals.inactive > 0 ? "warning" : "default"} />
          <AdminStat icon={<Gamepad2 />} label={t("admin.runningRooms")} value={summary.totals.running} />
          <AdminStat icon={<Clock3 />} label={t("admin.waitingRooms")} value={summary.totals.waiting} />
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
            <h3>{tableFilterTitle(activityFilter, progressFilter, t)}</h3>
          </div>
          <div className="admin-filter-groups">
            <AdminFilterGroup
              label={t("admin.activityFilters")}
              options={[
                { value: "all", label: filterCountLabel(t("admin.filterAll"), summary.totals.total) },
                { value: "active", label: filterCountLabel(t("admin.filterActive"), summary.totals.active) },
                { value: "inactive", label: filterCountLabel(t("admin.filterInactive"), summary.totals.inactive) },
              ]}
              selected={activityFilter}
              onChange={onActivityFilterChange}
            />
            <AdminFilterGroup
              label={t("admin.progressFilters")}
              options={[
                { value: "all", label: filterCountLabel(t("admin.filterAll"), summary.totals.total) },
                { value: "running", label: filterCountLabel(t("admin.filterRunning"), summary.totals.running) },
                { value: "waiting", label: filterCountLabel(t("admin.filterWaiting"), summary.totals.waiting) },
                { value: "ended", label: filterCountLabel(t("admin.filterEnded"), summary.totals.ended) },
              ]}
              selected={progressFilter}
              onChange={onProgressFilterChange}
            />
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
                    <div className="admin-status-stack">
                      <span className={`admin-status-chip ${progressStatusTone(room.progressStatus)}`}>
                        {progressStatusIcon(room.progressStatus)}
                        {progressStatusLabel(room.progressStatus, t)}
                      </span>
                      <span className={`admin-status-chip ${room.inactive ? "warning" : "ok"}`}>
                        {room.inactive ? <AlertTriangle /> : <CheckCircle2 />}
                        {t(room.inactive ? "admin.inactive" : "admin.active")}
                      </span>
                    </div>
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

export function AdminStatePanel({ icon, title, description, children }: { icon: ReactNode; title: string; description: string; children?: ReactNode }) {
  return (
    <section className="section-block">
      <div className="panel admin-state-panel">
        <span className="admin-state-icon">{icon}</span>
        <div className="admin-state-content">
          <h3>{title}</h3>
          <p>{description}</p>
          {children}
        </div>
      </div>
    </section>
  );
}

export function AdminTokenForm({
  value,
  onChange,
  onSubmit,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const { t } = useI18n();
  const canSubmit = Boolean(normalizeAdminTokenInput(value));

  return (
    <form className="admin-token-form" onSubmit={onSubmit}>
      <label>
        <span>{t("admin.tokenFieldLabel")}</span>
        <input
          type="password"
          value={value}
          placeholder={t("admin.tokenFieldPlaceholder")}
          autoComplete="current-password"
          onChange={(event) => onChange(event.currentTarget.value)}
        />
      </label>
      <button className="secondary-button compact" type="submit" disabled={!canSubmit}>
        <KeyRound /> {t("admin.tokenSubmit")}
      </button>
    </form>
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

function AdminFilterGroup<TFilter extends string>({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: Array<{ value: TFilter; label: string }>;
  selected: TFilter;
  onChange: (filter: TFilter) => void;
}) {
  return (
    <div className="admin-filter-group">
      <span className="admin-filter-group-label">{label}</span>
      <div className="admin-filter-tabs" role="tablist" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected === option.value}
            className={selected === option.value ? "active" : ""}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function filterRooms(rooms: AdminRoomSummary[], activityFilter: AdminActivityFilter, progressFilter: AdminProgressFilter) {
  return rooms.filter((room) => {
    const activityMatches =
      activityFilter === "all" || (activityFilter === "active" && room.active) || (activityFilter === "inactive" && room.inactive);
    const progressMatches = progressFilter === "all" || room.progressStatus === progressFilter;
    return activityMatches && progressMatches;
  });
}

async function fetchAdminRooms(token: string, signal?: AbortSignal): Promise<AdminRoomsResponse> {
  let response: Response;
  try {
    response = await fetch(resolveRoomServerHttpUrl("/admin/rooms"), {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal,
    });
  } catch {
    throw new AdminFetchError("connection");
  }

  if (response.status === 401) throw new AdminFetchError("unauthorized");
  if (response.status === 404) throw new AdminFetchError("disabled");
  if (!response.ok) throw new AdminFetchError("connection");

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new AdminFetchError("malformed", "Admin room response is not valid JSON.");
  }

  if (!isAdminRoomsResponse(body)) {
    throw new AdminFetchError("malformed", "Admin room response does not match the expected shape.");
  }

  return body;
}

class AdminFetchError extends Error {
  constructor(
    readonly code: AdminFetchErrorCode,
    message: string = code,
  ) {
    super(message);
  }
}

function adminErrorDescription(error: AdminFetchErrorCode, t: ReturnType<typeof useI18n>["t"]) {
  if (error === "disabled") return t("admin.disabledDescription");
  if (error === "unauthorized") return t("admin.unauthorizedDescription");
  if (error === "malformed") return t("admin.malformedDescription");
  return t("admin.connectionDescription");
}

function filterCountLabel(label: string, count: number) {
  return `${label} (${count})`;
}

function tableFilterTitle(activityFilter: AdminActivityFilter, progressFilter: AdminProgressFilter, t: ReturnType<typeof useI18n>["t"]) {
  const labels = [];
  if (activityFilter !== "all") labels.push(t(activityFilter === "active" ? "admin.filterActive" : "admin.filterInactive"));
  if (progressFilter !== "all") labels.push(t(progressFilterKey(progressFilter)));
  return labels.length > 0 ? labels.join(" / ") : t("admin.filterAll");
}

function progressFilterKey(filter: Exclude<AdminProgressFilter, "all">): TranslationKey {
  switch (filter) {
    case "running":
      return "admin.filterRunning";
    case "waiting":
      return "admin.filterWaiting";
    case "ended":
      return "admin.filterEnded";
  }
}

function progressStatusLabel(status: AdminProgressStatus, t: ReturnType<typeof useI18n>["t"]) {
  switch (status) {
    case "running":
      return t("admin.statusRunning");
    case "waiting":
      return t("admin.statusWaiting");
    default:
      return t("admin.statusEnded");
  }
}

function progressStatusTone(status: AdminProgressStatus) {
  if (status === "running") return "ok";
  return "neutral";
}

function progressStatusIcon(status: AdminProgressStatus) {
  if (status === "running") return <Gamepad2 />;
  if (status === "waiting") return <Clock3 />;
  return <CheckCircle2 />;
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
