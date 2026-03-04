import { glob } from 'fast-glob';
import { promises as fs } from 'fs';
import * as path from 'path';
import { loadYamlRules } from './yamlRuleLoader';

// ═════════════════════════════════════════════════════════════════════════════
// Types
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
  '**/src/core/report/**',
  '**/tests/**',
  '**/__tests__/**',
  '**/*.test.*',
  '**/*.spec.*',
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const CONCURRENCY_LIMIT = 50; // Parallel file processing limit

// ═════════════════════════════════════════════════════════════════════════════
// Rule Loading
// ═════════════════════════════════════════════════════════════════════════════

async function loadRules(): Promise<Rule[]> {
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
  const tsRuleIds = new Set(rules.map(r => r.id));
  const yamlRules = await loadYamlRules();

  for (const yamlRule of yamlRules) {
    if (tsRuleIds.has(yamlRule.id)) {
      console.error(`[shipguard] YAML rule "${yamlRule.id}" conflicts with built-in rule, skipping`);
      continue;
    }
    rules.push(yamlRule);
  }

  return rules;
}

function isValidRule(obj: unknown): obj is Rule {
  if (typeof obj !== 'object' || obj === null) return false;
  const rule = obj as Record<string, unknown>;
  return (
    typeof rule.id === 'string' &&
    typeof rule.name === 'string' &&
    typeof rule.check === 'function'
  );
}

function shouldApplyRule(rule: Rule, filePath: string): boolean {
  const normalizedPath = filePath.toLowerCase();
  return rule.applicableTo.some(pattern => {
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
  | { success: false; filePath: string; reason: 'not_found' | 'too_large' | 'not_file' | 'read_error'; error?: string };

async function readFileWithResult(filePath: string): Promise<FileReadResult> {
  try {
    const stats = await fs.stat(filePath);
    
    if (!stats.isFile()) {
      return { success: false, filePath, reason: 'not_file' };
    }
    
    if (stats.size > MAX_FILE_SIZE) {
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
      error: errorMsg 
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
  const context: ScanContext = {
    rootPath,
    filePath,
    content,
    lines: content.split('\n'),
  };

  const findings: Finding[] = [];
  const errors: ScanError[] = [];

  // Run applicable rules
  for (const rule of rules) {
    if (!shouldApplyRule(rule, filePath)) continue;

    try {
      const ruleFindings = rule.check(context);
      for (const finding of ruleFindings) {
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
  return {
    critical: findings.filter(f => f.severity === 'critical'),
    medium: findings.filter(f => f.severity === 'medium'),
    low: findings.filter(f => f.severity === 'low'),
  };
}

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

  // Read all files in parallel with concurrency limit
  const fileReadResults = await processBatch(
    files,
    (filePath) => readFileWithResult(filePath),
    CONCURRENCY_LIMIT
  );

  // Process successfully read files
  const validFiles: { filePath: string; content: string }[] = [];
  let filesSkipped = 0;
  for (const result of fileReadResults) {
    if (result.success) {
      validFiles.push({ filePath: result.filePath, content: result.content });
    } else {
      filesSkipped++;
      if ('reason' in result && result.reason === 'read_error') {
        scanErrors.push({ filePath: result.filePath, error: result.error || 'Unknown error' });
      }
    }
  }

  // Scan files in parallel with concurrency limit
  const scanResults = await processBatch(
    validFiles,
    async ({ filePath, content }) => {
      try {
        return await scanSingleFile(filePath, content, absoluteRoot, rules);
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
    console.error('Scan errors:', scanErrors);
  }

  return {
    ...categorizeFindings(allFindings),
    metadata: {
      durationMs,
      filesScanned: validFiles.length,
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
