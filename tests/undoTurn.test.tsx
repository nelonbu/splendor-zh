import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import PlayerPanel from '../src/components/PlayerPanel';
import { canUndoLastTurn, useGameStore } from '../src/store/gameStore';
import type { DevelopmentCard, NobleTile, PlayerState } from '../src/game/types';

function gameState() {
  const { board, players, currentPlayerIndex, phase, winner, turnCount, lastMoves } = useGameStore.getState();
  return { board, players, currentPlayerIndex, phase, winner, turnCount, lastMoves };
}

describe('local turn undo', () => {
  beforeEach(() => {
    useGameStore.getState().resetGame();
    useGameStore.getState().initGame('Alice', 'Bob');
  });

  afterEach(cleanup);

  it('shows undo below the previous move and restores the acting player before the move', () => {
    const before = gameState();
    useGameStore.getState().takeGems(['white', 'blue', 'green']);
    expect(canUndoLastTurn(useGameStore.getState(), 0)).toBe(true);

    render(<PlayerPanel playerIndex={0} />);
    const button = screen.getByRole('button', { name: '撤回Alice的上一步操作' });
    expect(button.closest('.player-last-move-column')?.querySelector('.player-last-move')).toBeTruthy();
    fireEvent.click(button);

    expect(gameState()).toEqual(before);
    expect(useGameStore.getState().currentPlayerIndex).toBe(0);
    expect(screen.queryByRole('button', { name: '撤回Alice的上一步操作' })).toBeNull();

    useGameStore.getState().take2Gems('white');
    expect(useGameStore.getState().players[0].gems.white).toBe(2);
    expect(canUndoLastTurn(useGameStore.getState(), 0)).toBe(true);
  });

  it('restores the deck and card order after a blind reservation', () => {
    const before = gameState();
    useGameStore.getState().reserveCard({ fromDeck: 1 });
    expect(useGameStore.getState().players[0].reserved).toHaveLength(1);
    useGameStore.getState().undoLastTurn();
    expect(gameState()).toEqual(before);
  });

  it('waits for required discard before offering undo, then restores the original turn', () => {
    useGameStore.setState(state => {
      const players = [...state.players] as [PlayerState, PlayerState];
      players[0] = {
        ...players[0],
        gems: { white: 2, blue: 2, green: 2, red: 2, black: 1, gold: 0 },
      };
      return { players };
    });
    const before = gameState();
    useGameStore.getState().takeGems(['white', 'blue', 'green']);
    expect(useGameStore.getState().pendingDiscard).toBe(true);
    expect(canUndoLastTurn(useGameStore.getState(), 0)).toBe(false);
    useGameStore.getState().undoLastTurn();
    expect(useGameStore.getState().pendingDiscard).toBe(true);

    useGameStore.getState().discardGems({ white: 2 });
    expect(canUndoLastTurn(useGameStore.getState(), 0)).toBe(true);
    useGameStore.getState().undoLastTurn();
    expect(gameState()).toEqual(before);
  });

  it('restores a purchase and noble visit together, then only allows the latest player to undo', () => {
    const noble: NobleTile = { id: 'undo-noble', prestigePoints: 3, requirement: { white: 3 } };
    const purchased = [0, 1].map(index => ({
      id: `undo-owned-${index}`, tier: 1 as const, prestigePoints: 0, gemBonus: 'white' as const, cost: {},
    }));
    const card: DevelopmentCard = { id: 'undo-buy', tier: 1, prestigePoints: 0, gemBonus: 'white', cost: {} };
    useGameStore.setState(state => {
      const players = [...state.players] as [PlayerState, PlayerState];
      players[0] = { ...players[0], purchased };
      return {
        players,
        board: {
          ...state.board,
          nobles: [noble],
          visibleCards: [[card, ...state.board.visibleCards[0].slice(1)], state.board.visibleCards[1], state.board.visibleCards[2]],
        },
      };
    });
    const before = gameState();
    useGameStore.getState().purchaseCard(card);
    expect(useGameStore.getState().pendingNobles).not.toBeNull();
    expect(canUndoLastTurn(useGameStore.getState(), 0)).toBe(false);
    useGameStore.getState().selectNoble(noble);
    expect(canUndoLastTurn(useGameStore.getState(), 0)).toBe(true);
    useGameStore.getState().undoLastTurn();
    expect(gameState()).toEqual(before);

    useGameStore.getState().takeGems(['white', 'blue', 'green']);
    useGameStore.getState().takeGems(['white', 'blue', 'green']);
    expect(canUndoLastTurn(useGameStore.getState(), 0)).toBe(false);
    expect(canUndoLastTurn(useGameStore.getState(), 1)).toBe(true);
  });
});
