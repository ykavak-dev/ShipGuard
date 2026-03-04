// ═════════════════════════════════════════════════════════════════════════════
// Core types shared between scanner, rules, and yamlRuleLoader
// ═════════════════════════════════════════════════════════════════════════════

export interface Finding {
  filePath: string;
  line?: number;
  column?: number;
  severity: 'critical' | 'medium' | 'low';
  message: string;
  ruleId: string;
  category: string;
}

export interface ScanContext {
  rootPath: string;
  filePath: string;
  content: string;
  lines: string[];
  strippedLines: string[];
}

export interface Rule {
  id: string;
  name: string;
  description: string;
  category: string;
  severity: 'critical' | 'medium' | 'low';
  applicableTo: string[];
  check(context: ScanContext): Finding[];
}

export interface ScanResult {
  critical: Finding[];
  medium: Finding[];
  low: Finding[];
  metadata?: ScanMetadata;
}

export interface ScanMetadata {
  durationMs: number;
  filesScanned: number;
  filesSkipped: number;
  filesWithErrors: number;
  rulesLoaded: number;
  startedAt: string;
  completedAt: string;
}
