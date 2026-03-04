import { promises as fsAsync } from 'fs';
import * as path from 'path';
import { Finding } from './scanner';
import { resolveSafePath } from './pathValidation';

const SENSITIVE_KEY_PATTERN = /password|secret|key|token|private|api_key|auth/i;
const EXPOSE_POSTGRES_PATTERN = /^EXPOSE\s+5432/i;

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fsAsync.access(filePath);
    return true;
  } catch {
    return false;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Types
// ═════════════════════════════════════════════════════════════════════════════

export interface FixSuggestion {
  ruleId: string;
  filePath: string;
  description: string;
  patch: string;
  canAutoApply: boolean;
}

interface PatchHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
}

// ═════════════════════════════════════════════════════════════════════════════
// Unified Diff Generator
// ═════════════════════════════════════════════════════════════════════════════

function createUnifiedDiff(
  oldFilePath: string,
  newFilePath: string,
  oldContent: string | null,
  newContent: string
): string {
  const oldLines = oldContent ? oldContent.split('\n') : [];
  const newLines = newContent.split('\n');
  const timestamp = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');

  const oldHeader = oldContent
    ? `--- a/${oldFilePath}\t${timestamp}`
    : `--- /dev/null\t${timestamp}`;
  const newHeader = `+++ b/${newFilePath}\t${timestamp}`;

  const hunks = generateHunks(oldLines, newLines);
  if (hunks.length === 0) return '';

  const diffLines = [oldHeader, newHeader, ...hunks.flatMap((hunk) => formatHunk(hunk))];

  return diffLines.join('\n') + '\n';
}

function generateHunks(oldLines: string[], newLines: string[]): PatchHunk[] {
  const hunks: PatchHunk[] = [];
  let i = 0;
  let j = 0;

  while (i < oldLines.length || j < newLines.length) {
    while (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
      i++;
      j++;
    }
    if (i >= oldLines.length && j >= newLines.length) break;

    const oldStart = i;
    const newStart = j;
    const hunkLines: string[] = [];
    const contextBefore = Math.max(0, oldStart - 3);

    for (let k = contextBefore; k < oldStart; k++) {
      hunkLines.push(' ' + oldLines[k]);
    }

    let oldCount = 0;
    let newCount = 0;

    while (i < oldLines.length || j < newLines.length) {
      if (i < oldLines.length && j < newLines.length && matchesAhead(oldLines, i, newLines, j, 3))
        break;

      if (i < oldLines.length && (j >= newLines.length || oldLines[i] !== newLines[j])) {
        hunkLines.push('-' + oldLines[i]);
        i++;
        oldCount++;
      } else if (j < newLines.length) {
        hunkLines.push('+' + newLines[j]);
        j++;
        newCount++;
      }
    }

    const contextAfter = Math.min(oldLines.length - i, 3);
    for (let k = 0; k < contextAfter; k++) {
      hunkLines.push(' ' + oldLines[i + k]);
      if (i + k < oldLines.length) oldCount++;
      if (j + k < newLines.length) newCount++;
    }

    hunks.push({
      oldStart: contextBefore + 1,
      oldLines: oldStart - contextBefore + oldCount,
      newStart: newStart - (oldStart - contextBefore) + 1,
      newLines: newStart - oldStart + newCount + (contextBefore > 0 ? oldStart - contextBefore : 0),
      lines: hunkLines,
    });

    i += contextAfter;
    j += contextAfter;
  }

  return hunks;
}

function formatHunk(hunk: PatchHunk): string[] {
  const header = `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`;
  return [header, ...hunk.lines];
}

/** Check if `count` elements starting at aIdx/bIdx match without allocating slices. */
function matchesAhead(
  a: string[],
  aIdx: number,
  b: string[],
  bIdx: number,
  count: number
): boolean {
  const aLen = Math.min(count, a.length - aIdx);
  const bLen = Math.min(count, b.length - bIdx);
  if (aLen !== bLen || aLen === 0) return false;
  for (let k = 0; k < aLen; k++) {
    if (a[aIdx + k] !== b[bIdx + k]) return false;
  }
  return true;
}

// ═════════════════════════════════════════════════════════════════════════════
// Fix Generators
// ═════════════════════════════════════════════════════════════════════════════

