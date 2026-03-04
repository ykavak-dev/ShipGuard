import { promises as fsAsync } from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import type { Rule, ScanContext, Finding } from './types';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

interface YamlPattern {
  regex: string;
  flags?: string;
  message: string;
}

interface YamlRule {
  id: string;
  name: string;
  description: string;
  category: string;
  severity: 'critical' | 'medium' | 'low';
  applicableTo: string[];
  patterns: YamlPattern[];
}

interface YamlRulesFile {
  rules: YamlRule[];
}

// ═══════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════

const DEFAULT_FILENAME = 'shipguard-rules.yml';
const MAX_REGEX_LENGTH = 500;
const REDOS_TEST_THRESHOLD_MS = 10;

// ═══════════════════════════════════════════════════════════════════════════
// Validation
// ═══════════════════════════════════════════════════════════════════════════

function isValidYamlRule(obj: unknown): obj is YamlRule {
  if (typeof obj !== 'object' || obj === null) return false;
  const r = obj as Record<string, unknown>;
  return (
    typeof r.id === 'string' &&
    typeof r.name === 'string' &&
    typeof r.description === 'string' &&
    typeof r.category === 'string' &&
    typeof r.severity === 'string' &&
    ['critical', 'medium', 'low'].includes(r.severity as string) &&
    Array.isArray(r.applicableTo) &&
    r.applicableTo.every((a: unknown) => typeof a === 'string') &&
    Array.isArray(r.patterns) &&
    r.patterns.length > 0
  );
}

function isValidPattern(p: unknown): p is YamlPattern {
  if (typeof p !== 'object' || p === null) return false;
  const pat = p as Record<string, unknown>;
  return (
    typeof pat.regex === 'string' &&
    pat.regex.length > 0 &&
    pat.regex.length <= MAX_REGEX_LENGTH &&
    typeof pat.message === 'string'
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ReDoS Safety Check
// ═══════════════════════════════════════════════════════════════════════════

const REDOS_TEST_STRINGS = [
  'a'.repeat(25) + 'b', // repeated single char
  'ab'.repeat(15) + 'c', // alternating chars
  ' '.repeat(25) + 'x', // whitespace
  '0'.repeat(25) + 'z', // digits
  'a b '.repeat(8) + '!', // mixed with spaces
];

function compileAndTestRegex(pattern: string, flags: string): RegExp | null {
  try {
    const regex = new RegExp(pattern, flags);
    for (const testStr of REDOS_TEST_STRINGS) {
      const start = performance.now();
      regex.test(testStr);
      const elapsed = performance.now() - start;
      if (elapsed >= REDOS_TEST_THRESHOLD_MS) return null;
    }
    return regex;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Compiler
// ═══════════════════════════════════════════════════════════════════════════

function compileYamlRule(yamlRule: YamlRule): Rule | null {
  const compiledPatterns: { regex: RegExp; message: string }[] = [];

  for (const p of yamlRule.patterns) {
    if (!isValidPattern(p)) {
      console.error(`[shipguard] Skipping invalid pattern in rule "${yamlRule.id}"`);
      continue;
    }

    const flags = p.flags || '';
    const regex = compileAndTestRegex(p.regex, flags);
    if (!regex) {
      console.error(
        `[shipguard] Skipping unsafe or invalid regex pattern in rule "${yamlRule.id}"`
      );
      continue;
    }
    compiledPatterns.push({ regex, message: p.message });
  }

  if (compiledPatterns.length === 0) {
    console.error(`[shipguard] Rule "${yamlRule.id}" has no valid patterns, skipping`);
    return null;
  }

  return {
    id: yamlRule.id,
    name: yamlRule.name,
    description: yamlRule.description,
    category: yamlRule.category,
    severity: yamlRule.severity,
    applicableTo: yamlRule.applicableTo,
    check(context: ScanContext): Finding[] {
      const findings: Finding[] = [];

      for (let i = 0; i < context.lines.length; i++) {
        const line = context.lines[i];

        for (const { regex, message } of compiledPatterns) {
          regex.lastIndex = 0;
          const match = regex.exec(line);
          if (match) {
            const resolvedMessage = message.replace('{match}', match[0]);
            findings.push({
              filePath: context.filePath,
              line: i + 1,
              severity: yamlRule.severity,
              message: resolvedMessage,
              ruleId: yamlRule.id,
              category: yamlRule.category,
            });
            break;
          }
        }
      }

      return findings;
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// File Loading
// ═══════════════════════════════════════════════════════════════════════════

async function loadYamlFile(filePath: string): Promise<Rule[]> {
  const rules: Rule[] = [];

  let content: string;
  try {
    content = await fsAsync.readFile(filePath, 'utf-8');
  } catch {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = yaml.load(content, { schema: yaml.JSON_SCHEMA });
  } catch (err) {
    console.error(
      `[shipguard] Failed to parse YAML file ${filePath}: ${err instanceof Error ? err.message : String(err)}`
    );
    return [];
  }

  if (typeof parsed !== 'object' || parsed === null) return [];

  const file = parsed as YamlRulesFile;
  if (!Array.isArray(file.rules)) return [];

  for (const yamlRule of file.rules) {
    if (!isValidYamlRule(yamlRule)) {
      console.error(
        `[shipguard] Skipping invalid YAML rule in ${filePath}: ${JSON.stringify((yamlRule as Record<string, unknown>)?.id ?? 'unknown')}`
      );
      continue;
    }

    const compiled = compileYamlRule(yamlRule);
    if (compiled) {
      rules.push(compiled);
    }
  }

  return rules;
}

// ═══════════════════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════════════════

/** Loads custom YAML security rules from `shipguard-rules.yml` or `SHIPGUARD_RULES_DIR`. */
export async function loadYamlRules(projectRoot?: string): Promise<Rule[]> {
  const rules: Rule[] = [];
  const root = projectRoot || process.env.SHIPGUARD_ROOT || process.cwd();

  // 1. Default file in project root
  const defaultPath = path.join(root, DEFAULT_FILENAME);
  rules.push(...(await loadYamlFile(defaultPath)));

  // 2. Additional rules directory from env or config
  const rulesDir = process.env.SHIPGUARD_RULES_DIR;
  if (rulesDir) {
    try {
      const dirEntries = await fsAsync.readdir(rulesDir);
      const files = dirEntries.filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));
      const fileResults = await Promise.all(
        files.map((file) => loadYamlFile(path.join(rulesDir, file)))
      );
      for (const fileRules of fileResults) {
        rules.push(...fileRules);
      }
    } catch {
      // Rules directory doesn't exist, that's fine
    }
  }

  return rules;
}
