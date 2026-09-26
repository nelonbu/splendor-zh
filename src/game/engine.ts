import type {
  ColoredGem,
  GemColor,
  GemCost,
  CardTier,
  DevelopmentCard,
  NobleTile,
  PlayerState,
  GameState,
  Action,
} from './types';
import {
  TIER1_CARDS,
  TIER2_CARDS,
  TIER3_CARDS,
  NOBLE_TILES,
  STARTING_GEMS,
  NOBLE_COUNT,
  CARDS_VISIBLE_PER_TIER,
  MAX_RESERVED_CARDS,
  WIN_THRESHOLD,
  TAKE_2_MIN_SUPPLY,
  COLORED_GEMS,
} from './constants';
import { canAfford, getEffectiveCost, getPlayerPoints } from './selectors';

// ── Helpers ─────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function createEmptyPlayerGems(): Record<GemColor, number> {
  return { white: 0, blue: 0, green: 0, red: 0, black: 0, gold: 0 };
}

function cloneGems(gems: Record<GemColor, number>): Record<GemColor, number> {
  return { ...gems };
}

function tierIndex(tier: CardTier): 0 | 1 | 2 {
  return (tier - 1) as 0 | 1 | 2;
}

// ── Setup ───────────────────────────────────────────────────

export function generateInitialState(p1Name: string, p2Name: string): GameState {
  const deck1 = shuffle(TIER1_CARDS);
  const deck2 = shuffle(TIER2_CARDS);
  const deck3 = shuffle(TIER3_CARDS);

  const visible1 = deck1.splice(0, CARDS_VISIBLE_PER_TIER);
  const visible2 = deck2.splice(0, CARDS_VISIBLE_PER_TIER);
  const visible3 = deck3.splice(0, CARDS_VISIBLE_PER_TIER);

  const nobles = shuffle(NOBLE_TILES).slice(0, NOBLE_COUNT);

  const createPlayer = (name: string): PlayerState => ({
    name,
    gems: createEmptyPlayerGems(),
    reserved: [],
    purchased: [],
    nobles: [],
  });

  return {
    board: {
      gemSupply: { ...STARTING_GEMS },
      decks: [deck1, deck2, deck3],
      visibleCards: [visible1, visible2, visible3],
      nobles,
    },
    players: [createPlayer(p1Name), createPlayer(p2Name)],
    currentPlayerIndex: 0,
    phase: 'playing',
    winner: null,
    turnCount: 0,
  };
}

// ── Validators ──────────────────────────────────────────────

export function canTakeGems(state: GameState, colors: ColoredGem[]): boolean {
  if (colors.length === 0 || colors.length > 3) return false;
  // No gold
  if ((colors as string[]).includes('gold')) return false;
  // No duplicates
  if (new Set(colors).size !== colors.length) return false;
  // Each must have ≥1 in supply
  for (const c of colors) {
    if (state.board.gemSupply[c] < 1) return false;
  }
  // If taking fewer than 3, verify supply doesn't have more available colors
  if (colors.length < 3) {
    const availableColors = COLORED_GEMS.filter(c => state.board.gemSupply[c] >= 1);
    if (availableColors.length >= 3 && colors.length < 3) return false;
    if (availableColors.length >= 2 && colors.length < 2) return false;
    // Must take all available if fewer than requested
    if (colors.length < availableColors.length && availableColors.length <= 3) return false;
  }
  return true;
}

export function canTake2Gems(state: GameState, color: ColoredGem): boolean {
  if ((color as string) === 'gold') return false;
  return state.board.gemSupply[color] >= TAKE_2_MIN_SUPPLY;
}

export function canReserveCard(
  state: GameState,
  source: DevelopmentCard | { fromDeck: CardTier },
): boolean {
  const player = state.players[state.currentPlayerIndex];
  if (player.reserved.length >= MAX_RESERVED_CARDS) return false;

  if ('fromDeck' in source) {
    const idx = tierIndex(source.fromDeck);
    return state.board.decks[idx].length > 0;
  }

  // Must be a visible card
  for (const tierCards of state.board.visibleCards) {
    if (tierCards.some(c => c.id === source.id)) return true;
  }
  return false;
}

export function canPurchaseCard(state: GameState, card: DevelopmentCard): boolean {
  const player = state.players[state.currentPlayerIndex];

  // Card must be visible or in player's reserved
  const isVisible = state.board.visibleCards.some(tier => tier.some(c => c.id === card.id));
  const isReserved = player.reserved.some(c => c.id === card.id);
  if (!isVisible && !isReserved) return false;

  return canAfford(card, player);
}

// ── State Transitions ───────────────────────────────────────

