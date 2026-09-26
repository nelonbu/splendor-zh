import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../src/store/gameStore';
import type { ColoredGem, DevelopmentCard, NobleTile, PlayerState } from '../src/game/types';
import type { AiConfig } from '../src/ai/aiTypes';
import { getTotalGems } from '../src/game/selectors';

// Helper to get current store state
function getState() {
  return useGameStore.getState();
}

// Helper to set up a game
function initGame() {
  useGameStore.getState().initGame('Alice', 'Bob');
}

// Helper: create a minimal card for testing
function makeCard(overrides: Partial<DevelopmentCard> & { id: string; tier: 1 | 2 | 3 }): DevelopmentCard {
  return {
    prestigePoints: 0,
    gemBonus: 'white',
    cost: {},
    ...overrides,
  };
}

// Helper: create a noble tile for testing
function makeNoble(overrides: Partial<NobleTile> & { id: string }): NobleTile {
  return {
    prestigePoints: 3,
    requirement: {},
    ...overrides,
  };
}

describe('Store — Setup', () => {
  beforeEach(() => {
    useGameStore.getState().resetGame();
  });

  it('initGame produces valid initial state with phase "playing"', () => {
    initGame();
    const state = getState();
    expect(state.phase).toBe('playing');
    expect(state.players[0].name).toBe('Alice');
    expect(state.players[1].name).toBe('Bob');
    expect(state.currentPlayerIndex).toBe(0);
    expect(state.winner).toBeNull();
    expect(state.pendingNobles).toBeNull();
    expect(state.pendingDiscard).toBe(false);
    expect(state.board.nobles).toHaveLength(3);
    for (const tierCards of state.board.visibleCards) {
      expect(tierCards).toHaveLength(4);
    }
  });

  it('resetGame returns store to pre-init state', () => {
    initGame();
    useGameStore.getState().resetGame();
    const state = getState();
    expect(state.phase).toBe('setup');
    expect(state.players[0].name).toBe('');
    expect(state.players[1].name).toBe('');
    expect(state.board.nobles).toHaveLength(0);
  });
});

describe('Store — Turn flow', () => {
  beforeEach(() => {
    useGameStore.getState().resetGame();
    initGame();
  });

  it('takeGems with invalid args is a no-op (state unchanged)', () => {
    const before = getState();
    // Try taking gold
    useGameStore.getState().takeGems(['gold'] as unknown as ColoredGem[]);
    expect(getState().currentPlayerIndex).toBe(before.currentPlayerIndex);
    expect(getState().players[0].gems).toEqual(before.players[0].gems);
  });

  it('valid takeGems updates player gems and supply, then advances turn', () => {
    const supply = getState().board.gemSupply;
    // Find 3 colors with gems available
    const colors: ColoredGem[] = (['white', 'blue', 'green'] as ColoredGem[]).filter(
      c => supply[c] >= 1
    );
    expect(colors.length).toBe(3);

    useGameStore.getState().takeGems(colors);
    const state = getState();

    // Player 0 should have gained gems
    for (const c of colors) {
      expect(state.players[0].gems[c]).toBe(1);
    }
    // Supply decreased
    for (const c of colors) {
      expect(state.board.gemSupply[c]).toBe(supply[c] - 1);
    }
    // Turn should have advanced
    expect(state.currentPlayerIndex).toBe(1);
  });

  it('currentPlayerIndex flips after a complete valid action', () => {
    expect(getState().currentPlayerIndex).toBe(0);
    useGameStore.getState().takeGems(['white', 'blue', 'green']);
    expect(getState().currentPlayerIndex).toBe(1);
    useGameStore.getState().takeGems(['white', 'blue', 'green']);
    expect(getState().currentPlayerIndex).toBe(0);
  });
});

