import { ArrowUp, Info, Shield } from "lucide-react";
import { type ReactNode, useCallback, useRef, useState } from "react";
import { roleDefinitions } from "../domain/roles";
import type { RoleId } from "../domain/types";
import { useI18n } from "../../../i18n/useI18n";
import { resolveGameTheme } from "../../theme";
import { werewolfTheme } from "../theme";
import { RoleInfoModal } from "./RoleInfoModal";

interface RevealPlayer {
  id: string;
  name: string;
  roleId: RoleId;
  originalRoleId?: RoleId;
  alphaWolfInfected?: boolean;
}

interface RoleRevealScreenProps {
  players: RevealPlayer[];
  title?: string;
  instruction?: string;
  doneLabel?: string;
  showRoleInfo?: boolean;
  showRoleInfoIdentity?: boolean;
  layout?: (parts: { screen: ReactNode; footer: ReactNode }) => ReactNode;
  onPlayerDone?: (playerId: string) => void;
  onDone: () => void;
}

const revealThreshold = 128;
const maxDrag = 220;
const werewolfAssets = resolveGameTheme({ theme: werewolfTheme }).assets;

export function RoleRevealScreen({
  players,
  title,
  instruction,
  doneLabel,
  showRoleInfo = false,
  showRoleInfoIdentity = true,
  layout,
  onPlayerDone,
  onDone,
}: RoleRevealScreenProps) {
  const { t } = useI18n();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [hasRevealed, setHasRevealed] = useState(false);
  const [roleInfoOpen, setRoleInfoOpen] = useState(false);
  const startYRef = useRef(0);

  const currentPlayer = players[currentIndex];
  const isLast = currentIndex === players.length - 1;
  const role = currentPlayer ? roleDefinitions[currentPlayer.roleId] : null;
  const roleAsset = currentPlayer ? werewolfAssets.roleIcons?.[currentPlayer.roleId] : undefined;
  const formerRole =
    currentPlayer?.originalRoleId && currentPlayer.originalRoleId !== currentPlayer.roleId
      ? roleDefinitions[currentPlayer.originalRoleId]
      : null;
  const translateY = Math.min(dragOffset, maxDrag);
  const isRevealed = dragOffset >= revealThreshold;

  const resetForNext = useCallback(() => {
    setDragOffset(0);
    setIsDragging(false);
    setHasRevealed(false);
    setRoleInfoOpen(false);
  }, []);

  const handleNext = useCallback(() => {
    if (!hasRevealed || isDragging || !currentPlayer) return;

    onPlayerDone?.(currentPlayer.id);

    if (isLast) {
      onDone();
      return;
    }

    setCurrentIndex((index) => index + 1);
    resetForNext();
  }, [currentPlayer, hasRevealed, isDragging, isLast, onDone, onPlayerDone, resetForNext]);

  if (!currentPlayer || !role) return null;

  const screen = (
    <section className={isDragging ? "role-reveal-screen is-dragging" : "role-reveal-screen"} aria-label={title ?? t("werewolf.roleReveal")}>
      <header className="reveal-header">
        <p className="section-label">{title ?? t("werewolf.roleReveal")}</p>
        <div className="reveal-dots" aria-label={`${currentIndex + 1} / ${players.length}`}>
          {players.map((player, index) => (
            <span
              key={player.id}
              className={index < currentIndex ? "done" : index === currentIndex ? "current" : ""}
            />
          ))}
        </div>
      </header>

      <div className="reveal-player-badge">
        <span>{t("werewolf.cardFor")}</span>
        <strong>{currentPlayer.name}</strong>
      </div>

      <p className="reveal-instruction">
        {instruction ?? (players.length === 1 ? t("werewolf.dragRevealHint") : t("werewolf.passDeviceInstruction", { name: currentPlayer.name }))}
      </p>

      <div className="reveal-stack">
        <div className="role-layer" aria-hidden={!isRevealed}>
          {roleAsset ? <img className="role-layer-icon" src={roleAsset} alt="" /> : <Shield />}
          <strong>
            {t(role.nameKey)}
            {formerRole && <span className="reveal-former-role">{t("werewolf.formerRole", { role: t(formerRole.nameKey) })}</span>}
            {currentPlayer.alphaWolfInfected && <span className="reveal-former-role">{t("werewolf.wolfAlignedStatus")}</span>}
          </strong>
          <p>{t(role.descriptionKey)}</p>
        </div>

        <div
          className={werewolfAssets.cover ? "cover-card has-cover-image" : "cover-card"}
          role="button"
          tabIndex={0}
          aria-label={t("werewolf.revealInstruction")}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            startYRef.current = event.clientY;
            setIsDragging(true);
            setDragOffset(0);
          }}
          onPointerMove={(event) => {
            if (!isDragging) return;
            const nextOffset = Math.max(0, startYRef.current - event.clientY);
            setDragOffset(nextOffset);
            if (nextOffset >= revealThreshold) setHasRevealed(true);
          }}
          onPointerUp={() => {
            setIsDragging(false);
            setDragOffset(0);
          }}
          onPointerCancel={() => {
            setIsDragging(false);
            setDragOffset(0);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            if (hasRevealed) {
              handleNext();
              return;
            }
            setDragOffset(maxDrag);
            setHasRevealed(true);
          }}
          style={{
            transform: `translateY(-${translateY}px)`,
            transition: isDragging ? "none" : "transform 180ms ease",
          }}
        >
          {werewolfAssets.cover ? (
            <img className="cover-card-image" src={werewolfAssets.cover} alt="" aria-hidden="true" draggable={false} />
          ) : (
            <span className="cover-card-mark">
              <Shield />
            </span>
          )}
          <span className="cover-card-hint">
            <ArrowUp />
            {t("werewolf.dragKeyboardHint")}
          </span>
        </div>
      </div>
      {roleInfoOpen && <RoleInfoModal role={role} showIdentity={showRoleInfoIdentity} onClose={() => setRoleInfoOpen(false)} />}
    </section>
  );

  const footer = (
    <div className="role-reveal-actions">
      <div className={showRoleInfo && hasRevealed ? "reveal-action-row with-info" : "reveal-action-row"}>
        <button className="primary-action compact" type="button" disabled={!hasRevealed || isDragging} onClick={handleNext}>
          {isLast ? doneLabel ?? t("werewolf.beginNight") : t("werewolf.nextPlayer")}
        </button>
        {showRoleInfo && hasRevealed && (
          <button
            className="reveal-info-icon-button"
            type="button"
            aria-label={t("werewolf.roleDescription")}
            title={t("werewolf.roleDescription")}
            onClick={() => setRoleInfoOpen(true)}
          >
            <Info />
          </button>
        )}
      </div>
    </div>
  );

  return layout ? <>{layout({ screen, footer })}</> : <>{screen}<div className="role-reveal-inline-actions">{footer}</div></>;
}
