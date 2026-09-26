import { Server, Socket } from 'socket.io';
import * as roomManager from './roomManager.js';

// Per-IP rate limiting for room creation
const createTimestamps = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 5;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = createTimestamps.get(ip) || [];
  const recent = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  createTimestamps.set(ip, recent);
  return recent.length >= RATE_LIMIT_MAX;
}

function recordRoomCreation(ip: string): void {
  const timestamps = createTimestamps.get(ip) || [];
  timestamps.push(Date.now());
  createTimestamps.set(ip, timestamps);
}

// For testing: clear rate limit state
export function _resetRateLimitsForTesting(): void {
  createTimestamps.clear();
}

function getPlayersInfo(room: roomManager.Room): { nickname: string; playerIndex: number; connected: boolean }[] {
  return room.players.map(p => ({
    nickname: p.nickname,
    playerIndex: p.playerIndex,
    connected: p.connected,
  }));
}

export function registerSocketHandlers(io: Server): void {
  io.on('connection', (socket: Socket) => {
    const ip = socket.handshake.address;

    socket.on('room:create', ({ nickname }: { nickname: string }) => {
      if (isRateLimited(ip)) {
        socket.emit('room:error', { message: 'Too many rooms created. Please wait.', errorCode: 'SERVER_AT_CAPACITY' });
        return;
      }

      const result = roomManager.createRoom(nickname, socket.id);
      if ('error' in result) {
        socket.emit('room:error', { message: result.error, errorCode: result.error });
        return;
      }

      recordRoomCreation(ip);
      socket.join(result.room.code);
      socket.emit('room:created', {
        code: result.room.code,
        playerIndex: result.player.playerIndex,
        reconnectToken: result.player.reconnectToken,
      });
    });

    socket.on('room:join', ({ code, nickname, reconnectToken }: { code: string; nickname: string; reconnectToken?: string }) => {
      const result = roomManager.joinRoom(code, nickname, socket.id, reconnectToken);
      if ('error' in result) {
        socket.emit('room:error', { message: result.error, errorCode: result.error });
        return;
      }

      socket.join(result.room.code);

      const isReconnect = reconnectToken && result.player.reconnectToken === reconnectToken;

      socket.emit('room:joined', {
        code: result.room.code,
        players: getPlayersInfo(result.room),
        playerIndex: result.player.playerIndex,
        reconnectToken: result.player.reconnectToken,
      });

      // Notify other players in the room
      if (isReconnect) {
        socket.to(code).emit('room:playerReconnected', { playerIndex: result.player.playerIndex });
        // Send current game state to reconnecting player
        if (result.room.gameState) {
          socket.emit('game:state', {
            gameState: result.room.gameState,
            pendingDiscard: result.room.pendingDiscard,
            pendingNobles: result.room.pendingNobles,
          });
        }
      } else {
        io.to(code).emit('room:updated', { players: getPlayersInfo(result.room) });
      }
    });

    socket.on('room:start', ({ code }: { code: string }) => {
      const result = roomManager.startGame(code, socket.id);
      if ('error' in result) {
        socket.emit('room:error', { message: result.error, errorCode: result.error });
        return;
      }

      io.to(code).emit('game:state', {
        gameState: result.gameState,
        pendingDiscard: false,
        pendingNobles: [],
        lastMoves: [null, null],
      });
    });

    socket.on('game:action', ({ code, action }: { code: string; action: any }) => {
      const result = roomManager.applyAction(code, socket.id, action);
      if ('error' in result) {
        socket.emit('game:error', { message: result.error });
        return;
      }

      io.to(code).emit('game:state', {
        gameState: result.gameState,
        pendingDiscard: result.pendingDiscard,
        pendingNobles: result.pendingNobles,
        lastMoves: result.lastMoves,
      });
    });

    socket.on('room:leave', ({ code }: { code: string }) => {
      socket.leave(code);
      socket.to(code).emit('room:destroyed', { reason: 'player_left' });
      roomManager.destroyRoom(code);
    });

    socket.on('disconnect', () => {
      const result = roomManager.disconnectPlayer(socket.id, (roomCode) => {
        // Grace timer expired — notify remaining players and destroy
        io.to(roomCode).emit('room:destroyed', { reason: 'opponent_disconnected' });
      });

      if (result) {
        socket.to(result.room.code).emit('room:playerDisconnected', {
          playerIndex: result.playerIndex,
        });
      }
    });
  });
}