describe('Store — Gem discard', () => {
  beforeEach(() => {
    useGameStore.getState().resetGame();
    initGame();
  });

  it('triggers pendingDiscard when gems exceed 10', () => {
    // Give player 0 nine gems, then take more to exceed 10
    useGameStore.setState((state) => {
      const players = [...state.players] as [PlayerState, PlayerState];
      players[0] = {
        ...players[0],
        gems: { white: 2, blue: 2, green: 2, red: 2, black: 1, gold: 0 },
      };
      return { players };
    });
    // Player has 9 gems, taking 3 would give 12
    useGameStore.getState().takeGems(['white', 'blue', 'green']);
    const state = getState();
    expect(state.pendingDiscard).toBe(true);
    expect(getTotalGems(state.players[0])).toBe(12);
  });

  it('currentPlayerIndex does NOT advance while pendingDiscard is true', () => {
    useGameStore.setState((state) => {
      const players = [...state.players] as [PlayerState, PlayerState];
      players[0] = {
        ...players[0],
        gems: { white: 2, blue: 2, green: 2, red: 2, black: 1, gold: 0 },
      };
      return { players };
    });
    useGameStore.getState().takeGems(['white', 'blue', 'green']);
    expect(getState().pendingDiscard).toBe(true);
    expect(getState().currentPlayerIndex).toBe(0);
  });

  it('after discardGems brings total to ≤ 10, pendingDiscard is false and turn advances', () => {
    useGameStore.setState((state) => {
      const players = [...state.players] as [PlayerState, PlayerState];
      players[0] = {
        ...players[0],
        gems: { white: 2, blue: 2, green: 2, red: 2, black: 1, gold: 0 },
      };
      return { players };
    });
    useGameStore.getState().takeGems(['white', 'blue', 'green']);
    expect(getState().pendingDiscard).toBe(true);

    // Discard 2 gems to get back to 10
    useGameStore.getState().discardGems({ white: 2 });
    const state = getState();
    expect(state.pendingDiscard).toBe(false);
    expect(getTotalGems(state.players[0])).toBe(10);
    expect(state.currentPlayerIndex).toBe(1);
  });
});

describe('Store — Noble selection', () => {
  beforeEach(() => {
    useGameStore.getState().resetGame();
    initGame();
  });

  it('pendingNobles is set when a purchase satisfies a noble requirement', () => {
    // Set up: player 0 has 3 white bonus cards, noble requires 3 white
    const noble: NobleTile = makeNoble({ id: 'test-noble', requirement: { white: 3 } });
    const purchasedCards: DevelopmentCard[] = [
      makeCard({ id: 'pc1', tier: 1, gemBonus: 'white' }),
      makeCard({ id: 'pc2', tier: 1, gemBonus: 'white' }),
    ];
    // Card to buy that will give the 3rd white bonus
    const cardToBuy = makeCard({ id: 'buy-card', tier: 1, gemBonus: 'white', cost: {} });

    useGameStore.setState((state) => {
      const players = [...state.players] as [PlayerState, PlayerState];
      players[0] = {
        ...players[0],
        purchased: purchasedCards,
      };
      const board = {
        ...state.board,
        nobles: [noble],
        visibleCards: [[cardToBuy, ...state.board.visibleCards[0].slice(1)], state.board.visibleCards[1], state.board.visibleCards[2]] as [DevelopmentCard[], DevelopmentCard[], DevelopmentCard[]],
      };
      return { players, board };
    });

    useGameStore.getState().purchaseCard(cardToBuy);
    const state = getState();
    expect(state.pendingNobles).not.toBeNull();
    expect(state.pendingNobles!.some(n => n.id === 'test-noble')).toBe(true);
  });

  it('currentPlayerIndex does NOT advance while pendingNobles is non-null', () => {
    const noble = makeNoble({ id: 'test-noble', requirement: { white: 3 } });
    const purchasedCards = [
      makeCard({ id: 'pc1', tier: 1, gemBonus: 'white' }),
      makeCard({ id: 'pc2', tier: 1, gemBonus: 'white' }),
    ];
    const cardToBuy = makeCard({ id: 'buy-card', tier: 1, gemBonus: 'white', cost: {} });

    useGameStore.setState((state) => {
      const players = [...state.players] as [PlayerState, PlayerState];
      players[0] = { ...players[0], purchased: purchasedCards };
      const board = {
        ...state.board,
        nobles: [noble],
        visibleCards: [[cardToBuy, ...state.board.visibleCards[0].slice(1)], state.board.visibleCards[1], state.board.visibleCards[2]] as [DevelopmentCard[], DevelopmentCard[], DevelopmentCard[]],
      };
      return { players, board };
    });

    useGameStore.getState().purchaseCard(cardToBuy);
    expect(getState().pendingNobles).not.toBeNull();
    expect(getState().currentPlayerIndex).toBe(0);
  });

  it('after selectNoble, noble moves to player, pendingNobles is null, turn advances', () => {
    const noble = makeNoble({ id: 'test-noble', requirement: { white: 3 } });
    const purchasedCards = [
      makeCard({ id: 'pc1', tier: 1, gemBonus: 'white' }),
      makeCard({ id: 'pc2', tier: 1, gemBonus: 'white' }),
    ];
    const cardToBuy = makeCard({ id: 'buy-card', tier: 1, gemBonus: 'white', cost: {} });

    useGameStore.setState((state) => {
      const players = [...state.players] as [PlayerState, PlayerState];
      players[0] = { ...players[0], purchased: purchasedCards };
      const board = {
        ...state.board,
        nobles: [noble],
        visibleCards: [[cardToBuy, ...state.board.visibleCards[0].slice(1)], state.board.visibleCards[1], state.board.visibleCards[2]] as [DevelopmentCard[], DevelopmentCard[], DevelopmentCard[]],
      };
      return { players, board };
    });

    useGameStore.getState().purchaseCard(cardToBuy);
    expect(getState().pendingNobles).not.toBeNull();

    useGameStore.getState().selectNoble(noble);
    const state = getState();
    expect(state.pendingNobles).toBeNull();
    expect(state.players[0].nobles.some(n => n.id === 'test-noble')).toBe(true);
    expect(state.currentPlayerIndex).toBe(1);
  });
});

