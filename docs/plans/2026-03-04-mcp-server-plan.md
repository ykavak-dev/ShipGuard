# MCP Server Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Expose ShipGuard as an MCP server with 5 tools and 2 resources using the high-level McpServer API.

**Architecture:** McpServer with stdio transport. Each tool in its own file with a register function. Cache state in server.ts passed to tools/resources. Zod for input schemas.

**Tech Stack:** TypeScript (strict), @modelcontextprotocol/sdk, zod, existing ShipGuard core modules

---

### Task 1: Install dependencies and update package.json

**Files:**
- Modify: `package.json`

**Step 1: Install MCP SDK and zod**

Run: `npm install @modelcontextprotocol/sdk zod`

**Step 2: Verify import paths**

Run: `node -e "const m = require('@modelcontextprotocol/sdk/server/mcp.js'); console.log(typeof m.McpServer)"`

If that fails, try: `node -e "const m = require('@modelcontextprotocol/server'); console.log(typeof m.McpServer)"`

Note the working import path for use in all subsequent tasks.

**Step 3: Add bin entry to package.json**

Add to the `"bin"` object:
```json
"shipguard-mcp": "dist/mcp/server.js"
```

**Step 4: Build to verify**

Run: `npm run build`
Expected: Compiles with no errors

**Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @modelcontextprotocol/sdk and zod dependencies"
```

---

### Task 2: Create scanTool.ts

**Files:**
- Create: `src/mcp/tools/scanTool.ts`

**Step 1: Write the scan tool module**

```typescript
import { z } from 'zod';
import { scanProject } from '../../core/scanner';
import { calculateScore } from '../../core/scoring';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ScanCache } from '../server';

// Adjust McpServer import path based on what was discovered in Task 1

