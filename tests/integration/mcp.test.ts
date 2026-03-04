import { describe, it, expect, beforeAll } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAllTools } from '../../src/mcp/tools';
import { registerAllResources } from '../../src/mcp/resources';
import { registerAllPrompts } from '../../src/mcp/prompts';
import type { ScanCache } from '../../src/mcp/types';

function createTestServer(): { server: McpServer; cache: ScanCache } {
  const cache: ScanCache = {
    lastResult: null,
    lastScore: null,
    lastPath: null,
    lastTimestamp: null,
    history: [],
  };

  const server = new McpServer(
    { name: 'shipguard-test', version: '2.0.0' },
    { capabilities: { logging: {} } }
  );

  registerAllTools(server, cache);
  registerAllResources(server, cache);
  registerAllPrompts(server);

  return { server, cache };
}

describe('MCP server registration', () => {
  let server: McpServer;

  beforeAll(() => {
    const result = createTestServer();
    server = result.server;
  });

  it('registers without throwing', () => {
    expect(server).toBeDefined();
  });

  it('can create multiple independent server instances', () => {
    const { server: server2 } = createTestServer();
    expect(server2).toBeDefined();
    expect(server2).not.toBe(server);
  });
});

describe('MCP ScanCache', () => {
  it('starts with empty state', () => {
    const { cache } = createTestServer();
    expect(cache.lastResult).toBeNull();
    expect(cache.lastScore).toBeNull();
    expect(cache.history).toEqual([]);
  });
});
