interface ScanResult {
  critical: number;
  medium: number;
  low: number;
}

/** Calculates a 0–100 risk score: `100 - (critical*15 + medium*6 + low*2)`. */
export function calculateScore(result: ScanResult): number {
  const { critical, medium, low } = result;
  const score = 100 - (critical * 15 + medium * 6 + low * 2);
  return Math.max(0, score);
}
