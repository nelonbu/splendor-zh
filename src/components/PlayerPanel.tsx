import type { GemColor } from '../game/types';
import { COLORED_GEMS } from '../game/constants';
import { canUndoLastTurn, useGameStore } from '../store/gameStore';
import { getPlayerBonuses, getPlayerPoints, canAfford } from '../game/selectors';
import { useAnimation } from './AnimationProvider';
import CardFace from './CardFace';
import GemArt from './GemArt';
import NobleFace from './NobleFace';
import { bonusAria, cardActionAria, copy, formatLastMove, playerGemAria, playerPointsLabel, undoTurnAria } from '../i18n/zhCN';

const ALL_GEMS: GemColor[] = [...COLORED_GEMS, 'gold'];

export default function PlayerPanel({ playerIndex }: { playerIndex: 0 | 1 }) {
  const player = useGameStore(s => s.players[playerIndex]);
  const currentPlayerIndex = useGameStore(s => s.currentPlayerIndex);
  const purchaseCard = useGameStore(s => s.purchaseCard);
  const pendingDiscard = useGameStore(s => s.pendingDiscard);
  const pendingNobles = useGameStore(s => s.pendingNobles);
  const aiMode = useGameStore(s => s.aiMode);
  const aiModel = useGameStore(s => s.aiConfig?.model);
  const onlineState = useGameStore(s => s.onlineState);
  const lastMove = useGameStore(s => s.lastMoves[playerIndex]);
  const canUndo = useGameStore(s => canUndoLastTurn(s, playerIndex));
  const undoLastTurn = useGameStore(s => s.undoLastTurn);

  const { inFlightGems } = useAnimation();

  const isActive = currentPlayerIndex === playerIndex;
  const isMyTurn = !onlineState || onlineState.myPlayerIndex === currentPlayerIndex;
  const points = getPlayerPoints(player);
  const bonuses = getPlayerBonuses(player);
  const blocked = !!pendingDiscard || !!pendingNobles || !isMyTurn;

  // Subtract in-flight gems that haven't visually arrived yet
  const displayGems = (color: GemColor) => {
    const actual = player.gems[color] ?? 0;
    const pending = inFlightGems.get(`${playerIndex}-${color}`) ?? 0;
    return Math.max(0, actual - pending);
  };
  const totalGems = ALL_GEMS.reduce((sum, c) => sum + displayGems(c), 0);

  return (
    <div className="player-panel-wrapper" data-player={playerIndex}>
      <div className={`player-panel ${isActive ? 'active' : ''}`}>
        <h3>
          {player.name}
          {aiMode && playerIndex === 1 && aiModel && (
            <span className="ai-model-name">({aiModel})</span>
          )}
          {' '}<span className="player-points">{playerPointsLabel(points)}</span>
        </h3>

        {/* Gems + Bonuses aligned grid */}
        <div className="player-gems-header">{copy.gems}：{totalGems}/10</div>
        <div className="player-gem-grid">
          {COLORED_GEMS.map(color => {
            const count = displayGems(color);
            return (
              <div key={color} className="player-gem-col">
                <span
                  className={`player-gem gem-${color} ${count > 0 ? '' : 'empty'}`}
                  data-player={playerIndex}
                  data-gem-dest={color}
                  aria-label={playerGemAria(color, count)}
                >
                  {count > 0 && <GemArt color={color} />}
                  <span className="gem-value">{count > 0 ? count : ''}</span>
                </span>
                <span
                  className={`player-bonus gem-${color} ${bonuses[color] > 0 ? 'has-bonus' : ''}`}
                  aria-label={bonusAria(color, bonuses[color])}
                >
                  <GemArt color={color} />
                  <span className="gem-value">{bonuses[color]}</span>
                </span>
              </div>
            );
          })}
          {displayGems('gold') > 0 && (
            <div className="player-gem-col">
              <span className="player-gem gem-gold" aria-label={playerGemAria('gold', displayGems('gold'))}><GemArt color="gold" /><span className="gem-value">{displayGems('gold')}</span></span>
              <span className="player-bonus-placeholder" />
            </div>
          )}
        </div>

        {/* Nobles */}
        {player.nobles.length > 0 && (
          <div className="player-nobles">
            {player.nobles.map(n => (
              <span key={n.id} className="player-noble noble-tile"><NobleFace noble={n} /></span>
            ))}
          </div>
        )}

        {/* Reserved cards */}
        {player.purchased.length > 0 && (
          <div className="purchased-cards">
            <h4>{copy.purchased}（{player.purchased.length}）</h4>
            <div className="purchased-list">
              {player.purchased.map(card => (
                <div key={card.id} className={`purchased-card card card-color-${card.gemBonus}`}>
                  <CardFace card={card} />
                </div>
              ))}
            </div>
          </div>
        )}

        {player.reserved.length > 0 && (
          <div className="reserved-cards">
            <h4>{copy.reserved}（{player.reserved.length}）</h4>
            <div className="reserved-list">
              {player.reserved.map(card => {
                const affordable = canAfford(card, player);
                return (
                  <div key={card.id} className={`reserved-card card-color-${card.gemBonus}`}>
                    {aiMode && <span className="card-label">{card.id}</span>}
                    <CardFace card={card} />
                    {isActive && (
                      <div className="card-actions">
                        <button
                          className="btn-buy"
                          aria-label={cardActionAria('buy', card.gemBonus, card.prestigePoints)}
                          disabled={!affordable || blocked}
                          onClick={() => purchaseCard(card)}
                        >
                          {copy.buy}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Last move — separate card to the right */}
      {lastMove && (
        <div className="player-last-move-column">
          <div className="player-last-move">
            <span className="last-move-label">{copy.lastMove}</span>
            <span className="last-move-text">{formatLastMove(lastMove)}</span>
          </div>
          {canUndo && (
            <button className="btn-undo-turn" aria-label={undoTurnAria(player.name)} onClick={undoLastTurn}>
              {copy.undoTurn}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
