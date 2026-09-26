import { create } from 'zustand';
import type {
  ColoredGem,
  CardTier,
  GemCost,
  DevelopmentCard,
  NobleTile,
  PlayerState,
  GameState,
  GamePhase,
} from '../game/types';
import type { AiConfig, AiState, AiVsAiConfig } from '../ai/aiTypes';
import { createGameLog } from '../game/turnLogger';
import { getModelDisplayName } from '../ai/modelNames';
import {
  generateInitialState,
  canTakeGems,
  canTake2Gems,
  canReserveCard,
  canPurchaseCard,
  applyTakeGems,
  applyTake2Gems,
  applyReserveCard,
  applyPurchaseCard,
  applyDiscardGems,
  applyNobleVisit,
  shouldTriggerEndGame,
  advanceTurn,
} from '../game/engine';
import { getEligibleNobles, getTotalGems } from '../game/selectors';
import { MAX_GEMS_IN_HAND } from '../game/constants';
import { getSocket } from '../online/socketClient';

export type LastMove =
  | { type: 'takeGems'; colors: ColoredGem[] }
  | { type: 'take2Gems'; color: ColoredGem }
  | { type: 'reserveCard'; cardId?: string; gemBonus: ColoredGem; prestigePoints: number }
  | { type: 'purchaseCard'; cardId: string; gemBonus: ColoredGem; prestigePoints: number; cost: Partial<Record<ColoredGem, number>> };

interface UndoSnapshot {
  playerIndex: 0 | 1;
  gameState: GameState;
  lastMoves: [LastMove | null, LastMove | null];
}

const initialAiState: AiState = {
  status: 'idle',
  reasoning: [],
  actionSummary: '',
  errorMessage: '',
  consecutiveFailures: 0,
};

export interface OnlineState {
  roomCode: string;
  myPlayerIndex: 0 | 1;
  nickname: string;
  opponentNickname: string;
  reconnectToken: string;
  connectionStatus: 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
  opponentConnected: boolean;
}

export interface GameStore extends GameState {
  pendingNobles: NobleTile[] | null;
  pendingDiscard: boolean;
  lastMoves: [LastMove | null, LastMove | null];
  undoSnapshot: UndoSnapshot | null;
  undoRevision: number;
  aiMode: boolean;
  aiConfig: AiConfig | null;
  aiState: AiState;
  aiVsAiMode: boolean;
  aiVsAiConfig: AiVsAiConfig | null;
  aiStates: [AiState, AiState];
  aiVsAiPaused: boolean;
  onlineState: OnlineState | null;
  opponentLeftMessage: string | null;

  initGame: (p1Name: string, p2Name: string, aiMode?: boolean, aiConfig?: AiConfig, aiVsAiMode?: boolean, aiVsAiConfig?: AiVsAiConfig) => void;
  resetGame: () => void;
  undoLastTurn: () => void;
  setAiState: (state: Partial<AiState>) => void;
  setAiStateForPlayer: (playerIndex: 0 | 1, partial: Partial<AiState>) => void;
  toggleAiVsAiPaused: () => void;
  setOnlineState: (state: OnlineState | null) => void;
  applyServerState: (gameState: GameState, pendingDiscard?: boolean, pendingNobles?: NobleTile[], lastMoves?: [LastMove | null, LastMove | null]) => void;
  takeGems: (colors: ColoredGem[]) => void;
  take2Gems: (color: ColoredGem) => void;
  reserveCard: (source: DevelopmentCard | { fromDeck: CardTier }) => void;
  purchaseCard: (card: DevelopmentCard) => void;
  discardGems: (gems: GemCost) => void;
  selectNoble: (noble: NobleTile) => void;
}

