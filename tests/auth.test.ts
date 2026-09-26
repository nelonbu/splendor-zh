import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { validatePassword, generateToken, verifyToken } from '../server/auth';

const TEST_PASSWORD = 'test-password-123';
const TEST_SECRET = 'test-jwt-secret';

function setEnv(password: string, secret: string) {
  process.env.SITE_PASSWORD = password;
  process.env.JWT_SECRET = secret;
}

describe('auth', () => {
  const originalPassword = process.env.SITE_PASSWORD;
  const originalSecret = process.env.JWT_SECRET;

  beforeEach(() => {
    setEnv(TEST_PASSWORD, TEST_SECRET);
  });

  afterEach(() => {
    if (originalPassword !== undefined) process.env.SITE_PASSWORD = originalPassword;
    else delete process.env.SITE_PASSWORD;
    if (originalSecret !== undefined) process.env.JWT_SECRET = originalSecret;
    else delete process.env.JWT_SECRET;
  });

  describe('validatePassword', () => {
    it('returns true for correct password', () => {
      expect(validatePassword(TEST_PASSWORD)).toBe(true);
    });

    it('returns false for wrong password of same length', () => {
      expect(validatePassword('test-password-456')).toBe(false);
    });

    it('returns false for wrong password of different length', () => {
      expect(validatePassword('short')).toBe(false);
    });

    it('returns false when SITE_PASSWORD is empty', () => {
      process.env.SITE_PASSWORD = '';
      expect(validatePassword('anything')).toBe(false);
    });
  });

  describe('generateToken + verifyToken', () => {
    it('correct password produces a valid token', () => {
      const token = generateToken(TEST_PASSWORD);
      const result = verifyToken(token);
      expect(result.valid).toBe(true);
      expect(result.payload).toBeDefined();
    });

    it('token becomes invalid after SITE_PASSWORD changes', () => {
      const token = generateToken(TEST_PASSWORD);
      process.env.SITE_PASSWORD = 'new-password';
      const result = verifyToken(token);
      expect(result.valid).toBe(false);
    });

    it('expired token is invalid', () => {
      const token = jwt.sign(
        { passwordHash: require('crypto').createHash('sha256').update(TEST_PASSWORD).digest('hex').slice(0, 8) },
        TEST_SECRET,
        { expiresIn: '0s' }
      );
      // Small delay to ensure expiry
      const result = verifyToken(token);
      expect(result.valid).toBe(false);
    });

    it('malformed token is invalid', () => {
      expect(verifyToken('not.a.valid.token')).toEqual({ valid: false });
      expect(verifyToken('')).toEqual({ valid: false });
      expect(verifyToken('garbage')).toEqual({ valid: false });
    });

    it('token signed with wrong secret is invalid', () => {
      const token = jwt.sign({ passwordHash: 'abcd1234' }, 'wrong-secret', { expiresIn: '7d' });
      expect(verifyToken(token).valid).toBe(false);
    });

    it('token without passwordHash claim is invalid', () => {
      const token = jwt.sign({ foo: 'bar' }, TEST_SECRET, { expiresIn: '7d' });
      expect(verifyToken(token).valid).toBe(false);
    });
  });
});
