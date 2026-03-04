# MCP Resources + Prompts + Claude Desktop Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add 4 MCP resources (replacing 2 existing + 2 new), 4 prompt templates, scan history tracking, and client setup documentation.

**Architecture:** Extend existing MCP server with individual resource/prompt files following the same pattern as tools. Each resource and prompt gets its own file with a register function. ScanCache gets extended with a history array and an `updateScan()` helper. Resources/prompts registered via barrel files.

**Tech Stack:** TypeScript, `@modelcontextprotocol/sdk` v1.27.1 (McpServer API), `zod` v4.3.6

**Design doc:** `docs/plans/2026-03-04-mcp-resources-prompts-design.md`

**Important constraints:**
- No `console.log` anywhere in `src/mcp/` (stdio transport)
- TypeScript strict mode with `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`
- CommonJS output
- No test framework exists — verification is `npm run build` + manual smoke test

---

### Task 1: Extend ScanCache with History

**Files:**
- Modify: `src/mcp/types.ts`

**Step 1: Add ScanHistoryEntry and extend ScanCache**

Replace the entire file:

```typescript
import type { ScanResult } from '../core/scanner';

export interface ScanHistoryEntry {
  timestamp: string;
  score: number;
  summary: { critical: number; medium: number; low: number };
  filesScanned: number;
}

export interface ScanCache {
  lastResult: ScanResult | null;
  lastScore: number | null;
  lastPath: string | null;
  lastTimestamp: string | null;
  history: ScanHistoryEntry[];
}

const MAX_HISTORY = 10;

export function updateScan(
  cache: ScanCache,
  result: ScanResult,
  score: number,
  scanPath: string,
): void {
  const timestamp = new Date().toISOString();

  cache.lastResult = result;
  cache.lastScore = score;
  cache.lastPath = scanPath;
  cache.lastTimestamp = timestamp;

  cache.history.unshift({
    timestamp,
    score,
    summary: {
      critical: result.critical.length,
      medium: result.medium.length,
      low: result.low.length,
    },
    filesScanned: result.metadata?.filesScanned ?? 0,
  });

  if (cache.history.length > MAX_HISTORY) {
    cache.history.length = MAX_HISTORY;
  }
}
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Clean compile, no errors.

**Step 3: Commit**

```bash
git add src/mcp/types.ts
git commit -m "feat(mcp): extend ScanCache with history and updateScan helper"
```

---

### Task 2: Update scanTool to use updateScan()

**Files:**
- Modify: `src/mcp/tools/scanTool.ts`

**Step 1: Replace direct cache mutation with updateScan()**

In `src/mcp/tools/scanTool.ts`, add the import and replace the cache update block.

Current code (lines 1-6, imports):
```typescript
import { z } from 'zod';
import { scanProject } from '../../core/scanner';
import { calculateScore } from '../../core/scoring';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ScanCache } from '../types';
```

Replace with:
```typescript
import { z } from 'zod';
import { scanProject } from '../../core/scanner';
import { calculateScore } from '../../core/scoring';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ScanCache } from '../types';
import { updateScan } from '../types';
```

Current code (lines 31-35, cache update):
```typescript
        // Update cache
        cache.lastResult = result;
        cache.lastScore = score;
        cache.lastPath = scanPath;
        cache.lastTimestamp = new Date().toISOString();
```

Replace with:
```typescript
        // Update cache + history
        updateScan(cache, result, score, scanPath);
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Clean compile, no errors.

**Step 3: Commit**

```bash
git add src/mcp/tools/scanTool.ts
git commit -m "refactor(mcp): use updateScan helper in scanTool"
```

---

### Task 3: Create 4 Individual Resource Files

**Files:**
- Create: `src/mcp/resources/scanResource.ts`
- Create: `src/mcp/resources/rulesResource.ts`
- Create: `src/mcp/resources/configResource.ts`
- Create: `src/mcp/resources/historyResource.ts`

**Step 1: Create scanResource.ts**

```typescript
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ScanCache } from '../types';

export function registerScanResource(server: McpServer, cache: ScanCache): void {
  server.registerResource(
    'scan-latest',
    'shipguard://scan/latest',
    {
      description: 'Latest scan results including score, findings, and metadata',
      mimeType: 'application/json',
    },
    async (uri) => {
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
        path: cache.lastPath,
        scannedAt: cache.lastTimestamp,
        summary: {
          critical: cache.lastResult.critical.length,
          medium: cache.lastResult.medium.length,
          low: cache.lastResult.low.length,
        },
        findings: [
          ...cache.lastResult.critical,
          ...cache.lastResult.medium,
          ...cache.lastResult.low,
        ],
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
}
```

