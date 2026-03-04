# Final Security Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the 5 remaining verified security findings from the final audit.

**Architecture:** Each fix is isolated and independently testable. We fix the highest severity first (HTML XSS), then MCP resource auth, cache TTL enforcement, legacy aiReview deprecation, and MCP prompt sanitization.

**Tech Stack:** TypeScript, Vitest, Zod, MCP SDK

---

### Task 1: Fix HTML Report `</script>` XSS (YUKSEK)

**Files:**
- Modify: `src/core/report/html.ts:65-76`
- Test: `tests/unit/htmlReport.test.ts`

The `findingsJson` variable is injected raw into a `<script>` block. If any finding's `message` or `filePath` contains `</script>`, the browser will close the script tag and execute attacker-controlled HTML.

**Step 1: Write the failing test**

In `tests/unit/htmlReport.test.ts`, add after the existing XSS test:

```typescript
it('escapes </script> in JSON findings to prevent script injection', () => {
  const maliciousFinding = makeFinding({
    message: '</script><script>alert("xss")</script>',
    filePath: 'src/app.ts',
    severity: 'critical',
  });

  const html = generateHtmlReport(
    makeScanResult([maliciousFinding]),
    50,
    80,
    [makeRule({ id: 'test-rule', severity: 'critical' })]
  );

  // The raw </script> must NOT appear in the output
  expect(html).not.toContain('</script><script>alert');
  // The escaped version should be present
  expect(html).toContain('\\u003c/script\\u003e');
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/htmlReport.test.ts`
Expected: FAIL — the raw `</script>` appears in output

**Step 3: Implement the fix**

In `src/core/report/html.ts`, after line 76 where `findingsJson` is created by `JSON.stringify(...)`, add:

```typescript
const safeFindingsJson = findingsJson.replace(/</g, '\\u003c');
```

Then on line 215, change `${findingsJson}` to `${safeFindingsJson}`.

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/htmlReport.test.ts`
Expected: PASS — all 5 tests pass

**Step 5: Commit**

```bash
git add src/core/report/html.ts tests/unit/htmlReport.test.ts
git commit -m "fix(security): escape </script> in HTML report JSON to prevent XSS"
```

---

### Task 2: Add Auth to MCP Resources (ORTA)

**Files:**
- Modify: `src/mcp/resources/scanResource.ts`
- Modify: `src/mcp/resources/historyResource.ts`
- Modify: `src/mcp/resources/configResource.ts`
- Modify: `src/mcp/resources/rulesResource.ts`
- Test: `tests/unit/mcp.test.ts`

MCP resources currently have no auth. All 5 tools check `checkMcpAuth(token)` but the 4 resources don't.

**Important context:** MCP `registerResource` callback receives `(uri)` — not a params object like tools. Resources are read via URI, so we can't add a `token` parameter the same way. Instead, we check if `SHIPGUARD_MCP_TOKEN` is set and if so, require it as a query parameter in the resource URI (e.g., `shipguard://scan/latest?token=xxx`).

**Step 1: Write the failing test**

In `tests/unit/mcp.test.ts`, add a new describe block:

```typescript
describe('MCP resource auth', () => {
  it('scanResource handler checks auth when SHIPGUARD_MCP_TOKEN is set', () => {
    // The resource registration function should import checkMcpAuth
    // Verify by checking the import exists in each resource file
    expect(typeof registerScanResource).toBe('function');
    expect(typeof registerHistoryResource).toBe('function');
    expect(typeof registerConfigResource).toBe('function');
    expect(typeof registerRulesResource).toBe('function');
  });
});
```

**Step 2: Implement auth in all 4 resources**

For each resource file, add the auth check. Since MCP resources receive only `uri`, extract token from the URL query string. Example for `scanResource.ts`:

```typescript
import { checkMcpAuth } from '../types';

// Inside the handler:
async (uri) => {
  const token = new URL(uri.href).searchParams.get('token') ?? undefined;
  const authError = checkMcpAuth(token);
  if (authError) {
    return {
      contents: [{
        uri: uri.href,
        mimeType: 'application/json',
        text: JSON.stringify({ error: authError }),
      }],
    };
  }
  // ... existing logic
}
```

Apply the same pattern to all 4 resource files.

**Step 3: Run tests**

Run: `npx vitest run tests/unit/mcp.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add src/mcp/resources/*.ts tests/unit/mcp.test.ts
git commit -m "fix(security): add auth checks to MCP resources"
```

---

### Task 3: Enforce Cache TTL (ORTA)

**Files:**
- Modify: `src/mcp/tools/reportTool.ts:19-31`
- Modify: `src/mcp/resources/scanResource.ts:13`
- Test: `tests/unit/mcp.test.ts`

