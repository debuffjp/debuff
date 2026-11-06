export function combo(hits: number): number {
  if (hits < 3) return 1;
  return hits * 2;
}

export function isHighScore(score: number, best: number): boolean {
  return score > best;
}
