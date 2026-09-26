import { useCallback } from 'react';
import type { DevelopmentCard } from '../game/types';
import { canAfford } from '../game/selectors';
import { useGameStore } from '../store/gameStore';
import { useAnimation } from './AnimationProvider';
import CardFace from './CardFace';
import { cardActionAria, copy } from '../i18n/zhCN';

interface CardProps {
  card: DevelopmentCard;
  showActions?: boolean;
  showLabel?: boolean;
}

export default function Card({ card, showActions = true, showLabel = false }: CardProps) {
  const player = useGameStore(s => s.players[s.currentPlayerIndex]);
  const { registerCardSource } = useAnimation();
  const cardRef = useCallback((el: HTMLElement | null) => {
    registerCardSource(card.id, el, card);
  }, [card, registerCardSource]);
  const pendingDiscard = useGameStore(s => s.pendingDiscard);
  const pendingNobles = useGameStore(s => s.pendingNobles);
  const purchaseCard = useGameStore(s => s.purchaseCard);
  const reserveCard = useGameStore(s => s.reserveCard);
  const onlineState = useGameStore(s => s.onlineState);
  const currentPlayerIndex = useGameStore(s => s.currentPlayerIndex);

  const goldSupply = useGameStore(s => s.board.gemSupply.gold);
  const reservedCount = useGameStore(s => s.players[s.currentPlayerIndex].reserved.length);

  const affordable = canAfford(card, player);
  const isMyTurn = !onlineState || onlineState.myPlayerIndex === currentPlayerIndex;
  const blocked = !!pendingDiscard || !!pendingNobles || !isMyTurn;
  const canReserve = goldSupply > 0 && reservedCount < 3;

  return (
    <div ref={cardRef} className={`card card-color-${card.gemBonus}`}>
      {showLabel && <span className="card-label">{card.id}</span>}
      <CardFace card={card} />
      {showActions && (
        <div className="card-actions">
          <button
            className="btn-buy"
            aria-label={cardActionAria('buy', card.gemBonus, card.prestigePoints)}
            disabled={!affordable || blocked}
            onClick={() => purchaseCard(card)}
          >
            {copy.buy}
          </button>
          <button
            className="btn-reserve"
            aria-label={cardActionAria('reserve', card.gemBonus, card.prestigePoints)}
            disabled={blocked || !canReserve}
            onClick={() => reserveCard(card)}
          >
            {copy.reserve}
          </button>
        </div>
      )}
    </div>
  );
}
