import type { DevelopmentCard, NobleTile, GemColor } from './types';

// ── Game Constants ──────────────────────────────────────────

export const GEMS_PER_COLOR = 4; // 2-player game
export const GOLD_GEMS = 5;
export const NOBLE_COUNT = 3; // players + 1
export const CARDS_VISIBLE_PER_TIER = 4;
export const MAX_RESERVED_CARDS = 3;
export const MAX_GEMS_IN_HAND = 10;
export const WIN_THRESHOLD = 15;
export const TAKE_2_MIN_SUPPLY = 4;

export const STARTING_GEMS: Record<GemColor, number> = {
  white: GEMS_PER_COLOR,
  blue: GEMS_PER_COLOR,
  green: GEMS_PER_COLOR,
  red: GEMS_PER_COLOR,
  black: GEMS_PER_COLOR,
  gold: GOLD_GEMS,
};

// ── Tier 1 Cards (40) ──────────────────────────────────────

export const TIER1_CARDS: DevelopmentCard[] = [
  // Black bonus (8)
  { id: '1-K-01', tier: 1, prestigePoints: 0, gemBonus: 'black', cost: { white: 1, blue: 1, green: 1, red: 1 } },
  { id: '1-K-02', tier: 1, prestigePoints: 0, gemBonus: 'black', cost: { blue: 2, green: 2 } },
  { id: '1-K-03', tier: 1, prestigePoints: 0, gemBonus: 'black', cost: { green: 2, red: 1 } },
  { id: '1-K-04', tier: 1, prestigePoints: 0, gemBonus: 'black', cost: { blue: 1, red: 2 } },
  { id: '1-K-05', tier: 1, prestigePoints: 0, gemBonus: 'black', cost: { blue: 2, red: 1 } },
  { id: '1-K-06', tier: 1, prestigePoints: 0, gemBonus: 'black', cost: { green: 3 } },
  { id: '1-K-07', tier: 1, prestigePoints: 1, gemBonus: 'black', cost: { green: 1, red: 3, white: 1 } },
  { id: '1-K-08', tier: 1, prestigePoints: 0, gemBonus: 'black', cost: { red: 2, white: 2 } },

  // White bonus (8)
  { id: '1-W-01', tier: 1, prestigePoints: 0, gemBonus: 'white', cost: { blue: 1, green: 1, red: 1, black: 1 } },
  { id: '1-W-02', tier: 1, prestigePoints: 0, gemBonus: 'white', cost: { blue: 1, red: 2 } },
  { id: '1-W-03', tier: 1, prestigePoints: 0, gemBonus: 'white', cost: { red: 2, black: 2 } },
  { id: '1-W-04', tier: 1, prestigePoints: 0, gemBonus: 'white', cost: { blue: 2, black: 1 } },
  { id: '1-W-05', tier: 1, prestigePoints: 0, gemBonus: 'white', cost: { black: 3 } },
  { id: '1-W-06', tier: 1, prestigePoints: 0, gemBonus: 'white', cost: { green: 2, red: 1 } },
  { id: '1-W-07', tier: 1, prestigePoints: 0, gemBonus: 'white', cost: { green: 1, red: 1, black: 3 } },
  { id: '1-W-08', tier: 1, prestigePoints: 1, gemBonus: 'white', cost: { black: 4 } },

  // Blue bonus (8)
  { id: '1-U-01', tier: 1, prestigePoints: 0, gemBonus: 'blue', cost: { white: 1, green: 1, red: 1, black: 1 } },
  { id: '1-U-02', tier: 1, prestigePoints: 0, gemBonus: 'blue', cost: { white: 1, green: 2 } },
  { id: '1-U-03', tier: 1, prestigePoints: 0, gemBonus: 'blue', cost: { white: 2, red: 2 } },
  { id: '1-U-04', tier: 1, prestigePoints: 0, gemBonus: 'blue', cost: { white: 2, green: 1 } },
  { id: '1-U-05', tier: 1, prestigePoints: 0, gemBonus: 'blue', cost: { white: 3 } },
  { id: '1-U-06', tier: 1, prestigePoints: 0, gemBonus: 'blue', cost: { red: 1, black: 2 } },
  { id: '1-U-07', tier: 1, prestigePoints: 0, gemBonus: 'blue', cost: { white: 1, black: 1, red: 3 } },
  { id: '1-U-08', tier: 1, prestigePoints: 1, gemBonus: 'blue', cost: { white: 4 } },

  // Green bonus (8)
  { id: '1-G-01', tier: 1, prestigePoints: 0, gemBonus: 'green', cost: { white: 1, blue: 1, red: 1, black: 1 } },
  { id: '1-G-02', tier: 1, prestigePoints: 0, gemBonus: 'green', cost: { white: 2, blue: 1 } },
  { id: '1-G-03', tier: 1, prestigePoints: 0, gemBonus: 'green', cost: { blue: 1, black: 2 } },
  { id: '1-G-04', tier: 1, prestigePoints: 0, gemBonus: 'green', cost: { white: 1, blue: 2 } },
  { id: '1-G-05', tier: 1, prestigePoints: 0, gemBonus: 'green', cost: { red: 3 } },
  { id: '1-G-06', tier: 1, prestigePoints: 0, gemBonus: 'green', cost: { white: 2, black: 2 } },
  { id: '1-G-07', tier: 1, prestigePoints: 0, gemBonus: 'green', cost: { blue: 1, red: 1, black: 3 } },
  { id: '1-G-08', tier: 1, prestigePoints: 1, gemBonus: 'green', cost: { blue: 4 } },

  // Red bonus (8)
  { id: '1-R-01', tier: 1, prestigePoints: 0, gemBonus: 'red', cost: { white: 1, blue: 1, green: 1, black: 1 } },
  { id: '1-R-02', tier: 1, prestigePoints: 0, gemBonus: 'red', cost: { white: 2, blue: 2 } },
  { id: '1-R-03', tier: 1, prestigePoints: 0, gemBonus: 'red', cost: { white: 1, blue: 1 } },
  { id: '1-R-04', tier: 1, prestigePoints: 0, gemBonus: 'red', cost: { green: 2, black: 1 } },
  { id: '1-R-05', tier: 1, prestigePoints: 0, gemBonus: 'red', cost: { blue: 3 } },
  { id: '1-R-06', tier: 1, prestigePoints: 0, gemBonus: 'red', cost: { green: 2, white: 1 } },
  { id: '1-R-07', tier: 1, prestigePoints: 0, gemBonus: 'red', cost: { green: 2, white: 1, black: 1 } },
  { id: '1-R-08', tier: 1, prestigePoints: 1, gemBonus: 'red', cost: { green: 4 } },
];

