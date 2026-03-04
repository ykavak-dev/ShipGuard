import { describe, it, expect } from 'vitest';
import { generateSarif } from '../../src/core/report/sarif';
import type { ScanResult, Rule, Finding } from '../../src/core/scanner';

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    filePath: 'src/app.ts',
    line: 10,
    severity: 'medium',
    message: 'Test finding',
    ruleId: 'test-rule',
    category: 'security',
    ...overrides,
  };
}

function makeRule(overrides: Partial<Rule> = {}): Rule {
  return {
    id: 'test-rule',
    name: 'Test Rule',
    description: 'A test rule',
    category: 'security',
    severity: 'medium',
    applicableTo: ['.ts'],
    check: () => [],
    ...overrides,
  };
}

function makeScanResult(
  critical: Finding[] = [],
  medium: Finding[] = [],
  low: Finding[] = []
): ScanResult {
  return { critical, medium, low };
}

describe('generateSarif', () => {
  it('output has correct SARIF version and schema', () => {
    const sarif = generateSarif(makeScanResult(), []) as Record<string, unknown>;
    expect(sarif.version).toBe('2.1.0');
    expect(sarif.$schema).toContain('sarif-schema-2.1.0');
  });

  it('all findings appear as results', () => {
    const criticalFinding = makeFinding({
      severity: 'critical',
      ruleId: 'rule-a',
      message: 'Critical issue',
    });
    const mediumFinding = makeFinding({
      severity: 'medium',
      ruleId: 'rule-b',
      message: 'Medium issue',
    });
    const lowFinding = makeFinding({ severity: 'low', ruleId: 'rule-c', message: 'Low issue' });

    const rules = [
      makeRule({ id: 'rule-a', severity: 'critical' }),
      makeRule({ id: 'rule-b', severity: 'medium' }),
      makeRule({ id: 'rule-c', severity: 'low' }),
    ];

    const sarif = generateSarif(
      makeScanResult([criticalFinding], [mediumFinding], [lowFinding]),
      rules
    ) as { runs: Array<{ results: Array<{ ruleId: string }> }> };

    const results = sarif.runs[0].results;
    expect(results).toHaveLength(3);

    const ruleIds = results.map((r) => r.ruleId);
    expect(ruleIds).toContain('rule-a');
    expect(ruleIds).toContain('rule-b');
    expect(ruleIds).toContain('rule-c');
  });

  it('maps severity correctly: critical→error, medium→warning, low→note', () => {
    const criticalFinding = makeFinding({ severity: 'critical', ruleId: 'r1' });
    const mediumFinding = makeFinding({ severity: 'medium', ruleId: 'r2' });
    const lowFinding = makeFinding({ severity: 'low', ruleId: 'r3' });

    const rules = [
      makeRule({ id: 'r1', severity: 'critical' }),
      makeRule({ id: 'r2', severity: 'medium' }),
      makeRule({ id: 'r3', severity: 'low' }),
    ];

    const sarif = generateSarif(
      makeScanResult([criticalFinding], [mediumFinding], [lowFinding]),
      rules
    ) as { runs: Array<{ results: Array<{ ruleId: string; level: string }> }> };

    const results = sarif.runs[0].results;
    const byRuleId = Object.fromEntries(results.map((r) => [r.ruleId, r.level]));

    expect(byRuleId['r1']).toBe('error');
    expect(byRuleId['r2']).toBe('warning');
    expect(byRuleId['r3']).toBe('note');
  });

  it('rules array matches result ruleIds', () => {
    const findings = [
      makeFinding({ severity: 'critical', ruleId: 'alpha' }),
      makeFinding({ severity: 'medium', ruleId: 'beta' }),
    ];
    const rules = [
      makeRule({ id: 'alpha', severity: 'critical' }),
      makeRule({ id: 'beta', severity: 'medium' }),
    ];

    const sarif = generateSarif(makeScanResult([findings[0]], [findings[1]]), rules) as {
      runs: Array<{
        tool: { driver: { rules: Array<{ id: string }> } };
        results: Array<{ ruleId: string }>;
      }>;
    };

    const driverRuleIds = sarif.runs[0].tool.driver.rules.map((r) => r.id);
    const resultRuleIds = sarif.runs[0].results.map((r) => r.ruleId);

    for (const id of resultRuleIds) {
      expect(driverRuleIds).toContain(id);
    }
  });

  it('empty results produces valid SARIF with empty results array', () => {
    const sarif = generateSarif(makeScanResult(), []) as {
      version: string;
      $schema: string;
      runs: Array<{ results: unknown[] }>;
    };

    expect(sarif.version).toBe('2.1.0');
    expect(sarif.$schema).toContain('sarif-schema-2.1.0');
    expect(sarif.runs).toHaveLength(1);
    expect(sarif.runs[0].results).toEqual([]);
  });
});
