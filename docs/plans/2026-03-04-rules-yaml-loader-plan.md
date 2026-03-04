# Rules Engine Expansion + YAML Custom Rules Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add 6 new built-in security rules and a YAML-based custom rule loader to ShipGuard.

**Architecture:** New rules follow existing `Rule` interface pattern (default export per file). YAML loader is a separate module that converts YAML patterns into `Rule` objects. Scanner merges both sources with TS rules taking priority on ID conflicts.

**Tech Stack:** TypeScript (strict mode, CommonJS), `js-yaml` for YAML parsing, `fast-glob` (existing)

**Design doc:** `docs/plans/2026-03-04-rules-yaml-loader-design.md`

**Constraints:**
- TypeScript strict mode: `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`
- No test framework exists — verification via `npm run build` + manual smoke test
- Existing 4 rules (secrets.ts, env.ts, docker.ts, reliability.ts) must NOT be modified

---

### Task 1: Install js-yaml

**Files:**
- Modify: `package.json` (via npm)

**Step 1: Install dependencies**

Run:
```bash
npm install js-yaml
npm install -D @types/js-yaml
```

**Step 2: Verify build still passes**

Run: `npm run build`
Expected: Clean compile.

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add js-yaml dependency for YAML rule loader"
```

---

### Task 2: Add SQL Injection Rule

**Files:**
- Create: `src/core/rules/sqlInjection.ts`

**Step 1: Create the rule file**

```typescript
import type { Rule, ScanContext, Finding } from '../scanner';

const QUERY_METHODS = ['query', 'execute', 'raw', 'prepare'];

const rule: Rule = {
  id: 'sql-injection',
  name: 'SQL Injection Risk',
  description: 'Detects SQL queries built with string concatenation or template literals',
  category: 'injection',
  severity: 'critical',
  applicableTo: ['.ts', '.js'],
  check(context: ScanContext): Finding[] {
    const findings: Finding[] = [];

    for (let i = 0; i < context.lines.length; i++) {
      const line = context.lines[i];
      const trimmed = line.trim();

      // Skip comments
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;

      for (const method of QUERY_METHODS) {
        // Template literal with interpolation: .query(`...${...}...`)
        const templatePattern = new RegExp(`\\.${method}\\s*\\(\`[^\\)]*\\$\\{`);
        if (templatePattern.test(line)) {
          findings.push({
            filePath: context.filePath,
            line: i + 1,
            severity: 'critical',
            message: `SQL injection risk: .${method}() uses template literal with variable interpolation. Use parameterized queries instead.`,
            ruleId: 'sql-injection',
            category: 'injection',
          });
          break;
        }

        // String concatenation: .query("SELECT" + variable) or .query('INSERT' +
        const concatPattern = new RegExp(`\\.${method}\\s*\\(\\s*['"][^'"]*['"]\\s*\\+`);
        if (concatPattern.test(line)) {
          findings.push({
            filePath: context.filePath,
            line: i + 1,
            severity: 'critical',
            message: `SQL injection risk: .${method}() uses string concatenation. Use parameterized queries instead.`,
            ruleId: 'sql-injection',
            category: 'injection',
          });
          break;
        }
      }
    }

    return findings;
  },
};

export default rule;
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Clean compile.

**Step 3: Commit**

```bash
git add src/core/rules/sqlInjection.ts
git commit -m "feat(rules): add sql-injection rule"
```

---

### Task 3: Add XSS Rule

**Files:**
- Create: `src/core/rules/xss.ts`

**Step 1: Create the rule file**

