import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'child_process';
import * as path from 'path';

const ROOT = path.join(__dirname, '..', '..');
const CLI = path.join(ROOT, 'dist', 'cli.js');
const FIXTURES = path.join(__dirname, '..', 'fixtures');

function run(args: string[], options?: { cwd?: string }): { stdout: string; exitCode: number } {
  try {
    const stdout = execFileSync('node', [CLI, ...args], {
      cwd: options?.cwd ?? FIXTURES,
      encoding: 'utf-8',
      timeout: 30000,
      env: { ...process.env, NO_COLOR: '1' },
    });
    return { stdout, exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: Buffer; status?: number };
    return {
      stdout: e.stdout?.toString() ?? '',
      exitCode: e.status ?? 1,
    };
  }
}

describe('CLI scan command', () => {
  beforeAll(() => {
    execFileSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'pipe' });
  });

  it('outputs JSON with --format json', () => {
    const { stdout } = run(['scan', '--format', 'json']);
    const json = JSON.parse(stdout);
    expect(json.summary).toBeDefined();
    expect(typeof json.score).toBe('number');
    expect(json.findings).toBeDefined();
  });

  it('outputs valid SARIF with --format sarif', () => {
    const { stdout } = run(['scan', '--format', 'sarif']);
    const sarif = JSON.parse(stdout);
    expect(sarif.version).toBe('2.1.0');
    expect(sarif.runs).toBeDefined();
  });

  it('exits with code 1 when score below threshold', () => {
    const { exitCode } = run(['scan', '--format', 'json', '--threshold', '100']);
    expect(exitCode).toBe(1);
  });

  it('exits with code 0 when score above threshold', () => {
    const { exitCode } = run(['scan', '--format', 'json', '--threshold', '0']);
    expect(exitCode).toBe(0);
  });

  it('--json flag works as alias for --format json', () => {
    const { stdout } = run(['scan', '--json']);
    const json = JSON.parse(stdout);
    expect(json.score).toBeDefined();
    expect(json.summary).toBeDefined();
  });
});

describe('CLI config command', () => {
  it('lists config values', () => {
    const { stdout, exitCode } = run(['config', 'list'], { cwd: ROOT });
    expect(exitCode).toBe(0);
    expect(stdout).toContain('provider');
    expect(stdout).toContain('threshold');
  });
});