export async function generateEnvExampleFix(rootPath: string): Promise<FixSuggestion | null> {
  const envPath = path.join(rootPath, '.env');
  const envExamplePath = '.env.example';
  const fullEnvExamplePath = path.join(rootPath, envExamplePath);

  if (!(await fileExists(envPath)) || (await fileExists(fullEnvExamplePath))) {
    return null;
  }

  const envContent = await fsAsync.readFile(envPath, 'utf-8');
  const lines = envContent.split('\n');

  const exampleLines = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return line;

    const eqIndex = line.indexOf('=');
    if (eqIndex > 0) {
      const key = line.substring(0, eqIndex).trim();
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        return `${key}=YOUR_${key.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_HERE`;
      }
      return `${key}=your_${key.toLowerCase().replace(/[^a-z0-9]/g, '_')}_here`;
    }
    return line;
  });

  const exampleContent = `# Environment Variables Template
# Copy this file to .env and fill in your values

${exampleLines.join('\n')}
`;

  const patch = createUnifiedDiff(envExamplePath, envExamplePath, null, exampleContent);

  return {
    ruleId: 'env-missing-example',
    filePath: envExamplePath,
    description: 'Create .env.example template from existing .env file',
    patch,
    canAutoApply: true,
  };
}

export async function generateLoggingNoteFix(
  rootPath: string,
  filesWithExcessiveLogs: Array<{ filePath: string; count: number }>
): Promise<FixSuggestion | null> {
  if (filesWithExcessiveLogs.length === 0) return null;

  const notePath = 'LOGGING_MIGRATION_NOTE.md';
  const fullNotePath = path.join(rootPath, notePath);

  if (await fileExists(fullNotePath)) return null;

  const noteContent = `# Logging Migration Note

> Generated by ShipGuard
> Date: ${new Date().toISOString().split('T')[0]}

## Summary

Excessive console.log usage detected across ${filesWithExcessiveLogs.length} file(s).
Consider migrating to a structured logger like pino or winston.

## Affected Files

| File | Console.log Count |
|------|------------------|
${filesWithExcessiveLogs.map((f) => `| ${f.filePath} | ${f.count} |`).join('\n')}

## Migration Example

### Before
console.log('User logged in:', userId);
console.error('Failed to connect to database');

### After (using pino)
import logger from './logger';

logger.info({ userId }, 'User logged in');
logger.error('Failed to connect to database');

## Benefits

- Structured JSON logs for better parsing
- Log levels (debug, info, warn, error)
- Better performance with async logging
- Centralized log configuration

---
*This file was auto-generated. You can delete it after migration is complete.*
`;

  const patch = createUnifiedDiff(notePath, notePath, null, noteContent);

  return {
    ruleId: 'logging-migration-note',
    filePath: notePath,
    description: `Create migration note for ${filesWithExcessiveLogs.length} file(s) with excessive console.log usage`,
    patch,
    canAutoApply: true,
  };
}

