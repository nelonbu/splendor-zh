import { describe, it, expect } from 'vitest';
import {
  generateInitialState,
  canTakeGems,
  canTake2Gems,
  canReserveCard,
  applyTakeGems,
  applyTake2Gems,
  applyReserveCard,
  applyPurchaseCard,
  applyDiscardGems,
  applyNobleVisit,
  shouldTriggerEndGame,
  determineWinner,
  advanceTurn,
} from './engine';
import { getEffectiveCost, canAfford, getEligibleNobles } from './selectors';
import type { GameState, PlayerState, DevelopmentCard, NobleTile, ColoredGem } from './types';

// ── Helpers ─────────────────────────────────────────────────

function makePlayer(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    name: 'Test',
    gems: { white: 0, blue: 0, green: 0, red: 0, black: 0, gold: 0 },
    reserved: [],
    purchased: [],
    nobles: [],
    ...overrides,
  };
}

function makeState(overrides: Partial<GameState> = {}): GameState {
  const base = generateInitialState('Alice', 'Bob');
  return { ...base, ...overrides };
}

function makeCard(overrides: Partial<DevelopmentCard> = {}): DevelopmentCard {
  return {
    id: 'test-card',
    tier: 1,
    prestigePoints: 0,
    gemBonus: 'white',
    cost: {},
    ...overrides,
  };
}

// ── generateInitialState ────────────────────────────────────

describe('generateInitialState', () => {
  it('returns phase "playing"', () => {
    const state = generateInitialState('Alice', 'Bob');
    expect(state.phase).toBe('playing');
  });

  it('has 4 of each colored gem and 5 gold in supply', () => {
    const state = generateInitialState('Alice', 'Bob');
    expect(state.board.gemSupply.white).toBe(4);
    expect(state.board.gemSupply.blue).toBe(4);
    expect(state.board.gemSupply.green).toBe(4);
    expect(state.board.gemSupply.red).toBe(4);
    expect(state.board.gemSupply.black).toBe(4);
    expect(state.board.gemSupply.gold).toBe(5);
  });

  it('has exactly 4 visible cards per tier', () => {
    const state = generateInitialState('Alice', 'Bob');
    expect(state.board.visibleCards[0]).toHaveLength(4);
    expect(state.board.visibleCards[1]).toHaveLength(4);
    expect(state.board.visibleCards[2]).toHaveLength(4);
  });

  it('has exactly 3 noble tiles', () => {
    const state = generateInitialState('Alice', 'Bob');
    expect(state.board.nobles).toHaveLength(3);
  });

  it('both players start with 0 gems and 0 cards', () => {
    const state = generateInitialState('Alice', 'Bob');
    for (const player of state.players) {
      expect(Object.values(player.gems).every(v => v === 0)).toBe(true);
      expect(player.purchased).toHaveLength(0);
      expect(player.reserved).toHaveLength(0);
      expect(player.nobles).toHaveLength(0);
    }
  });

  it('visible cards do not appear in the deck', () => {
    const state = generateInitialState('Alice', 'Bob');
    for (let i = 0; i < 3; i++) {
      const visibleIds = new Set(state.board.visibleCards[i].map(c => c.id));
      for (const card of state.board.decks[i]) {
        expect(visibleIds.has(card.id)).toBe(false);
      }
    }
  });

  it('deck sizes are correct after dealing visible cards', () => {
    const state = generateInitialState('Alice', 'Bob');
    expect(state.board.decks[0]).toHaveLength(36); // 40 - 4
    expect(state.board.decks[1]).toHaveLength(26); // 30 - 4
    expect(state.board.decks[2]).toHaveLength(16); // 20 - 4
  });
});

// ── canTakeGems / applyTakeGems ─────────────────────────────

describe('canTakeGems', () => {
  it('rejects gold', () => {
    const state = makeState();
    expect(canTakeGems(state, ['gold' as ColoredGem])).toBe(false);
  });

  it('rejects duplicate colors', () => {
    const state = makeState();
    expect(canTakeGems(state, ['blue', 'blue', 'red'])).toBe(false);
  });

  it('rejects more than 3 colors', () => {
    const state = makeState();
    expect(canTakeGems(state, ['white', 'blue', 'green', 'red'])).toBe(false);
  });

  it('rejects a color with 0 gems in supply', () => {
    const state = makeState();
    state.board.gemSupply.white = 0;
    expect(canTakeGems(state, ['white', 'blue', 'green'])).toBe(false);
  });

  it('accepts 1 or 2 colors when fewer are available', () => {
    const state = makeState();
    state.board.gemSupply = { white: 0, blue: 0, green: 0, red: 1, black: 1, gold: 5 };
    expect(canTakeGems(state, ['red', 'black'])).toBe(true);

    state.board.gemSupply = { white: 0, blue: 0, green: 0, red: 0, black: 1, gold: 5 };
    expect(canTakeGems(state, ['black'])).toBe(true);
  });

  it('rejects taking fewer colors than available', () => {
    const state = makeState();
    // All 5 colors available, but trying to take only 2
    expect(canTakeGems(state, ['white', 'blue'])).toBe(false);
  });

  it('rejects empty array', () => {
    const state = makeState();
    expect(canTakeGems(state, [])).toBe(false);
  });
});

