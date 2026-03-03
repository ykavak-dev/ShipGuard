#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerAllTools } from './tools';
import { registerAllResources } from './resources';
import type { ScanCache } from './types';

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
