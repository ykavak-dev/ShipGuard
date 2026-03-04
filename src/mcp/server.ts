#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerAllTools } from './tools';
import { registerAllResources } from './resources';
import { registerAllPrompts } from './prompts';
import type { ScanCache } from './types';
import { VERSION } from '../version';

// Re-export ScanCache for convenience (tools already import from ./types)
export type { ScanCache } from './types';

// ═════════════════════════════════════════════════════════════════════════════
// Server
// ═════════════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {
  const cache: ScanCache = {
    lastResult: null,
    lastScore: null,
    lastPath: null,
    lastTimestamp: null,
    cachedAt: null,
    history: [],
  };

  const server = new McpServer(
    { name: 'shipguard', version: VERSION },
    { capabilities: { logging: {} } }
  );

  registerAllTools(server, cache);
  registerAllResources(server, cache);
  registerAllPrompts(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('[shipguard] MCP server running on stdio');
}

main().catch((err) => {
  console.error('[shipguard] Failed to start MCP server:', err);
  process.exit(1);
});
