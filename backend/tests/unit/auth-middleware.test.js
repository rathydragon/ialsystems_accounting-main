import { describe, it, expect, afterEach, vi } from 'vitest';
import { getJwtSecret } from '../../api/auth-middleware.js';

describe('getJwtSecret', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns the configured secret when long enough', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('JWT_SECRET', '  ' + 'a'.repeat(40) + '  ');
    expect(getJwtSecret()).toBe('a'.repeat(40));
  });

  it('throws in production when JWT_SECRET is missing', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('JWT_SECRET', '');
    expect(() => getJwtSecret()).toThrow(/JWT_SECRET is not configured/);
  });

  it('throws when JWT_SECRET is still the .env.example placeholder', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('JWT_SECRET', 'generate_a_secure_random_64_character_hex_secret_key_here');
    expect(() => getJwtSecret()).toThrow(/JWT_SECRET is not configured/);
  });

  it('throws on Vercel even when NODE_ENV is development', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('JWT_SECRET', '');
    expect(() => getJwtSecret()).toThrow(/JWT_SECRET is not configured/);
  });

  it('rejects secrets shorter than 32 characters outside tests', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('JWT_SECRET', 'short-secret');
    expect(() => getJwtSecret()).toThrow(/at least 32 characters/);
  });

  it('uses a stable random secret in local development', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('VERCEL', '');
    vi.stubEnv('JWT_SECRET', '');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const first = getJwtSecret();
    expect(first).toMatch(/^[0-9a-f]{96}$/);
    expect(getJwtSecret()).toBe(first);
  });
});
