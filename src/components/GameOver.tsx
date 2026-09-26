import { useEffect, useRef } from 'react';
import { useGameStore } from '../store/gameStore';
import { getPlayerPoints } from '../game/selectors';
import { updateStats } from '../store/profileService';
import { finalizeGameLog, exportGameLogJson, getGameLog } from '../game/turnLogger';
import { analyzeGameLog } from '../game/evalAnalysis';
import { openEvalDashboard } from '../game/evalDashboard';
import { getModelDisplayName } from '../ai/modelNames';
import type { GameMode } from '../store/profileTypes';
import { copy, pointsLabel, winnerLabel } from '../i18n/zhCN';

export default function GameOver() {
  const winner = useGameStore(s => s.winner);
  const resetGame = useGameStore(s => s.resetGame);
  const aiVsAiMode = useGameStore(s => s.aiVsAiMode);
  const aiVsAiConfig = useGameStore(s => s.aiVsAiConfig);
  const players = useGameStore(s => s.players);
  const statsRecorded = useRef(false);

  useEffect(() => {
    if (!winner || statsRecorded.current) return;
    statsRecorded.current = true;

    const state = useGameStore.getState();

    if (state.aiVsAiMode) {
      const p0Score = getPlayerPoints(state.players[0]);
      const p1Score = getPlayerPoints(state.players[1]);
      const winnerIndex = winner === state.players[0] || winner.name === state.players[0].name ? 0 : 1;
      finalizeGameLog(winnerIndex as 0 | 1, [p0Score, p1Score]);
      updateStats('ai-vs-ai', false);
      return;
    }

    const isOnline = state.onlineState !== null;
    const isAi = state.aiMode;

    let mode: GameMode;
    let playerWon: boolean;

    if (isOnline) {
      mode = 'online';
      playerWon = winner.name === state.onlineState!.nickname;
    } else if (isAi) {
      mode = 'ai';
      playerWon = winner.name === state.players[0].name;
    } else {
      mode = 'local';
      playerWon = winner.name === state.players[0].name;
    }

    updateStats(mode, playerWon);
  }, [winner]);

  if (!winner) return null;

  function handleDownloadLog() {
    const json = exportGameLogJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `splendor-game-log-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleOpenEvalDashboard() {
    const log = getGameLog();
    if (!log) return;
    const report = analyzeGameLog(log);
    openEvalDashboard(report);
  }

  if (aiVsAiMode && aiVsAiConfig) {
    const p0Score = getPlayerPoints(players[0]);
    const p1Score = getPlayerPoints(players[1]);
    const p0Model = getModelDisplayName(aiVsAiConfig.player0.provider, aiVsAiConfig.player0.model);
    const p1Model = getModelDisplayName(aiVsAiConfig.player1.provider, aiVsAiConfig.player1.model);

    return (
      <div className="game-over">
        <h2>{winnerLabel(winner.name)}</h2>
        <p className="winner-points">{pointsLabel(getPlayerPoints(winner))}</p>
        <p className="matchup-score">
          {p0Model}：{pointsLabel(p0Score)} &mdash; {p1Model}：{pointsLabel(p1Score)}
        </p>
        <div className="game-over-actions">
          <button onClick={resetGame}>{copy.playAgain}</button>
          <button className="btn-download-log" onClick={handleDownloadLog}>
            {copy.downloadLog}
          </button>
          <button className="btn-eval-dashboard" onClick={handleOpenEvalDashboard}>
            {copy.reviewEvaluation}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="game-over">
      <h2>{winnerLabel(winner.name)}</h2>
      <p className="winner-points">{pointsLabel(getPlayerPoints(winner))}</p>
      <button onClick={resetGame}>{copy.playAgain}</button>
    </div>
  );
}