describe('applyTakeGems', () => {
  it('transfers gems from supply to player', () => {
    const state = makeState();
    const colors: ColoredGem[] = ['white', 'blue', 'green'];
    const next = applyTakeGems(state, colors);

    expect(next.board.gemSupply.white).toBe(3);
    expect(next.board.gemSupply.blue).toBe(3);
    expect(next.board.gemSupply.green).toBe(3);
    expect(next.players[0].gems.white).toBe(1);
    expect(next.players[0].gems.blue).toBe(1);
    expect(next.players[0].gems.green).toBe(1);
  });
});

// ── canTake2Gems / applyTake2Gems ───────────────────────────

describe('canTake2Gems', () => {
  it('rejects when supply has < 4', () => {
    const state = makeState();
    state.board.gemSupply.white = 3;
    expect(canTake2Gems(state, 'white')).toBe(false);
  });

  it('rejects gold', () => {
    const state = makeState();
    expect(canTake2Gems(state, 'gold' as ColoredGem)).toBe(false);
  });

  it('accepts when supply has exactly 4', () => {
    const state = makeState();
    expect(canTake2Gems(state, 'white')).toBe(true);
  });
});

describe('applyTake2Gems', () => {
  it('player gains 2 and supply loses 2', () => {
    const state = makeState();
    const next = applyTake2Gems(state, 'white');

    expect(next.board.gemSupply.white).toBe(2);
    expect(next.players[0].gems.white).toBe(2);
  });
});

// ── getEffectiveCost ────────────────────────────────────────

describe('getEffectiveCost', () => {
  it('cost never goes below 0', () => {
    const player = makePlayer({
      purchased: [
        makeCard({ gemBonus: 'red' }),
        makeCard({ gemBonus: 'red' }),
        makeCard({ gemBonus: 'red' }),
      ],
    });
    const card = makeCard({ cost: { red: 2 } });
    const effective = getEffectiveCost(card, player);
    expect(effective.red ?? 0).toBe(0);
  });

  it('bonuses correctly reduce cost per color', () => {
    const player = makePlayer({
      purchased: [
        makeCard({ gemBonus: 'red' }),
        makeCard({ gemBonus: 'blue' }),
      ],
    });
    const card = makeCard({ cost: { red: 3, blue: 2, white: 1 } });
    const effective = getEffectiveCost(card, player);
    expect(effective.red).toBe(2);
    expect(effective.blue).toBe(1);
    expect(effective.white).toBe(1);
  });
});

// ── canAfford / applyPurchaseCard ───────────────────────────

describe('canAfford', () => {
  it('player with exact gems can purchase', () => {
    const player = makePlayer({
      gems: { white: 2, blue: 1, green: 0, red: 0, black: 0, gold: 0 },
    });
    const card = makeCard({ cost: { white: 2, blue: 1 } });
    expect(canAfford(card, player)).toBe(true);
  });

  it('gold fills missing gems', () => {
    const player = makePlayer({
      gems: { white: 0, blue: 0, green: 0, red: 0, black: 0, gold: 3 },
    });
    const card = makeCard({ cost: { white: 2, blue: 1 } });
    expect(canAfford(card, player)).toBe(true);
  });

  it('insufficient gems + gold cannot purchase', () => {
    const player = makePlayer({
      gems: { white: 0, blue: 0, green: 0, red: 0, black: 0, gold: 1 },
    });
    const card = makeCard({ cost: { white: 2, blue: 1 } });
    expect(canAfford(card, player)).toBe(false);
  });
});