const initialStoreState = {
  board: {
    gemSupply: { white: 0, blue: 0, green: 0, red: 0, black: 0, gold: 0 },
    decks: [[], [], []] as [DevelopmentCard[], DevelopmentCard[], DevelopmentCard[]],
    visibleCards: [[], [], []] as [DevelopmentCard[], DevelopmentCard[], DevelopmentCard[]],
    nobles: [] as NobleTile[],
  },
  players: [
    { name: '', gems: { white: 0, blue: 0, green: 0, red: 0, black: 0, gold: 0 }, reserved: [], purchased: [], nobles: [] },
    { name: '', gems: { white: 0, blue: 0, green: 0, red: 0, black: 0, gold: 0 }, reserved: [], purchased: [], nobles: [] },
  ] as [PlayerState, PlayerState],
  currentPlayerIndex: 0 as 0 | 1,
  phase: 'setup' as GamePhase,
  winner: null as PlayerState | null,
  turnCount: 0,
  pendingNobles: null as NobleTile[] | null,
  pendingDiscard: false,
  lastMoves: [null, null] as [LastMove | null, LastMove | null],
  undoSnapshot: null as UndoSnapshot | null,
  undoRevision: 0,
  aiMode: false,
  aiConfig: null as AiConfig | null,
  aiState: { ...initialAiState },
  aiVsAiMode: false,
  aiVsAiConfig: null as AiVsAiConfig | null,
  aiStates: [{ ...initialAiState }, { ...initialAiState }] as [AiState, AiState],
  aiVsAiPaused: false,
  onlineState: null as OnlineState | null,
  opponentLeftMessage: null as string | null,
};

function setLastMove(lastMoves: [LastMove | null, LastMove | null], playerIndex: 0 | 1, move: LastMove): [LastMove | null, LastMove | null] {
  const updated: [LastMove | null, LastMove | null] = [...lastMoves];
  updated[playerIndex] = move;
  return updated;
}

function captureUndoSnapshot(state: GameStore): UndoSnapshot {
  return {
    playerIndex: state.currentPlayerIndex,
    gameState: {
      board: state.board,
      players: state.players,
      currentPlayerIndex: state.currentPlayerIndex,
      phase: state.phase,
      winner: state.winner,
      turnCount: state.turnCount,
    },
    lastMoves: state.lastMoves,
  };
}

export function canUndoLastTurn(state: GameStore, playerIndex: 0 | 1): boolean {
  const snapshot = state.undoSnapshot;
  return !!snapshot && snapshot.playerIndex === playerIndex
    && state.currentPlayerIndex !== playerIndex
    && state.turnCount === snapshot.gameState.turnCount + 1
    && (state.phase === 'playing' || state.phase === 'ending')
    && !state.pendingDiscard && !state.pendingNobles
    && !state.onlineState && !state.aiMode && !state.aiVsAiMode;
}

function postActionChecks(state: GameState): GameState & { pendingNobles: NobleTile[] | null; pendingDiscard: boolean } {
  const player = state.players[state.currentPlayerIndex];

  // 1. Check gem discard
  if (getTotalGems(player) > MAX_GEMS_IN_HAND) {
    return { ...state, pendingNobles: null, pendingDiscard: true };
  }

  // 2. Check noble eligibility
  const eligible = getEligibleNobles(state.board.nobles, player);
  if (eligible.length > 0) {
    return { ...state, pendingNobles: eligible, pendingDiscard: false };
  }

  // 3. Check win trigger
  if (state.phase === 'playing' && shouldTriggerEndGame(state)) {
    state = { ...state, phase: 'ending' };
  }

  // 4. Advance turn
  const advanced = advanceTurn(state);
  return { ...advanced, pendingNobles: null, pendingDiscard: false };
}