export function applyTakeGems(state: GameState, colors: ColoredGem[]): GameState {
  const supply = cloneGems(state.board.gemSupply);
  const playerGems = cloneGems(state.players[state.currentPlayerIndex].gems);

  for (const c of colors) {
    supply[c]--;
    playerGems[c]++;
  }

  const players = [...state.players] as [PlayerState, PlayerState];
  players[state.currentPlayerIndex] = {
    ...players[state.currentPlayerIndex],
    gems: playerGems,
  };

  return {
    ...state,
    board: { ...state.board, gemSupply: supply },
    players,
  };
}

export function applyTake2Gems(state: GameState, color: ColoredGem): GameState {
  const supply = cloneGems(state.board.gemSupply);
  const playerGems = cloneGems(state.players[state.currentPlayerIndex].gems);

  supply[color] -= 2;
  playerGems[color] += 2;

  const players = [...state.players] as [PlayerState, PlayerState];
  players[state.currentPlayerIndex] = {
    ...players[state.currentPlayerIndex],
    gems: playerGems,
  };

  return {
    ...state,
    board: { ...state.board, gemSupply: supply },
    players,
  };
}

export function applyReserveCard(
  state: GameState,
  source: DevelopmentCard | { fromDeck: CardTier },
): GameState {
  const player = state.players[state.currentPlayerIndex];
  let card: DevelopmentCard;
  let newDecks = state.board.decks.map(d => [...d]) as [DevelopmentCard[], DevelopmentCard[], DevelopmentCard[]];
  let newVisible = state.board.visibleCards.map(v => [...v]) as [DevelopmentCard[], DevelopmentCard[], DevelopmentCard[]];

  if ('fromDeck' in source) {
    const idx = tierIndex(source.fromDeck);
    card = newDecks[idx].shift()!;
  } else {
    card = source;
    const idx = tierIndex(card.tier);
    const cardPos = newVisible[idx].findIndex(c => c.id === card.id);
    newVisible[idx] = newVisible[idx].filter(c => c.id !== card.id);
    // Replace from deck — insert at same position
    if (newDecks[idx].length > 0) {
      const replacement = newDecks[idx].shift()!;
      newVisible[idx].splice(cardPos, 0, replacement);
    }
  }

  // Award gold if available
  const supply = cloneGems(state.board.gemSupply);
  const playerGems = cloneGems(player.gems);
  if (supply.gold > 0) {
    supply.gold--;
    playerGems.gold++;
  }

  const players = [...state.players] as [PlayerState, PlayerState];
  players[state.currentPlayerIndex] = {
    ...player,
    gems: playerGems,
    reserved: [...player.reserved, card],
  };

  return {
    ...state,
    board: { ...state.board, gemSupply: supply, decks: newDecks, visibleCards: newVisible },
    players,
  };
}

export function applyPurchaseCard(state: GameState, card: DevelopmentCard): GameState {
  const player = state.players[state.currentPlayerIndex];
  const effective = getEffectiveCost(card, player);
  const supply = cloneGems(state.board.gemSupply);
  const playerGems = cloneGems(player.gems);

  // Pay gems
  let goldUsed = 0;
  for (const color of COLORED_GEMS) {
    const need = effective[color] ?? 0;
    const have = playerGems[color];
    if (need <= have) {
      playerGems[color] -= need;
      supply[color] += need;
    } else {
      // Pay what we can with colored gems, rest with gold
      supply[color] += have;
      playerGems[color] = 0;
      goldUsed += need - have;
    }
  }
  playerGems.gold -= goldUsed;
  supply.gold += goldUsed;

  // Remove card from visible or reserved
  let newVisible = state.board.visibleCards.map(v => [...v]) as [DevelopmentCard[], DevelopmentCard[], DevelopmentCard[]];
  let newDecks = state.board.decks.map(d => [...d]) as [DevelopmentCard[], DevelopmentCard[], DevelopmentCard[]];
  let newReserved = [...player.reserved];

  const isReserved = player.reserved.some(c => c.id === card.id);
  if (isReserved) {
    newReserved = newReserved.filter(c => c.id !== card.id);
  } else {
    const idx = tierIndex(card.tier);
    const cardPos = newVisible[idx].findIndex(c => c.id === card.id);
    newVisible[idx] = newVisible[idx].filter(c => c.id !== card.id);
    // Replace from deck — insert at same position
    if (newDecks[idx].length > 0) {
      const replacement = newDecks[idx].shift()!;
      newVisible[idx].splice(cardPos, 0, replacement);
    }
  }

  const players = [...state.players] as [PlayerState, PlayerState];
  players[state.currentPlayerIndex] = {
    ...player,
    gems: playerGems,
    reserved: newReserved,
    purchased: [...player.purchased, card],
  };

  return {
    ...state,
    board: { ...state.board, gemSupply: supply, decks: newDecks, visibleCards: newVisible },
    players,
  };
}