```typescript
import type { Rule, ScanContext, Finding } from '../scanner';

const XSS_PATTERNS: { pattern: RegExp; message: string }[] = [
  {
    pattern: /\.innerHTML\s*=/,
    message: 'Direct innerHTML assignment is an XSS risk. Use textContent or a sanitization library.',
  },
  {
    pattern: /\.outerHTML\s*=/,
    message: 'Direct outerHTML assignment is an XSS risk. Use safe DOM APIs.',
  },
  {
    pattern: /dangerouslySetInnerHTML/,
    message: 'dangerouslySetInnerHTML bypasses React XSS protection. Sanitize input first.',
  },
  {
    pattern: /document\.write\s*\(/,
    message: 'document.write() can introduce XSS vulnerabilities. Use safe DOM APIs.',
  },
  {
    pattern: /\beval\s*\(/,
    message: 'eval() executes arbitrary code and is an XSS/injection risk. Avoid eval entirely.',
  },
];

const rule: Rule = {
  id: 'xss-vulnerable',
  name: 'XSS Vulnerability',
  description: 'Detects patterns that may lead to cross-site scripting vulnerabilities',
  category: 'xss',
  severity: 'critical',
  applicableTo: ['.ts', '.js', '.jsx', '.tsx'],
  check(context: ScanContext): Finding[] {
    const findings: Finding[] = [];

    for (let i = 0; i < context.lines.length; i++) {
      const line = context.lines[i];
      const trimmed = line.trim();

      // Skip comments
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;

      for (const { pattern, message } of XSS_PATTERNS) {
        if (pattern.test(line)) {
          findings.push({
            filePath: context.filePath,
            line: i + 1,
            severity: 'critical',
            message,
            ruleId: 'xss-vulnerable',
            category: 'xss',
          });
          break; // One finding per line
        }
      }
    }

    return findings;
  },
};

export default rule;
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Clean compile.

**Step 3: Commit**

```bash
git add src/core/rules/xss.ts
git commit -m "feat(rules): add xss-vulnerable rule"
```

---

### Task 4: Add Insecure Dependency Rule

**Files:**
- Create: `src/core/rules/insecureDependency.ts`

**Step 1: Create the rule file**

```typescript
import type { Rule, ScanContext, Finding } from '../scanner';

const DANGEROUS_PACKAGES: { name: string; reason: string }[] = [
  { name: 'event-stream', reason: 'Known supply chain attack (flatmap-stream injection)' },
  { name: 'ua-parser-js', reason: 'Package was hijacked with cryptominer/password stealer' },
  { name: 'colors', reason: 'Maintainer sabotaged package (infinite loop in v1.4.1+)' },
  { name: 'faker', reason: 'Maintainer sabotaged package (replaced with ENDGAME module)' },
  { name: 'node-ipc', reason: 'Maintainer added protestware (data destruction payload)' },
  { name: 'flatmap-stream', reason: 'Malicious package used in event-stream attack' },
  { name: 'left-pad', reason: 'Deprecated and unmaintained — use String.prototype.padStart()' },
];

const rule: Rule = {
  id: 'insecure-dependency',
  name: 'Insecure Dependency',
  description: 'Detects known vulnerable, hijacked, or sabotaged npm packages',
  category: 'supply-chain',
  severity: 'critical',
  applicableTo: ['package.json'],
  check(context: ScanContext): Finding[] {
    const findings: Finding[] = [];

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(context.content);
    } catch {
      return [];
    }

    const deps = {
      ...(typeof parsed.dependencies === 'object' && parsed.dependencies !== null
        ? parsed.dependencies as Record<string, string>
        : {}),
      ...(typeof parsed.devDependencies === 'object' && parsed.devDependencies !== null
        ? parsed.devDependencies as Record<string, string>
        : {}),
    };

    for (const { name, reason } of DANGEROUS_PACKAGES) {
      if (name in deps) {
        // Find the line number where this package appears
        let lineNum: number | undefined;
        for (let i = 0; i < context.lines.length; i++) {
          if (context.lines[i].includes(`"${name}"`)) {
            lineNum = i + 1;
            break;
          }
        }

        findings.push({
          filePath: context.filePath,
          line: lineNum,
          severity: 'critical',
          message: `Insecure dependency "${name}": ${reason}`,
          ruleId: 'insecure-dependency',
          category: 'supply-chain',
        });
      }
    }

    return findings;
  },
};

export default rule;
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Clean compile.

**Step 3: Commit**

```bash
git add src/core/rules/insecureDependency.ts
git commit -m "feat(rules): add insecure-dependency rule"
```

---

### Task 5: Add Weak Crypto Rule

**Files:**
- Create: `src/core/rules/weakCrypto.ts`

**Step 1: Create the rule file**

