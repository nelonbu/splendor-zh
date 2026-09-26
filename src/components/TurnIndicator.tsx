import { useGameStore } from '../store/gameStore';
import { turnMessage } from '../i18n/zhCN';

export default function TurnIndicator() {
  const players = useGameStore(s => s.players);
  const currentPlayerIndex = useGameStore(s => s.currentPlayerIndex);
  const phase = useGameStore(s => s.phase);
  const pendingDiscard = useGameStore(s => s.pendingDiscard);
  const pendingNobles = useGameStore(s => s.pendingNobles);

  const message = turnMessage(players[currentPlayerIndex].name, pendingDiscard, !!pendingNobles, phase === 'ending');
  return <div className="turn-indicator" role="status" aria-live="polite">{message}</div>;
}
