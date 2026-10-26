// Small random helpers. Garsae never stores a seed: every play is different.

export const rand = (min = 0, max = 1): number => min + Math.random() * (max - min);

export const randInt = (min: number, maxInclusive: number): number =>
  Math.floor(rand(min, maxInclusive + 1));

export const chance = (p: number): boolean => Math.random() < p;

export function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

export function weightedPick<T>(items: readonly T[], weights: readonly number[]): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r < 0) return items[i];
  }
  return items[items.length - 1];
}

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