describe('Store — End-game sequence', () => {
  beforeEach(() => {
    useGameStore.getState().resetGame();
    initGame();
  });

  it('shouldTriggerEndGame returning true sets phase to "ending"', () => {
    // Give player 0 enough points via purchased cards
    const highPointCards: DevelopmentCard[] = [];
    for (let i = 0; i < 5; i++) {
      highPointCards.push(makeCard({ id: `hp-${i}`, tier: 3, prestigePoints: 3, gemBonus: 'white' }));
    }
    // Free card to buy that gives another point
    const cardToBuy = makeCard({ id: 'final-card', tier: 1, gemBonus: 'blue', prestigePoints: 1, cost: {} });

    useGameStore.setState((state) => {
      const players = [...state.players] as [PlayerState, PlayerState];
      players[0] = { ...players[0], purchased: highPointCards };
      const board = {
        ...state.board,
        visibleCards: [[cardToBuy, ...state.board.visibleCards[0].slice(1)], state.board.visibleCards[1], state.board.visibleCards[2]] as [DevelopmentCard[], DevelopmentCard[], DevelopmentCard[]],
      };
      return { players, board };
    });

    // Player 0 has 15 points, buys 1 more → 16 → triggers ending
    useGameStore.getState().purchaseCard(cardToBuy);
    const state = getState();
    // Phase should be 'ending' (player 2 still needs their turn)
    expect(state.phase).toBe('ending');
    expect(state.currentPlayerIndex).toBe(1);
  });

  it('while phase is "ending", the other player still gets their turn', () => {
    const highPointCards: DevelopmentCard[] = [];
    for (let i = 0; i < 5; i++) {
      highPointCards.push(makeCard({ id: `hp-${i}`, tier: 3, prestigePoints: 3, gemBonus: 'white' }));
    }
    const cardToBuy = makeCard({ id: 'final-card', tier: 1, gemBonus: 'blue', prestigePoints: 1, cost: {} });

    useGameStore.setState((state) => {
      const players = [...state.players] as [PlayerState, PlayerState];
      players[0] = { ...players[0], purchased: highPointCards };
      const board = {
        ...state.board,
        visibleCards: [[cardToBuy, ...state.board.visibleCards[0].slice(1)], state.board.visibleCards[1], state.board.visibleCards[2]] as [DevelopmentCard[], DevelopmentCard[], DevelopmentCard[]],
      };
      return { players, board };
    });

    useGameStore.getState().purchaseCard(cardToBuy);
    expect(getState().phase).toBe('ending');
    expect(getState().currentPlayerIndex).toBe(1);

    // Player 2 can still take an action
    useGameStore.getState().takeGems(['white', 'blue', 'green']);
    const state = getState();
    // After player 2's turn, wrapping back to player 0 → phase 'ended'
    expect(state.phase).toBe('ended');
    expect(state.winner).not.toBeNull();
  });

  it('after the second player turn, phase is "ended" and winner is set', () => {
    const highPointCards: DevelopmentCard[] = [];
    for (let i = 0; i < 5; i++) {
      highPointCards.push(makeCard({ id: `hp-${i}`, tier: 3, prestigePoints: 3, gemBonus: 'white' }));
    }
    const cardToBuy = makeCard({ id: 'final-card', tier: 1, gemBonus: 'blue', prestigePoints: 1, cost: {} });

    useGameStore.setState((state) => {
      const players = [...state.players] as [PlayerState, PlayerState];
      players[0] = { ...players[0], purchased: highPointCards };
      const board = {
        ...state.board,
        visibleCards: [[cardToBuy, ...state.board.visibleCards[0].slice(1)], state.board.visibleCards[1], state.board.visibleCards[2]] as [DevelopmentCard[], DevelopmentCard[], DevelopmentCard[]],
      };
      return { players, board };
    });

    useGameStore.getState().purchaseCard(cardToBuy);
    useGameStore.getState().takeGems(['white', 'blue', 'green']);

    const state = getState();
    expect(state.phase).toBe('ended');
    expect(state.winner).not.toBeNull();
    expect(state.winner!.name).toBe('Alice');
  });
});