`CACHE_TTL_MS` (30 minutes) is defined in `types.ts` but never enforced. Stale scan results stay in memory indefinitely.

**Step 1: Write the failing test**

```typescript
describe('cache TTL', () => {
  it('reportTool treats cache as stale after CACHE_TTL_MS', () => {
    // CACHE_TTL_MS is exported from types.ts
    expect(CACHE_TTL_MS).toBe(30 * 60 * 1000);
  });
});
```

**Step 2: Add isCacheStale helper to types.ts**

In `src/mcp/types.ts`, add:

```typescript
export function isCacheStale(cache: ScanCache): boolean {
  if (cache.cachedAt === null) return true;
  return Date.now() - cache.cachedAt > CACHE_TTL_MS;
}
```

**Step 3: Use isCacheStale in reportTool.ts**

Change line 19 from:
```typescript
if (!cache.lastResult) {
```
to:
```typescript
if (!cache.lastResult || isCacheStale(cache)) {
```

Import `isCacheStale` from `../types`.

**Step 4: Use isCacheStale in scanResource.ts**

Change the check from:
```typescript
if (!cache.lastResult) {
```
to:
```typescript
if (!cache.lastResult || isCacheStale(cache)) {
```

Import `isCacheStale` from `../types`.

**Step 5: Run tests**

Run: `npx vitest run tests/unit/mcp.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/mcp/types.ts src/mcp/tools/reportTool.ts src/mcp/resources/scanResource.ts tests/unit/mcp.test.ts
git commit -m "fix(security): enforce cache TTL for scan results"
```

---

### Task 4: Harden Legacy aiReview.ts (ORTA)

**Files:**
- Modify: `src/ai/aiReview.ts`

The legacy `reviewWithAI()` function is missing: Zod validation, XML isolation, timeout, and leaks error details. Since the new provider-based system (`OpenAIProvider.reviewFindings()`) already has all these fixes, the cleanest approach is to deprecate the legacy function and make it delegate to the new provider.

**Step 1: Rewrite aiReview.ts to use the new provider**

```typescript
import { OpenAIProvider } from './providers/openai';
import type { ScanResult } from '../core/scanner';

export interface AIReviewResult {
  prioritizedRisks: string[];
  quickFixes: string[];
  shipReadiness: string;
}

/**
 * @deprecated Use OpenAIProvider.reviewFindings() directly.
 * This function is maintained for backward compatibility only.
 */
export async function reviewWithAI(
  scanResults: unknown,
  options: {
    apiKey?: string;
    baseUrl?: string;
    model?: string;
  } = {}
): Promise<AIReviewResult> {
  const provider = new OpenAIProvider(options.apiKey, options.model);
  return provider.reviewFindings(scanResults as ScanResult);
}
```

This inherits all security fixes from the OpenAI provider: Zod validation, XML isolation, AbortSignal.timeout(30000).

**Step 2: Run all tests**

Run: `npm test`
Expected: PASS — the function signature and return type are unchanged

**Step 3: Commit**

```bash
git add src/ai/aiReview.ts
git commit -m "fix(security): deprecate legacy reviewWithAI, delegate to hardened OpenAIProvider"
```

---

### Task 5: Sanitize MCP Prompt Inputs (DUSUK-ORTA)

**Files:**
- Modify: `src/mcp/prompts/securityAudit.ts`
- Modify: `src/mcp/prompts/quickCheck.ts`
- Modify: `src/mcp/prompts/fixAll.ts`
- Modify: `src/mcp/prompts/explainFinding.ts`

User-supplied `path`, `ruleId`, `filePath` are interpolated directly into LLM prompts. While MCP prompts are templates for LLM consumption (not executed), they can manipulate LLM behavior.

**Step 1: Create a sanitization utility**

In each prompt file, wrap user values in XML isolation tags, consistent with the pattern used elsewhere. Example for `securityAudit.ts`:

Change:
```typescript
`Run a comprehensive security audit on "${path}".`,
```
to:
```typescript
`Run a comprehensive security audit on the path provided below.`,
`<user_provided_path>${path}</user_provided_path>`,
```

Apply the same pattern to all 4 prompt files.

**Step 2: Run tests**

Run: `npm test`
Expected: PASS

**Step 3: Build and lint**

Run: `npm run build && npx eslint src/ --ext .ts`
Expected: Clean

**Step 4: Commit**

```bash
git add src/mcp/prompts/*.ts
git commit -m "fix(security): wrap MCP prompt user inputs in XML isolation tags"
```

---

### Task 6: Final Verification

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
