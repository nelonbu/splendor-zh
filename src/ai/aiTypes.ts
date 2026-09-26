import type { ColoredGem, CardTier, GemColor } from '../game/types';

// ── Provider Config ────────────────────────────────────────

export type AiProvider = 'anthropic' | 'openai' | 'gemini' | 'openrouter' | 'custom';

export interface AiConfig {
  provider: AiProvider;
  model: string;
  apiKey: string;
  baseUrl?: string; // only for 'custom' provider
}

// ── AI State ───────────────────────────────────────────────

export type AiStatus = 'idle' | 'thinking' | 'done' | 'error';

export interface AiState {
  status: AiStatus;
  reasoning: string[];        // 3-4 bullets after each move
  actionSummary: string;      // plain-language summary of the action taken
  errorMessage: string;       // populated when status === 'error'
  consecutiveFailures: number;
}

// ── AI Actions ─────────────────────────────────────────────

export type AiAction =
  | { type: 'takeGems'; colors: ColoredGem[] }
  | { type: 'take2Gems'; color: ColoredGem }
  | { type: 'purchaseCard'; cardId: string }
  | { type: 'reserveCard'; cardId: string }
  | { type: 'reserveCard'; fromDeck: CardTier }
  | { type: 'discardGems'; gems: Partial<Record<GemColor, number>> }
  | { type: 'selectNoble'; nobleId: string };

// ── AI Response ────────────────────────────────────────────

export interface AiResponse {
  reasoning: string[];
  action: AiAction;
}

export interface AiMoveResult extends AiResponse {
  responseTimeMs: number;
}

// ── AI vs AI Config ───────────────────────────────────────

export interface AiVsAiConfig {
  player0: AiConfig;
  player1: AiConfig;
}

// ── Turn Logging (for evals) ──────────────────────────────

export interface TurnLogEntry {
  turnCount: number;
  playerIndex: 0 | 1;
  provider: AiProvider;
  model: string;
  action: AiAction;
  reasoning: string[];
  isFallback: boolean;
  playerPoints: [number, number];
  actingPlayerBonuses: Record<ColoredGem, number>;
  actingPlayerTotalGems: number;
  responseTimeMs: number;
  timestamp: number;
  // Enriched fields for eval metrics
  actingPlayerGems?: Record<GemColor, number>;
  purchasedCardTier?: CardTier;
  purchasedCardPrestige?: number;
  purchasedCardGemBonus?: ColoredGem;
  goldSpent?: number;
  reservedCardId?: string;
  isBlockingReserve?: boolean;
}

// ── Game Log Events ──────────────────────────────────────

export type GameLogEvent =
  | { type: 'discard'; turnCount: number; playerIndex: 0 | 1; gems: Partial<Record<GemColor, number>>; timestamp: number }
  | { type: 'nobleClaim'; turnCount: number; playerIndex: 0 | 1; nobleId: string; timestamp: number };

export interface GameLog {
  gameId: string;
  startedAt: number;
  endedAt: number | null;
  player0: { name: string; provider: AiProvider; model: string };
  player1: { name: string; provider: AiProvider; model: string };
  winnerIndex: 0 | 1 | null;
  finalScores: [number, number];
  turns: TurnLogEntry[];
  boardNobleIds: string[];
  events: GameLogEvent[];
}