// ── Tier 2 Cards (30) ──────────────────────────────────────

export const TIER2_CARDS: DevelopmentCard[] = [
  // Black bonus (6)
  { id: '2-K-01', tier: 2, prestigePoints: 1, gemBonus: 'black', cost: { green: 3, red: 2, white: 2 } },
  { id: '2-K-02', tier: 2, prestigePoints: 1, gemBonus: 'black', cost: { blue: 3, red: 2 } },
  { id: '2-K-03', tier: 2, prestigePoints: 2, gemBonus: 'black', cost: { blue: 1, red: 4 } },
  { id: '2-K-04', tier: 2, prestigePoints: 2, gemBonus: 'black', cost: { green: 5 } },
  { id: '2-K-05', tier: 2, prestigePoints: 2, gemBonus: 'black', cost: { red: 5 } },
  { id: '2-K-06', tier: 2, prestigePoints: 3, gemBonus: 'black', cost: { white: 5, black: 3 } },

  // White bonus (6)
  { id: '2-W-01', tier: 2, prestigePoints: 1, gemBonus: 'white', cost: { blue: 2, green: 2, black: 3 } },
  { id: '2-W-02', tier: 2, prestigePoints: 1, gemBonus: 'white', cost: { green: 1, red: 1, black: 3 } },
  { id: '2-W-03', tier: 2, prestigePoints: 2, gemBonus: 'white', cost: { green: 1, red: 4 } },
  { id: '2-W-04', tier: 2, prestigePoints: 2, gemBonus: 'white', cost: { red: 5 } },
  { id: '2-W-05', tier: 2, prestigePoints: 2, gemBonus: 'white', cost: { black: 5 } },
  { id: '2-W-06', tier: 2, prestigePoints: 3, gemBonus: 'white', cost: { black: 5, blue: 3 } },

  // Blue bonus (6)
  { id: '2-U-01', tier: 2, prestigePoints: 1, gemBonus: 'blue', cost: { white: 3, green: 2, black: 2 } },
  { id: '2-U-02', tier: 2, prestigePoints: 1, gemBonus: 'blue', cost: { white: 2, red: 2, black: 1 } },
  { id: '2-U-03', tier: 2, prestigePoints: 2, gemBonus: 'blue', cost: { white: 4, black: 1 } },
  { id: '2-U-04', tier: 2, prestigePoints: 2, gemBonus: 'blue', cost: { white: 5 } },
  { id: '2-U-05', tier: 2, prestigePoints: 2, gemBonus: 'blue', cost: { green: 5 } },
  { id: '2-U-06', tier: 2, prestigePoints: 3, gemBonus: 'blue', cost: { green: 5, red: 3 } },

  // Green bonus (6)
  { id: '2-G-01', tier: 2, prestigePoints: 1, gemBonus: 'green', cost: { white: 2, blue: 3, black: 2 } },
  { id: '2-G-02', tier: 2, prestigePoints: 1, gemBonus: 'green', cost: { white: 3, blue: 1, red: 1 } },
  { id: '2-G-03', tier: 2, prestigePoints: 2, gemBonus: 'green', cost: { blue: 4, white: 1 } },
  { id: '2-G-04', tier: 2, prestigePoints: 2, gemBonus: 'green', cost: { blue: 5 } },
  { id: '2-G-05', tier: 2, prestigePoints: 2, gemBonus: 'green', cost: { black: 5 } },
  { id: '2-G-06', tier: 2, prestigePoints: 3, gemBonus: 'green', cost: { blue: 5, black: 3 } },

  // Red bonus (6)
  { id: '2-R-01', tier: 2, prestigePoints: 1, gemBonus: 'red', cost: { white: 2, blue: 1, green: 3, black: 1 } },
  { id: '2-R-02', tier: 2, prestigePoints: 1, gemBonus: 'red', cost: { blue: 1, green: 2, black: 2 } },
  { id: '2-R-03', tier: 2, prestigePoints: 2, gemBonus: 'red', cost: { blue: 2, green: 4 } },
  { id: '2-R-04', tier: 2, prestigePoints: 2, gemBonus: 'red', cost: { blue: 5 } },
  { id: '2-R-05', tier: 2, prestigePoints: 2, gemBonus: 'red', cost: { white: 5 } },
  { id: '2-R-06', tier: 2, prestigePoints: 3, gemBonus: 'red', cost: { white: 3, black: 5 } },
];

