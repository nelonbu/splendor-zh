// ── Gem Colors ──────────────────────────────────────────────

export type ColoredGem = 'white' | 'blue' | 'green' | 'red' | 'black';
export type GemColor = ColoredGem | 'gold';

// ── Costs ───────────────────────────────────────────────────

/** Card/noble costs — gold never appears here */
export type CardCost = Partial<Record<ColoredGem, number>>;

/** Gem payments — gold allowed as wildcard */
export type GemCost = Partial<Record<GemColor, number>>;

// ── Cards & Nobles ──────────────────────────────────────────

export type CardTier = 1 | 2 | 3;

export interface DevelopmentCard {
  id: string;
  tier: CardTier;
  prestigePoints: number;
  gemBonus: ColoredGem;
  cost: CardCost;
}

export interface NobleTile {
  id: string;
  prestigePoints: number;
  requirement: CardCost; // expressed in card bonuses, not gems
}

// ── Player ──────────────────────────────────────────────────

export interface PlayerState {
  name: string;
  gems: Record<GemColor, number>;
  reserved: DevelopmentCard[];
  purchased: DevelopmentCard[];
  nobles: NobleTile[];
}

// ── Board ───────────────────────────────────────────────────

export interface BoardState {
  gemSupply: Record<GemColor, number>;
  decks: [DevelopmentCard[], DevelopmentCard[], DevelopmentCard[]]; // tier 1, 2, 3
  visibleCards: [DevelopmentCard[], DevelopmentCard[], DevelopmentCard[]]; // tier 1, 2, 3
  nobles: NobleTile[];
}

// ── Game State ──────────────────────────────────────────────

export type GamePhase = 'setup' | 'playing' | 'ending' | 'ended';

export interface GameState {
  board: BoardState;
  players: [PlayerState, PlayerState];
  currentPlayerIndex: 0 | 1;
  phase: GamePhase;
  winner: PlayerState | null;
  turnCount: number;
}

// ── Actions ─────────────────────────────────────────────────

export type Action =
  | { type: 'takeGems'; colors: ColoredGem[] }
  | { type: 'take2Gems'; color: ColoredGem }
  | { type: 'reserveCard'; source: DevelopmentCard | { fromDeck: CardTier } }
  | { type: 'purchaseCard'; card: DevelopmentCard }
  | { type: 'discardGems'; gems: GemCost }
  | { type: 'selectNoble'; noble: NobleTile };
