import type { ScanResult } from '../core/scanner';

/** Maximum age of cached scan results before they should be considered stale */
export const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

export interface ScanHistoryEntry {
  timestamp: string;
  score: number;
  summary: { critical: number; medium: number; low: number };
  filesScanned: number;
}

export interface ScanCache {
  lastResult: ScanResult | null;
  lastScore: number | null;
  lastPath: string | null;
  lastTimestamp: string | null;
  /** Epoch timestamp (ms) when the cache was last updated, for TTL checks */
  cachedAt: number | null;
  history: ScanHistoryEntry[];
}

const MAX_HISTORY = 10;

export function updateScan(
  cache: ScanCache,
  result: ScanResult,
  score: number,
  scanPath: string
): void {
  const timestamp = new Date().toISOString();

  cache.lastResult = result;
  cache.lastScore = score;
  cache.lastPath = scanPath;
  cache.lastTimestamp = timestamp;
  cache.cachedAt = Date.now();

  cache.history.unshift({
    timestamp,
    score,
    summary: {
      critical: result.critical.length,
      medium: result.medium.length,
      low: result.low.length,
    },
    filesScanned: result.metadata?.filesScanned ?? 0,
  });

  if (cache.history.length > MAX_HISTORY) {
    cache.history.length = MAX_HISTORY;
  }
}
