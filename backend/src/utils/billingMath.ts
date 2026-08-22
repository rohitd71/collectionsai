export interface CommissionBreakdown {
  commissionOwed: number;
  totalOwed: number;
}

// Rounds to cents to avoid floating-point drift accumulating across many
// small payments before it reaches an invoice.
export function computeCommission(amountCollected: number, rate: number, baseFee: number): CommissionBreakdown {
  const commissionOwed = Math.round(amountCollected * rate * 100) / 100;
  const totalOwed = Math.round((commissionOwed + baseFee) * 100) / 100;
  return { commissionOwed, totalOwed };
}
