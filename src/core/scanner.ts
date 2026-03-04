import { glob } from 'fast-glob';
import { promises as fs } from 'fs';
import * as path from 'path';
import { stripCommentsFromLines } from './commentUtils';
import { loadYamlRules } from './yamlRuleLoader';

// Re-export core types so existing imports from './scanner' keep working
export type { Finding, ScanContext, Rule, ScanResult, ScanMetadata } from './types';
import type { Finding, ScanContext, Rule, ScanResult } from './types';

interface ScanError {
  filePath: string;
  error: string;
}

// ═════════════════════════════════════════════════════════════════════════════
// Configuration
// ═════════════════════════════════════════════════════════════════════════════

const GLOB_PATTERNS = [
  '**/*.ts',
  '**/*.js',
  '**/*.jsx',
  '**/*.tsx',
  '**/.env',
  '**/Dockerfile',
  '**/package.json',
];

const IGNORE_PATTERNS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/.git/**',
  '**/coverage/**',
  '**/demo-examples/**',
  '**/src/core/rules/**',
  '**/tests/fixtures/**',
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const CONCURRENCY_LIMIT = 50; // Parallel file processing limit
const MAX_FINDINGS_PER_FILE = 100; // Prevent DoS from rules matching every line

// ═════════════════════════════════════════════════════════════════════════════
// Rule Loading
// ═════════════════════════════════════════════════════════════════════════════

let cachedRules: Rule[] | null = null;

/** Loads all security rules (built-in + YAML). Results are cached unless `forceReload` is true. */
async function loadRules(forceReload = false): Promise<Rule[]> {
  if (cachedRules && !forceReload) return cachedRules;
  const rules: Rule[] = [];
  const rulesDir = path.join(__dirname, 'rules');

  // 1. Load TypeScript rules
  try {
    const ruleFiles = await glob('*.js', {
      cwd: rulesDir,
      absolute: true,
      onlyFiles: true,
    });

    const rulePromises = ruleFiles.map(async (file): Promise<Rule | null> => {
      try {
        const ruleModule = await import(file);
        const rule = ruleModule.default || ruleModule.rule || ruleModule;
        return isValidRule(rule) ? rule : null;
      } catch {
        return null;
      }
    });

    const loadedRules = await Promise.all(rulePromises);
    rules.push(...loadedRules.filter((r): r is Rule => r !== null));
  } catch {
    // Rules directory may not exist yet
  }

  // 2. Load YAML rules
  const tsRuleIds = new Set(rules.map((r) => r.id));
  const yamlRules = await loadYamlRules();

  for (const yamlRule of yamlRules) {
    if (tsRuleIds.has(yamlRule.id)) {
      console.error(
        `[shipguard] YAML rule "${yamlRule.id}" conflicts with built-in rule, skipping`
      );
      continue;
    }
    rules.push(yamlRule);
  }

  // Deduplicate rules by ID (handles duplicate YAML rules or duplicate TS rules)
  const ruleIds = new Set<string>();
  const deduped: Rule[] = [];
  for (const rule of rules) {
    if (ruleIds.has(rule.id)) {
      console.error(
        `[shipguard] Duplicate rule ID "${rule.id}" detected, keeping first occurrence`
      );
      continue;
    }
    ruleIds.add(rule.id);
    deduped.push(rule);
  }
  cachedRules = deduped;
  return cachedRules;
}

function isValidRule(obj: unknown): obj is Rule {
  if (typeof obj !== 'object' || obj === null) return false;
  const rule = obj as Record<string, unknown>;
  return (
    typeof rule.id === 'string' && typeof rule.name === 'string' && typeof rule.check === 'function'
  );
}