export async function generateDockerExposeFix(
  rootPath: string,
  filePath: string
): Promise<FixSuggestion | null> {
  const fullPath = path.join(rootPath, filePath);

  if (!(await fileExists(fullPath))) return null;

  const content = await fsAsync.readFile(fullPath, 'utf-8');
  const lines = content.split('\n');

  const exposePostgresLines: number[] = [];

  lines.forEach((line, idx) => {
    if (EXPOSE_POSTGRES_PATTERN.test(line.trim())) {
      exposePostgresLines.push(idx);
    }
  });

  if (exposePostgresLines.length === 0) return null;

  const newLines = lines.filter((_, idx) => !exposePostgresLines.includes(idx));

  const patch = createUnifiedDiff(filePath, filePath, content, newLines.join('\n'));

  return {
    ruleId: 'docker-expose-postgres',
    filePath,
    description: 'Remove EXPOSE 5432 (PostgreSQL) from Dockerfile - use internal networking',
    patch,
    canAutoApply: false,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// Main Export
// ═════════════════════════════════════════════════════════════════════════════

export interface ScanResultsInput {
  critical: Finding[];
  medium: Finding[];
  low: Finding[];
  metadata?: {
    consoleLogCounts?: Map<string, number>;
    dockerFilesWithPostgres?: string[];
  };
}

async function collectFixSuggestions(
  rootPath: string,
  scanResults: ScanResultsInput
): Promise<FixSuggestion[]> {
  const suggestions: FixSuggestion[] = [];

  const envFix = await generateEnvExampleFix(rootPath);
  if (envFix) suggestions.push(envFix);

  const consoleLogCounts = scanResults.metadata?.consoleLogCounts;
  if (consoleLogCounts && consoleLogCounts.size > 0) {
    // Any file with a count > 0 triggered the excessive-logging rule
    const filesWithLogs = Array.from(consoleLogCounts.entries())
      .filter(([, count]) => count > 0)
      .map(([filePath, count]) => ({ filePath, count }));

    const loggingNote = await generateLoggingNoteFix(rootPath, filesWithLogs);
    if (loggingNote) suggestions.push(loggingNote);
  }

  const dockerFiles = scanResults.metadata?.dockerFilesWithPostgres || [];
  for (const filePath of dockerFiles) {
    const fix = await generateDockerExposeFix(rootPath, filePath);
    if (fix) suggestions.push(fix);
  }

  return suggestions;
}

/** Generates a unified diff patch string from scan results. */
export async function generatePatch(
  rootPath: string,
  scanResults: ScanResultsInput
): Promise<string> {
  const suggestions = await collectFixSuggestions(rootPath, scanResults);

  if (suggestions.length === 0) {
    return '# No automated fixes available for current scan results\n';
  }

  const parts: string[] = [
    '# ShipGuard Auto-Fix Patch',
    `# Generated: ${new Date().toISOString()}`,
    `# Total suggestions: ${suggestions.length}`,
    '',
  ];

  for (let i = 0; i < suggestions.length; i++) {
    const s = suggestions[i];
    parts.push('# ═════════════════════════════════════════════════════════════════════════════');
    parts.push(`# Fix ${i + 1}/${suggestions.length}: ${s.ruleId}`);
    parts.push(`# File: ${s.filePath}`);
    parts.push(`# Description: ${s.description}`);
    parts.push(`# Auto-apply: ${s.canAutoApply ? 'YES' : 'NO - requires manual review'}`);
    parts.push('# ═════════════════════════════════════════════════════════════════════════════');
    parts.push('');
    parts.push(s.patch);
    parts.push('');
  }

  return parts.join('\n');
}

/** Generates fix suggestions for the given scan results. */
export async function generateFixes(
  rootPath: string,
  scanResults: ScanResultsInput
): Promise<FixSuggestion[]> {
  return collectFixSuggestions(rootPath, scanResults);
}

/** Applies an auto-applicable fix suggestion to the filesystem. */
export async function applyFix(rootPath: string, fix: FixSuggestion): Promise<void> {
  // Validate path to prevent path traversal attacks
  let safePath: string;
  try {
    safePath = resolveSafePath(rootPath, fix.filePath);
  } catch (err) {
    console.error(
      `[shipguard] Skipping fix for ${fix.filePath}: ${err instanceof Error ? err.message : String(err)}`
    );
    return;
  }

  if (fix.ruleId === 'env-missing-example') {
    const content = extractNewFileContent(fix.patch);
    await fsAsync.writeFile(safePath, content, 'utf-8');
    return;
  }

  if (fix.ruleId === 'logging-migration-note') {
    const content = extractNewFileContent(fix.patch);
    await fsAsync.writeFile(safePath, content, 'utf-8');
    return;
  }

  throw new Error(`Fix ${fix.ruleId} cannot be auto-applied. Manual review required.`);
}

function extractNewFileContent(patch: string): string {
  const lines = patch.split('\n');
  const contentLines: string[] = [];
  let inHunk = false;

  for (const line of lines) {
    if (line.startsWith('@@')) {
      inHunk = true;
      continue;
    }
    if (!inHunk) continue;
    if (line.startsWith('+')) {
      contentLines.push(line.substring(1));
    } else if (line.startsWith(' ')) {
      contentLines.push(line.substring(1));
    }
  }

  return contentLines.join('\n');
}