describe('Store — AI mode', () => {
  beforeEach(() => {
    useGameStore.getState().resetGame();
  });

  const mockConfig: AiConfig = {
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    apiKey: 'test-key',
  };

  it('initGame with aiMode sets aiMode, aiConfig, and player 2 name to "AI Player"', () => {
    useGameStore.getState().initGame('Alice', 'Bob', true, mockConfig);
    const state = getState();
    expect(state.aiMode).toBe(true);
    expect(state.aiConfig).toEqual(mockConfig);
    expect(state.players[1].name).toBe('AI Player');
    expect(state.aiState.status).toBe('idle');
    expect(state.aiState.reasoning).toEqual([]);
    expect(state.aiState.consecutiveFailures).toBe(0);
  });

  it('initGame without aiMode defaults to false', () => {
    useGameStore.getState().initGame('Alice', 'Bob');
    const state = getState();
    expect(state.aiMode).toBe(false);
    expect(state.aiConfig).toBeNull();
    expect(state.players[1].name).toBe('Bob');
  });

  it('resetGame clears all AI state', () => {
    useGameStore.getState().initGame('Alice', 'Bob', true, mockConfig);
    useGameStore.getState().setAiState({ status: 'thinking', reasoning: ['test'] });
    useGameStore.getState().resetGame();
    const state = getState();
    expect(state.aiMode).toBe(false);
    expect(state.aiConfig).toBeNull();
    expect(state.aiState.status).toBe('idle');
    expect(state.aiState.reasoning).toEqual([]);
    expect(state.aiState.errorMessage).toBe('');
    expect(state.aiState.consecutiveFailures).toBe(0);
  });

  it('setAiState updates AI state partially', () => {
    useGameStore.getState().initGame('Alice', 'Bob', true, mockConfig);
    useGameStore.getState().setAiState({ status: 'thinking' });
    expect(getState().aiState.status).toBe('thinking');
    expect(getState().aiState.reasoning).toEqual([]); // unchanged

    useGameStore.getState().setAiState({
      status: 'done',
      reasoning: ['Good move', 'Strong position'],
      actionSummary: 'Took 3 gems',
    });
    const state = getState();
    expect(state.aiState.status).toBe('done');
    expect(state.aiState.reasoning).toEqual(['Good move', 'Strong position']);
    expect(state.aiState.actionSummary).toBe('Took 3 gems');
    expect(state.aiState.consecutiveFailures).toBe(0); // unchanged
  });

  it('setAiState tracks consecutive failures', () => {
    useGameStore.getState().initGame('Alice', 'Bob', true, mockConfig);
    useGameStore.getState().setAiState({ status: 'error', errorMessage: 'API error', consecutiveFailures: 1 });
    expect(getState().aiState.consecutiveFailures).toBe(1);

    useGameStore.getState().setAiState({ consecutiveFailures: 2 });
    expect(getState().aiState.consecutiveFailures).toBe(2);
  });
});