export const useGameStore = create<GameStore>((set, get) => ({
  ...initialStoreState,

  initGame: (p1Name: string, p2Name: string, aiMode?: boolean, aiConfig?: AiConfig, aiVsAiMode?: boolean, aiVsAiConfig?: AiVsAiConfig) => {
    if (aiVsAiMode && aiVsAiConfig) {
      const p1Label = `AI 1: ${getModelDisplayName(aiVsAiConfig.player0.provider, aiVsAiConfig.player0.model)}`;
      const p2Label = `AI 2: ${getModelDisplayName(aiVsAiConfig.player1.provider, aiVsAiConfig.player1.model)}`;
      const gameState = generateInitialState(p1Label, p2Label);
      createGameLog(
        { name: p1Label, provider: aiVsAiConfig.player0.provider, model: aiVsAiConfig.player0.model },
        { name: p2Label, provider: aiVsAiConfig.player1.provider, model: aiVsAiConfig.player1.model },
        gameState.board.nobles.map(n => n.id),
      );
      set({
        ...gameState,
        pendingNobles: null,
        pendingDiscard: false,
        aiMode: false,
        aiConfig: null,
        aiState: { ...initialAiState },
        aiVsAiMode: true,
        aiVsAiConfig,
        aiStates: [{ ...initialAiState }, { ...initialAiState }],
        aiVsAiPaused: false,
        undoSnapshot: null,
      });
      return;
    }

    const p2 = aiMode ? 'AI Player' : p2Name;
    const gameState = generateInitialState(p1Name, p2);
    set({
      ...gameState,
      pendingNobles: null,
      pendingDiscard: false,
      aiMode: aiMode ?? false,
      aiConfig: aiConfig ?? null,
      aiState: { ...initialAiState },
      aiVsAiMode: false,
      aiVsAiConfig: null,
      aiStates: [{ ...initialAiState }, { ...initialAiState }],
      aiVsAiPaused: false,
      undoSnapshot: null,
    });
  },

  resetGame: () => {
    set({ ...initialStoreState, undoRevision: get().undoRevision + 1 });
  },

  undoLastTurn: () => {
    const state = get();
    const snapshot = state.undoSnapshot;
    if (!snapshot || !canUndoLastTurn(state, snapshot.playerIndex)) return;
    set({
      ...snapshot.gameState,
      lastMoves: snapshot.lastMoves,
      pendingDiscard: false,
      pendingNobles: null,
      undoSnapshot: null,
      undoRevision: state.undoRevision + 1,
    });
  },

  setAiState: (partial: Partial<AiState>) => {
    set((state) => ({ aiState: { ...state.aiState, ...partial } }));
  },

  setAiStateForPlayer: (playerIndex: 0 | 1, partial: Partial<AiState>) => {
    set((state) => {
      const aiStates: [AiState, AiState] = [...state.aiStates];
      aiStates[playerIndex] = { ...aiStates[playerIndex], ...partial };
      return { aiStates };
    });
  },

  toggleAiVsAiPaused: () => {
    set((state) => ({ aiVsAiPaused: !state.aiVsAiPaused }));
  },

  setOnlineState: (onlineState: OnlineState | null) => {
    set({ onlineState, ...(onlineState ? { undoSnapshot: null } : {}) });
  },

  applyServerState: (gameState: GameState, pendingDiscard?: boolean, pendingNobles?: NobleTile[], lastMoves?: [LastMove | null, LastMove | null]) => {
    set({
      ...gameState,
      pendingDiscard: pendingDiscard ?? false,
      pendingNobles: pendingNobles && pendingNobles.length > 0 ? pendingNobles : null,
      lastMoves: lastMoves ?? get().lastMoves,
      undoSnapshot: null,
    });
  },

  takeGems: (colors: ColoredGem[]) => {
    const state = get();
    if (state.onlineState) {
      getSocket().emit('game:action', {
        code: state.onlineState.roomCode,
        action: { type: 'takeGems', colors },
      });
      return;
    }

    if (state.phase !== 'playing' && state.phase !== 'ending') return;
    if (state.pendingDiscard || state.pendingNobles) return;
    if (!canTakeGems(state, colors)) return;

    const newState = applyTakeGems(state, colors);
    const lastMoves = setLastMove(state.lastMoves, state.currentPlayerIndex, { type: 'takeGems', colors });
    set({ ...postActionChecks(newState), lastMoves, undoSnapshot: captureUndoSnapshot(state) });
  },

  take2Gems: (color: ColoredGem) => {
    const state = get();
    if (state.onlineState) {
      getSocket().emit('game:action', {
        code: state.onlineState.roomCode,
        action: { type: 'take2Gems', color },
      });
      return;
    }

    if (state.phase !== 'playing' && state.phase !== 'ending') return;
    if (state.pendingDiscard || state.pendingNobles) return;
    if (!canTake2Gems(state, color)) return;

    const newState = applyTake2Gems(state, color);
    const lastMoves = setLastMove(state.lastMoves, state.currentPlayerIndex, { type: 'take2Gems', color });
    set({ ...postActionChecks(newState), lastMoves, undoSnapshot: captureUndoSnapshot(state) });
  },

  reserveCard: (source: DevelopmentCard | { fromDeck: CardTier }) => {
    const state = get();
    if (state.onlineState) {
      getSocket().emit('game:action', {
        code: state.onlineState.roomCode,
        action: 'fromDeck' in source
          ? { type: 'reserveCard', fromDeck: source.fromDeck }
          : { type: 'reserveCard', cardId: source.id },
      });
      return;
    }

    if (state.phase !== 'playing' && state.phase !== 'ending') return;
    if (state.pendingDiscard || state.pendingNobles) return;
    if (!canReserveCard(state, source)) return;

    const card = 'fromDeck' in source ? undefined : source;
    const newState = applyReserveCard(state, source);
    const lastMoves = setLastMove(state.lastMoves, state.currentPlayerIndex, {
      type: 'reserveCard',
      cardId: card?.id,
      gemBonus: card?.gemBonus ?? 'white',
      prestigePoints: card?.prestigePoints ?? 0,
    });
    set({ ...postActionChecks(newState), lastMoves, undoSnapshot: captureUndoSnapshot(state) });
  },

  purchaseCard: (card: DevelopmentCard) => {
    const state = get();
    if (state.onlineState) {
      getSocket().emit('game:action', {
        code: state.onlineState.roomCode,
        action: { type: 'purchaseCard', cardId: card.id },
      });
      return;
    }

    if (state.phase !== 'playing' && state.phase !== 'ending') return;
    if (state.pendingDiscard || state.pendingNobles) return;
    if (!canPurchaseCard(state, card)) return;

    const newState = applyPurchaseCard(state, card);
    const lastMoves = setLastMove(state.lastMoves, state.currentPlayerIndex, {
      type: 'purchaseCard',
      cardId: card.id,
      gemBonus: card.gemBonus,
      prestigePoints: card.prestigePoints,
      cost: card.cost,
    });
    set({ ...postActionChecks(newState), lastMoves, undoSnapshot: captureUndoSnapshot(state) });
  },

  discardGems: (gems: GemCost) => {
    const state = get();
    if (state.onlineState) {
      getSocket().emit('game:action', {
        code: state.onlineState.roomCode,
        action: { type: 'discardGems', gems },
      });
      return;
    }

    if (!state.pendingDiscard) return;

    const newState = applyDiscardGems(state, gems);
    const player = newState.players[newState.currentPlayerIndex];

    if (getTotalGems(player) > MAX_GEMS_IN_HAND) {
      // Still over limit, keep pending
      set({ ...newState, pendingDiscard: true, pendingNobles: null });
      return;
    }

    // Discard resolved, continue post-action checks (noble/win/advance)
    const eligible = getEligibleNobles(newState.board.nobles, player);
    if (eligible.length > 0) {
      set({ ...newState, pendingNobles: eligible, pendingDiscard: false });
      return;
    }

    if (newState.phase === 'playing' && shouldTriggerEndGame(newState)) {
      const updated = { ...newState, phase: 'ending' as GamePhase };
      const advanced = advanceTurn(updated);
      set({ ...advanced, pendingNobles: null, pendingDiscard: false });
      return;
    }

    const advanced = advanceTurn(newState);
    set({ ...advanced, pendingNobles: null, pendingDiscard: false });
  },

  selectNoble: (noble: NobleTile) => {
    const state = get();
    if (state.onlineState) {
      getSocket().emit('game:action', {
        code: state.onlineState.roomCode,
        action: { type: 'selectNoble', nobleId: noble.id },
      });
      return;
    }

    if (!state.pendingNobles) return;
    if (!state.pendingNobles.some(n => n.id === noble.id)) return;

    const newState = applyNobleVisit(state, noble);

    // Check if more nobles are eligible
    const player = newState.players[newState.currentPlayerIndex];
    const remaining = getEligibleNobles(newState.board.nobles, player);
    if (remaining.length > 0) {
      set({ ...newState, pendingNobles: remaining, pendingDiscard: false });
      return;
    }

    // Check win trigger
    if (newState.phase === 'playing' && shouldTriggerEndGame(newState)) {
      const updated = { ...newState, phase: 'ending' as GamePhase };
      const advanced = advanceTurn(updated);
      set({ ...advanced, pendingNobles: null, pendingDiscard: false });
      return;
    }

    const advanced = advanceTurn(newState);
    set({ ...advanced, pendingNobles: null, pendingDiscard: false });
  },
}));
