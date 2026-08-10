import { describe, expect, it } from 'vitest';
import { createUuid } from './id';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('client UUID compatibility', () => {
  it('uses the browser implementation when available', () => {
    const expected = '12345678-1234-4123-8123-123456789abc';
    expect(createUuid({ randomUUID: () => expected })).toBe(expected);
  });

  it('creates a valid UUID when randomUUID is unavailable', () => {
    const value = createUuid({ getRandomValues: bytes => { bytes.fill(0); return bytes; } });
    expect(value).toBe('00000000-0000-4000-8000-000000000000');
    expect(value).toMatch(uuidPattern);
  });

  it('still creates a valid UUID in an older WebView without Web Crypto', () => {
    expect(createUuid(null)).toMatch(uuidPattern);
  });
});
