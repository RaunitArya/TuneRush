import { describe, expect, it } from 'vitest';
import { parseEnv } from '../src/config/env.js';

const base = {
  MONGO_URI: 'mongodb://localhost:27017/tunerush',
  JWT_ACCESS_SECRET: 'x'.repeat(32),
};

describe('parseEnv', () => {
  it('applies defaults and coerces PORT', () => {
    const env = parseEnv({ ...base, PORT: '4000' });
    expect(env.PORT).toBe(4000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.ACCESS_TOKEN_TTL_SECONDS).toBe(900);
  });

  it('splits CORS_ORIGINS into a list', () => {
    const env = parseEnv({ ...base, CORS_ORIGINS: 'http://a.com, http://b.com' });
    expect(env.CORS_ORIGINS).toEqual(['http://a.com', 'http://b.com']);
  });

  it('fails fast with a readable message when MONGO_URI is missing', () => {
    expect(() => parseEnv({ JWT_ACCESS_SECRET: base.JWT_ACCESS_SECRET })).toThrow(/MONGO_URI/);
  });

  it('rejects a short JWT secret', () => {
    expect(() => parseEnv({ ...base, JWT_ACCESS_SECRET: 'short' })).toThrow(/JWT_ACCESS_SECRET/);
  });
});
