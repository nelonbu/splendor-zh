import { useEffect, useRef } from 'react';
import { useGameStore } from '../store/gameStore';
import { getLegalActions } from '../game/engine';
import { getTotalGems } from '../game/selectors';
import { MAX_GEMS_IN_HAND } from '../game/constants';
import { getAiMove, getAiDiscardDecision, getAiNobleSelection } from '../ai/aiService';
import type { AiAction } from '../ai/aiTypes';
import type { GameState, DevelopmentCard, CardTier } from '../game/types';

const AI_DELAY_MS = 1500;

function findCardById(state: GameState, cardId: string): DevelopmentCard | undefined {
  for (const tierCards of state.board.visibleCards) {
    const card = tierCards.find(c => c.id === cardId);
    if (card) return card;
  }
  return state.players[state.currentPlayerIndex].reserved.find(c => c.id === cardId);
}

function summarizeAction(action: AiAction): string {
  switch (action.type) {
    case 'takeGems':
      return `Took ${action.colors.join(', ')} gems`;
    case 'take2Gems':
      return `Took 2 ${action.color} gems`;
    case 'purchaseCard':
      return `Purchased card ${action.cardId}`;
    case 'reserveCard':
      if ('fromDeck' in action) return `Reserved from tier ${action.fromDeck} deck`;
      return `Reserved card ${action.cardId}`;
    case 'discardGems':
      return `Discarded gems`;
    case 'selectNoble':
      return `Selected noble ${action.nobleId}`;
  }
}

export default function AiPlayerController() {
  const runningRef = useRef(false);

  const currentPlayerIndex = useGameStore(s => s.currentPlayerIndex);
  const aiMode = useGameStore(s => s.aiMode);
  const aiConfig = useGameStore(s => s.aiConfig);
  const phase = useGameStore(s => s.phase);
  const pendingDiscard = useGameStore(s => s.pendingDiscard);
  const pendingNobles = useGameStore(s => s.pendingNobles);
  const aiStatus = useGameStore(s => s.aiState.status);
  const manualOverride = useGameStore(s => s.aiState.status === 'error' && s.aiState.consecutiveFailures >= 3);

  useEffect(() => {
    if (!aiMode || !aiConfig) return;
    if (currentPlayerIndex !== 1) return;
    if (phase !== 'playing' && phase !== 'ending') return;
    if (manualOverride) return;
    if (aiStatus === 'thinking') return;
    if (runningRef.current) return;

    const store = useGameStore.getState();

    async function runAiTurn() {
      runningRef.current = true;

      try {
        if (store.pendingDiscard) {
          const player = store.players[1];
          const excess = getTotalGems(player) - MAX_GEMS_IN_HAND;
          useGameStore.getState().setAiState({ status: 'thinking' });
          await delay(AI_DELAY_MS);
          const result = await getAiDiscardDecision(player.gems, excess, aiConfig!);
          if (result.action.type === 'discardGems' && result.action.gems) {
            useGameStore.getState().discardGems(result.action.gems);
          }
          useGameStore.getState().setAiState({
            status: 'done',
            reasoning: result.reasoning,
            actionSummary: summarizeAction(result.action),
          });
          return;
        }

        if (store.pendingNobles) {
          useGameStore.getState().setAiState({ status: 'thinking' });
          await delay(AI_DELAY_MS);
          const result = await getAiNobleSelection(store.pendingNobles, aiConfig!);
          if (result.action.type === 'selectNoble') {
            const nobleId = result.action.nobleId;
            const noble = store.pendingNobles.find(n => n.id === nobleId);
            if (noble) {
              useGameStore.getState().selectNoble(noble);
            }
          }
          useGameStore.getState().setAiState({
            status: 'done',
            reasoning: result.reasoning,
            actionSummary: summarizeAction(result.action),
          });
          return;
        }

        // Normal turn
        useGameStore.getState().setAiState({ status: 'thinking' });
        const currentState = useGameStore.getState() as GameState;
        const legalActions = getLegalActions(currentState);

        if (legalActions.length === 0) return;

        await delay(AI_DELAY_MS);
        const result = await getAiMove(currentState, legalActions, aiConfig!);
        const action = result.action;

        // Apply the action
        const latestStore = useGameStore.getState();
        switch (action.type) {
          case 'takeGems':
            latestStore.takeGems(action.colors);
            break;
          case 'take2Gems':
            latestStore.take2Gems(action.color);
            break;
          case 'purchaseCard': {
            const card = findCardById(latestStore as GameState, action.cardId);
            if (card) latestStore.purchaseCard(card);
            break;
          }
          case 'reserveCard': {
            if ('fromDeck' in action) {
              latestStore.reserveCard({ fromDeck: action.fromDeck as CardTier });
            } else {
              const card = findCardById(latestStore as GameState, action.cardId);
              if (card) latestStore.reserveCard(card);
            }
            break;
          }
        }

        useGameStore.getState().setAiState({
          status: 'done',
          reasoning: result.reasoning,
          actionSummary: summarizeAction(action),
          consecutiveFailures: 0,
        });
      } catch (err) {
        const prev = useGameStore.getState().aiState.consecutiveFailures;
        useGameStore.getState().setAiState({
          status: 'error',
          errorMessage: err instanceof Error ? err.message : 'AI request failed',
          consecutiveFailures: prev + 1,
        });
      } finally {
        runningRef.current = false;
      }
    }

    runAiTurn();
  }, [currentPlayerIndex, aiMode, aiConfig, phase, pendingDiscard, pendingNobles, aiStatus, manualOverride]);

  return null;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
