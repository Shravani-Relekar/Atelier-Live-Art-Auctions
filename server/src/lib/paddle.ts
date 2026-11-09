/** Stable, non-reversible public "paddle number" so bidders are never identified by name. */
export function paddleFor(userId: string | null | undefined): number | null {
  if (!userId) return null;
  let h = 0x811c9dc5;
  for (let i = 0; i < userId.length; i++) {
    h ^= userId.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return 1000 + ((h >>> 0) % 9000);
}
