import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { Server as SocketIOServer } from 'socket.io';
import { validatePassword, generateToken, authMiddleware, socketAuthMiddleware } from './auth.js';
import { registerSocketHandlers } from './socketHandlers.js';
import * as roomManager from './roomManager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const server = http.createServer(app);
const PORT = parseInt(process.env.PORT || '3001');

// CORS — only in development
if (process.env.NODE_ENV !== 'production') {
  app.use(cors());
}

app.use(express.json({ limit: '1mb' }));

// --- Public endpoints (no auth) ---

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', rooms: roomManager.getRoomCount(), passwordRequired: !!process.env.SITE_PASSWORD });
});

app.post('/api/auth', (req, res) => {
  const { password } = req.body;
  if (!password || !validatePassword(password)) {
    res.status(401).json({ error: 'Invalid password' });
    return;
  }
  const token = generateToken(password);
  res.json({ token });
});

// --- Auth middleware on protected routes ---

if (process.env.SITE_PASSWORD) {
  app.use('/api/ai', authMiddleware);
}

// --- AI proxy rate limiting ---

const aiRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.AI_RATE_LIMIT_RPM || '10'),
  message: { error: 'Rate limit exceeded. Try again in a minute.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => !!req.body?.apiKey,
});

app.use('/api/ai', aiRateLimit);

// --- AI chat proxy ---

interface ChatRequest {
  provider: 'anthropic' | 'openai' | 'gemini' | 'openrouter' | 'custom';
  model: string;
  apiKey?: string;
  baseUrl?: string;
  system?: string;
  messages: unknown[];
}

app.post('/api/ai/chat', async (req, res) => {
  const { provider, model, baseUrl, system, messages } = req.body as ChatRequest;
  const apiKey = req.body.apiKey || process.env.ANTHROPIC_API_KEY;

  if (!provider || !model || !messages) {
    res.status(400).json({ error: 'Missing required fields: provider, model, messages' });
    return;
  }

  if (!apiKey) {
    res.status(400).json({ error: 'No API key provided and no hosted key configured' });
    return;
  }

  try {
    let url: string;
    let headers: Record<string, string>;
    let body: string;

    if (provider === 'anthropic') {
      url = 'https://api.anthropic.com/v1/messages';
      headers = {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      };
      body = JSON.stringify({
        model,
        max_tokens: 1024,
        ...(system ? { system } : {}),
        messages,
      });
    } else if (provider === 'gemini') {
      url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      headers = { 'Content-Type': 'application/json' };
      const contents: { role: string; parts: { text: string }[] }[] = [];
      let systemInstruction: { parts: { text: string }[] } | undefined;
      for (const msg of messages as { role: string; content: string }[]) {
        if (msg.role === 'system') {
          systemInstruction = { parts: [{ text: msg.content }] };
        } else {
          contents.push({
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: msg.content }],
          });
        }
      }
      body = JSON.stringify({
        ...(systemInstruction ? { systemInstruction } : {}),
        contents,
        generationConfig: {
          maxOutputTokens: 8192,
          responseMimeType: 'application/json',
        },
      });
    } else if (provider === 'openrouter') {
      url = 'https://openrouter.ai/api/v1/chat/completions';
      headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      };
      body = JSON.stringify({ model, messages });
    } else {
      url = provider === 'custom' && baseUrl
        ? `${baseUrl.replace(/\/$/, '')}/v1/chat/completions`
        : 'https://api.openai.com/v1/chat/completions';
      headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      };
      body = JSON.stringify({ model, messages });
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body,
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(502).json({ error: `Proxy error: ${message}` });
  }
});

// --- Socket.io setup ---

const io = new SocketIOServer(server, {
  cors: process.env.NODE_ENV !== 'production'
    ? { origin: 'http://localhost:5173', credentials: true }
    : undefined,
});

if (process.env.SITE_PASSWORD) {
  io.use(socketAuthMiddleware);
}
registerSocketHandlers(io);

// --- Static file serving (production) ---

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../dist')));
  // Catch-all AFTER all API routes — serves index.html for client-side routing
  app.get('/{*splat}', (_req, res) => {
    res.sendFile(path.join(__dirname, '../dist/index.html'));
  });
}

// --- Room cleanup interval ---

const cleanupInterval = setInterval(() => {
  const destroyed = roomManager.cleanupStaleRooms();
  for (const code of destroyed) {
    io.to(code).emit('room:destroyed', { reason: 'timeout' });
  }
}, 5 * 60 * 1000);

// --- Graceful shutdown ---

function gracefulShutdown() {
  console.log('Shutting down gracefully...');
  clearInterval(cleanupInterval);
  io.emit('room:destroyed', { reason: 'server_restarting' });
  io.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000);
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// --- Start server ---

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
