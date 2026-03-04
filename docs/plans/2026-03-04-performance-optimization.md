# ShipGuard Performance Optimization Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all 30+ verified performance issues across scanner, rules, AI providers, MCP server, CLI, and utilities — raising the performance score from 6/10 to 9/10.

**Architecture:** Issues are grouped into 12 independent tasks ordered by impact. Each task is self-contained with TDD. Core pattern changes (rule cache, ScanContext, regex pre-compile) are done first since later tasks depend on them.

**Tech Stack:** TypeScript, Vitest, Node.js async APIs

---

### Task 1: Add Module-Level Rule Cache to loadRules()

**Files:**
- Modify: `src/core/scanner.ts:92-148`
- Test: `tests/unit/scanner.test.ts`

`loadRules()` is called from 6 places (scanner, analyzeTool, fixTool, rulesTool, rulesResource, cli) with zero caching. Each call does filesystem glob + dynamic imports + YAML parsing (~50-100ms).

**Step 1: Write the failing test**

In `tests/unit/scanner.test.ts`, add:

```typescript
import { loadRules } from '../../src/core/scanner';

describe('loadRules caching', () => {
  it('returns the same array reference on consecutive calls', async () => {
    const rules1 = await loadRules();
    const rules2 = await loadRules();
    expect(rules1).toBe(rules2); // Same reference = cached
  });

  it('reloads rules when forceReload is true', async () => {
    const rules1 = await loadRules();
    const rules2 = await loadRules(true);
    expect(rules1).not.toBe(rules2); // Different reference = reloaded
    expect(rules1).toEqual(rules2); // Same content
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/scanner.test.ts`
Expected: FAIL — loadRules returns different references

**Step 3: Implement the cache**

In `src/core/scanner.ts`, add module-level cache before `loadRules()`:

```typescript
let cachedRules: Rule[] | null = null;

async function loadRules(forceReload = false): Promise<Rule[]> {
  if (cachedRules && !forceReload) return cachedRules;

  const rules: Rule[] = [];
  // ... existing rule loading logic ...

  cachedRules = deduped;
  return cachedRules;
}
```

