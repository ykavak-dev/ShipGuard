import { describe, it, expect, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { updateScan } from '../../src/mcp/types';
import type { ScanCache } from '../../src/mcp/types';
import type { ScanResult } from '../../src/core/scanner';
import { registerAllTools } from '../../src/mcp/tools';
import { registerAllResources } from '../../src/mcp/resources';
import { registerAllPrompts } from '../../src/mcp/prompts';
import { registerScanTool } from '../../src/mcp/tools/scanTool';
import { registerAnalyzeTool } from '../../src/mcp/tools/analyzeTool';
import { registerFixTool } from '../../src/mcp/tools/fixTool';
import { registerRulesTool } from '../../src/mcp/tools/rulesTool';
import { registerReportTool } from '../../src/mcp/tools/reportTool';
import { registerScanResource } from '../../src/mcp/resources/scanResource';
import { registerRulesResource } from '../../src/mcp/resources/rulesResource';
import { registerConfigResource } from '../../src/mcp/resources/configResource';
import { registerHistoryResource } from '../../src/mcp/resources/historyResource';
import { registerSecurityAuditPrompt } from '../../src/mcp/prompts/securityAudit';
import { registerQuickCheckPrompt } from '../../src/mcp/prompts/quickCheck';
import { registerFixAllPrompt } from '../../src/mcp/prompts/fixAll';
import { registerExplainFindingPrompt } from '../../src/mcp/prompts/explainFinding';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function freshCache(): ScanCache {
  return {
    lastResult: null,
    lastScore: null,
    lastPath: null,
    lastTimestamp: null,
    history: [],
  };
}

function makeScanResult(critical = 0, medium = 0, low = 0, filesScanned = 5): ScanResult {
  const mkFinding = (severity: 'critical' | 'medium' | 'low', n: number) =>
    Array.from({ length: n }, (_, i) => ({
      ruleId: `rule-${severity}-${i}`,
      severity,
      message: `${severity} finding ${i}`,
      filePath: `/fake/file-${i}.ts`,
      line: i + 1,
    }));

  return {
    critical: mkFinding('critical', critical),
    medium: mkFinding('medium', medium),
    low: mkFinding('low', low),
    metadata: {
      durationMs: 42,
      filesScanned,
      filesSkipped: 0,
      filesWithErrors: 0,
      rulesLoaded: 10,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    },
  };
}

function freshServer(): McpServer {
  return new McpServer(
    { name: 'shipguard-test', version: '2.0.0' },
    { capabilities: { logging: {} } }
  );
}

function createTestServer(): { server: McpServer; cache: ScanCache } {
  const cache = freshCache();
  const server = freshServer();

  registerAllTools(server, cache);
  registerAllResources(server, cache);
  registerAllPrompts(server);

  return { server, cache };
}

// ---------------------------------------------------------------------------
// updateScan -- the core of ScanCache management
// ---------------------------------------------------------------------------

describe('updateScan', () => {
  let cache: ScanCache;

  beforeEach(() => {
    cache = freshCache();
  });

  it('sets lastResult, lastScore, lastPath, and lastTimestamp', () => {
    const result = makeScanResult(1, 2, 3);
    updateScan(cache, result, 85, '/some/path');

    expect(cache.lastResult).toBe(result);
    expect(cache.lastScore).toBe(85);
    expect(cache.lastPath).toBe('/some/path');
    expect(cache.lastTimestamp).not.toBeNull();
    // Timestamp should be a valid ISO string
    expect(() => new Date(cache.lastTimestamp!).toISOString()).not.toThrow();
  });

  it('pushes a history entry on each call', () => {
    updateScan(cache, makeScanResult(1, 0, 0), 85, '/a');
    expect(cache.history).toHaveLength(1);

    updateScan(cache, makeScanResult(0, 2, 0), 88, '/b');
    expect(cache.history).toHaveLength(2);
  });

  it('history entries contain correct summary counts', () => {
    const result = makeScanResult(2, 3, 4, 10);
    updateScan(cache, result, 50, '/project');

    const entry = cache.history[0];
    expect(entry.score).toBe(50);
    expect(entry.summary).toEqual({ critical: 2, medium: 3, low: 4 });
    expect(entry.filesScanned).toBe(10);
    expect(entry.timestamp).toBeTruthy();
  });

  it('most recent entry is at the front (unshift order)', () => {
    updateScan(cache, makeScanResult(), 90, '/first');
    updateScan(cache, makeScanResult(), 70, '/second');

    expect(cache.history[0].score).toBe(70);
    expect(cache.history[1].score).toBe(90);
  });

  it('caps history at MAX_HISTORY (10 entries)', () => {
    for (let i = 0; i < 15; i++) {
      updateScan(cache, makeScanResult(i, 0, 0), 100 - i, `/path/${i}`);
    }

    expect(cache.history).toHaveLength(10);
    // Most recent (i=14) should be first
    expect(cache.history[0].score).toBe(100 - 14);
    // Oldest surviving entry should be i=5 (entries 0-4 were pushed out)
    expect(cache.history[9].score).toBe(100 - 5);
  });

  it('overwrites lastResult on repeated calls', () => {
    const r1 = makeScanResult(1, 0, 0);
    const r2 = makeScanResult(0, 1, 0);

    updateScan(cache, r1, 85, '/a');
    updateScan(cache, r2, 94, '/b');

    expect(cache.lastResult).toBe(r2);
    expect(cache.lastScore).toBe(94);
    expect(cache.lastPath).toBe('/b');
  });

  it('handles result with no metadata gracefully', () => {
    const result: ScanResult = {
      critical: [],
      medium: [],
      low: [],
    };

    updateScan(cache, result, 100, '/empty');

    expect(cache.history[0].filesScanned).toBe(0);
  });

  it('each call produces a distinct timestamp', async () => {
    updateScan(cache, makeScanResult(), 90, '/a');
    // Small delay to ensure different timestamps
    await new Promise((r) => setTimeout(r, 5));
    updateScan(cache, makeScanResult(), 80, '/b');

    const [recent, older] = cache.history;
    expect(new Date(recent.timestamp).getTime()).toBeGreaterThanOrEqual(
      new Date(older.timestamp).getTime()
    );
  });

  it('history entries are independent objects', () => {
    updateScan(cache, makeScanResult(1, 0, 0), 85, '/a');
    updateScan(cache, makeScanResult(0, 2, 0), 88, '/b');

    expect(cache.history[0]).not.toBe(cache.history[1]);
    expect(cache.history[0].summary).not.toBe(cache.history[1].summary);
  });
});

// ---------------------------------------------------------------------------
// MCP server registration (full stack)
// ---------------------------------------------------------------------------

describe('MCP server registration', () => {
  it('registers all tools, resources, and prompts without throwing', () => {
    expect(() => createTestServer()).not.toThrow();
  });

  it('can create multiple independent server instances', () => {
    const { server: s1, cache: c1 } = createTestServer();
    const { server: s2, cache: c2 } = createTestServer();

    expect(s1).not.toBe(s2);
    expect(c1).not.toBe(c2);

    // Mutating one cache does not affect the other
    updateScan(c1, makeScanResult(1, 0, 0), 85, '/a');
    expect(c1.lastScore).toBe(85);
    expect(c2.lastScore).toBeNull();
  });

  it('cache starts in empty state', () => {
    const { cache } = createTestServer();
    expect(cache.lastResult).toBeNull();
    expect(cache.lastScore).toBeNull();
    expect(cache.lastPath).toBeNull();
    expect(cache.lastTimestamp).toBeNull();
    expect(cache.history).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Tool registrations (5 tools)
// ---------------------------------------------------------------------------

describe('MCP tool registrations', () => {
  it('registers scan_repository tool', () => {
    const server = freshServer();
    expect(() => registerScanTool(server, freshCache())).not.toThrow();
  });

  it('registers analyze_file tool', () => {
    const server = freshServer();
    expect(() => registerAnalyzeTool(server)).not.toThrow();
  });

  it('registers generate_fix tool', () => {
    const server = freshServer();
    expect(() => registerFixTool(server)).not.toThrow();
  });

  it('registers list_rules tool', () => {
    const server = freshServer();
    expect(() => registerRulesTool(server)).not.toThrow();
  });

  it('registers get_risk_report tool', () => {
    const server = freshServer();
    expect(() => registerReportTool(server, freshCache())).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Resource registrations (4 resources)
// ---------------------------------------------------------------------------

describe('MCP resource registrations', () => {
  it('registers scan-latest resource', () => {
    const server = freshServer();
    expect(() => registerScanResource(server, freshCache())).not.toThrow();
  });

  it('registers rules-active resource', () => {
    const server = freshServer();
    expect(() => registerRulesResource(server)).not.toThrow();
  });

  it('registers config resource', () => {
    const server = freshServer();
    expect(() => registerConfigResource(server)).not.toThrow();
  });

  it('registers history resource', () => {
    const server = freshServer();
    expect(() => registerHistoryResource(server, freshCache())).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Prompt registrations (4 prompts)
// ---------------------------------------------------------------------------

describe('MCP prompt registrations', () => {
  it('registers security-audit prompt', () => {
    const server = freshServer();
    expect(() => registerSecurityAuditPrompt(server)).not.toThrow();
  });

  it('registers quick-check prompt', () => {
    const server = freshServer();
    expect(() => registerQuickCheckPrompt(server)).not.toThrow();
  });

  it('registers fix-all prompt', () => {
    const server = freshServer();
    expect(() => registerFixAllPrompt(server)).not.toThrow();
  });

  it('registers explain-finding prompt', () => {
    const server = freshServer();
    expect(() => registerExplainFindingPrompt(server)).not.toThrow();
  });
});
