import { describe, it, expect, afterEach } from 'vitest';
import * as path from 'path';
import { loadYamlRules } from '../../src/core/yamlRuleLoader';
import { createTestContext } from '../helpers/createContext';

const FIXTURES_DIR = path.resolve(__dirname, '..', 'fixtures', 'yaml-rules');

describe('loadYamlRules', () => {
  const originalRulesDir = process.env.SHIPGUARD_RULES_DIR;

  afterEach(() => {
    if (originalRulesDir === undefined) {
      delete process.env.SHIPGUARD_RULES_DIR;
    } else {
      process.env.SHIPGUARD_RULES_DIR = originalRulesDir;
    }
  });

  it('loads rules from SHIPGUARD_RULES_DIR and finds >= 2 rules with correct ids', async () => {
    process.env.SHIPGUARD_RULES_DIR = FIXTURES_DIR;

    // Pass a nonexistent project root so only SHIPGUARD_RULES_DIR is used
    const rules = await loadYamlRules('/nonexistent-project-root');
    expect(rules.length).toBeGreaterThanOrEqual(2);

    const ids = rules.map((r) => r.id);
    expect(ids).toContain('test-no-todo');
    expect(ids).toContain('test-no-console-error');
  });

  it('loaded rule check() detects a TODO comment', async () => {
    process.env.SHIPGUARD_RULES_DIR = FIXTURES_DIR;

    const rules = await loadYamlRules('/nonexistent-project-root');
    const todoRule = rules.find((r) => r.id === 'test-no-todo');
    expect(todoRule).toBeDefined();

    const context = createTestContext('app.ts', '// TODO: fix this\nconst x = 1;');
    const findings = todoRule!.check(context);
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0].ruleId).toBe('test-no-todo');
    expect(findings[0].message).toContain('TODO');
  });

  it('returns empty array for nonexistent project root with no SHIPGUARD_RULES_DIR', async () => {
    delete process.env.SHIPGUARD_RULES_DIR;
    const rules = await loadYamlRules('/completely/nonexistent/path');
    expect(rules).toEqual([]);
  });

  it('all loaded rules have id and check function', async () => {
    process.env.SHIPGUARD_RULES_DIR = FIXTURES_DIR;

    const rules = await loadYamlRules('/nonexistent-project-root');
    for (const rule of rules) {
      expect(typeof rule.id).toBe('string');
      expect(rule.id.length).toBeGreaterThan(0);
      expect(typeof rule.check).toBe('function');
    }
  });
});
