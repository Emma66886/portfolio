/**
 * Seeded random numbers for the turn-based games. The seed lives in the
 * game's own state, so a shuffle can be saved, sent to another browser or
 * replayed in a test and still come out the same.
 */
export type Seeded = { seed: number };

/** Mulberry32: advances the state's seed and returns a number in [0, 1). */
export function random(state: Seeded) {
  let t = (state.seed = (state.seed + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Fisher-Yates, in place. */
export function shuffle<T>(state: Seeded, list: T[]) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(random(state) * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

export function newSeed() {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) return crypto.getRandomValues(new Uint32Array(1))[0] | 0;
  return (Math.random() * 2 ** 32) | 0;
}