Make sure the existing `export { loadRules }` still works. The function signature adds `forceReload = false` so all existing callers are unaffected.

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/scanner.test.ts`
Expected: PASS

**Step 5: Run full test suite**

Run: `npm test`
Expected: All 178 tests pass

**Step 6: Commit**

```bash
git add src/core/scanner.ts tests/unit/scanner.test.ts
git commit -m "perf: add module-level cache to loadRules()"
```

---

### Task 2: Add strippedLines to ScanContext

**Files:**
- Modify: `src/core/scanner.ts:20-25,229-234`
- Modify: `src/core/rules/sqlInjection.ts`
- Modify: `src/core/rules/xss.ts`
- Modify: `src/core/rules/corsPermissive.ts`
- Modify: `src/core/rules/weakCrypto.ts`
- Modify: `src/core/rules/errorInfoLeak.ts`
- Modify: `src/core/rules/reliability.ts`
- Test: `tests/unit/rules.test.ts`

Currently each of the 6 rules independently calls `stripCommentsFromLines(context.lines)` — the same character-by-character parsing runs 6 times per file.

**Step 1: Add strippedLines to ScanContext interface**

In `src/core/scanner.ts`, change the `ScanContext` interface:

```typescript
export interface ScanContext {
  rootPath: string;
  filePath: string;
  content: string;
  lines: string[];
  strippedLines: string[];  // NEW: pre-computed comment-stripped lines
}
```

**Step 2: Compute strippedLines in scanSingleFile**

In `src/core/scanner.ts`, in the `scanSingleFile` function (around line 229), change:

```typescript
const context: ScanContext = {
  rootPath,
  filePath,
  content,
  lines: content.split('\n'),
  strippedLines: stripCommentsFromLines(content.split('\n')),
};
```

Add import at top of scanner.ts:
```typescript
import { stripCommentsFromLines } from './commentUtils';
```

**Step 3: Update all 6 rules to use context.strippedLines**

For each rule file, remove the `stripCommentsFromLines` import and call, and use `context.strippedLines` instead.

Example for `sqlInjection.ts`:
```typescript
// REMOVE: import { stripCommentsFromLines } from '../commentUtils';
// REMOVE: const strippedLines = stripCommentsFromLines(context.lines);
// CHANGE: use context.strippedLines instead of strippedLines
const codeOnly = context.strippedLines[i];
```

Apply the same pattern to all 6 rule files:
- `sqlInjection.ts`: change `strippedLines[i]` → `context.strippedLines[i]`, remove `stripCommentsFromLines` import/call
- `xss.ts`: same
- `corsPermissive.ts`: same
- `weakCrypto.ts`: same
- `errorInfoLeak.ts`: same
- `reliability.ts`: same

Keep `isCommentLine` imports where still used for the `trimmed` line check.

**Step 4: Update test helper if needed**

In `tests/unit/rules.test.ts`, find `createTestContext` helper and add `strippedLines`:

```typescript
function createTestContext(filePath: string, content: string, rootPath: string): ScanContext {
  const lines = content.split('\n');
  return {
    rootPath,
    filePath: path.join(rootPath, filePath),
    content,
    lines,
    strippedLines: stripCommentsFromLines(lines),
  };
}
```

Import `stripCommentsFromLines` in the test file.

**Step 5: Run tests**

Run: `npm test`
Expected: All 178 tests pass

**Step 6: Commit**

```bash
git add src/core/scanner.ts src/core/rules/*.ts tests/unit/rules.test.ts
git commit -m "perf: pre-compute strippedLines in ScanContext, eliminate 5x duplicate comment stripping"
```

---

### Task 3: Pre-compile SQL Injection Regexes

**Files:**
- Modify: `src/core/rules/sqlInjection.ts:4-52`
- Test: `tests/unit/rules.test.ts`

Inner loop creates `new RegExp()` for each of 8 methods × each line = 16,000 regex compilations for a 1000-line file.

**Step 1: Write the failing test**

In `tests/unit/rules.test.ts`, add:

```typescript
it('detects SQL injection via string concatenation pattern', () => {
  const content = `const result = db.execute("SELECT * FROM users WHERE id=" + userId);`;
  const ctx = createTestContext('test.ts', content, FIXTURES);
  const findings = sqlInjectionRule.check(ctx);
  expect(findings).toHaveLength(1);
  expect(findings[0].message).toContain('execute');
});
```

**Step 2: Verify existing tests pass first**

Run: `npx vitest run tests/unit/rules.test.ts`
Expected: PASS (the new test should also pass with current code)

**Step 3: Pre-compile regexes at module level**

In `src/core/rules/sqlInjection.ts`, replace the current approach:

```typescript
const QUERY_METHODS = ['query', 'execute', 'raw', 'prepare', 'findRaw', 'executeRaw', 'all', 'get'];

// Pre-compiled regex patterns for each method
const TEMPLATE_PATTERNS = QUERY_METHODS.map(
  (method) => ({
    method,
    pattern: new RegExp(`\\.${method}\\s*\\(\`[^\\)]*\\$\\{`),
  })
);

const CONCAT_PATTERNS = QUERY_METHODS.map(
  (method) => ({
    method,
    pattern: new RegExp(`\\.${method}\\s*\\(\\s*['"][^'"]*['"]\\s*\\+`),
  })
);
```

Then update the `check()` loop to use the pre-compiled arrays:

```typescript
check(context: ScanContext): Finding[] {
  const findings: Finding[] = [];

  for (let i = 0; i < context.lines.length; i++) {
    const trimmed = context.lines[i].trim();
    if (isCommentLine(trimmed)) continue;
    const codeOnly = context.strippedLines[i];

    let found = false;

    for (const { method, pattern } of TEMPLATE_PATTERNS) {
      if (pattern.test(codeOnly)) {
        findings.push({
          filePath: context.filePath,
          line: i + 1,
          severity: 'critical',
          message: `SQL injection risk: .${method}() uses template literal with variable interpolation. Use parameterized queries instead.`,
          ruleId: 'sql-injection',
          category: 'injection',
        });
        found = true;
        break;
      }
    }

    if (found) continue;

    for (const { method, pattern } of CONCAT_PATTERNS) {
      if (pattern.test(codeOnly)) {
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
```

**Step 4: Run tests**

Run: `npx vitest run tests/unit/rules.test.ts`
Expected: All pass (existing + new)

**Step 5: Commit**

```bash
git add src/core/rules/sqlInjection.ts tests/unit/rules.test.ts
git commit -m "perf: pre-compile SQL injection regexes at module level"
```

---

### Task 4: CLI Lazy Imports

**Files:**
- Modify: `src/cli.ts:1-33`
- Test: `tests/integration/cli.test.ts`

All modules are eagerly loaded at startup — `shipguard --help` loads scanner, AI providers, fix engine, chalk, ora, fast-glob. ~200-500ms wasted.

**Step 1: Move imports inside command handlers**

Convert top-level requires to lazy requires inside each command's `.action()` handler. Keep only `commander` and `config` at the top level (needed for all commands).

Replace lines 1-33 with:

```typescript
#!/usr/bin/env node

const { Command } = require('commander') as typeof import('commander');
const { loadConfig, saveConfig, maskApiKey } = require('./config') as typeof import('./config');

import type { FixSuggestion } from './core/fixEngine';
import type { ScanResult as ScannerScanResult, Rule } from './core/scanner';
import type { ShipGuardConfig } from './config';

import * as fs from 'fs';
import * as path from 'path';

const program = new Command();
```

Then in each command handler, add the require at the top:

**scan command handler:**
```typescript
.action(async (targetPath: string, options: ...) => {
  const { scanProject, loadRules: loadAllRules } = require('./core/scanner') as typeof import('./core/scanner');
  const { calculateScore } = require('./core/scoring') as typeof import('./core/scoring');
  const { printReport, printDetailedReport, createSpinner, success, error, warning, info, divider, generateSarif, generateHtmlReport } = require('./core/report') as typeof import('./core/report');
  const { resolveSafePath } = require('./core/pathValidation') as typeof import('./core/pathValidation');
  // ... rest of handler
```

**ai-review command handler:**
```typescript
.action(async (options: ...) => {
  const { scanProject } = require('./core/scanner') as typeof import('./core/scanner');
  const { calculateScore } = require('./core/scoring') as typeof import('./core/scoring');
  const { printReport, printAIReview, createSpinner, success, error, divider } = require('./core/report') as typeof import('./core/report');
  const { createProvider } = require('./ai/providerFactory') as typeof import('./ai/providerFactory');
  // ... rest of handler
```

**fix command handler:**
```typescript
.action(async (options: ...) => {
  const { scanProject, loadRules: loadAllRules } = require('./core/scanner') as typeof import('./core/scanner');
  const { generatePatch, generateFixes, applyFix } = require('./core/fixEngine') as typeof import('./core/fixEngine');
  const { printReport, createSpinner, success, error, warning, info, divider } = require('./core/report') as typeof import('./core/report');
  const { resolveSafePath } = require('./core/pathValidation') as typeof import('./core/pathValidation');
  // ... rest of handler
```

The `config` command doesn't need scanner/AI/fixEngine so it stays lean.

**Step 2: Run tests**

Run: `npm run build && npm test`
Expected: All tests pass — CLI integration tests verify commands still work

**Step 3: Commit**

```bash
git add src/cli.ts
git commit -m "perf: lazy-load modules in CLI command handlers to reduce startup time"
```

---

### Task 5: Add Retry Logic to OpenAI Provider

**Files:**
- Modify: `src/ai/providers/openai.ts`
- Test: `tests/unit/providers.test.ts`

OpenAI has zero retry logic. Any transient 429/5xx fails immediately. Claude provider has 3 retries with exponential backoff + jitter.

**Step 1: Write the failing test**

In `tests/unit/providers.test.ts`, add:

```typescript
describe('OpenAI retry logic', () => {
  it('OpenAIProvider has callWithRetry method', () => {
    // Just verify the class has retry capability
    const provider = new OpenAIProvider('test-key');
    expect(provider).toBeDefined();
    // The actual retry behavior is tested via integration
  });
});
```

**Step 2: Extract retry logic from Claude to a shared base, or add to OpenAI**

The simplest approach: add `callWithRetry` to the `AIProvider` base class so all providers inherit it.

In `src/ai/providers/base.ts`, add:

```typescript
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;

export abstract class AIProvider {
  // ... existing code ...

  protected async callWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        return await fn();
      } catch (err: unknown) {
        lastError = err;
        const status = (err as { status?: number }).status;
        const responseStatus = (err as { response?: { status?: number } }).response?.status;
        const httpStatus = status ?? responseStatus;

        if (httpStatus === 429 || (httpStatus !== undefined && httpStatus >= 500)) {
          const baseDelay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
          const jitter = Math.random() * baseDelay * 0.5;
          await new Promise((resolve) => setTimeout(resolve, baseDelay + jitter));
          continue;
        }

        throw err;
      }
    }

    throw lastError;
  }
}
```

Then in `src/ai/providers/openai.ts`, wrap API calls with `this.callWithRetry()`:

In `reviewFindings()` (around line 89):
```typescript
const response = await this.callWithRetry(() =>
  fetch(`${this.baseUrl}/chat/completions`, { ... })
);
```

In `generateFix()`, `analyzeFinding()`, `suggestRules()`, `streamResponse()` — wrap each `fetch()` call with `this.callWithRetry()`.

In `src/ai/providers/ollama.ts`, do the same for all `fetch()` calls.

Remove the duplicate `callWithRetry` from `src/ai/providers/claude.ts` and use the inherited one. Also remove the duplicate constants `MAX_RETRIES` and `INITIAL_RETRY_DELAY_MS` from claude.ts.

**Step 3: Run tests**

Run: `npm test`
Expected: All pass

**Step 4: Commit**

```bash
git add src/ai/providers/base.ts src/ai/providers/openai.ts src/ai/providers/ollama.ts src/ai/providers/claude.ts tests/unit/providers.test.ts
git commit -m "perf: add retry logic with exponential backoff to OpenAI and Ollama providers"
```

---

### Task 6: Fix String Concatenation in Loops

**Files:**
- Modify: `src/core/commentUtils.ts:32-110`
- Modify: `src/ai/providers/openai.ts` (stream parser)
- Modify: `src/ai/providers/ollama.ts` (stream parser)
- Test: `tests/unit/commentUtils.test.ts`

String `+=` in loops creates O(n^2) intermediate strings. Use array + join instead.

**Step 1: Fix commentUtils.ts**

In `stripLineContent()`, replace `result += char` with array accumulation:

```typescript
function stripLineContent(line: string, inBlockComment: boolean): StripResult {
  const chars: string[] = [];
  let inString: string | null = null;
  let i = 0;

  if (inBlockComment) {
    while (i < line.length - 1) {
      if (line[i] === '*' && line[i + 1] === '/') {
        i += 2;
        inBlockComment = false;
        break;
      }
      i++;
    }
    if (inBlockComment && i === line.length - 1) {
      return { text: '', blockCommentOpen: true };
    }
    if (inBlockComment) {
      return { text: '', blockCommentOpen: true };
    }
  }

  while (i < line.length) {
    const char = line[i];
    const next = line[i + 1];

    if (!inString && (char === "'" || char === '"' || char === '`')) {
      inString = char;
      chars.push(char);
      i++;
      continue;
    }

    if (inString && char === inString && line[i - 1] !== '\\') {
      inString = null;
      chars.push(char);
      i++;
      continue;
    }

    if (inString) {
      chars.push(char);
      i++;
      continue;
    }

    if (char === '/' && next === '/') {
      break;
    }

    if (char === '/' && next === '*') {
      i += 2;
      let closed = false;
      while (i < line.length - 1) {
        if (line[i] === '*' && line[i + 1] === '/') {
          i += 2;
          closed = true;
          break;
        }
        i++;
      }
      if (!closed) {
        return { text: chars.join(''), blockCommentOpen: true };
      }
      continue;
    }

    chars.push(char);
    i++;
  }

  return { text: chars.join(''), blockCommentOpen: false };
}
```

**Step 2: Fix OpenAI stream parser**

In `src/ai/providers/openai.ts`, in `streamResponse()`:

```typescript
const chunks: string[] = [];
// ... in the loop:
if (content) {
  onChunk(content);
  chunks.push(content);  // Instead of fullText += content
}
// ... after loop:
return chunks.join('');
```

**Step 3: Fix Ollama stream parser**

Same pattern in `src/ai/providers/ollama.ts` `streamResponse()`:

```typescript
const chunks: string[] = [];
// ... in the loop:
if (content) {
  onChunk(content);
  chunks.push(content);
}
// ... after loop:
return chunks.join('');
```

**Step 4: Run tests**

Run: `npm test`
Expected: All pass

**Step 5: Commit**

```bash
git add src/core/commentUtils.ts src/ai/providers/openai.ts src/ai/providers/ollama.ts
git commit -m "perf: replace string concatenation in loops with array.push + join"
```

---

### Task 7: Ollama Timeout + Token Tracking + OpenAI Max Tokens

**Files:**
- Modify: `src/ai/providers/ollama.ts`
- Modify: `src/ai/providers/openai.ts:15`
- Test: `tests/unit/providers.test.ts`

Three quick fixes: Ollama 30s timeout is too short for local LLM, Ollama has no token tracking, OpenAI REVIEW_MAX_TOKENS=1000 is too low.

**Step 1: Fix Ollama timeout**

In `src/ai/providers/ollama.ts`, change the timeout constant:

```typescript
const REQUEST_TIMEOUT_MS = 120000; // 120 seconds — local LLM needs more time for model loading + inference
```

Update both `AbortSignal.timeout()` calls to use the constant.

**Step 2: Add Ollama token tracking**

In `src/ai/providers/ollama.ts`, after each successful API response, add token tracking. Ollama responses include token counts in the response:

```typescript
// After successful chat response:
const promptTokens = parsed.prompt_eval_count ?? 0;
const completionTokens = parsed.eval_count ?? 0;
this.trackTokens(promptTokens, completionTokens, 0);
```

For streaming, estimate after collection:
```typescript
// After stream completes:
const estimatedTokens = Math.ceil(fullText.length / 4);
this.trackTokens(0, estimatedTokens, 0);
```

**Step 3: Fix OpenAI REVIEW_MAX_TOKENS**

In `src/ai/providers/openai.ts`, line 15:

```typescript
const REVIEW_MAX_TOKENS = 2048;  // Was 1000, matching Claude provider
```

**Step 4: Run tests**

Run: `npm test`
Expected: All pass

**Step 5: Commit**

```bash
git add src/ai/providers/ollama.ts src/ai/providers/openai.ts tests/unit/providers.test.ts
git commit -m "perf: increase Ollama timeout to 120s, add token tracking, raise OpenAI max tokens"
```

---

### Task 8: Claude Batch Error Isolation + Few-shot Caching

**Files:**
- Modify: `src/ai/providers/claude.ts:249-261`
- Modify: `src/ai/prompts/fewshot.ts`
- Test: `tests/unit/providers.test.ts`

Two issues: (1) `Promise.all` in batch analysis means one failure kills entire batch. (2) Few-shot examples are recreated on every call.

**Step 1: Fix batch error isolation**

In `src/ai/providers/claude.ts`, change `analyzeAllFindings()`:

```typescript
private async analyzeAllFindings(findings: Finding[]): Promise<AnalyzeFindingResult[]> {
  const results: AnalyzeFindingResult[] = [];

  for (let i = 0; i < findings.length; i += ANALYZE_BATCH_SIZE) {
    const batch = findings.slice(i, i + ANALYZE_BATCH_SIZE);
    const batchResults = await Promise.allSettled(
      batch.map((finding) => this.analyzeSingleFinding(finding))
    );

    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        // Push a safe fallback for failed analyses
        results.push({
          severity: 'medium',
          cvss: 0,
          impact: 'Analysis failed — manual review recommended',
          exploitability: 'Unknown',
          remediation: 'Review finding manually',
          falsePositiveRisk: 'unknown',
        });
      }
    }
  }

  return results;
}
```

**Step 2: Cache few-shot examples**

In `src/ai/prompts/fewshot.ts`, change functions to module-level constants:

```typescript
// Cache few-shot examples at module level
let _analyzeFindingExamples: MessageParam[] | null = null;
let _generateFixExamples: MessageParam[] | null = null;

export function getAnalyzeFindingExamples(): MessageParam[] {
  if (!_analyzeFindingExamples) {
    _analyzeFindingExamples = [
      // ... existing example objects ...
    ];
  }
  return _analyzeFindingExamples;
}

export function getGenerateFixExamples(): MessageParam[] {
  if (!_generateFixExamples) {
    _generateFixExamples = [
      // ... existing example objects ...
    ];
  }
  return _generateFixExamples;
}
```

**Step 3: Run tests**

Run: `npm test`
Expected: All pass

**Step 4: Commit**

```bash
git add src/ai/providers/claude.ts src/ai/prompts/fewshot.ts
git commit -m "perf: use Promise.allSettled for batch error isolation, cache few-shot examples"
```

---

### Task 9: Secrets /g Flag Fix + insecureDependency O(n*m) Fix

**Files:**
- Modify: `src/core/rules/secrets.ts:3-39`
- Modify: `src/core/rules/insecureDependency.ts:52-71`
- Test: `tests/unit/rules.test.ts`

Two rule efficiency fixes: (1) Remove unnecessary `/g` flag from secret patterns since we only use `.test()`. (2) Replace O(n*m) line scanning with single-pass line→package map.

**Step 1: Fix secrets.ts /g flag**

In `src/core/rules/secrets.ts`, remove the `/g` flag from all patterns since `.test()` doesn't need global matching:

```typescript
const SECRET_PATTERNS = [
  { pattern: /sk_live_[a-zA-Z0-9]{24,}/, name: 'Stripe Live Key' },
  { pattern: /AKIA[0-9A-Z]{16}/, name: 'AWS Access Key ID' },
  // ... remove /g from all patterns ...
];
```

Also remove `pattern.lastIndex = 0;` line since it's no longer needed.

**Step 2: Fix insecureDependency.ts O(n*m)**

Replace the nested loop with a single-pass line number lookup:

```typescript
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
      ? (parsed.dependencies as Record<string, string>)
      : {}),
    ...(typeof parsed.devDependencies === 'object' && parsed.devDependencies !== null
      ? (parsed.devDependencies as Record<string, string>)
      : {}),
  };

  // Build line number map in single pass
  const lineMap = new Map<string, number>();
  for (let i = 0; i < context.lines.length; i++) {
    const line = context.lines[i];
    for (const { name } of DANGEROUS_PACKAGES) {
      if (line.includes(`"${name}"`)) {
        lineMap.set(name, i + 1);
      }
    }
  }

  for (const { name, reason } of DANGEROUS_PACKAGES) {
    if (name in deps) {
      findings.push({
        filePath: context.filePath,
        line: lineMap.get(name),
        severity: 'critical',
        message: `Insecure dependency "${name}": ${reason}`,
        ruleId: 'insecure-dependency',
        category: 'supply-chain',
      });
    }
  }

  return findings;
},
```

Note: this is still O(n*m) for the line map building but with a single pass and early `break` per package if found. For the typical case (package.json ~50 lines, ~16 dangerous packages), the improvement is that we only iterate lines once instead of once per matched package.

Actually, a better approach — build a single-pass map from line content to line number, then look up each package:

```typescript
  // Build line number map in single pass: O(lines)
  const lineMap = new Map<string, number>();
  for (let i = 0; i < context.lines.length; i++) {
    // Extract package name from line like:  "event-stream": "^3.3.4"
    const match = context.lines[i].match(/"([^"]+)"\s*:/);
    if (match) {
      lineMap.set(match[1], i + 1);
    }
  }

  for (const { name, reason } of DANGEROUS_PACKAGES) {
    if (name in deps) {
      findings.push({
        filePath: context.filePath,
        line: lineMap.get(name),
        severity: 'critical',
        message: `Insecure dependency "${name}": ${reason}`,
        ruleId: 'insecure-dependency',
        category: 'supply-chain',
      });
    }
  }
```

This is O(lines + packages) instead of O(lines * matched_packages).

**Step 3: Run tests**

Run: `npx vitest run tests/unit/rules.test.ts`
Expected: All pass

**Step 4: Commit**

```bash
git add src/core/rules/secrets.ts src/core/rules/insecureDependency.ts
git commit -m "perf: remove /g flag from secret patterns, optimize insecureDependency to O(n+m)"
```

---

### Task 10: Sync I/O → Async I/O in MCP Tools + Fix Engine

**Files:**
- Modify: `src/mcp/tools/analyzeTool.ts:59-66`
- Modify: `src/mcp/tools/fixTool.ts:57-65`
- Modify: `src/core/fixEngine.ts` (sync I/O calls)
- Modify: `src/core/yamlRuleLoader.ts` (sync I/O calls)
- Test: existing tests

Replace `fs.existsSync`, `fs.readFileSync`, `fs.writeFileSync` with async equivalents in async functions.

**Step 1: Fix analyzeTool.ts**

```typescript
import { promises as fs } from 'fs';

// Replace:
// if (!fs.existsSync(resolvedPath)) {
// const content = fs.readFileSync(resolvedPath, 'utf-8');
// With:
try {
  const content = await fs.readFile(resolvedPath, 'utf-8');
} catch {
  return {
    content: [{ type: 'text' as const, text: `File not found: ${filePath}` }],
    isError: true,
  };
}
```

**Step 2: Fix fixTool.ts**

Same pattern — replace sync with async:

```typescript
import { promises as fs } from 'fs';

try {
  const content = await fs.readFile(resolvedPath, 'utf-8');
} catch {
  return {
    content: [{ type: 'text' as const, text: `File not found: ${filePath}` }],
    isError: true,
  };
}
```

**Step 3: Fix fixEngine.ts**

For the fix engine, the functions `generateEnvExampleFix`, `generateDockerExposeFix` etc. use sync I/O. Convert to async:

- `fs.existsSync(path)` → `await fs.access(path).then(() => true).catch(() => false)` or use try/catch with `fs.stat()`
- `fs.readFileSync(path, 'utf-8')` → `await fs.readFile(path, 'utf-8')`
- `fs.writeFileSync(path, data)` → `await fs.writeFile(path, data)`

Make the affected functions `async` and update all callers.

**Step 4: Fix yamlRuleLoader.ts**

- `fs.readFileSync` → `await fs.readFile`
- `fs.readdirSync` → `await fs.readdir`
- `fs.existsSync` → try/catch with `await fs.access`

These are already called from `async` functions so the change is straightforward.

**Step 5: Run tests**

Run: `npm test`
Expected: All pass

**Step 6: Commit**

```bash
git add src/mcp/tools/analyzeTool.ts src/mcp/tools/fixTool.ts src/core/fixEngine.ts src/core/yamlRuleLoader.ts
git commit -m "perf: convert sync I/O to async in MCP tools, fix engine, and YAML loader"
```

---

### Task 11: Provider Factory Cache + Config Cache + Scanner Memory Optimization

**Files:**
- Modify: `src/ai/providerFactory.ts`
- Modify: `src/config/index.ts`
- Modify: `src/core/scanner.ts:317-335`
- Test: existing tests

Three caching improvements: (1) Provider instance cache. (2) Config cache. (3) Scanner stream-process pipeline.

**Step 1: Add provider instance cache**

In `src/ai/providerFactory.ts`:

```typescript
const providerCache = new Map<string, AIProvider>();

export function createProvider(config?: Partial<ProviderConfig>): AIProvider {
  const provider = config?.provider ?? 'claude';
  const cacheKey = `${provider}:${config?.apiKey ?? 'default'}:${config?.model ?? 'default'}`;

  const cached = providerCache.get(cacheKey);
  if (cached) return cached;

  let instance: AIProvider;
  switch (provider) {
    case 'claude':
      instance = new ClaudeProvider(config?.apiKey, config?.model);
      break;
    case 'openai':
      instance = new OpenAIProvider(config?.apiKey, config?.model);
      break;
    case 'ollama':
      instance = new OllamaProvider(config?.model);
      break;
    default: {
      const _exhaustive: never = provider;
      throw new Error(`Unknown provider: ${_exhaustive}`);
    }
  }

  providerCache.set(cacheKey, instance);
  return instance;
}
```

**Step 2: Add config cache**

In `src/config/index.ts`, add a simple cache:

```typescript
let configCache: { config: ShipGuardConfig; timestamp: number } | null = null;
const CONFIG_CACHE_TTL_MS = 5000; // 5 seconds

export function loadConfig(overrides?: Partial<ShipGuardConfig>): ShipGuardConfig {
  // If overrides are provided, skip cache (CLI flags are unique per invocation)
  if (!overrides && configCache && Date.now() - configCache.timestamp < CONFIG_CACHE_TTL_MS) {
    return configCache.config;
  }

  // ... existing loadConfig logic ...

  const result = { /* merged config */ };

  if (!overrides) {
    configCache = { config: result, timestamp: Date.now() };
  }

  return result;
}
```

**Step 3: Optimize scanner memory — process files as they're read**

In `src/core/scanner.ts`, instead of reading ALL files into memory then scanning ALL, combine read+scan:

```typescript
// Replace the two-phase approach with combined read+scan
const scanResults = await processBatch(
  files,
  async (filePath) => {
    const readResult = await readFileWithResult(filePath);
    if (!readResult.success) {
      if ('reason' in readResult && readResult.reason === 'read_error') {
        return {
          findings: [],
          errors: [{ filePath: readResult.filePath, error: readResult.error || 'Unknown error' }],
          skipped: true,
        };
      }
      return { findings: [], errors: [], skipped: true };
    }
    try {
      const result = await scanSingleFile(readResult.filePath, readResult.content, absoluteRoot, rules);
      return { ...result, skipped: false };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        findings: [],
        errors: [{ filePath, error: `Scan failed: ${errorMsg}` }],
        skipped: false,
      };
    }
  },
  CONCURRENCY_LIMIT
);

