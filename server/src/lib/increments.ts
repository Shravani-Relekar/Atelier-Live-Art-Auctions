/**
 * Bid increment ladder (whole currency units). Kept in sync with client/src/lib/increments.ts.
 * Each row: [upper bound (exclusive), increment].
 */
const LADDER: Array<[number, number]> = [
  [1_000, 50],
  [5_000, 100],
  [10_000, 500],
  [50_000, 1_000],
  [100_000, 5_000],
  [500_000, 10_000],
  [1_000_000, 25_000],
  [5_000_000, 100_000],
  [10_000_000, 250_000],
  [50_000_000, 500_000],
];

export function incrementFor(amount: number): number {
  for (const [bound, inc] of LADDER) if (amount < bound) return inc;
  return 1_000_000;
}

export function nextMinBid(currentBid: number | null, startingBid: number): number {
  return currentBid == null ? startingBid : currentBid + incrementFor(currentBid);
}

export const MAX_BID_AMOUNT = 2_000_000_000;
