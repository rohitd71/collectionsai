import { describe, expect, it } from 'vitest';
import { computeCommission } from './billingMath';

describe('computeCommission', () => {
  it('applies the commission rate and adds the base fee', () => {
    const result = computeCommission(97240, 0.06, 599);
    expect(result.commissionOwed).toBe(5834.4);
    expect(result.totalOwed).toBe(6433.4);
  });

  it('returns zero commission when nothing was collected', () => {
    const result = computeCommission(0, 0.06, 599);
    expect(result.commissionOwed).toBe(0);
    expect(result.totalOwed).toBe(599);
  });

  it('rounds to the nearest cent', () => {
    const result = computeCommission(150.555, 0.06, 0);
    expect(result.commissionOwed).toBe(9.03);
  });
});