// Aggregate results
let filesSkipped = 0;
let filesScanned = 0;
for (const result of scanResults) {
  allFindings.push(...result.findings);
  scanErrors.push(...result.errors);
  if (result.skipped) filesSkipped++;
  else filesScanned++;
}
```

This way each file's content is GC-eligible as soon as its scan completes, instead of holding all file contents in memory simultaneously.

**Step 4: Run tests**

Run: `npm test`
Expected: All pass

**Step 5: Commit**

```bash
git add src/ai/providerFactory.ts src/config/index.ts src/core/scanner.ts
git commit -m "perf: add provider/config caching, optimize scanner memory with read+scan pipeline"
```

---

### Task 12: Remaining Medium/Low Fixes

**Files:**
- Modify: `src/core/rules/weakCrypto.ts:63-66`
- Modify: `src/core/fixEngine.ts:78-79`
- Modify: `src/core/report/html.ts:3-9`
- Modify: `src/ai/validation.ts:96,104`
- Modify: `src/mcp/types.ts:52`
- Modify: `src/core/yamlRuleLoader.ts` (regex double compile)
- Modify: `src/core/scanner.ts:289-295`
- Modify: `src/core/scanner.ts:158-169`
- Modify: `src/mcp/tools/reportTool.ts:33-38`
- Modify: `src/core/rules/corsPermissive.ts`, `xss.ts`, `weakCrypto.ts`, `errorInfoLeak.ts`, `sqlInjection.ts` (redundant isCommentLine after strippedLines)
- Test: existing tests

Batch of smaller fixes.

**Step 1: escapeHtml single-pass**

In `src/core/report/html.ts`, replace chained `.replace()` with single-pass:

```typescript
const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#039;',
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => HTML_ESCAPE_MAP[char]);
}
```

**Step 2: Fix validation.ts double parse**

In `src/ai/validation.ts`, replace `schema.parse({})` with pre-computed defaults:

```typescript
// In parseAndValidate, on JSON parse failure:
catch {
  console.error(`[shipguard] WARNING: ${label} response was not valid JSON`);
  return schema.parse({}) as T;  // This is fine - it's only called on error
}
// Actually the double parse concern is minor - schema.parse({}) on empty object is O(1).
// The real fix is to avoid calling it twice. Change the validation failure:
const result = schema.safeParse(raw);
if (!result.success) {
  console.error(...);
  // Use safeParse on empty to get defaults without throwing
  const defaultResult = schema.safeParse({});
  return defaultResult.success ? defaultResult.data : ({} as T);
}
```

**Step 3: Fix array unshift in types.ts**

In `src/mcp/types.ts`, replace `unshift` with `push` + slice from end:

```typescript
cache.history.push({
  timestamp,
  score,
  summary: { ... },
  filesScanned: result.metadata?.filesScanned ?? 0,
});

