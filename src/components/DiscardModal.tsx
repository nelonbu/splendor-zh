import { useState } from 'react';
import type { GemColor, GemCost } from '../game/types';
import { COLORED_GEMS, MAX_GEMS_IN_HAND } from '../game/constants';
import { useGameStore } from '../store/gameStore';
import { getTotalGems } from '../game/selectors';
import GemArt from './GemArt';
import { copy, discardConfirm, discardGemAria, discardInstruction, undoDiscardAria } from '../i18n/zhCN';

const ALL_GEMS: GemColor[] = [...COLORED_GEMS, 'gold'];

export default function DiscardModal() {
  const aiVsAiMode = useGameStore(s => s.aiVsAiMode);
  const player = useGameStore(s => s.players[s.currentPlayerIndex]);
  const discardGems = useGameStore(s => s.discardGems);

  if (aiVsAiMode) return null;
  const [toDiscard, setToDiscard] = useState<Record<GemColor, number>>({
    white: 0, blue: 0, green: 0, red: 0, black: 0, gold: 0,
  });

  const totalDiscarding = Object.values(toDiscard).reduce((a, b) => a + b, 0);
  const totalAfter = getTotalGems(player) - totalDiscarding;
  const canConfirm = totalAfter <= MAX_GEMS_IN_HAND && totalDiscarding > 0;

  function addDiscard(color: GemColor) {
    if (toDiscard[color] < player.gems[color]) {
      setToDiscard({ ...toDiscard, [color]: toDiscard[color] + 1 });
    }
  }

  function removeDiscard(color: GemColor) {
    if (toDiscard[color] > 0) {
      setToDiscard({ ...toDiscard, [color]: toDiscard[color] - 1 });
    }
  }

  function handleConfirm() {
    const gems: GemCost = {};
    for (const color of ALL_GEMS) {
      if (toDiscard[color] > 0) {
        gems[color] = toDiscard[color];
      }
    }
    discardGems(gems);
    setToDiscard({ white: 0, blue: 0, green: 0, red: 0, black: 0, gold: 0 });
  }

  return (
    <div className="modal-overlay">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="discard-title">
        <h2 id="discard-title">{copy.discardGems}</h2>
        <p>{discardInstruction(getTotalGems(player), MAX_GEMS_IN_HAND)}</p>
        <div className="discard-gems">
          {ALL_GEMS.map(color => {
            if (player.gems[color] === 0) return null;
            return (
              <div key={color} style={{ textAlign: 'center' }}>
                <button
                  className={`discard-gem gem-${color}`}
                  aria-label={discardGemAria(color, toDiscard[color])}
                  onClick={() => addDiscard(color)}
                >
                  <GemArt color={color} />
                  <span className="gem-value">{player.gems[color] - toDiscard[color]}</span>
                </button>
                {toDiscard[color] > 0 && (
                  <div style={{ fontSize: '0.75rem', marginTop: '2px' }}>
                    <span style={{ color: '#dc2626' }}>-{toDiscard[color]}</span>
                    {' '}
                    <button
                      style={{ fontSize: '0.65rem', padding: '1px 4px', background: '#2a3a55', color: '#aabbcc', borderRadius: '3px' }}
                      onClick={() => removeDiscard(color)}
                      aria-label={undoDiscardAria(color)}
                    >
                      {copy.undo}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <button className="btn-confirm" disabled={!canConfirm} onClick={handleConfirm}>
          {discardConfirm(totalDiscarding)}
        </button>
      </div>
    </div>
  );
}
