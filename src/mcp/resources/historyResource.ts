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
