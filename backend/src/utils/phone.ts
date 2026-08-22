// Normalizes to E.164-ish form for dedup/dialing. Assumes North American
// numbers when no country code is present, matching this platform's
// initial target market (CAD/USD collections).
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, '');
  return digits.startsWith('+') ? digits : `+1${digits}`;
}