**Step 2: Create rulesResource.ts**

```typescript
import { loadRules } from '../../core/scanner';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerRulesResource(server: McpServer): void {
  server.registerResource(
    'rules-active',
    'shipguard://rules/active',
    {
      description: 'All active security scanning rules',
      mimeType: 'application/json',
    },
    async (uri) => {
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

**Step 3: Create configResource.ts**

```typescript
import { loadConfig, maskApiKey } from '../../config';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerConfigResource(server: McpServer): void {
  server.registerResource(
    'config',
    'shipguard://config',
    {
      description: 'Current ShipGuard configuration with masked API keys',
      mimeType: 'application/json',
    },
    async (uri) => {
      const config = loadConfig();
      const response = {
        ...config,
        apiKey: maskApiKey(config.apiKey),
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
}
```

**Step 4: Create historyResource.ts**

```typescript
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ScanCache } from '../types';

export function registerHistoryResource(server: McpServer, cache: ScanCache): void {
  server.registerResource(
    'history',
    'shipguard://history',
    {
      description: 'Last 10 scan results with scores and summaries',
      mimeType: 'application/json',
    },
    async (uri) => {
      return {
        contents: [{
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(cache.history, null, 2),
        }],
      };
    }
  );
}
```

**Step 5: Verify build**

Run: `npm run build`
Expected: Clean compile. (Note: these files won't be imported yet, but TS will still check them.)

**Step 6: Commit**

```bash
git add src/mcp/resources/scanResource.ts src/mcp/resources/rulesResource.ts src/mcp/resources/configResource.ts src/mcp/resources/historyResource.ts
git commit -m "feat(mcp): add 4 individual resource files"
```

---

### Task 4: Rewrite resources/index.ts

**Files:**
- Modify: `src/mcp/resources/index.ts`

**Step 1: Replace entire file with new registry**

```typescript
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ScanCache } from '../types';
import { registerScanResource } from './scanResource';
import { registerRulesResource } from './rulesResource';
import { registerConfigResource } from './configResource';
import { registerHistoryResource } from './historyResource';

export function registerAllResources(server: McpServer, cache: ScanCache): void {
  registerScanResource(server, cache);
  registerRulesResource(server);
  registerConfigResource(server);
  registerHistoryResource(server, cache);
}
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Clean compile, no errors.

**Step 3: Commit**

```bash
git add src/mcp/resources/index.ts
git commit -m "refactor(mcp): rewrite resources index to use individual files"
```

---

### Task 5: Create 4 Prompt Files

**Files:**
- Create: `src/mcp/prompts/securityAudit.ts`
- Create: `src/mcp/prompts/quickCheck.ts`
- Create: `src/mcp/prompts/fixAll.ts`
- Create: `src/mcp/prompts/explainFinding.ts`

**Step 1: Create securityAudit.ts**

```typescript
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerSecurityAuditPrompt(server: McpServer): void {
  server.registerPrompt(
    'security-audit',
    {
      description: 'Run a full security audit on a directory and provide detailed analysis',
      argsSchema: z.object({
        path: z.string().describe('Directory path to audit'),
        threshold: z.number().optional().default(80).describe('Minimum acceptable risk score'),
      }),
    },
    ({ path, threshold }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: [
              `Run a comprehensive security audit on "${path}".`,
              '',
              'Steps:',
              '1. Use the scan_repository tool to scan the directory.',
              `2. The minimum acceptable score is ${threshold}.`,
              '3. Review the shipguard://scan/latest resource for detailed findings.',
              '4. For each critical finding, explain the risk and suggest a fix.',
              '5. Provide an overall security assessment with prioritized action items.',
            ].join('\n'),
          },
        },
      ],
    })
  );
}
```

**Step 2: Create quickCheck.ts**

```typescript
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerQuickCheckPrompt(server: McpServer): void {
  server.registerPrompt(
    'quick-check',
    {
      description: 'Quick security scan with a brief summary of findings',
      argsSchema: z.object({
        path: z.string().optional().describe('Directory path to scan (defaults to project root)'),
      }),
    },
    ({ path }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: [
              `Run a quick security check${path ? ` on "${path}"` : ''}.`,
              '',
              '1. Use scan_repository to scan.',
              '2. Give me a one-paragraph summary: score, critical count, top concern.',
              '3. If the score is below 80, list the top 3 fixes to improve it.',
            ].join('\n'),
          },
        },
      ],
    })
  );
}
```

**Step 3: Create fixAll.ts**

```typescript
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerFixAllPrompt(server: McpServer): void {
  server.registerPrompt(
    'fix-all',
    {
      description: 'Generate fixes for all findings in a directory',
      argsSchema: z.object({
        path: z.string().describe('Directory path to fix'),
        autoApply: z.boolean().optional().default(false).describe('Automatically apply safe fixes'),
      }),
    },
    ({ path, autoApply }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: [
              `Fix all security findings in "${path}".`,
              '',
              '1. Use scan_repository to identify all findings.',
              '2. For each finding, use generate_fix to create a patch.',
              autoApply
                ? '3. Apply all fixes automatically (--apply flag).'
                : '3. Show each patch for review before applying.',
              '4. Re-scan to verify the fixes resolved the issues.',
              '5. Report the before/after score comparison.',
            ].join('\n'),
          },
        },
      ],
    })
  );
}
```

**Step 4: Create explainFinding.ts**

```typescript
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerExplainFindingPrompt(server: McpServer): void {
  server.registerPrompt(
    'explain-finding',
    {
      description: 'Explain a specific security finding in detail with fix guidance',
      argsSchema: z.object({
        ruleId: z.string().describe('The rule ID of the finding to explain'),
        filePath: z.string().describe('Path to the file containing the finding'),
      }),
    },
    ({ ruleId, filePath }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: [
              `Explain the security finding from rule "${ruleId}" in file "${filePath}".`,
              '',
              '1. Use analyze_file to get details about this specific finding.',
              '2. Explain what the vulnerability is and why it matters.',
              '3. Show the vulnerable code and explain the attack vector.',
              '4. Use generate_fix to create a patch.',
              '5. Explain why the fix resolves the issue.',
            ].join('\n'),
          },
        },
      ],
    })
  );
}
```

**Step 5: Verify build**

Run: `npm run build`
Expected: Clean compile.

**Step 6: Commit**

```bash
git add src/mcp/prompts/securityAudit.ts src/mcp/prompts/quickCheck.ts src/mcp/prompts/fixAll.ts src/mcp/prompts/explainFinding.ts
git commit -m "feat(mcp): add 4 prompt template files"
```

---

### Task 6: Create Prompts Registry

**Files:**
- Create: `src/mcp/prompts/index.ts`

**Step 1: Create the prompts registry**

```typescript
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerSecurityAuditPrompt } from './securityAudit';
import { registerQuickCheckPrompt } from './quickCheck';
import { registerFixAllPrompt } from './fixAll';
import { registerExplainFindingPrompt } from './explainFinding';

export function registerAllPrompts(server: McpServer): void {
  registerSecurityAuditPrompt(server);
  registerQuickCheckPrompt(server);
  registerFixAllPrompt(server);
  registerExplainFindingPrompt(server);
}
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Clean compile.

**Step 3: Commit**

```bash
git add src/mcp/prompts/index.ts
git commit -m "feat(mcp): add prompts registry"
```

---

### Task 7: Update server.ts

**Files:**
- Modify: `src/mcp/server.ts`

**Step 1: Wire prompts and initialize history in cache**

Replace the entire file:

```typescript
#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerAllTools } from './tools';
import { registerAllResources } from './resources';
import { registerAllPrompts } from './prompts';
import type { ScanCache } from './types';

export type { ScanCache } from './types';

async function main(): Promise<void> {
  const cache: ScanCache = {
    lastResult: null,
    lastScore: null,
    lastPath: null,
    lastTimestamp: null,
    history: [],
  };

  const server = new McpServer(
    { name: 'shipguard', version: '2.0.0' },
    { capabilities: { logging: {} } }
  );

  registerAllTools(server, cache);
  registerAllResources(server, cache);
  registerAllPrompts(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('ShipGuard MCP server running on stdio');
}

main().catch((err) => {
  console.error('Failed to start MCP server:', err);
  process.exit(1);
});
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Clean compile, no errors.

**Step 3: Commit**

```bash
git add src/mcp/server.ts
git commit -m "feat(mcp): wire prompts and initialize history in server"
```

---

### Task 8: Create Client Documentation

**Files:**
- Create: `docs/claude-desktop-config.json`
- Create: `docs/mcp-setup.md`

**Step 1: Create claude-desktop-config.json**

```json
{
  "mcpServers": {
    "shipguard": {
      "command": "npx",
      "args": ["-y", "shipguard-mcp"],
      "env": {
        "SHIPGUARD_ROOT": "/path/to/your/project"
      }
    }
  }
}
```

**Step 2: Create docs/mcp-setup.md**

```markdown
# ShipGuard MCP Server Setup

## Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "shipguard": {
      "command": "npx",
      "args": ["-y", "shipguard-mcp"],
      "env": {
        "SHIPGUARD_ROOT": "/path/to/your/project"
      }
    }
  }
}
```

For a local install (without npx):

```json
{
  "mcpServers": {
    "shipguard": {
      "command": "node",
      "args": ["/absolute/path/to/shipguard/dist/mcp/server.js"],
      "env": {
        "SHIPGUARD_ROOT": "/path/to/your/project"
      }
    }
  }
}
```

## Cursor

Add to `.cursor/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "shipguard": {
      "command": "npx",
      "args": ["-y", "shipguard-mcp"],
      "env": {
        "SHIPGUARD_ROOT": "."
      }
    }
  }
}
```

## VS Code (Copilot)

Add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "shipguard": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "shipguard-mcp"],
      "env": {
        "SHIPGUARD_ROOT": "${workspaceFolder}"
      }
    }
  }
}
```

## Available Tools

| Tool | Description |
|------|-------------|
| `scan_repository` | Full project scan with score and findings |
| `analyze_file` | Single-file analysis with optional rule filter |
| `generate_fix` | Generate/apply fix patch for a finding |
| `list_rules` | List active rules with optional category filter |
| `get_risk_report` | Summary or detailed report from cache or fresh scan |

## Available Resources

| URI | Description |
|-----|-------------|
| `shipguard://scan/latest` | Latest scan results |
| `shipguard://rules/active` | Active security rules |
| `shipguard://config` | Current configuration (API keys masked) |
| `shipguard://history` | Last 10 scan history |