describe('Store — Guard rails', () => {
  beforeEach(() => {
    useGameStore.getState().resetGame();
    initGame();
  });

  it('actions called during pendingDiscard (other than discardGems) are no-ops', () => {
    // Force pendingDiscard
    useGameStore.setState((state) => {
      const players = [...state.players] as [PlayerState, PlayerState];
      players[0] = {
        ...players[0],
        gems: { white: 2, blue: 2, green: 2, red: 2, black: 1, gold: 0 },
      };
      return { players };
    });
    useGameStore.getState().takeGems(['white', 'blue', 'green']);
    expect(getState().pendingDiscard).toBe(true);

    const stateBefore = getState();

    // These should all be no-ops
    useGameStore.getState().takeGems(['red', 'black', 'white']);
    expect(getState()).toBe(stateBefore);

    useGameStore.getState().take2Gems('red');
    expect(getState()).toBe(stateBefore);

    const visibleCard = getState().board.visibleCards[0][0];
    if (visibleCard) {
      useGameStore.getState().reserveCard(visibleCard);
      expect(getState()).toBe(stateBefore);

      useGameStore.getState().purchaseCard(visibleCard);
      expect(getState()).toBe(stateBefore);
    }
  });

  it('actions called during pendingNobles (other than selectNoble) are no-ops', () => {
    const noble = makeNoble({ id: 'test-noble', requirement: { white: 3 } });
    const purchasedCards = [
      makeCard({ id: 'pc1', tier: 1, gemBonus: 'white' }),
      makeCard({ id: 'pc2', tier: 1, gemBonus: 'white' }),
    ];
    const cardToBuy = makeCard({ id: 'buy-card', tier: 1, gemBonus: 'white', cost: {} });

    useGameStore.setState((state) => {
      const players = [...state.players] as [PlayerState, PlayerState];
      players[0] = { ...players[0], purchased: purchasedCards };
      const board = {
        ...state.board,
        nobles: [noble],
        visibleCards: [[cardToBuy, ...state.board.visibleCards[0].slice(1)], state.board.visibleCards[1], state.board.visibleCards[2]] as [DevelopmentCard[], DevelopmentCard[], DevelopmentCard[]],
      };
      return { players, board };
    });

    useGameStore.getState().purchaseCard(cardToBuy);
    expect(getState().pendingNobles).not.toBeNull();

    const stateBefore = getState();
    useGameStore.getState().takeGems(['red', 'black', 'blue']);
    expect(getState()).toBe(stateBefore);

    useGameStore.getState().take2Gems('red');
    expect(getState()).toBe(stateBefore);
  });

  it('actions called when phase is "ended" are no-ops', () => {
    // Directly set phase to ended
    useGameStore.setState({ phase: 'ended', winner: getState().players[0] });

    const stateBefore = getState();
    useGameStore.getState().takeGems(['white', 'blue', 'green']);
    expect(getState()).toBe(stateBefore);

    useGameStore.getState().take2Gems('white');
    expect(getState()).toBe(stateBefore);
  });
});
