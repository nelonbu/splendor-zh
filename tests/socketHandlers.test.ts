import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createServer, Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { io as ioc, Socket as ClientSocket } from 'socket.io-client';
import { registerSocketHandlers, _resetRateLimitsForTesting } from '../server/socketHandlers';
import { _resetForTesting } from '../server/roomManager';

let httpServer: HttpServer;
let ioServer: SocketIOServer;
let port: number;

function createClient(): ClientSocket {
  return ioc(`http://localhost:${port}`, {
    transports: ['websocket'],
    autoConnect: false,
  });
}

function connectClient(client: ClientSocket): Promise<void> {
  return new Promise((resolve) => {
    client.on('connect', resolve);
    client.connect();
  });
}

function waitForEvent<T = any>(client: ClientSocket, event: string, timeout = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${event}`)), timeout);
    client.once(event, (data: T) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

function disconnectAndWait(client: ClientSocket): Promise<void> {
  if (!client.connected) return Promise.resolve();
  return new Promise((resolve) => {
    client.on('disconnect', () => resolve());
    client.disconnect();
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

beforeAll(async () => {
  httpServer = createServer();
  ioServer = new SocketIOServer(httpServer, {
    cors: { origin: '*' },
  });
  registerSocketHandlers(ioServer);

  await new Promise<void>((resolve) => {
    httpServer.listen(0, () => {
      const addr = httpServer.address();
      port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve();
    });
  });
});

afterAll(async () => {
  ioServer.close();
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});

beforeEach(async () => {
  _resetForTesting();
  _resetRateLimitsForTesting();
  // Allow any pending socket events from previous tests to settle
  await new Promise(resolve => setTimeout(resolve, 50));
});

describe('socketHandlers', () => {
  describe('full flow: create → join → start → action', () => {
    it('completes a full game flow between two players', async () => {
      const client1 = createClient();
      const client2 = createClient();

      try {
        await Promise.all([connectClient(client1), connectClient(client2)]);

        // Player 1 creates a room
        const createdPromise = waitForEvent(client1, 'room:created');
        client1.emit('room:create', { nickname: 'Alice' });
        const created = await createdPromise;

        expect(created.code).toMatch(/^[A-Z0-9]{6}$/);
        expect(created.playerIndex).toBe(0);
        expect(created.reconnectToken).toBeTruthy();

        const roomCode = created.code;

        // Player 2 joins the room
        const joinedPromise = waitForEvent(client2, 'room:joined');
        const updatedPromise = waitForEvent(client1, 'room:updated');
        client2.emit('room:join', { code: roomCode, nickname: 'Bob' });

        const joined = await joinedPromise;
        expect(joined.code).toBe(roomCode);
        expect(joined.playerIndex).toBe(1);
        expect(joined.players).toHaveLength(2);

        const updated = await updatedPromise;
        expect(updated.players).toHaveLength(2);

        // Player 1 starts the game
        const statePromise1 = waitForEvent(client1, 'game:state');
        const statePromise2 = waitForEvent(client2, 'game:state');
        client1.emit('room:start', { code: roomCode });

        const state1 = await statePromise1;
        const state2 = await statePromise2;
        expect(state1.gameState.phase).toBe('playing');
        expect(state2.gameState.phase).toBe('playing');
        expect(state1.gameState.players[0].name).toBe('Alice');
        expect(state1.gameState.players[1].name).toBe('Bob');

        // Player 1 takes gems
        const gems = Object.entries(state1.gameState.board.gemSupply)
          .filter(([color, count]) => color !== 'gold' && (count as number) > 0)
          .map(([color]) => color)
          .slice(0, 3);

        const actionStateP1 = waitForEvent(client1, 'game:state');
        const actionStateP2 = waitForEvent(client2, 'game:state');
        client1.emit('game:action', {
          code: roomCode,
          action: { type: 'takeGems', colors: gems },
        });

        const actionState = await actionStateP1;
        await actionStateP2;
        expect(actionState.gameState.currentPlayerIndex).toBe(1); // Turn advanced
      } finally {
        client1.disconnect();
        client2.disconnect();
      }
    });
  });

  describe('error flows', () => {
    it('emits room:error when joining invalid code', async () => {
      const client = createClient();
      try {
        await connectClient(client);

        const errorPromise = waitForEvent(client, 'room:error');
        client.emit('room:join', { code: 'XXXXXX', nickname: 'Alice' });
        const error = await errorPromise;

        expect(error.errorCode).toBe('ROOM_NOT_FOUND');
      } finally {
        client.disconnect();
      }
    });

    it('emits room:error when joining full room', async () => {
      const client1 = createClient();
      const client2 = createClient();
      const client3 = createClient();

      try {
        await Promise.all([connectClient(client1), connectClient(client2), connectClient(client3)]);

        const createdP = waitForEvent(client1, 'room:created');
        client1.emit('room:create', { nickname: 'Alice' });
        const created = await createdP;

        const joinedP = waitForEvent(client2, 'room:joined');
        client2.emit('room:join', { code: created.code, nickname: 'Bob' });
        await joinedP;

        const errorP = waitForEvent(client3, 'room:error');
        client3.emit('room:join', { code: created.code, nickname: 'Charlie' });
        const error = await errorP;

        expect(error.errorCode).toBe('ROOM_FULL');
      } finally {
        client1.disconnect();
        client2.disconnect();
        client3.disconnect();
      }
    });

    it('emits room:error when non-host tries to start', async () => {
      const client1 = createClient();
      const client2 = createClient();

      try {
        await Promise.all([connectClient(client1), connectClient(client2)]);

        const createdP = waitForEvent(client1, 'room:created');
        client1.emit('room:create', { nickname: 'Alice' });
        const created = await createdP;

        const joinedP = waitForEvent(client2, 'room:joined');
        client2.emit('room:join', { code: created.code, nickname: 'Bob' });
        await joinedP;

        const errorP = waitForEvent(client2, 'room:error');
        client2.emit('room:start', { code: created.code });
        const error = await errorP;

        expect(error.errorCode).toBe('NOT_HOST');
      } finally {
        client1.disconnect();
        client2.disconnect();
      }
    });

    it('emits game:error for out-of-turn action', async () => {
      const client1 = createClient();
      const client2 = createClient();

      try {
        await Promise.all([connectClient(client1), connectClient(client2)]);

        const createdP = waitForEvent(client1, 'room:created');
        client1.emit('room:create', { nickname: 'Alice' });
        const created = await createdP;

        const joinedP = waitForEvent(client2, 'room:joined');
        client2.emit('room:join', { code: created.code, nickname: 'Bob' });
        await joinedP;

        const stateP = waitForEvent(client1, 'game:state');
        client1.emit('room:start', { code: created.code });
        await stateP;

        // Player 2 tries to act on player 1's turn
        const errorP = waitForEvent(client2, 'game:error');
        client2.emit('game:action', {
          code: created.code,
          action: { type: 'takeGems', colors: ['white', 'blue', 'green'] },
        });
        const error = await errorP;

        expect(error.message).toBe('NOT_YOUR_TURN');
      } finally {
        client1.disconnect();
        client2.disconnect();
      }
    });
  });

  describe('disconnect and reconnect', () => {
    it('notifies opponent on disconnect and restores state on reconnect', async () => {
      const client1 = createClient();
      const client2 = createClient();

      try {
        await Promise.all([connectClient(client1), connectClient(client2)]);

        // Create and join room
        const createdP = waitForEvent(client1, 'room:created');
        client1.emit('room:create', { nickname: 'Alice' });
        const created = await createdP;

        const joinedP = waitForEvent(client2, 'room:joined');
        client2.emit('room:join', { code: created.code, nickname: 'Bob' });
        const joined = await joinedP;

        // Start game
        const stateP = waitForEvent(client1, 'game:state');
        client1.emit('room:start', { code: created.code });
        await stateP;

        // Player 2 disconnects
        const disconnectP = waitForEvent(client1, 'room:playerDisconnected');
        client2.disconnect();
        const disconnected = await disconnectP;
        expect(disconnected.playerIndex).toBe(1);

        // Player 2 reconnects with new socket
        const client2b = createClient();
        await connectClient(client2b);

        const rejoinedP = waitForEvent(client2b, 'room:joined');
        const reconnectedP = waitForEvent(client1, 'room:playerReconnected');
        const gameStateP = waitForEvent(client2b, 'game:state');

        client2b.emit('room:join', {
          code: created.code,
          nickname: 'Bob',
          reconnectToken: joined.reconnectToken,
        });

        const rejoined = await rejoinedP;
        expect(rejoined.playerIndex).toBe(1);

        const reconnected = await reconnectedP;
        expect(reconnected.playerIndex).toBe(1);

        const gameState = await gameStateP;
        expect(gameState.gameState.phase).toBe('playing');

        await disconnectAndWait(client2b);
      } finally {
        await disconnectAndWait(client1);
        await sleep(50); // Allow server-side disconnect handlers to complete
      }
    });
  });

  describe('room leave', () => {
    it('notifies opponent when player leaves', async () => {
      const client1 = createClient();
      const client2 = createClient();

      try {
        await connectClient(client1);
        await connectClient(client2);

        const createdP = waitForEvent(client1, 'room:created');
        client1.emit('room:create', { nickname: 'Alice' });
        const created = await createdP;

        const joinedP = waitForEvent(client2, 'room:joined');
        client2.emit('room:join', { code: created.code, nickname: 'Bob' });
        await joinedP;

        const destroyedP = waitForEvent(client1, 'room:destroyed');
        client2.emit('room:leave', { code: created.code });
        const destroyed = await destroyedP;

        expect(destroyed.reason).toBe('player_left');
      } finally {
        client1.disconnect();
        client2.disconnect();
      }
    });
  });
});