## Available Prompts

| Prompt | Description |
|--------|-------------|
| `security-audit` | Full security audit with detailed analysis |
| `quick-check` | Quick scan with brief summary |
| `fix-all` | Generate fixes for all findings |
| `explain-finding` | Explain a specific finding in detail |

## Environment Variables

- `SHIPGUARD_ROOT` — Default directory to scan (falls back to `process.cwd()`)
- `OPENAI_API_KEY` — Required for AI review features
- `ANTHROPIC_API_KEY` — Required for Claude provider
```

**Step 3: Commit**

```bash
git add docs/claude-desktop-config.json docs/mcp-setup.md
git commit -m "docs: add MCP client setup guide and Claude Desktop config"
```

---

### Task 9: Final Verification

**Step 1: Clean build**

Run: `npm run build`
Expected: Clean compile, zero errors.

**Step 2: Smoke test — verify capabilities**

Run:
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' | node dist/mcp/server.js 2>/dev/null | head -c 2000
```

Expected: Response includes `"resources"`, `"prompts"`, and `"tools"` in server capabilities.

**Step 3: Verify resource count**

Run:
```bash
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}\n{"jsonrpc":"2.0","id":2,"method":"resources/list","params":{}}\n' | node dist/mcp/server.js 2>/dev/null | head -c 3000
```

Expected: 4 resources listed (`shipguard://scan/latest`, `shipguard://rules/active`, `shipguard://config`, `shipguard://history`).

**Step 4: Verify prompt count**

Run:
```bash
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}\n{"jsonrpc":"2.0","id":3,"method":"prompts/list","params":{}}\n' | node dist/mcp/server.js 2>/dev/null | head -c 3000
```

Expected: 4 prompts listed (`security-audit`, `quick-check`, `fix-all`, `explain-finding`).

**Step 5: Verify file structure**

```
src/mcp/
├── server.ts
├── types.ts
├── tools/
│   ├── index.ts
│   ├── scanTool.ts
│   ├── analyzeTool.ts
│   ├── fixTool.ts
│   ├── rulesTool.ts
│   └── reportTool.ts
├── resources/
│   ├── index.ts
│   ├── scanResource.ts
│   ├── rulesResource.ts
│   ├── configResource.ts
│   └── historyResource.ts
└── prompts/
    ├── index.ts
    ├── securityAudit.ts
    ├── quickCheck.ts
    ├── fixAll.ts
    └── explainFinding.ts
```

**Step 6: Commit if any final fixes were needed**

```bash
git add -A
git commit -m "feat(mcp): complete resources, prompts, and client docs"
```