export function applyDiscardGems(state: GameState, gems: GemCost): GameState {
  const player = state.players[state.currentPlayerIndex];
  const supply = cloneGems(state.board.gemSupply);
  const playerGems = cloneGems(player.gems);

  const allColors: GemColor[] = [...COLORED_GEMS, 'gold'];
  for (const color of allColors) {
    const amount = gems[color] ?? 0;
    if (amount > 0) {
      playerGems[color] -= amount;
      supply[color] += amount;
    }
  }

  const players = [...state.players] as [PlayerState, PlayerState];
  players[state.currentPlayerIndex] = {
    ...player,
    gems: playerGems,
  };

  return {
    ...state,
    board: { ...state.board, gemSupply: supply },
    players,
  };
}

export function applyNobleVisit(state: GameState, noble: NobleTile): GameState {
  const player = state.players[state.currentPlayerIndex];
  const newNobles = state.board.nobles.filter(n => n.id !== noble.id);

  const players = [...state.players] as [PlayerState, PlayerState];
  players[state.currentPlayerIndex] = {
    ...player,
    nobles: [...player.nobles, noble],
  };

  return {
    ...state,
    board: { ...state.board, nobles: newNobles },
    players,
  };
}

export function shouldTriggerEndGame(state: GameState): boolean {
  return state.players.some(p => getPlayerPoints(p) >= WIN_THRESHOLD);
}

export function determineWinner(state: GameState): PlayerState {
  const [p1, p2] = state.players;
  const pts1 = getPlayerPoints(p1);
  const pts2 = getPlayerPoints(p2);

  if (pts1 > pts2) return p1;
  if (pts2 > pts1) return p2;
  // Tiebreak: fewer purchased cards wins
  if (p1.purchased.length < p2.purchased.length) return p1;
  if (p2.purchased.length < p1.purchased.length) return p2;
  // Still tied: player 2 wins (they had the disadvantage of going second)
  return p2;
}

export function advanceTurn(state: GameState): GameState {
  const nextIndex = state.currentPlayerIndex === 0 ? 1 : 0;

  // If phase is 'ending' and we're wrapping back to player 0, the round is complete
  if (state.phase === 'ending' && nextIndex === 0) {
    const winner = determineWinner(state);
    return {
      ...state,
      currentPlayerIndex: nextIndex as 0 | 1,
      phase: 'ended',
      winner,
      turnCount: state.turnCount + 1,
    };
  }

  return {
    ...state,
    currentPlayerIndex: nextIndex as 0 | 1,
    turnCount: state.turnCount + 1,
  };
}

// ── Legal Actions ───────────────────────────────────────────

export function getLegalActions(state: GameState): Action[] {
  if (state.phase !== 'playing' && state.phase !== 'ending') return [];

  const actions: Action[] = [];
  const player = state.players[state.currentPlayerIndex];

  // Take 3 distinct gems
  const availableColors = COLORED_GEMS.filter(c => state.board.gemSupply[c] >= 1);
  if (availableColors.length >= 3) {
    // Generate all 3-color combinations
    for (let i = 0; i < availableColors.length; i++) {
      for (let j = i + 1; j < availableColors.length; j++) {
        for (let k = j + 1; k < availableColors.length; k++) {
          actions.push({ type: 'takeGems', colors: [availableColors[i], availableColors[j], availableColors[k]] });
        }
      }
    }
  } else if (availableColors.length > 0) {
    // Take whatever is available (1 or 2)
    actions.push({ type: 'takeGems', colors: availableColors });
  }

  // Take 2 of same color
  for (const color of COLORED_GEMS) {
    if (canTake2Gems(state, color)) {
      actions.push({ type: 'take2Gems', color });
    }
  }

  // Reserve cards
  if (player.reserved.length < MAX_RESERVED_CARDS) {
    for (const tierCards of state.board.visibleCards) {
      for (const card of tierCards) {
        actions.push({ type: 'reserveCard', source: card });
      }
    }
    for (const tier of [1, 2, 3] as CardTier[]) {
      const idx = tierIndex(tier);
      if (state.board.decks[idx].length > 0) {
        actions.push({ type: 'reserveCard', source: { fromDeck: tier } });
      }
    }
  }

  // Purchase visible cards
  for (const tierCards of state.board.visibleCards) {
    for (const card of tierCards) {
      if (canAfford(card, player)) {
        actions.push({ type: 'purchaseCard', card });
      }
    }
  }

  // Purchase reserved cards
  for (const card of player.reserved) {
    if (canAfford(card, player)) {
      actions.push({ type: 'purchaseCard', card });
    }
  }

  return actions;
}