// ── Tier 3 Cards (20) ──────────────────────────────────────

export const TIER3_CARDS: DevelopmentCard[] = [
  // Black bonus (4)
  { id: '3-K-01', tier: 3, prestigePoints: 3, gemBonus: 'black', cost: { white: 3, blue: 3, green: 3, red: 5 } },
  { id: '3-K-02', tier: 3, prestigePoints: 4, gemBonus: 'black', cost: { blue: 7 } },
  { id: '3-K-03', tier: 3, prestigePoints: 4, gemBonus: 'black', cost: { green: 3, red: 6, white: 3 } },
  { id: '3-K-04', tier: 3, prestigePoints: 5, gemBonus: 'black', cost: { blue: 7, red: 3 } },

  // White bonus (4)
  { id: '3-W-01', tier: 3, prestigePoints: 3, gemBonus: 'white', cost: { blue: 3, green: 3, red: 3, black: 5 } },
  { id: '3-W-02', tier: 3, prestigePoints: 4, gemBonus: 'white', cost: { black: 7 } },
  { id: '3-W-03', tier: 3, prestigePoints: 4, gemBonus: 'white', cost: { blue: 3, green: 6, black: 3 } },
  { id: '3-W-04', tier: 3, prestigePoints: 5, gemBonus: 'white', cost: { black: 7, green: 3 } },

  // Blue bonus (4)
  { id: '3-U-01', tier: 3, prestigePoints: 3, gemBonus: 'blue', cost: { white: 3, green: 3, red: 3, black: 3 } },
  { id: '3-U-02', tier: 3, prestigePoints: 4, gemBonus: 'blue', cost: { white: 7 } },
  { id: '3-U-03', tier: 3, prestigePoints: 4, gemBonus: 'blue', cost: { white: 6, red: 3, black: 3 } },
  { id: '3-U-04', tier: 3, prestigePoints: 5, gemBonus: 'blue', cost: { white: 7, black: 3 } },

  // Green bonus (4)
  { id: '3-G-01', tier: 3, prestigePoints: 3, gemBonus: 'green', cost: { white: 3, blue: 5, red: 3, black: 3 } },
  { id: '3-G-02', tier: 3, prestigePoints: 4, gemBonus: 'green', cost: { red: 7 } },
  { id: '3-G-03', tier: 3, prestigePoints: 4, gemBonus: 'green', cost: { white: 3, red: 6, black: 3 } },
  { id: '3-G-04', tier: 3, prestigePoints: 5, gemBonus: 'green', cost: { red: 7, white: 3 } },

  // Red bonus (4)
  { id: '3-R-01', tier: 3, prestigePoints: 3, gemBonus: 'red', cost: { white: 3, blue: 3, green: 5, black: 3 } },
  { id: '3-R-02', tier: 3, prestigePoints: 4, gemBonus: 'red', cost: { green: 7 } },
  { id: '3-R-03', tier: 3, prestigePoints: 4, gemBonus: 'red', cost: { blue: 3, green: 6, white: 3 } },
  { id: '3-R-04', tier: 3, prestigePoints: 5, gemBonus: 'red', cost: { green: 7, blue: 3 } },
];

