/** Mirrors server/src/lib/increments.ts. The server is authoritative; this only drives the UI. */
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

/** The next `count` valid bid amounts starting at `from` (inclusive). */
export function bidLadder(from: number, count: number): number[] {
  const out = [from];
  while (out.length < count) {
    const last = out[out.length - 1];
    out.push(last + incrementFor(last));
  }
  return out;
}

/** Rounds an arbitrary amount up to the next valid step on the ladder at or above `min`. */
export function snapToLadder(amount: number, min: number): number {
  let v = min;
  while (v < amount) v += incrementFor(v);
  return v;
}
