import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getSocket, connectSocket, setStoredRoom, getStoredRoom, clearStoredRoom,
  setupSocketListeners, setupVisibilityHandler,
} from '../online/socketClient';
import { useGameStore } from '../store/gameStore';
import { loadProfile } from '../store/profileService';

type LobbyState = 'idle' | 'waiting' | 'ready';

interface PlayerInfo {
  nickname: string;
  playerIndex: number;
  connected: boolean;
}

const ERROR_MESSAGES: Record<string, string> = {
  ROOM_NOT_FOUND: 'Room not found. Check the code and try again.',
  ROOM_FULL: 'This room is already full.',
  NOT_HOST: 'Only the host can start the game.',
  SERVER_AT_CAPACITY: 'Too many rooms created. Please wait a moment.',
};

export default function OnlineLobby({ inviteCode = '' }: { inviteCode?: string }) {
  const [lobbyState, setLobbyState] = useState<LobbyState>('idle');
  const [nickname, setNickname] = useState(() => loadProfile().playerName);
  const [roomCode, setRoomCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [myPlayerIndex, setMyPlayerIndex] = useState<number>(-1);
  const myPlayerIndexRef = useRef<number>(-1);
  const [reconnectToken, setReconnectToken] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const setOnlineState = useGameStore(s => s.setOnlineState);
  const applyServerState = useGameStore(s => s.applyServerState);

  // Deep-link: auto-fill room code from invite prop
  useEffect(() => {
    if (inviteCode) {
      setJoinCode(inviteCode);
    }
  }, [inviteCode]);

  // Listen for room:destroyed events from setupSocketListeners
  useEffect(() => {
    const handler = (e: Event) => {
      const msg = (e as CustomEvent).detail as string;
      setError(msg);
      setLobbyState('idle');
      setRoomCode('');
      setPlayers([]);
    };
    window.addEventListener('splendor:room-destroyed', handler);
    return () => window.removeEventListener('splendor:room-destroyed', handler);
  }, []);

  // Socket event setup
  useEffect(() => {
    const socket = getSocket();
    setupSocketListeners(socket);
    const cleanupVisibility = setupVisibilityHandler();

    function onCreated(data: { code: string; playerIndex: number; reconnectToken: string }) {
      setRoomCode(data.code);
      setMyPlayerIndex(data.playerIndex);
      myPlayerIndexRef.current = data.playerIndex;
      setReconnectToken(data.reconnectToken);
      setPlayers([{ nickname, playerIndex: data.playerIndex, connected: true }]);
      setStoredRoom({ roomCode: data.code, reconnectToken: data.reconnectToken, nickname });
      setLobbyState('waiting');
      setError('');
    }

    function onJoined(data: { code: string; players: PlayerInfo[]; playerIndex: number; reconnectToken: string }) {
      setRoomCode(data.code);
      setMyPlayerIndex(data.playerIndex);
      myPlayerIndexRef.current = data.playerIndex;
      setReconnectToken(data.reconnectToken);
      setPlayers(data.players);
      const myNick = data.players.find(p => p.playerIndex === data.playerIndex)?.nickname || nickname;
      setStoredRoom({ roomCode: data.code, reconnectToken: data.reconnectToken, nickname: myNick });
      setLobbyState(data.players.length >= 2 ? 'ready' : 'waiting');
      setError('');
    }

    function onUpdated(data: { players: PlayerInfo[] }) {
      setPlayers(data.players);
      if (data.players.length >= 2) {
        setLobbyState('ready');
      }
    }

    function onError(data: { message: string; errorCode?: string }) {
      const msg = data.errorCode ? (ERROR_MESSAGES[data.errorCode] || data.message) : data.message;
      setError(msg);
    }

    function onGameState(data: { gameState: any; pendingDiscard: boolean; pendingNobles: any[]; lastMoves?: [any, any] }) {
      const gs = data.gameState;
      const storedRoom = getStoredRoom();

      // Apply the full server state to the store
      applyServerState(gs, data.pendingDiscard, data.pendingNobles, data.lastMoves);

      // Build OnlineState — use ref (not stale closure) with storedRoom as fallback
      const currentMyIndex = myPlayerIndexRef.current >= 0 ? myPlayerIndexRef.current : 0;
      const opponentIdx = currentMyIndex === 0 ? 1 : 0;

      setOnlineState({
        roomCode: roomCode || storedRoom?.roomCode || '',
        myPlayerIndex: currentMyIndex as 0 | 1,
        nickname: gs.players[currentMyIndex]?.name || nickname,
        opponentNickname: gs.players[opponentIdx]?.name || '',
        reconnectToken: reconnectToken || storedRoom?.reconnectToken || '',
        connectionStatus: 'connected',
        opponentConnected: true,
      });
    }

    function onDestroyed(data: { reason: string }) {
      const reasons: Record<string, string> = {
        player_left: 'Your opponent left the room.',
        opponent_disconnected: 'Your opponent disconnected.',
        timeout: 'Room timed out due to inactivity.',
        server_restarting: 'Server is restarting. Please create a new room.',
      };
      setError(reasons[data.reason] || 'Room was closed.');
      setLobbyState('idle');
      setRoomCode('');
      setPlayers([]);
      clearStoredRoom();
    }

    function onPlayerDisconnected(data: { playerIndex: number }) {
      setPlayers(prev => prev.map(p =>
        p.playerIndex === data.playerIndex ? { ...p, connected: false } : p
      ));
    }

    function onPlayerReconnected(data: { playerIndex: number }) {
      setPlayers(prev => prev.map(p =>
        p.playerIndex === data.playerIndex ? { ...p, connected: true } : p
      ));
    }

    socket.on('room:created', onCreated);
    socket.on('room:joined', onJoined);
    socket.on('room:updated', onUpdated);
    socket.on('room:error', onError);
    socket.on('game:state', onGameState);
    socket.on('room:destroyed', onDestroyed);
    socket.on('room:playerDisconnected', onPlayerDisconnected);
    socket.on('room:playerReconnected', onPlayerReconnected);

    connectSocket();

    // Auto-rejoin from stored room data
    const stored = getStoredRoom();
    if (stored) {
      setNickname(stored.nickname);
      socket.emit('room:join', {
        code: stored.roomCode,
        nickname: stored.nickname,
        reconnectToken: stored.reconnectToken,
      });
    }

    return () => {
      cleanupVisibility();
      socket.off('room:created', onCreated);
      socket.off('room:joined', onJoined);
      socket.off('room:updated', onUpdated);
      socket.off('room:error', onError);
      socket.off('game:state', onGameState);
      socket.off('room:destroyed', onDestroyed);
      socket.off('room:playerDisconnected', onPlayerDisconnected);
      socket.off('room:playerReconnected', onPlayerReconnected);
      // Don't disconnect here — the game might still be active
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreate = useCallback(() => {
    if (!nickname.trim()) return;
    setError('');
    const socket = getSocket();
    socket.emit('room:create', { nickname: nickname.trim() });
  }, [nickname]);

  const handleJoin = useCallback(() => {
    if (!nickname.trim() || !joinCode.trim()) return;
    setError('');
    const socket = getSocket();
    socket.emit('room:join', { code: joinCode.trim().toUpperCase(), nickname: nickname.trim() });
  }, [nickname, joinCode]);

  const handleStart = useCallback(() => {
    if (!roomCode) return;
    const socket = getSocket();
    socket.emit('room:start', { code: roomCode });
  }, [roomCode]);

  const handleLeave = useCallback(() => {
    if (!roomCode) return;
    const socket = getSocket();
    socket.emit('room:leave', { code: roomCode });
    setLobbyState('idle');
    setRoomCode('');
    setPlayers([]);
    clearStoredRoom();
    setError('');
  }, [roomCode]);

  const handleCopyLink = useCallback(() => {
    const link = `${window.location.origin}/room/${roomCode}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [roomCode]);

  const isHost = myPlayerIndex === 0;

  // --- Idle state ---
  if (lobbyState === 'idle') {
    // Invite link: show only name input + join button
    if (inviteCode) {
      return (
        <div className="online-lobby">
          <h2>Join Game</h2>
          <div className="lobby-room-header">
            <span className="lobby-room-label">Room:</span>
            <span className="lobby-room-code">{inviteCode}</span>
          </div>

          <div className="lobby-section">
            <label className="lobby-label">Enter your nickname:</label>
            <input
              type="text"
              value={nickname}
              onChange={e => setNickname(e.target.value)}
              placeholder="Nickname"
              maxLength={20}
              onKeyDown={e => { if (e.key === 'Enter' && nickname.trim()) handleJoin(); }}
              autoFocus
            />
          </div>

          <button
            className="lobby-btn-primary"
            onClick={handleJoin}
            disabled={!nickname.trim()}
          >
            Join Room
          </button>

          {error && <p className="lobby-error">{error}</p>}
        </div>
      );
    }

    // Normal lobby: create or join
    return (
      <div className="online-lobby">
        <div className="lobby-section">
          <label className="lobby-label">Enter your nickname:</label>
          <input
            type="text"
            value={nickname}
            onChange={e => setNickname(e.target.value)}
            placeholder="Nickname"
            maxLength={20}
          />
        </div>

        <button
          className="lobby-btn-primary"
          onClick={handleCreate}
          disabled={!nickname.trim()}
        >
          Create Room
        </button>

        <div className="lobby-divider">or</div>

        <div className="lobby-section">
          <label className="lobby-label">Room code:</label>
          <input
            type="text"
            value={joinCode}
            onChange={e => setJoinCode(e.target.value.toUpperCase())}
            placeholder="ABCDEF"
            maxLength={6}
          />
          <button
            className="lobby-btn-primary"
            onClick={handleJoin}
            disabled={!nickname.trim() || !joinCode.trim()}
          >
            Join Room
          </button>
        </div>

        {error && <p className="lobby-error">{error}</p>}
      </div>
    );
  }

  // --- Waiting / Ready state ---
  return (
    <div className="online-lobby">
      <div className="lobby-room-header">
        <span className="lobby-room-label">Room:</span>
        <span className="lobby-room-code">{roomCode}</span>
      </div>

      {lobbyState === 'waiting' && (
        <div className="lobby-share">
          <span className="lobby-share-label">Share this link:</span>
          <button className="lobby-copy-btn" onClick={handleCopyLink}>
            {copied ? 'Copied!' : `${window.location.origin}/room/${roomCode}`}
          </button>
        </div>
      )}

      <div className="lobby-players">
        <h3>Players</h3>
        {players.map(p => (
          <div key={p.playerIndex} className={`lobby-player ${!p.connected ? 'disconnected' : ''}`}>
            <span className="lobby-player-status">{p.connected ? '\u2713' : '\u23F3'}</span>
            <span>{p.nickname}</span>
            {p.playerIndex === myPlayerIndex && <span className="lobby-you">(you)</span>}
          </div>
        ))}
        {lobbyState === 'waiting' && players.length < 2 && (
          <div className="lobby-player waiting">
            <span className="lobby-player-status">{'\u23F3'}</span>
            <span>Waiting for opponent...</span>
          </div>
        )}
      </div>

      <div className="lobby-actions">
        {lobbyState === 'ready' && isHost && (
          <button className="lobby-btn-primary" onClick={handleStart}>
            Start Game
          </button>
        )}
        <button className="lobby-btn-secondary" onClick={handleLeave}>
          Leave Room
        </button>
      </div>

      {error && <p className="lobby-error">{error}</p>}
    </div>
  );
}
