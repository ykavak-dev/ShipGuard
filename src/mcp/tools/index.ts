import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ScanCache } from '../types';
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