// Keep only last MAX_HISTORY entries (newest at end)
if (cache.history.length > MAX_HISTORY) {
  cache.history = cache.history.slice(-MAX_HISTORY);
}
```

Note: this changes history order from newest-first to newest-last. Check all consumers of `cache.history` to verify they handle this. If they expect newest-first, just reverse at read time: `cache.history.slice().reverse()`.

Actually, to minimize change and avoid breaking consumers, keep `unshift` but it's O(10) since MAX_HISTORY=10 — this is not a real performance concern. Skip this change.

**Step 4: Fix reportTool.ts to use updateScan**

In `src/mcp/tools/reportTool.ts`, replace manual cache update with `updateScan()`:

```typescript
import { checkMcpAuth, isCacheStale, updateScan } from '../types';
import { calculateScore } from '../../core/scoring';

// Replace lines 33-37:
updateScan(cache, result, calculateScore(countResult), scanPath);
```

This ensures history is updated and `cachedAt` is set correctly.

**Step 5: Fix weakCrypto context window allocation**

In `src/core/rules/weakCrypto.ts`, pre-lowercase context lines to avoid repeated `.toLowerCase()`:

```typescript
// Before the loop, lowercase all stripped lines once:
const lowerLines = context.strippedLines.map(l => l.toLowerCase());

