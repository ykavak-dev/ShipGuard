import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  generateFixes,
  generatePatch,
  generateEnvExampleFix,
  generateDockerExposeFix,
  generateLoggingNoteFix,
  applyFix,
  FixSuggestion,
  ScanResultsInput,
} from '../../src/core/fixEngine';

// ── Helpers ────────────────────────────────────────────────────────────────

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shipguard-test-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
  tempDirs.length = 0;
});

function emptyScanResults(): ScanResultsInput {
  return { critical: [], medium: [], low: [] };
}

// ── generateFixes ──────────────────────────────────────────────────────────

describe('generateFixes', () => {
  it('returns a FixSuggestion[] when .env exists without .env.example', async () => {
    const dir = makeTempDir();
    fs.writeFileSync(path.join(dir, '.env'), 'API_KEY=secret123\nDB_HOST=localhost\n');

    const scanResults: ScanResultsInput = {
      critical: [
        {
          filePath: '.env',
          severity: 'critical',
          message: 'Missing .env.example',
          ruleId: 'env-missing-example',
          category: 'security',
        },
      ],
      medium: [],
      low: [],
    };

    const fixes = await generateFixes(dir, scanResults);
    expect(Array.isArray(fixes)).toBe(true);
    expect(fixes.length).toBeGreaterThan(0);

    const envFix = fixes.find(f => f.ruleId === 'env-missing-example');
    expect(envFix).toBeDefined();
    expect(envFix!.canAutoApply).toBe(true);
    expect(envFix!.filePath).toBe('.env.example');
    expect(envFix!.patch).toBeTruthy();
  });

  it('returns empty array when there are no applicable fixes', async () => {
    const dir = makeTempDir();
    // No .env, no docker files, no logging metadata
    const fixes = await generateFixes(dir, emptyScanResults());
    expect(fixes).toEqual([]);
  });
});

// ── generatePatch ──────────────────────────────────────────────────────────

describe('generatePatch', () => {
  it('returns "no automated fixes" message for empty scan results', async () => {
    const dir = makeTempDir();
    const patch = await generatePatch(dir, emptyScanResults());
    expect(patch).toContain('# No automated fixes available');
  });

  it('returns a patch containing fix details when fixes are available', async () => {
    const dir = makeTempDir();
    fs.writeFileSync(path.join(dir, '.env'), 'SECRET=value\n');

    const patch = await generatePatch(dir, emptyScanResults());
    expect(patch).toContain('Kilo Guardian Auto-Fix Patch');
    expect(patch).toContain('env-missing-example');
  });
});

// ── generateEnvExampleFix ──────────────────────────────────────────────────

describe('generateEnvExampleFix', () => {
  it('returns a FixSuggestion when .env exists and .env.example does not', async () => {
    const dir = makeTempDir();
    fs.writeFileSync(path.join(dir, '.env'), 'DB_PASSWORD=hunter2\nPORT=3000\n');

    const fix = await generateEnvExampleFix(dir);
    expect(fix).not.toBeNull();
    expect(fix!.ruleId).toBe('env-missing-example');
    expect(fix!.canAutoApply).toBe(true);
    expect(fix!.filePath).toBe('.env.example');
    expect(fix!.description).toContain('.env.example');
    expect(fix!.patch).toBeTruthy();
  });

  it('returns null when .env.example already exists', async () => {
    const dir = makeTempDir();
    fs.writeFileSync(path.join(dir, '.env'), 'KEY=value\n');
    fs.writeFileSync(path.join(dir, '.env.example'), 'KEY=your_key_here\n');

    const fix = await generateEnvExampleFix(dir);
    expect(fix).toBeNull();
  });

  it('returns null when .env does not exist', async () => {
    const dir = makeTempDir();
    const fix = await generateEnvExampleFix(dir);
    expect(fix).toBeNull();
  });

  it('masks sensitive keys in the generated template', async () => {
    const dir = makeTempDir();
    fs.writeFileSync(
      path.join(dir, '.env'),
      'API_KEY=sk-abc123\nDATABASE_PASSWORD=hunter2\nAPP_NAME=myapp\n'
    );

    const fix = await generateEnvExampleFix(dir);
    expect(fix).not.toBeNull();
    // Sensitive keys get uppercased YOUR_..._HERE placeholder
    expect(fix!.patch).toContain('YOUR_API_KEY_HERE');
    expect(fix!.patch).toContain('YOUR_DATABASE_PASSWORD_HERE');
    // Non-sensitive keys get lowercased your_..._here placeholder
    expect(fix!.patch).toContain('your_app_name_here');
  });

  it('preserves comments and blank lines from .env', async () => {
    const dir = makeTempDir();
    fs.writeFileSync(
      path.join(dir, '.env'),
      '# Database config\nDB_HOST=localhost\n\n# App config\nPORT=3000\n'
    );

    const fix = await generateEnvExampleFix(dir);
    expect(fix).not.toBeNull();
    expect(fix!.patch).toContain('# Database config');
    expect(fix!.patch).toContain('# App config');
  });
});

// ── applyFix ───────────────────────────────────────────────────────────────

