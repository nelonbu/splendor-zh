import type { DevelopmentCard } from '../game/types';
import { COLORED_GEMS } from '../game/constants';
import AssetImage from './AssetImage';
import GemArt from './GemArt';
import { cardArt } from './gameArt.generated';
import { bonusAria, costAria, pointsLabel } from '../i18n/zhCN';

/** Shared, presentation-only card face for board, animation and player area. */
export default function CardFace({ card }: { card: DevelopmentCard }) {
  const costs = COLORED_GEMS.filter(color => (card.cost[color] ?? 0) > 0);
  return (
    <>
      <AssetImage src={cardArt[card.id]} className="card-art" />
      <div className="card-header">
        <span className="card-points" aria-label={pointsLabel(card.prestigePoints)}>{card.prestigePoints || ''}</span>
        <span className={`card-bonus gem-${card.gemBonus}`} aria-label={bonusAria(card.gemBonus)}>
          <GemArt color={card.gemBonus} />
        </span>
      </div>
      <div className="card-cost">
        {costs.map(color => (
          <span key={color} className={`cost-gem gem-${color}`} aria-label={costAria(color, card.cost[color] ?? 0)}>
            <GemArt color={color} />
            <span className="gem-value">{card.cost[color]}</span>
          </span>
        ))}
      </div>
    </>
  );
}