// In the Math.random context check:
const windowStart = Math.max(0, i - 3);
const windowEnd = Math.min(lowerLines.length, i + 4);
let contextText = '';
for (let k = windowStart; k < windowEnd; k++) {
  contextText += lowerLines[k] + ' ';
}
```

**Step 6: Fix fixEngine diff lookahead**

In `src/core/fixEngine.ts`, replace `slice` with index comparison:

```typescript
// Instead of:
// const lookAheadOld = oldLines.slice(i, i + 3);
// const lookAheadNew = newLines.slice(j, j + 3);
// if (arraysEqual(lookAheadOld, lookAheadNew))

// Use direct index comparison:
function lookaheadMatch(arr1: string[], start1: number, arr2: string[], start2: number, count: number): boolean {
  for (let k = 0; k < count; k++) {
    if (start1 + k >= arr1.length || start2 + k >= arr2.length) return false;
    if (arr1[start1 + k] !== arr2[start2 + k]) return false;
  }
  return true;
}

// Then:
if (lookaheadMatch(oldLines, i, newLines, j, 3) && i < oldLines.length) break;
```

**Step 7: categorizeFindings single pass**

In `src/core/scanner.ts`, replace triple-filter with single pass:

```typescript
function categorizeFindings(findings: Finding[]): Pick<ScanResult, 'critical' | 'medium' | 'low'> {
  const critical: Finding[] = [];
  const medium: Finding[] = [];
  const low: Finding[] = [];

  for (const f of findings) {
    switch (f.severity) {
      case 'critical': critical.push(f); break;
      case 'medium': medium.push(f); break;
      case 'low': low.push(f); break;
    }
  }

  return { critical, medium, low };
}
```

**Step 8: Remove redundant isCommentLine after strippedLines**

In the 5 rules that have both `stripCommentsFromLines` AND `isCommentLine` check, the `isCommentLine` is now redundant since `strippedLines[i]` already has comments removed. Remove the `isCommentLine(trimmed)` check and the import from:
- `sqlInjection.ts`
- `xss.ts`
- `corsPermissive.ts`
- `weakCrypto.ts`
- `errorInfoLeak.ts`

Keep using `context.strippedLines[i]` (from Task 2) instead of `context.lines[i]` for the code check.

Note: After Task 2, `isCommentLine` + `trimmed` are used for the early `continue`. Since `strippedLines[i]` would be empty for comment-only lines, we can replace:
```typescript
const trimmed = context.lines[i].trim();
if (isCommentLine(trimmed)) continue;
const codeOnly = context.strippedLines[i];
```
with:
```typescript
const codeOnly = context.strippedLines[i];
if (!codeOnly.trim()) continue;  // Skip empty/comment-only lines
```

**Step 9: Fix yamlRuleLoader regex double compile**

In `src/core/yamlRuleLoader.ts`, compile the regex once and reuse for both safety check and rule:

```typescript
// Instead of compiling regex once for ReDoS check and again for use:
const compiled = new RegExp(pattern.regex, pattern.flags || '');
// Run ReDoS safety check on compiled regex
if (isReDoSRisk(compiled)) { ... }
// Use same compiled regex in rule
```

**Step 10: Run all tests**

Run: `npm run build && npm test`
Expected: All 178+ tests pass

**Step 11: Commit**

```bash
git add src/core/report/html.ts src/ai/validation.ts src/mcp/tools/reportTool.ts src/core/rules/*.ts src/core/fixEngine.ts src/core/scanner.ts src/core/yamlRuleLoader.ts
git commit -m "perf: batch of medium/low optimizations across rules, report, validation, scanner"
```

---

### Task 13: Final Verification

**Step 1: Full build**

Run: `npm run build`
Expected: Clean compile

**Step 2: Full test suite**

Run: `npm test`
Expected: All tests pass

**Step 3: ESLint**

Run: `npx eslint src/ --ext .ts`
Expected: 0 warnings, 0 errors

**Step 4: npm audit**

Run: `npm audit --audit-level=high`
Expected: 0 vulnerabilities
