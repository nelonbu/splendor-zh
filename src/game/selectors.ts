import type { ColoredGem, CardCost, DevelopmentCard, NobleTile, PlayerState } from './types';
import { COLORED_GEMS } from './constants';

/** Sum purchased card bonuses by color */
export function getPlayerBonuses(player: PlayerState): Record<ColoredGem, number> {
  const bonuses: Record<ColoredGem, number> = { white: 0, blue: 0, green: 0, red: 0, black: 0 };
  for (const card of player.purchased) {
    bonuses[card.gemBonus]++;
  }
  return bonuses;
}

/** Card cost minus player's bonuses (floor 0 per color) */
export function getEffectiveCost(card: DevelopmentCard, player: PlayerState): CardCost {
  const bonuses = getPlayerBonuses(player);
  const effective: CardCost = {};
  for (const color of COLORED_GEMS) {
    const raw = card.cost[color] ?? 0;
    const reduced = Math.max(0, raw - bonuses[color]);
    if (reduced > 0) {
      effective[color] = reduced;
    }
  }
  return effective;
}

/** Check if a player can afford a card (gems + gold wildcards) */
export function canAfford(card: DevelopmentCard, player: PlayerState): boolean {
  const effective = getEffectiveCost(card, player);
  let goldNeeded = 0;
  for (const color of COLORED_GEMS) {
    const need = effective[color] ?? 0;
    const have = player.gems[color];
    if (need > have) {
      goldNeeded += need - have;
    }
  }
  return goldNeeded <= player.gems.gold;
}

/** Return nobles whose requirements are fully met by the player's purchased card bonuses */
export function getEligibleNobles(nobles: NobleTile[], player: PlayerState): NobleTile[] {
  const bonuses = getPlayerBonuses(player);
  return nobles.filter(noble => {
    for (const color of COLORED_GEMS) {
      const req = noble.requirement[color] ?? 0;
      if (req > 0 && bonuses[color] < req) return false;
    }
    return true;
  });
}

/** Calculate total prestige points for a player */
export function getPlayerPoints(player: PlayerState): number {
  let points = 0;
  for (const card of player.purchased) {
    points += card.prestigePoints;
  }
  for (const noble of player.nobles) {
    points += noble.prestigePoints;
  }
  return points;
}

/** Total gems held by a player */
export function getTotalGems(player: PlayerState): number {
  let total = 0;
  for (const color of COLORED_GEMS) {
    total += player.gems[color];
  }
  total += player.gems.gold;
  return total;
}
