import { describe, it, expect } from 'vitest';
import {
  TIER1_CARDS,
  TIER2_CARDS,
  TIER3_CARDS,
  NOBLE_TILES,
  ALL_CARDS,
  STARTING_GEMS,
  GEMS_PER_COLOR,
  GOLD_GEMS,
  COLORED_GEMS,
} from '../src/game/constants';

describe('Card counts', () => {
  it('Tier 1 has 40 cards', () => {
    expect(TIER1_CARDS).toHaveLength(40);
  });

  it('Tier 2 has 30 cards', () => {
    expect(TIER2_CARDS).toHaveLength(30);
  });

  it('Tier 3 has 20 cards', () => {
    expect(TIER3_CARDS).toHaveLength(20);
  });

  it('Total is 90 cards', () => {
    expect(ALL_CARDS).toHaveLength(90);
  });
});

describe('Noble tiles', () => {
  it('has 10 nobles', () => {
    expect(NOBLE_TILES).toHaveLength(10);
  });
});

describe('Unique IDs', () => {
  it('every card has a unique id', () => {
    const ids = ALL_CARDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every noble has a unique id', () => {
    const ids = NOBLE_TILES.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('No gold in card costs', () => {
  it('no card has gold as a cost key', () => {
    for (const card of ALL_CARDS) {
      expect('gold' in card.cost).toBe(false);
    }
  });
});

describe('Starting gems', () => {
  it('4 per colored gem for 2-player', () => {
    for (const color of COLORED_GEMS) {
      expect(STARTING_GEMS[color]).toBe(GEMS_PER_COLOR);
      expect(STARTING_GEMS[color]).toBe(4);
    }
  });

  it('5 gold gems', () => {
    expect(STARTING_GEMS.gold).toBe(GOLD_GEMS);
    expect(STARTING_GEMS.gold).toBe(5);
  });
});

describe('Cross-check sample cards against rules.md', () => {
  it('1-K-01: 0pts, black bonus, cost W1 U1 G1 R1', () => {
    const card = ALL_CARDS.find((c) => c.id === '1-K-01')!;
    expect(card.tier).toBe(1);
    expect(card.prestigePoints).toBe(0);
    expect(card.gemBonus).toBe('black');
    expect(card.cost).toEqual({ white: 1, blue: 1, green: 1, red: 1 });
  });

  it('2-K-06: 3pts, black bonus, cost W5 K3', () => {
    const card = ALL_CARDS.find((c) => c.id === '2-K-06')!;
    expect(card.tier).toBe(2);
    expect(card.prestigePoints).toBe(3);
    expect(card.gemBonus).toBe('black');
    expect(card.cost).toEqual({ white: 5, black: 3 });
  });

  it('3-U-04: 5pts, blue bonus, cost W7 K3', () => {
    const card = ALL_CARDS.find((c) => c.id === '3-U-04')!;
    expect(card.tier).toBe(3);
    expect(card.prestigePoints).toBe(5);
    expect(card.gemBonus).toBe('blue');
    expect(card.cost).toEqual({ white: 7, black: 3 });
  });

  it('1-R-08: 1pt, red bonus, cost G4', () => {
    const card = ALL_CARDS.find((c) => c.id === '1-R-08')!;
    expect(card.tier).toBe(1);
    expect(card.prestigePoints).toBe(1);
    expect(card.gemBonus).toBe('red');
    expect(card.cost).toEqual({ green: 4 });
  });

  it('3-G-04: 5pts, green bonus, cost R7 W3', () => {
    const card = ALL_CARDS.find((c) => c.id === '3-G-04')!;
    expect(card.tier).toBe(3);
    expect(card.prestigePoints).toBe(5);
    expect(card.gemBonus).toBe('green');
    expect(card.cost).toEqual({ red: 7, white: 3 });
  });
});
