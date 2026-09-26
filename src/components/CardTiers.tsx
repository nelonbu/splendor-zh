import { useGameStore } from '../store/gameStore';
import type { CardTier } from '../game/types';
import Card from './Card';
import { useAnimation } from './AnimationProvider';
import AssetImage from './AssetImage';
import { deckArt } from './gameArt.generated';
import { deckAria, tierName } from '../i18n/zhCN';

const TIERS: CardTier[] = [3, 2, 1]; // display highest tier first
const MAX_VISIBLE = 4; // max visible cards per tier

export default function CardTiers() {
  const visibleCards = useGameStore(s => s.board.visibleCards);
  const decks = useGameStore(s => s.board.decks);
  const reserveCard = useGameStore(s => s.reserveCard);
  const pendingDiscard = useGameStore(s => s.pendingDiscard);
  const pendingNobles = useGameStore(s => s.pendingNobles);
  const aiMode = useGameStore(s => s.aiMode);
  const onlineState = useGameStore(s => s.onlineState);
  const currentPlayerIndex = useGameStore(s => s.currentPlayerIndex);

  const goldSupply = useGameStore(s => s.board.gemSupply.gold);
  const reservedCount = useGameStore(s => s.players[s.currentPlayerIndex].reserved.length);

  const { suppressedCardIds } = useAnimation();

  const isMyTurn = !onlineState || onlineState.myPlayerIndex === currentPlayerIndex;
  const blocked = !!pendingDiscard || !!pendingNobles || !isMyTurn;
  const canReserve = goldSupply > 0 && reservedCount < 3;

  return (
    <div className="card-tiers">
      {TIERS.map(tier => {
        const tierIdx = tier - 1;
        const cards = visibleCards[tierIdx];
        const deckSize = decks[tierIdx].length;

        return (
          <div key={tier} className="card-tier">
            <button
              className="deck-button"
              aria-label={deckAria(tier, deckSize)}
              disabled={deckSize === 0 || blocked || !canReserve}
              onClick={() => reserveCard({ fromDeck: tier })}
            >
              <AssetImage src={deckArt[tier]} className="deck-art" />
              <span>{tierName(tier)}</span>
              <span className="deck-count">{deckSize}</span>
            </button>
            {Array.from({ length: MAX_VISIBLE }, (_, i) => {
              const card = cards[i] ?? null;
              if (!card) {
                return <div key={`${tier}-${i}`} className="card-slot card-slot-empty" />;
              }
              const isSuppressed = suppressedCardIds.has(card.id);
              return (
                <div key={`${tier}-${i}`} className="card-slot" style={isSuppressed ? { visibility: 'hidden' } : undefined}>
                  <Card card={card} showLabel={aiMode} />
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
