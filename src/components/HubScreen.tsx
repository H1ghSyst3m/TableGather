import { ChevronRight, Clock3, Lock, LogIn, Play, QrCode, SignalMedium, Users } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { games } from "../games/registry";
import { gameThemeStyle, hubDefaultTheme } from "../games/theme";
import { useI18n } from "../i18n/useI18n";
import type { GameId, SessionMode } from "../types";
import { GameIcon } from "./GameIcon";
import { HeaderBar } from "./HeaderBar";
import type { TranslationKey } from "../i18n/translations";

interface HubScreenProps {
  navigate: (path: string) => void;
}

export function HubScreen({ navigate }: HubScreenProps) {
  const { t } = useI18n();
  const [selectedGameId, setSelectedGameId] = useState<GameId>("werewolf");
  const [mode, setMode] = useState<SessionMode>("room");
  const currentGame = games.find((game) => game.id === selectedGameId) ?? games[0];
  const otherGames = games.filter((game) => game.id !== currentGame.id);
  const canStart = currentGame.status === "playable";

  const start = () => {
    if (!canStart) return;
    navigate(mode === "room" ? `/room/create/${currentGame.id}` : `/play/${currentGame.id}`);
  };

  return (
    <main className="app-frame hub-screen" style={gameThemeStyle({ theme: hubDefaultTheme })}>
      <HeaderBar />

      <section className="segmented-tabs" aria-label={t("common.session")}>
        <button className="segmented-tab active" type="button">
          <GameIcon game={currentGame} />
          <span>{t("common.games")}</span>
        </button>
        <button className="segmented-tab" type="button">
          <Users />
          <span>{t("common.session")}</span>
        </button>
      </section>

      <section className="section-block current-game">
        <p className="section-label">{t("common.currentGame")}</p>
        <div className="current-game-layout">
          <GameIcon game={currentGame} size="large" />
          <div>
            <h2>{t(currentGame.titleKey as TranslationKey)}</h2>
            <p>{t(currentGame.descriptionKey as TranslationKey)}</p>
          </div>
        </div>
        <div className="game-facts" aria-label={t("common.currentGame")}>
          <span>
            <Users /> {currentGame.playerRange} {t("common.players")}
          </span>
          <span>
            <Clock3 /> {currentGame.duration}
          </span>
          <span>
            <SignalMedium /> {t(currentGame.difficultyKey as TranslationKey)}
          </span>
        </div>
      </section>

      <section className="section-block">
        <p className="section-label">{t("common.otherGames")}</p>
        <div className="list-surface">
          {otherGames.map((game) => (
            <button
              className="game-row"
              key={game.id}
              type="button"
              onClick={() => setSelectedGameId(game.id)}
              disabled={game.status !== "playable"}
            >
              <GameIcon game={game} />
              <span className="row-main">
            <strong>{t(game.titleKey as TranslationKey)}</strong>
                <span>{t(game.descriptionKey as TranslationKey)}</span>
              </span>
              <span className={`status-label status-${game.id}`}>
                <Lock /> {t("common.comingSoon")}
              </span>
              <ChevronRight />
            </button>
          ))}
        </div>
      </section>

      <section className="section-block">
        <p className="section-label">{t("common.chooseMode")}</p>
        <div className="mode-list">
          <ModeButton
            active={mode === "room"}
            title={t("hub.roomMode")}
            description={t("hub.roomModeDescription")}
            icon={<QrCode />}
            onClick={() => setMode("room")}
          />
          <ModeButton
            active={mode === "pass-and-play"}
            title={t("hub.passAndPlay")}
            description={t("hub.passAndPlayDescription")}
            icon={<Users />}
            onClick={() => setMode("pass-and-play")}
          />
        </div>
      </section>

      <div className="sticky-action">
        <button className="primary-action" type="button" onClick={start} disabled={!canStart}>
          <Play />
          {t("hub.startGame", { game: t(currentGame.titleKey as TranslationKey) })}
        </button>
        {mode === "room" && (
          <button className="secondary-button full hub-join-room-action" type="button" onClick={() => navigate("/room/join")} disabled={!canStart}>
            <LogIn /> {t("hub.joinRoomByCode")}
          </button>
        )}
        <p>{t("hub.helper")}</p>
      </div>
    </main>
  );
}

function ModeButton({
  active,
  title,
  description,
  icon,
  onClick,
}: {
  active: boolean;
  title: string;
  description: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button className={`mode-button ${active ? "active" : ""}`} type="button" onClick={onClick}>
      <span className="mode-icon">{icon}</span>
      <span className="row-main">
        <strong>{title}</strong>
        <span>{description}</span>
      </span>
      <span className="radio-dot" />
      <ChevronRight />
    </button>
  );
}
