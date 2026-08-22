import { describe, expect, it } from 'vitest';
import { normalizePhone } from './phone';

describe('normalizePhone', () => {
  it('strips formatting from a bare North American number', () => {
    expect(normalizePhone('(647) 555-0101')).toBe('+16475550101');
  });

  it('leaves an already-E.164 number untouched', () => {
    expect(normalizePhone('+442071838750')).toBe('+442071838750');
  });

  it('treats two differently formatted numbers as the same phone', () => {
    expect(normalizePhone('647-555-0101')).toBe(normalizePhone('6475550101'));
  });
});
