import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'child_process';
import * as path from 'path';

const ROOT = path.join(__dirname, '..', '..');
const FIXTURES = path.join(__dirname, '..', 'fixtures');

// Import from dist/ so that __dirname in scanner resolves to dist/core/,
// allowing loadRules() to discover the compiled rule .js files.
let scanProject: typeof import('../../src/core/scanner').scanProject;

describe('scanProject', () => {
  beforeAll(async () => {
    execFileSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'pipe' });
    const mod = await import(path.join(ROOT, 'dist', 'core', 'scanner.js'));
    scanProject = mod.scanProject;
  });

  it('returns findings for vulnerable fixtures', async () => {
    const result = await scanProject(FIXTURES);
    const total = result.critical.length + result.medium.length + result.low.length;
    expect(total).toBeGreaterThan(0);
  });

  it('populates metadata', async () => {
    const result = await scanProject(FIXTURES);
    expect(result.metadata).toBeDefined();
    expect(result.metadata!.filesScanned).toBeGreaterThan(0);
    expect(result.metadata!.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.metadata!.rulesLoaded).toBeGreaterThan(0);
    expect(result.metadata!.startedAt).toBeTruthy();
    expect(result.metadata!.completedAt).toBeTruthy();
  });

  it('categorizes findings by severity', async () => {
    const result = await scanProject(FIXTURES);
    expect(result.critical.length).toBeGreaterThan(0);
    for (const f of result.critical) {
      expect(f.severity).toBe('critical');
    }
    for (const f of result.medium) {
      expect(f.severity).toBe('medium');
    }
    for (const f of result.low) {
      expect(f.severity).toBe('low');
    }
  });

  it('returns empty results for nonexistent directory', async () => {
    const emptyDir = path.join(FIXTURES, 'nonexistent-' + Date.now());
    const result = await scanProject(emptyDir);
    const total = result.critical.length + result.medium.length + result.low.length;
    expect(total).toBe(0);
  });

  it('uses relative file paths in findings', async () => {
    const result = await scanProject(FIXTURES);
    const allFindings = [...result.critical, ...result.medium, ...result.low];
    for (const f of allFindings) {
      expect(path.isAbsolute(f.filePath)).toBe(false);
    }
  });
});