describe('applyPurchaseCard', () => {
  it('purchased card moves from visible to player purchased list', () => {
    const state = makeState();
    const card = state.board.visibleCards[0][0];
    // Give the player enough gems
    state.players[0].gems = { white: 10, blue: 10, green: 10, red: 10, black: 10, gold: 5 };

    const next = applyPurchaseCard(state, card);
    expect(next.players[0].purchased.some(c => c.id === card.id)).toBe(true);
    expect(next.board.visibleCards[0].some(c => c.id === card.id)).toBe(false);
  });

  it('card slot is refilled from deck', () => {
    const state = makeState();
    const card = state.board.visibleCards[0][0];
    state.players[0].gems = { white: 10, blue: 10, green: 10, red: 10, black: 10, gold: 5 };
    const deckSizeBefore = state.board.decks[0].length;

    const next = applyPurchaseCard(state, card);
    // Visible count stays at 4 (refilled from deck)
    expect(next.board.visibleCards[0]).toHaveLength(4);
    expect(next.board.decks[0]).toHaveLength(deckSizeBefore - 1);
  });

  it('pays with gold for shortfall', () => {
    const state = makeState();
    const card = makeCard({ id: state.board.visibleCards[0][0].id, tier: 1, cost: { white: 3 } });
    state.board.visibleCards[0][0] = card;
    state.players[0].gems = { white: 1, blue: 0, green: 0, red: 0, black: 0, gold: 2 };

    const next = applyPurchaseCard(state, card);
    expect(next.players[0].gems.white).toBe(0);
    expect(next.players[0].gems.gold).toBe(0);
    expect(next.board.gemSupply.white).toBe(4 + 1); // original 4 + 1 returned
    expect(next.board.gemSupply.gold).toBe(5 + 2); // original 5 + 2 returned
  });

  it('purchasing a reserved card removes it from reserved', () => {
    const state = makeState();
    const card = makeCard({ cost: {} }); // free card
    state.players[0].reserved = [card];

    const next = applyPurchaseCard(state, card);
    expect(next.players[0].reserved).toHaveLength(0);
    expect(next.players[0].purchased.some(c => c.id === card.id)).toBe(true);
  });
});

// ── canReserveCard / applyReserveCard ───────────────────────

describe('canReserveCard', () => {
  it('rejected when player already has 3 reserved', () => {
    const state = makeState();
    state.players[0].reserved = [makeCard({ id: 'r1' }), makeCard({ id: 'r2' }), makeCard({ id: 'r3' })];
    const card = state.board.visibleCards[0][0];
    expect(canReserveCard(state, card)).toBe(false);
  });

  it('rejects blind reserve from empty deck', () => {
    const state = makeState();
    state.board.decks[0] = [];
    expect(canReserveCard(state, { fromDeck: 1 })).toBe(false);
  });
});

describe('applyReserveCard', () => {
  it('gold is awarded if supply > 0', () => {
    const state = makeState();
    const card = state.board.visibleCards[0][0];

    const next = applyReserveCard(state, card);
    expect(next.players[0].gems.gold).toBe(1);
    expect(next.board.gemSupply.gold).toBe(4);
  });

  it('no gold awarded if supply is empty', () => {
    const state = makeState();
    state.board.gemSupply.gold = 0;
    const card = state.board.visibleCards[0][0];

    const next = applyReserveCard(state, card);
    expect(next.players[0].gems.gold).toBe(0);
    expect(next.board.gemSupply.gold).toBe(0);
    expect(next.players[0].reserved).toHaveLength(1);
  });

  it('blind reserve removes top card from deck', () => {
    const state = makeState();
    const topCard = state.board.decks[0][0];
    const deckSize = state.board.decks[0].length;

    const next = applyReserveCard(state, { fromDeck: 1 });
    expect(next.players[0].reserved[0].id).toBe(topCard.id);
    expect(next.board.decks[0]).toHaveLength(deckSize - 1);
  });

  it('visible card is replaced from deck after reserve', () => {
    const state = makeState();
    const card = state.board.visibleCards[0][0];

    const next = applyReserveCard(state, card);
    expect(next.board.visibleCards[0]).toHaveLength(4);
    expect(next.board.visibleCards[0].some(c => c.id === card.id)).toBe(false);
  });
});

// ── getEligibleNobles ───────────────────────────────────────

describe('getEligibleNobles', () => {
  it('returns nobles whose requirements are fully met', () => {
    const noble: NobleTile = { id: 'N-test', prestigePoints: 3, requirement: { red: 3, green: 3 } };
    const player = makePlayer({
      purchased: [
        makeCard({ gemBonus: 'red' }),
        makeCard({ gemBonus: 'red' }),
        makeCard({ gemBonus: 'red' }),
        makeCard({ gemBonus: 'green' }),
        makeCard({ gemBonus: 'green' }),
        makeCard({ gemBonus: 'green' }),
      ],
    });
    expect(getEligibleNobles([noble], player)).toHaveLength(1);
  });

  it('returns empty when no noble is eligible', () => {
    const noble: NobleTile = { id: 'N-test', prestigePoints: 3, requirement: { red: 4, green: 4 } };
    const player = makePlayer({
      purchased: [makeCard({ gemBonus: 'red' })],
    });
    expect(getEligibleNobles([noble], player)).toHaveLength(0);
  });
});