// ── Noble Tiles (10) ────────────────────────────────────────

export const NOBLE_TILES: NobleTile[] = [
  { id: 'N-01', prestigePoints: 3, requirement: { red: 4, green: 4 } },
  { id: 'N-02', prestigePoints: 3, requirement: { red: 4, black: 4 } },
  { id: 'N-03', prestigePoints: 3, requirement: { white: 4, blue: 4 } },
  { id: 'N-04', prestigePoints: 3, requirement: { blue: 4, green: 4 } },
  { id: 'N-05', prestigePoints: 3, requirement: { white: 3, blue: 3, black: 3 } },
  { id: 'N-06', prestigePoints: 3, requirement: { white: 3, red: 3, green: 3 } },
  { id: 'N-07', prestigePoints: 3, requirement: { blue: 3, red: 3, black: 3 } },
  { id: 'N-08', prestigePoints: 3, requirement: { white: 4, black: 4 } },
  { id: 'N-09', prestigePoints: 3, requirement: { green: 3, red: 3, black: 3 } },
  { id: 'N-10', prestigePoints: 3, requirement: { white: 3, blue: 3, green: 3 } },
];

// ── Convenience exports ─────────────────────────────────────

export const ALL_CARDS: DevelopmentCard[] = [...TIER1_CARDS, ...TIER2_CARDS, ...TIER3_CARDS];

export const COLORED_GEMS: readonly ('white' | 'blue' | 'green' | 'red' | 'black')[] = [
  'white', 'blue', 'green', 'red', 'black',
] as const;
