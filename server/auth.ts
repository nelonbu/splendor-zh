import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import type { Socket } from 'socket.io';

function getJwtSecret(): string {
  return process.env.JWT_SECRET || 'default-dev-secret';
}

function getSitePassword(): string {
  return process.env.SITE_PASSWORD || '';
}

function computePasswordHash(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex').slice(0, 8);
}

export function validatePassword(input: string): boolean {
  const sitePassword = getSitePassword();
  if (!sitePassword) return false;

  const inputBuf = Buffer.from(input, 'utf8');
  const passwordBuf = Buffer.from(sitePassword, 'utf8');

  if (inputBuf.length !== passwordBuf.length) return false;

  return crypto.timingSafeEqual(inputBuf, passwordBuf);
}

export function generateToken(password: string): string {
  const passwordHash = computePasswordHash(password);
  return jwt.sign({ passwordHash }, getJwtSecret(), { expiresIn: '7d' });
}

export function verifyToken(token: string): { valid: boolean; payload?: jwt.JwtPayload } {
  try {
    const decoded = jwt.verify(token, getJwtSecret());
    if (typeof decoded === 'string') return { valid: false };

    const payload = decoded as jwt.JwtPayload & { passwordHash?: string };
    if (!payload.passwordHash) return { valid: false };

    const currentHash = computePasswordHash(getSitePassword());
    if (payload.passwordHash !== currentHash) return { valid: false };

    return { valid: true, payload };
  } catch {
    return { valid: false };
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const token = authHeader.slice(7);
  const result = verifyToken(token);
  if (!result.valid) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  next();
}

export function socketAuthMiddleware(socket: Socket, next: (err?: Error) => void): void {
  const token = socket.handshake.auth?.token as string | undefined;
  if (!token) {
    next(new Error('Unauthorized'));
    return;
  }

  const result = verifyToken(token);
  if (!result.valid) {
    next(new Error('Unauthorized'));
    return;
  }

  next();
}