```typescript
import type { Rule, ScanContext, Finding } from '../scanner';

const WEAK_HASH_PATTERN = /createHash\s*\(\s*['"](?:md5|sha1)['"]\s*\)/;
const PSEUDO_RANDOM_PATTERN = /crypto\.pseudoRandomBytes/;
const MATH_RANDOM_PATTERN = /Math\.random\s*\(\)/;

const SECURITY_CONTEXT_KEYWORDS = [
  'token', 'secret', 'password', 'key', 'salt', 'hash', 'nonce',
  'session', 'csrf', 'auth', 'credential', 'encrypt',
];

const rule: Rule = {
  id: 'weak-crypto',
  name: 'Weak Cryptography',
  description: 'Detects use of weak cryptographic algorithms and insecure random number generation',
  category: 'cryptography',
  severity: 'medium',
  applicableTo: ['.ts', '.js'],
  check(context: ScanContext): Finding[] {
    const findings: Finding[] = [];

    for (let i = 0; i < context.lines.length; i++) {
      const line = context.lines[i];
      const trimmed = line.trim();

      // Skip comments
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;

      // Weak hash algorithms
      if (WEAK_HASH_PATTERN.test(line)) {
        findings.push({
          filePath: context.filePath,
          line: i + 1,
          severity: 'medium',
          message: 'Weak hash algorithm (MD5/SHA1) detected. Use SHA-256 or stronger.',
          ruleId: 'weak-crypto',
          category: 'cryptography',
        });
      }

      // Deprecated pseudoRandomBytes
      if (PSEUDO_RANDOM_PATTERN.test(line)) {
        findings.push({
          filePath: context.filePath,
          line: i + 1,
          severity: 'medium',
          message: 'crypto.pseudoRandomBytes is deprecated. Use crypto.randomBytes() instead.',
          ruleId: 'weak-crypto',
          category: 'cryptography',
        });
      }

      // Math.random() in security context
      if (MATH_RANDOM_PATTERN.test(line)) {
        const surroundingLines = context.lines
          .slice(Math.max(0, i - 3), Math.min(context.lines.length, i + 4))
          .join(' ')
          .toLowerCase();

        const inSecurityContext = SECURITY_CONTEXT_KEYWORDS.some(kw => surroundingLines.includes(kw));

        if (inSecurityContext) {
          findings.push({
            filePath: context.filePath,
            line: i + 1,
            severity: 'medium',
            message: 'Math.random() is not cryptographically secure. Use crypto.randomBytes() or crypto.randomUUID() for security-sensitive values.',
            ruleId: 'weak-crypto',
            category: 'cryptography',
          });
        }
      }
    }

    return findings;
  },
};

export default rule;
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Clean compile.

**Step 3: Commit**

```bash
git add src/core/rules/weakCrypto.ts
git commit -m "feat(rules): add weak-crypto rule"
```

---

### Task 6: Add CORS Permissive Rule

**Files:**
- Create: `src/core/rules/corsPermissive.ts`

**Step 1: Create the rule file**

```typescript
import type { Rule, ScanContext, Finding } from '../scanner';

