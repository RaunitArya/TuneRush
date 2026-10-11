import { describe, expect, it } from 'vitest';
import { parseEnv } from '../src/config/env.js';

describe('parseEnv', () => {
  it('applies defaults and coerces PORT', () => {
    const env = parseEnv({ MONGO_URI: 'mongodb://localhost:27017/tunerush', PORT: '4000' });
    expect(env.PORT).toBe(4000);
    expect(env.NODE_ENV).toBe('development');
  });

  it('fails fast with a readable message when MONGO_URI is missing', () => {
    expect(() => parseEnv({})).toThrowError(/MONGO_URI/);
  });
});
