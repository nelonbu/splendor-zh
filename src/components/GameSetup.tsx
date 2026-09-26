import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { loadProfile, updateProfile } from '../store/profileService';
import RulesModal from './RulesModal';
import { copy } from '../i18n/zhCN';

export default function GameSetup() {
  const [p1Name, setP1Name] = useState(() => loadProfile().playerName || copy.defaultPlayerOne);
  const [p2Name, setP2Name] = useState<string>(copy.defaultPlayerTwo);
  const [showRules, setShowRules] = useState(false);
  const initGame = useGameStore(s => s.initGame);
  const canStart = p1Name.trim() !== '' && p2Name.trim() !== '';

  function handleStart(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canStart) return;
    updateProfile({ playerName: p1Name.trim() });
    initGame(p1Name.trim(), p2Name.trim());
  }

  return (
    <div className="game-setup">
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
      <h2>{copy.localPlayers}</h2>
      <div className="setup-top-buttons">
        <button type="button" className="btn-rules" onClick={() => setShowRules(true)}>
          {copy.howToPlay}
        </button>
      </div>
      <form onSubmit={handleStart}>
        <input
          aria-label={copy.playerOneName}
          placeholder={copy.playerOneName}
          value={p1Name}
          onChange={event => setP1Name(event.target.value)}
        />
        <input
          aria-label={copy.playerTwoName}
          placeholder={copy.playerTwoName}
          value={p2Name}
          onChange={event => setP2Name(event.target.value)}
        />
        <button type="submit" disabled={!canStart}>{copy.startGame}</button>
      </form>
    </div>
  );
}
