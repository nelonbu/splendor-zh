import type { TurnLogEntry, GameLog, GameLogEvent, AiProvider } from '../ai/aiTypes';

// ── Module-level state ──────────────────────────────────────

let currentLog: GameLog | null = null;

// ── Public API ──────────────────────────────────────────────

export function createGameLog(
  player0: { name: string; provider: AiProvider; model: string },
  player1: { name: string; provider: AiProvider; model: string },
  boardNobleIds: string[] = [],
): void {
  currentLog = {
    gameId: `game-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    startedAt: Date.now(),
    endedAt: null,
    player0,
    player1,
    winnerIndex: null,
    finalScores: [0, 0],
    turns: [],
    boardNobleIds,
    events: [],
  };
}

export function logEvent(event: GameLogEvent): void {
  if (!currentLog) return;
  currentLog.events.push(event);
}

export function logTurn(entry: Omit<TurnLogEntry, 'timestamp' | 'isFallback'>): void {
  if (!currentLog) return;

  const isFallback = entry.reasoning.some(
    r => /fallback|illegal move/i.test(r),
  );

  currentLog.turns.push({
    ...entry,
    isFallback,
    timestamp: Date.now(),
  });
}

export function finalizeGameLog(
  winnerIndex: 0 | 1 | null,
  finalScores: [number, number],
): void {
  if (!currentLog) return;
  currentLog.endedAt = Date.now();
  currentLog.winnerIndex = winnerIndex;
  currentLog.finalScores = finalScores;
}

export function getGameLog(): GameLog | null {
  return currentLog;
}

export function exportGameLogJson(): string {
  return JSON.stringify(currentLog, null, 2);
}

export function clearGameLog(): void {
  currentLog = null;
}
