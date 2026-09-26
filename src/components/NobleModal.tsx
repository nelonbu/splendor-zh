import { useGameStore } from '../store/gameStore';
import type { NobleTile } from '../game/types';
import NobleFace from './NobleFace';
import { copy, nobleChoiceAria, nobleChoosing } from '../i18n/zhCN';

function NobleOption({ noble, onSelect }: { noble: NobleTile; onSelect: () => void }) {
  return (
    <div className="noble-choice" role="button" tabIndex={0} aria-label={nobleChoiceAria(noble.prestigePoints)} onClick={onSelect} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(); } }}>
      <div className="noble-tile"><NobleFace noble={noble} /></div>
    </div>
  );
}

export default function NobleModal() {
  const aiVsAiMode = useGameStore(s => s.aiVsAiMode);
  const pendingNobles = useGameStore(s => s.pendingNobles);
  const selectNoble = useGameStore(s => s.selectNoble);
  const onlineState = useGameStore(s => s.onlineState);
  const currentPlayerIndex = useGameStore(s => s.currentPlayerIndex);
  const currentPlayerName = useGameStore(s => s.players[currentPlayerIndex].name);

  if (aiVsAiMode) return null;
  if (!pendingNobles) return null;

  const isMyTurn = !onlineState || onlineState.myPlayerIndex === currentPlayerIndex;

  if (!isMyTurn) {
    return (
      <div className="modal-overlay">
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="noble-visit-title">
          <h2 id="noble-visit-title">{copy.nobleVisit}</h2>
          <p>{nobleChoosing(currentPlayerName)}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="noble-choice-title">
        <h2 id="noble-choice-title">{copy.chooseNoble}</h2>
        <p>{copy.qualifiesNoble}</p>
        <div className="noble-choices">
          {pendingNobles.map(noble => (
            <NobleOption key={noble.id} noble={noble} onSelect={() => selectNoble(noble)} />
          ))}
        </div>
      </div>
    </div>
  );
}