/** Returns true if a rule's `applicableTo` patterns match the given file path. */
function shouldApplyRule(rule: Rule, filePath: string): boolean {
  const normalizedPath = filePath.toLowerCase();
  return rule.applicableTo.some((pattern) => {
    if (pattern.startsWith('.')) {
      return normalizedPath.endsWith(pattern.toLowerCase());
    }
    if (pattern.includes('/')) {
      return normalizedPath.endsWith(pattern.toLowerCase());
    }
    return path.basename(normalizedPath) === pattern.toLowerCase();
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// File Reading with Error Handling
// ═════════════════════════════════════════════════════════════════════════════

type FileReadResult =
  | { success: true; filePath: string; content: string }
  | {
      success: false;
      filePath: string;
      reason: 'not_found' | 'too_large' | 'not_file' | 'symlink' | 'read_error';
      error?: string;
    };

async function readFileWithResult(filePath: string): Promise<FileReadResult> {
  try {
    // Use lstat to detect symlinks without following them (CWE-59)
    const lstats = await fs.lstat(filePath);

    if (lstats.isSymbolicLink()) {
      return { success: false, filePath, reason: 'symlink' };
    }

    if (!lstats.isFile()) {
      return { success: false, filePath, reason: 'not_file' };
    }

    if (lstats.size > MAX_FILE_SIZE) {
      return { success: false, filePath, reason: 'too_large' };
    }

    const content = await fs.readFile(filePath, 'utf-8');
    return { success: true, filePath, content };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      filePath,
      reason: 'read_error',
      error: errorMsg,
    };
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Parallel File Scanning
// ═════════════════════════════════════════════════════════════════════════════

interface ScanFileResult {
  findings: Finding[];
  errors: ScanError[];
}

async function scanSingleFile(
  filePath: string,
  content: string,
  rootPath: string,
  rules: Rule[]
): Promise<ScanFileResult> {
  const lines = content.split('\n');
  const context: ScanContext = {
    rootPath,
    filePath,
    content,
    lines,
    strippedLines: stripCommentsFromLines(lines),
  };

  const findings: Finding[] = [];
  const errors: ScanError[] = [];

  // Run applicable rules
  for (const rule of rules) {
    if (!shouldApplyRule(rule, filePath)) continue;

    try {
      const ruleFindings = rule.check(context);
      for (const finding of ruleFindings) {
        if (findings.length >= MAX_FINDINGS_PER_FILE) break;
        findings.push({
          ...finding,
          filePath: path.relative(rootPath, finding.filePath),
          severity: finding.severity || rule.severity,
          ruleId: finding.ruleId || rule.id,
          category: finding.category || rule.category,
        });
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      errors.push({
        filePath,
        error: `Rule ${rule.id} failed: ${errorMsg}`,
      });
    }
    if (findings.length >= MAX_FINDINGS_PER_FILE) break;
  }

  return { findings, errors };
}

// Process files in batches to control concurrency
async function processBatch<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  concurrency: number
): Promise<R[]> {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);
  }

  return results;
}

// ═════════════════════════════════════════════════════════════════════════════
// Main Scanner
// ═════════════════════════════════════════════════════════════════════════════

function categorizeFindings(findings: Finding[]): Pick<ScanResult, 'critical' | 'medium' | 'low'> {
  const critical: Finding[] = [];
  const medium: Finding[] = [];
  const low: Finding[] = [];
  for (const f of findings) {
    if (f.severity === 'critical') critical.push(f);
    else if (f.severity === 'medium') medium.push(f);
    else low.push(f);
  }
  return { critical, medium, low };
}

/** Scans a directory tree for security vulnerabilities and returns categorised findings. */
export async function scanProject(rootPath: string): Promise<ScanResult> {
  const startedAt = new Date().toISOString();
  const startTime = performance.now();

  const absoluteRoot = path.resolve(rootPath);
  const allFindings: Finding[] = [];
  const scanErrors: ScanError[] = [];

  // Load rules
  const rules = await loadRules();

  // Discover files
  const files = await glob(GLOB_PATTERNS, {
    cwd: absoluteRoot,
    absolute: true,
    onlyFiles: true,
    ignore: IGNORE_PATTERNS,
  });

  // Read + scan in a single pipeline so file contents are GC-eligible after each batch
  let filesScannedCount = 0;
  let filesSkipped = 0;

  const scanResults = await processBatch(
    files,
    async (filePath) => {
      const readResult = await readFileWithResult(filePath);
      if (!readResult.success) {
        filesSkipped++;
        if (readResult.reason === 'read_error') {
          return {
            findings: [],
            errors: [{ filePath: readResult.filePath, error: readResult.error || 'Unknown error' }],
          };
        }
        return { findings: [], errors: [] };
      }
      filesScannedCount++;
      try {
        return await scanSingleFile(readResult.filePath, readResult.content, absoluteRoot, rules);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        return {
          findings: [],
          errors: [{ filePath, error: `Scan failed: ${errorMsg}` }],
        };
      }
    },
    CONCURRENCY_LIMIT
  );

  // Aggregate results
  for (const result of scanResults) {
    allFindings.push(...result.findings);
    scanErrors.push(...result.errors);
  }

  const completedAt = new Date().toISOString();
  const durationMs = Math.round(performance.now() - startTime);

  // Log errors in development mode
  if (scanErrors.length > 0 && process.env.DEBUG) {
    console.error('[shipguard] Scan errors:', scanErrors);
  }

  if (filesScannedCount === 0) {
    console.warn('[shipguard] No scannable files found in the target directory.');
  }

  return {
    ...categorizeFindings(allFindings),
    metadata: {
      durationMs,
      filesScanned: filesScannedCount,
      filesSkipped,
      filesWithErrors: scanErrors.length,
      rulesLoaded: rules.length,
      startedAt,
      completedAt,
    },
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// Utility Exports
// ═════════════════════════════════════════════════════════════════════════════

export { loadRules, shouldApplyRule };