// ── shouldTriggerEndGame ────────────────────────────────────

describe('shouldTriggerEndGame', () => {
  it('returns false when no player has >= 15 points', () => {
    const state = makeState();
    expect(shouldTriggerEndGame(state)).toBe(false);
  });

  it('returns true when a player reaches exactly 15', () => {
    const state = makeState();
    // Give player 0 cards worth 15 points
    state.players[0].purchased = [
      makeCard({ prestigePoints: 5 }),
      makeCard({ prestigePoints: 5 }),
      makeCard({ prestigePoints: 5 }),
    ];
    expect(shouldTriggerEndGame(state)).toBe(true);
  });

  it('returns true when a player exceeds 15', () => {
    const state = makeState();
    state.players[0].purchased = [
      makeCard({ prestigePoints: 5 }),
      makeCard({ prestigePoints: 5 }),
      makeCard({ prestigePoints: 5 }),
      makeCard({ prestigePoints: 3 }),
    ];
    expect(shouldTriggerEndGame(state)).toBe(true);
  });
});

// ── determineWinner ─────────────────────────────────────────

describe('determineWinner', () => {
  it('returns player with most points', () => {
    const state = makeState();
    state.players[0].purchased = [makeCard({ prestigePoints: 5 })];
    state.players[1].purchased = [makeCard({ prestigePoints: 3 })];
    expect(determineWinner(state).name).toBe('Alice');
  });

  it('tiebreak: fewer purchased cards wins', () => {
    const state = makeState();
    // Both have 6 points, but player 0 has fewer cards
    state.players[0].purchased = [makeCard({ prestigePoints: 6 })];
    state.players[1].purchased = [
      makeCard({ prestigePoints: 3 }),
      makeCard({ prestigePoints: 3 }),
    ];
    expect(determineWinner(state).name).toBe('Alice');
  });

  it('both equal on points and cards: player 2 wins', () => {
    const state = makeState();
    state.players[0].purchased = [makeCard({ prestigePoints: 5 })];
    state.players[1].purchased = [makeCard({ prestigePoints: 5 })];
    expect(determineWinner(state).name).toBe('Bob');
  });
});

// ── advanceTurn ─────────────────────────────────────────────

describe('advanceTurn', () => {
  it('flips currentPlayerIndex 0 -> 1 -> 0', () => {
    let state = makeState();
    state.currentPlayerIndex = 0;
    state = advanceTurn(state);
    expect(state.currentPlayerIndex).toBe(1);
    state = advanceTurn(state);
    expect(state.currentPlayerIndex).toBe(0);
  });

  it('when phase is ending and index wraps to 0, phase becomes ended', () => {
    const state = makeState();
    state.phase = 'ending';
    state.currentPlayerIndex = 1;
    // Give someone points so winner can be determined
    state.players[0].purchased = [makeCard({ prestigePoints: 15 })];

    const next = advanceTurn(state);
    expect(next.phase).toBe('ended');
    expect(next.winner).not.toBeNull();
  });

  it('when phase is ending but not wrapping to 0, phase stays ending', () => {
    const state = makeState();
    state.phase = 'ending';
    state.currentPlayerIndex = 0;

    const next = advanceTurn(state);
    expect(next.phase).toBe('ending');
    expect(next.currentPlayerIndex).toBe(1);
  });
});

// ── applyDiscardGems ────────────────────────────────────────

describe('applyDiscardGems', () => {
  it('removes gems from player and returns to supply', () => {
    const state = makeState();
    state.players[0].gems = { white: 5, blue: 4, green: 3, red: 0, black: 0, gold: 0 };

    const next = applyDiscardGems(state, { white: 1, blue: 1 });
    expect(next.players[0].gems.white).toBe(4);
    expect(next.players[0].gems.blue).toBe(3);
    expect(next.board.gemSupply.white).toBe(5); // 4 + 1
    expect(next.board.gemSupply.blue).toBe(5); // 4 + 1
  });
});

// ── applyNobleVisit ─────────────────────────────────────────

describe('applyNobleVisit', () => {
  it('moves noble from board to player', () => {
    const state = makeState();
    const noble = state.board.nobles[0];
    const boardNobleCount = state.board.nobles.length;

    const next = applyNobleVisit(state, noble);
    expect(next.players[0].nobles).toHaveLength(1);
    expect(next.players[0].nobles[0].id).toBe(noble.id);
    expect(next.board.nobles).toHaveLength(boardNobleCount - 1);
  });
});