export function registerScanTool(server: McpServer, cache: ScanCache): void {
  server.registerTool(
    'scan_repository',
    {
      description: 'Scan a directory for security vulnerabilities and calculate risk score',
      inputSchema: z.object({
        path: z.string().optional().describe('Directory path to scan (defaults to SHIPGUARD_ROOT)'),
        threshold: z.number().default(80).describe('Minimum acceptable risk score'),
      }),
    },
    async ({ path, threshold }) => {
      try {
        const scanPath = path || process.env.SHIPGUARD_ROOT || process.cwd();
        const result = await scanProject(scanPath);

        const countResult = {
          critical: result.critical.length,
          medium: result.medium.length,
          low: result.low.length,
        };

        const score = calculateScore(countResult);
        const passed = score >= threshold;

        // Update cache
        cache.lastResult = result;
        cache.lastScore = score;
        cache.lastPath = scanPath;
        cache.lastTimestamp = new Date().toISOString();

        const response = {
          score,
          passed,
          threshold,
          summary: countResult,
          findings: [
            ...result.critical,
            ...result.medium,
            ...result.low,
          ],
          metadata: result.metadata,
        };

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(response, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Scan failed: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    }
  );
}
```

**Step 2: Build to verify**

Run: `npm run build`
Expected: May fail because server.ts doesn't exist yet — that's OK. Check only for syntax errors in this file by running: `npx tsc --noEmit src/mcp/tools/scanTool.ts` or just build after Task 8.

**Step 3: Commit**

```bash
git add src/mcp/tools/scanTool.ts
git commit -m "feat(mcp): add scan_repository tool"
```

---

### Task 3: Create analyzeTool.ts

**Files:**
- Create: `src/mcp/tools/analyzeTool.ts`

**Step 1: Write the analyze tool module**

```typescript
import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import { loadRules, shouldApplyRule } from '../../core/scanner';
import type { Finding, ScanContext } from '../../core/scanner';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerAnalyzeTool(server: McpServer): void {
  server.registerTool(
    'analyze_file',
    {
      description: 'Perform deep security analysis on a single file',
      inputSchema: z.object({
        filePath: z.string().describe('Absolute path to the file to analyze'),
        rules: z.array(z.string()).optional().describe('Specific rule IDs to apply (optional, defaults to all)'),
      }),
    },
    async ({ filePath, rules: ruleIds }) => {
      try {
        if (!fs.existsSync(filePath)) {
          return {
            content: [{ type: 'text' as const, text: `File not found: ${filePath}` }],
            isError: true,
          };
        }

        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');
        const context: ScanContext = {
          rootPath: path.dirname(filePath),
          filePath,
          content,
          lines,
        };

        let applicableRules = await loadRules();
        applicableRules = applicableRules.filter(r => shouldApplyRule(r, filePath));

        if (ruleIds && ruleIds.length > 0) {
          applicableRules = applicableRules.filter(r => ruleIds.includes(r.id));
        }

        const findings: Finding[] = [];
        for (const rule of applicableRules) {
          findings.push(...rule.check(context));
        }

        const response = {
          filePath,
          rulesApplied: applicableRules.map(r => r.id),
          findingsCount: findings.length,
          findings,
        };

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(response, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Analysis failed: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    }
  );
}
```

**Step 2: Commit**

```bash
git add src/mcp/tools/analyzeTool.ts
git commit -m "feat(mcp): add analyze_file tool"
```

---

### Task 4: Create fixTool.ts

**Files:**
- Create: `src/mcp/tools/fixTool.ts`

**Step 1: Write the fix tool module**

```typescript
import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import { loadRules, shouldApplyRule } from '../../core/scanner';
import { generateFixes, generatePatch, applyFix } from '../../core/fixEngine';
import type { Finding, ScanContext } from '../../core/scanner';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerFixTool(server: McpServer): void {
  server.registerTool(
    'generate_fix',
    {
      description: 'Generate a fix patch for a specific security finding',
      inputSchema: z.object({
        findingId: z.string().describe("Rule ID of the finding to fix (e.g., 'hardcoded-secrets')"),
        filePath: z.string().describe('Path to the file with the finding'),
        autoApply: z.boolean().default(false).describe('Whether to auto-apply the fix'),
      }),
    },
    async ({ findingId, filePath, autoApply }) => {
      try {
        if (!fs.existsSync(filePath)) {
          return {
            content: [{ type: 'text' as const, text: `File not found: ${filePath}` }],
            isError: true,
          };
        }

        // Run the specific rule on the file to get actual findings
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');
        const rootPath = process.env.SHIPGUARD_ROOT || process.cwd();
        const context: ScanContext = {
          rootPath,
          filePath,
          content,
          lines,
        };

        const allRules = await loadRules();
        const matchingRule = allRules.find(r => r.id === findingId && shouldApplyRule(r, filePath));

        if (!matchingRule) {
          return {
            content: [{ type: 'text' as const, text: `No rule '${findingId}' applicable to ${filePath}` }],
            isError: true,
          };
        }

        const findings = matchingRule.check(context);
        if (findings.length === 0) {
          return {
            content: [{ type: 'text' as const, text: `No findings for rule '${findingId}' in ${filePath}` }],
          };
        }

        // Categorize findings for fix engine
        const categorized: { critical: Finding[]; medium: Finding[]; low: Finding[] } = {
          critical: [], medium: [], low: [],
        };
        for (const f of findings) {
          categorized[f.severity].push(f);
        }

        // Extract metadata needed by fix engine
        const consoleLogCounts = new Map<string, number>();
        const dockerFilesWithPostgres: string[] = [];
        for (const f of findings) {
          if (f.ruleId === 'console-log-excessive' || f.ruleId === 'console-log') {
            const match = f.message.match(/Found (\d+) console\.log/);
            consoleLogCounts.set(f.filePath, match ? parseInt(match[1], 10) : 1);
          }
          if (f.ruleId === 'docker-expose-postgres') {
            dockerFilesWithPostgres.push(f.filePath);
          }
        }

        const scanInput = {
          ...categorized,
          metadata: { consoleLogCounts, dockerFilesWithPostgres },
        };

        const fixes = await generateFixes(rootPath, scanInput);
        const patch = await generatePatch(rootPath, scanInput);

        let applied = false;
        if (autoApply && fixes.length > 0) {
          for (const fix of fixes.filter(f => f.canAutoApply)) {
            applyFix(rootPath, fix);
            applied = true;
          }
        }

        const response = {
          patch: patch.trim() === '# No automated fixes available for current scan results' ? null : patch,
          applied,
          fixes: fixes.map(f => ({
            ruleId: f.ruleId,
            filePath: f.filePath,
            description: f.description,
            canAutoApply: f.canAutoApply,
          })),
        };

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(response, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Fix generation failed: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    }
  );
}
```

**Step 2: Commit**

```bash
git add src/mcp/tools/fixTool.ts
git commit -m "feat(mcp): add generate_fix tool"
```

---

### Task 5: Create rulesTool.ts and reportTool.ts

**Files:**
- Create: `src/mcp/tools/rulesTool.ts`
- Create: `src/mcp/tools/reportTool.ts`

**Step 1: Write the rules tool**

```typescript
import { z } from 'zod';
import { loadRules } from '../../core/scanner';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerRulesTool(server: McpServer): void {
  server.registerTool(
    'list_rules',
    {
      description: 'List all active security rules with their severity and descriptions',
      inputSchema: z.object({
        category: z.string().optional().describe('Filter by category (optional)'),
      }),
    },
    async ({ category }) => {
      try {
        let rules = await loadRules();

        if (category) {
          rules = rules.filter(r => r.category === category);
        }

        const response = rules.map(r => ({
          id: r.id,
          name: r.name,
          description: r.description,
          severity: r.severity,
          category: r.category,
          applicableTo: r.applicableTo,
        }));

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(response, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Failed to load rules: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    }
  );
}
```

**Step 2: Write the report tool**

```typescript
import { z } from 'zod';
import { scanProject } from '../../core/scanner';
import { calculateScore } from '../../core/scoring';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ScanCache } from '../server';

export function registerReportTool(server: McpServer, cache: ScanCache): void {
  server.registerTool(
    'get_risk_report',
    {
      description: 'Get a summary risk report from the latest scan',
      inputSchema: z.object({
        format: z.enum(['summary', 'detailed']).default('summary').describe('Report format'),
      }),
    },
    async ({ format }) => {
      try {
        // Use cache if available, otherwise do a fresh scan
        if (!cache.lastResult) {
          const scanPath = process.env.SHIPGUARD_ROOT || process.cwd();
          const result = await scanProject(scanPath);
          const countResult = {
            critical: result.critical.length,
            medium: result.medium.length,
            low: result.low.length,
          };
          cache.lastResult = result;
          cache.lastScore = calculateScore(countResult);
          cache.lastPath = scanPath;
          cache.lastTimestamp = new Date().toISOString();
        }

        const result = cache.lastResult;
        const score = cache.lastScore!;
        const allFindings = [...result.critical, ...result.medium, ...result.low];

        // Top 3 risks: first 3 critical, then medium
        const topRisks = [...result.critical, ...result.medium].slice(0, 3);

        if (format === 'summary') {
          const response = {
            score,
            scannedAt: cache.lastTimestamp,
            path: cache.lastPath,
            summary: {
              critical: result.critical.length,
              medium: result.medium.length,
              low: result.low.length,
              total: allFindings.length,
            },
            topRisks: topRisks.map(f => ({
              ruleId: f.ruleId,
              severity: f.severity,
              message: f.message,
              filePath: f.filePath,
            })),
            metadata: result.metadata,
          };
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(response, null, 2) }],
          };
        }

        // Detailed: include all findings
        const response = {
          score,
          scannedAt: cache.lastTimestamp,
          path: cache.lastPath,
          summary: {
            critical: result.critical.length,
            medium: result.medium.length,
            low: result.low.length,
            total: allFindings.length,
          },
          findings: {
            critical: result.critical,
            medium: result.medium,
            low: result.low,
          },
          metadata: result.metadata,
        };

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(response, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Report failed: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    }
  );
}
```

**Step 3: Commit**

```bash
git add src/mcp/tools/rulesTool.ts src/mcp/tools/reportTool.ts
git commit -m "feat(mcp): add list_rules and get_risk_report tools"
```

---

### Task 6: Create tools/index.ts and resources/index.ts

**Files:**
- Create: `src/mcp/tools/index.ts`
- Create: `src/mcp/resources/index.ts`

**Step 1: Write tool registry**

```typescript
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ScanCache } from '../server';
import { registerScanTool } from './scanTool';
import { registerAnalyzeTool } from './analyzeTool';
import { registerFixTool } from './fixTool';
import { registerRulesTool } from './rulesTool';
import { registerReportTool } from './reportTool';

export function registerAllTools(server: McpServer, cache: ScanCache): void {
  registerScanTool(server, cache);
  registerAnalyzeTool(server);
  registerFixTool(server);
  registerRulesTool(server);
  registerReportTool(server, cache);
}
```

**Step 2: Write resource registry**

```typescript
import { loadRules } from '../../core/scanner';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';
import type { ScanCache } from '../server';

export function registerAllResources(server: McpServer, cache: ScanCache): void {
  // Resource: latest scan results
  server.registerResource(
    'scan-results-latest',
    'shipguard://scan-results/latest',
    {
      title: 'Latest Scan Results',
      description: 'Results from the most recent security scan',
      mimeType: 'application/json',
    },
    async (uri): Promise<ReadResourceResult> => {
      if (!cache.lastResult) {
        return {
          contents: [{
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify({ message: 'No scan results available. Run scan_repository first.' }),
          }],
        };
      }

      const response = {
        score: cache.lastScore,
        scannedAt: cache.lastTimestamp,
        path: cache.lastPath,
        summary: {
          critical: cache.lastResult.critical.length,
          medium: cache.lastResult.medium.length,
          low: cache.lastResult.low.length,
        },
        findings: {
          critical: cache.lastResult.critical,
          medium: cache.lastResult.medium,
          low: cache.lastResult.low,
        },
        metadata: cache.lastResult.metadata,
      };

      return {
        contents: [{
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(response, null, 2),
        }],
      };
    }
  );

  // Resource: active rules list
  server.registerResource(
    'rules-list',
    'shipguard://rules/list',
    {
      title: 'Active Security Rules',
      description: 'All loaded security scanning rules',
      mimeType: 'application/json',
    },
    async (uri): Promise<ReadResourceResult> => {
      const rules = await loadRules();
      const response = rules.map(r => ({
        id: r.id,
        name: r.name,
        description: r.description,
        severity: r.severity,
        category: r.category,
        applicableTo: r.applicableTo,
      }));

      return {
        contents: [{
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(response, null, 2),
        }],
      };
    }
  );
}
```

**Step 3: Commit**

```bash
git add src/mcp/tools/index.ts src/mcp/resources/index.ts
git commit -m "feat(mcp): add tool registry and resource registry"
```

---

### Task 7: Create server.ts (main entry point)

**Files:**
- Create: `src/mcp/server.ts`

**Step 1: Write the MCP server**

```typescript
#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { ScanResult } from '../core/scanner';
import { registerAllTools } from './tools';
import { registerAllResources } from './resources';

// ═════════════════════════════════════════════════════════════════════════════
// Cache
// ═════════════════════════════════════════════════════════════════════════════

export interface ScanCache {
  lastResult: ScanResult | null;
  lastScore: number | null;
  lastPath: string | null;
  lastTimestamp: string | null;
}

// ═════════════════════════════════════════════════════════════════════════════
// Server
// ═════════════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {
  const cache: ScanCache = {
    lastResult: null,
    lastScore: null,
    lastPath: null,
    lastTimestamp: null,
  };

  const server = new McpServer(
    { name: 'shipguard', version: '2.0.0' },
    { capabilities: { logging: {} } }
  );

  registerAllTools(server, cache);
  registerAllResources(server, cache);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('ShipGuard MCP server running on stdio');
}

main().catch((err) => {
  console.error('Failed to start MCP server:', err);
  process.exit(1);
});
```

Note: The import paths for `McpServer` and `StdioServerTransport` should match whatever was discovered in Task 1. If `@modelcontextprotocol/sdk/server/mcp.js` doesn't work, try `@modelcontextprotocol/server`. Update ALL tool files to use the same import path.

**Step 2: Build**

Run: `npm run build`
Expected: Compiles with zero errors

**Step 3: Quick smoke test**

Run: `echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' | node dist/mcp/server.js 2>/dev/null | head -1`

Expected: JSON response with server capabilities (tools, resources)

**Step 4: Commit**

```bash
git add src/mcp/server.ts
git commit -m "feat(mcp): add MCP server with stdio transport"
```

---

### Task 8: Final verification

**Step 1: Clean build**

Run: `npm run clean && npm run build`
Expected: Zero errors

**Step 2: Verify MCP server starts**

Run: `timeout 3 node dist/mcp/server.js 2>&1 >/dev/null || true`
Expected: stderr shows "ShipGuard MCP server running on stdio"

**Step 3: Verify existing CLI still works**

Run: `node dist/cli.js scan --json 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('provider','MISSING'))"`
Expected: `claude`

**Step 4: Verify bin entry**

Run: `cat package.json | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['bin'].get('shipguard-mcp','MISSING'))"`
Expected: `dist/mcp/server.js`

**Step 5: Verify file structure**

Run: `find src/mcp -type f | sort`
Expected:
```
src/mcp/resources/index.ts
src/mcp/server.ts
src/mcp/tools/analyzeTool.ts
src/mcp/tools/fixTool.ts
src/mcp/tools/index.ts
src/mcp/tools/reportTool.ts
src/mcp/tools/rulesTool.ts
src/mcp/tools/scanTool.ts
```

**Step 6: Verify no changes to core files**

Run: `git diff HEAD~7 -- src/core/ src/ai/ src/config/ src/cli.ts`
Expected: No changes