const CORS_PATTERNS: { pattern: RegExp; message: string }[] = [
  {
    pattern: /['"]Access-Control-Allow-Origin['"]\s*[:=]\s*['"]\*['"]/,
    message: 'Access-Control-Allow-Origin set to wildcard (*). Restrict to specific origins.',
  },
  {
    pattern: /origin\s*:\s*['"]\*['"]/,
    message: "CORS origin set to '*'. Restrict to specific allowed origins.",
  },
  {
    pattern: /origin\s*:\s*true\b/,
    message: 'CORS origin set to true (reflects any origin). Restrict to specific allowed origins.',
  },
  {
    pattern: /\bcors\s*\(\s*\)/,
    message: 'cors() called without options allows all origins. Pass a configuration object.',
  },
];

const rule: Rule = {
  id: 'cors-permissive',
  name: 'Permissive CORS Policy',
  description: 'Detects overly permissive CORS configurations',
  category: 'cors',
  severity: 'medium',
  applicableTo: ['.ts', '.js'],
  check(context: ScanContext): Finding[] {
    const findings: Finding[] = [];

    for (let i = 0; i < context.lines.length; i++) {
      const line = context.lines[i];
      const trimmed = line.trim();

      // Skip comments
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;

      for (const { pattern, message } of CORS_PATTERNS) {
        if (pattern.test(line)) {
          findings.push({
            filePath: context.filePath,
            line: i + 1,
            severity: 'medium',
            message,
            ruleId: 'cors-permissive',
            category: 'cors',
          });
          break; // One finding per line
        }
      }
    }

    return findings;
  },
};

export default rule;
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Clean compile.

**Step 3: Commit**

```bash
git add src/core/rules/corsPermissive.ts
git commit -m "feat(rules): add cors-permissive rule"
```

---

### Task 7: Add Error Info Leak Rule

**Files:**
- Create: `src/core/rules/errorInfoLeak.ts`

**Step 1: Create the rule file**

```typescript
import type { Rule, ScanContext, Finding } from '../scanner';

const STACK_LEAK_PATTERNS: { pattern: RegExp; message: string }[] = [
  {
    pattern: /res\.(send|json)\s*\(\s*err\.stack/,
    message: 'Sending error stack trace to client leaks internal information.',
  },
  {
    pattern: /res\.json\s*\(\s*\{[^}]*stack\s*:/,
    message: 'Including stack trace in JSON response leaks internal information.',
  },
  {
    pattern: /res\.status\s*\(\s*500\s*\)\s*\.\s*send\s*\(\s*(?:err|error)\s*\)/,
    message: 'Sending raw error object in 500 response may leak stack traces and internal paths.',
  },
  {
    pattern: /res\.(send|json)\s*\(\s*(?:err|error)\.message\s*\)/,
    message: 'Sending error.message directly may leak internal error details to clients.',
  },
];

const rule: Rule = {
  id: 'error-info-leak',
  name: 'Error Information Leak',
  description: 'Detects patterns that may leak stack traces or internal error details to clients',
  category: 'information-disclosure',
  severity: 'low',
  applicableTo: ['.ts', '.js'],
  check(context: ScanContext): Finding[] {
    const findings: Finding[] = [];

    for (let i = 0; i < context.lines.length; i++) {
      const line = context.lines[i];
      const trimmed = line.trim();

      // Skip comments
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;

      for (const { pattern, message } of STACK_LEAK_PATTERNS) {
        if (pattern.test(line)) {
          findings.push({
            filePath: context.filePath,
            line: i + 1,
            severity: 'low',
            message,
            ruleId: 'error-info-leak',
            category: 'information-disclosure',
          });
          break; // One finding per line
        }
      }
    }

    return findings;
  },
};

export default rule;
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Clean compile.

**Step 3: Commit**

```bash
git add src/core/rules/errorInfoLeak.ts
git commit -m "feat(rules): add error-info-leak rule"
```

---

### Task 8: Create YAML Rule Loader

**Files:**
- Create: `src/core/yamlRuleLoader.ts`

**Step 1: Create the YAML rule loader**

```typescript
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import type { Rule, ScanContext, Finding } from './scanner';

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
// Compiler
// ═══════════════════════════════════════════════════════════════════════════

function compileYamlRule(yamlRule: YamlRule): Rule | null {
  const compiledPatterns: { regex: RegExp; message: string }[] = [];

  for (const p of yamlRule.patterns) {
    if (!isValidPattern(p)) {
      console.error(`[shipguard] Skipping invalid pattern in rule "${yamlRule.id}"`);
      continue;
    }

    try {
      const flags = p.flags || '';
      compiledPatterns.push({
        regex: new RegExp(p.regex, flags),
        message: p.message,
      });
    } catch (err) {
      console.error(`[shipguard] Invalid regex in rule "${yamlRule.id}": ${err instanceof Error ? err.message : String(err)}`);
    }
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
            break; // One finding per line per rule
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

function loadYamlFile(filePath: string): Rule[] {
  const rules: Rule[] = [];

  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = yaml.load(content);
  } catch (err) {
    console.error(`[shipguard] Failed to parse YAML file ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }

  if (typeof parsed !== 'object' || parsed === null) return [];

  const file = parsed as YamlRulesFile;
  if (!Array.isArray(file.rules)) return [];

  for (const yamlRule of file.rules) {
    if (!isValidYamlRule(yamlRule)) {
      console.error(`[shipguard] Skipping invalid YAML rule in ${filePath}: ${JSON.stringify((yamlRule as Record<string, unknown>)?.id ?? 'unknown')}`);
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

export async function loadYamlRules(projectRoot?: string): Promise<Rule[]> {
  const rules: Rule[] = [];
  const root = projectRoot || process.env.SHIPGUARD_ROOT || process.cwd();

  // 1. Default file in project root
  const defaultPath = path.join(root, DEFAULT_FILENAME);
  rules.push(...loadYamlFile(defaultPath));

  // 2. Additional rules directory from env or config
  const rulesDir = process.env.SHIPGUARD_RULES_DIR;
  if (rulesDir) {
    try {
      const files = fs.readdirSync(rulesDir).filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));
      for (const file of files) {
        rules.push(...loadYamlFile(path.join(rulesDir, file)));
      }
    } catch {
      // Rules directory doesn't exist, that's fine
    }
  }

  return rules;
}
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Clean compile.

**Step 3: Commit**

```bash
git add src/core/yamlRuleLoader.ts
git commit -m "feat(rules): add YAML custom rule loader"
```

---

### Task 9: Update Scanner — GLOB_PATTERNS + YAML Integration

**Files:**
- Modify: `src/core/scanner.ts`

**Step 1: Add new glob patterns**

In `src/core/scanner.ts`, find the `GLOB_PATTERNS` array (around line 62) and add 3 new entries:

Current:
```typescript
const GLOB_PATTERNS = [
  '**/*.ts',
  '**/*.js',
  '**/.env',
  '**/Dockerfile',
];
```

Replace with:
```typescript
const GLOB_PATTERNS = [
  '**/*.ts',
  '**/*.js',
  '**/*.jsx',
  '**/*.tsx',
  '**/.env',
  '**/Dockerfile',
  '**/package.json',
];
```

**Step 2: Import yamlRuleLoader**

Add import at top of file (after existing imports):
```typescript
import { loadYamlRules } from './yamlRuleLoader';
```

**Step 3: Integrate YAML rules into loadRules()**

Replace the `loadRules()` function (lines 84-113) with:

```typescript
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
```

Note: The original `loadRules` had an unused `error` parameter in the catch of the rulePromises map. The replacement omits it to satisfy `noUnusedParameters`.

**Step 4: Verify build**

Run: `npm run build`
Expected: Clean compile.

**Step 5: Commit**

```bash
git add src/core/scanner.ts
git commit -m "feat(scanner): add JSX/TSX/package.json patterns and YAML rule integration"
```

---

### Task 10: Create Example YAML Rules File

**Files:**
- Create: `shipguard-rules.example.yml`

**Step 1: Create the example file**

```yaml
# ShipGuard Custom Rules Example
# Copy to shipguard-rules.yml and customize
# See docs/mcp-setup.md for full documentation

rules:
  - id: "no-todo-comments"
    name: "TODO Comments"
    description: "Detects TODO/FIXME comments that should be resolved before shipping"
    category: "code-quality"
    severity: "low"
    applicableTo: [".ts", ".js", ".jsx", ".tsx"]
    patterns:
      - regex: "//\\s*(TODO|FIXME|HACK|XXX)"
        flags: "gi"
        message: "Found unresolved {match} comment"

  - id: "no-hardcoded-urls"
    name: "Hardcoded URLs"
    description: "Detects hardcoded localhost/IP URLs that should use environment variables"
    category: "configuration"
    severity: "medium"
    applicableTo: [".ts", ".js"]
    patterns:
      - regex: "(https?://localhost:\\d+|https?://127\\.0\\.0\\.1)"
        message: "Hardcoded localhost URL found, use environment variable instead"
```

**Step 2: Commit**

```bash
git add shipguard-rules.example.yml
git commit -m "docs: add example YAML rules file"
```

---

### Task 11: Final Verification

**Step 1: Clean build**

Run: `npm run build`
Expected: Clean compile, zero errors.

**Step 2: Smoke test — scan with new rules**

Run:
```bash
node dist/cli.js scan --json 2>/dev/null | head -c 500
```

Expected: Output includes scan results. Score may differ due to new rules detecting issues.

**Step 3: Verify rule count via MCP**

Run:
```bash
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}\n{"jsonrpc":"2.0","id":2,"method":"notifications/initialized"}\n{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_rules","arguments":{}}}\n' | node dist/mcp/server.js 2>/dev/null | grep -o '"id"' | wc -l
```

Expected: 10 (4 existing + 6 new built-in rules). YAML rules only load if shipguard-rules.yml exists.

**Step 4: Verify YAML loader with example file**

Run:
```bash
cp shipguard-rules.example.yml shipguard-rules.yml
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}\n{"jsonrpc":"2.0","id":2,"method":"notifications/initialized"}\n{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_rules","arguments":{}}}\n' | node dist/mcp/server.js 2>/dev/null | grep -o '"id"' | wc -l
rm shipguard-rules.yml
```

Expected: 12 (10 built-in + 2 YAML rules).

**Step 5: Verify file structure**

```
src/core/rules/
├── secrets.ts        (existing, untouched)
├── env.ts            (existing, untouched)
├── docker.ts         (existing, untouched)
├── reliability.ts    (existing, untouched)
├── sqlInjection.ts   (new)
├── xss.ts            (new)
├── insecureDependency.ts (new)
├── weakCrypto.ts     (new)
├── corsPermissive.ts (new)
└── errorInfoLeak.ts  (new)

src/core/
├── scanner.ts        (modified: GLOB_PATTERNS + YAML integration)
└── yamlRuleLoader.ts (new)
```
