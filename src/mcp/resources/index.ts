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