describe('applyFix', () => {
  it('throws for non-auto-applicable ruleIds', () => {
    const dir = makeTempDir();
    const fix: FixSuggestion = {
      ruleId: 'docker-expose-postgres',
      filePath: 'Dockerfile',
      description: 'Remove EXPOSE 5432',
      patch: '--- a/Dockerfile\n+++ b/Dockerfile\n@@ -1,1 +1,0 @@\n-EXPOSE 5432\n',
      canAutoApply: false,
    };

    expect(() => applyFix(dir, fix)).toThrow('cannot be auto-applied');
  });

  it('creates the .env.example file when applying env-missing-example fix', async () => {
    const dir = makeTempDir();
    fs.writeFileSync(path.join(dir, '.env'), 'SECRET_KEY=abc123\n');

    const fix = await generateEnvExampleFix(dir);
    expect(fix).not.toBeNull();

    applyFix(dir, fix!);

    const created = fs.existsSync(path.join(dir, '.env.example'));
    expect(created).toBe(true);

    const content = fs.readFileSync(path.join(dir, '.env.example'), 'utf-8');
    expect(content).toContain('YOUR_SECRET_KEY_HERE');
  });

  it('applies logging-migration-note fix by writing the file', async () => {
    const dir = makeTempDir();
    const loggingFix = await generateLoggingNoteFix(dir, [
      { filePath: 'src/app.ts', count: 12 },
    ]);
    expect(loggingFix).not.toBeNull();

    applyFix(dir, loggingFix!);

    const created = fs.existsSync(path.join(dir, 'LOGGING_MIGRATION_NOTE.md'));
    expect(created).toBe(true);

    const content = fs.readFileSync(path.join(dir, 'LOGGING_MIGRATION_NOTE.md'), 'utf-8');
    expect(content).toContain('Logging Migration Note');
  });
});

// ── generateDockerExposeFix ────────────────────────────────────────────────

describe('generateDockerExposeFix', () => {
  it('returns a fix when Dockerfile contains EXPOSE 5432', async () => {
    const dir = makeTempDir();
    const dockerContent = `FROM node:18-alpine
WORKDIR /app
COPY . .
EXPOSE 5432
EXPOSE 3000
CMD ["node", "index.js"]
`;
    fs.writeFileSync(path.join(dir, 'Dockerfile'), dockerContent);

    const fix = await generateDockerExposeFix(dir, 'Dockerfile');
    expect(fix).not.toBeNull();
    expect(fix!.ruleId).toBe('docker-expose-postgres');
    expect(fix!.canAutoApply).toBe(false);
    expect(fix!.patch).toContain('-EXPOSE 5432');
  });

  it('returns null when Dockerfile does not contain EXPOSE 5432', async () => {
    const dir = makeTempDir();
    const dockerContent = `FROM node:18-alpine
WORKDIR /app
COPY . .
EXPOSE 3000
CMD ["node", "index.js"]
`;
    fs.writeFileSync(path.join(dir, 'Dockerfile'), dockerContent);

    const fix = await generateDockerExposeFix(dir, 'Dockerfile');
    expect(fix).toBeNull();
  });

  it('returns null when Dockerfile does not exist', async () => {
    const dir = makeTempDir();
    const fix = await generateDockerExposeFix(dir, 'Dockerfile');
    expect(fix).toBeNull();
  });
});

// ── generateLoggingNoteFix ──────────────────────────────────────────────────

describe('generateLoggingNoteFix', () => {
  it('returns a fix when files have excessive logs', async () => {
    const dir = makeTempDir();
    const files = [
      { filePath: 'src/app.ts', count: 15 },
      { filePath: 'src/utils.ts', count: 8 },
    ];

    const fix = await generateLoggingNoteFix(dir, files);
    expect(fix).not.toBeNull();
    expect(fix!.ruleId).toBe('logging-migration-note');
    expect(fix!.canAutoApply).toBe(true);
    expect(fix!.patch).toContain('src/app.ts');
    expect(fix!.patch).toContain('src/utils.ts');
    expect(fix!.patch).toContain('15');
    expect(fix!.patch).toContain('8');
    expect(fix!.description).toContain('2 file(s)');
  });

  it('returns null when file list is empty', async () => {
    const dir = makeTempDir();
    const fix = await generateLoggingNoteFix(dir, []);
    expect(fix).toBeNull();
  });

  it('returns null when LOGGING_MIGRATION_NOTE.md already exists', async () => {
    const dir = makeTempDir();
    fs.writeFileSync(path.join(dir, 'LOGGING_MIGRATION_NOTE.md'), '# Existing note\n');

    const fix = await generateLoggingNoteFix(dir, [
      { filePath: 'src/app.ts', count: 10 },
    ]);
    expect(fix).toBeNull();
  });
});

// ── generatePatch with real fixes ──────────────────────────────────────────

describe('generatePatch – with actual fixes', () => {
  it('generates a patch with Docker and logging fixes via metadata', async () => {
    const dir = makeTempDir();

    // Create a Dockerfile with EXPOSE 5432
    fs.writeFileSync(
      path.join(dir, 'Dockerfile'),
      'FROM node:18\nEXPOSE 5432\nEXPOSE 3000\nCMD ["node", "."]\n'
    );

    const scanResults: ScanResultsInput = {
      critical: [],
      medium: [],
      low: [],
      metadata: {
        consoleLogCounts: new Map([['src/app.ts', 12]]),
        dockerFilesWithPostgres: ['Dockerfile'],
      },
    };

    const patch = await generatePatch(dir, scanResults);
    expect(patch).toContain('Kilo Guardian Auto-Fix Patch');
    expect(patch).toContain('docker-expose-postgres');
    expect(patch).toContain('logging-migration-note');
    expect(patch).toContain('Total suggestions:');
  });

  it('generates patch with only logging note when no docker files', async () => {
    const dir = makeTempDir();

    const scanResults: ScanResultsInput = {
      critical: [],
      medium: [],
      low: [],
      metadata: {
        consoleLogCounts: new Map([['src/verbose.ts', 20]]),
      },
    };

    const patch = await generatePatch(dir, scanResults);
    expect(patch).toContain('logging-migration-note');
  });
});
