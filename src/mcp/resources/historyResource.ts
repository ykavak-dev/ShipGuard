import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { checkMcpAuth } from '../types';
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
      const parsedUrl = new URL(uri.href);
      const token = parsedUrl.searchParams.get('token') ?? undefined;
      const authError = checkMcpAuth(token);
      parsedUrl.searchParams.delete('token');
      const safeUri = parsedUrl.toString();
      if (authError) {
        return {
          contents: [
            {
              uri: safeUri,
              mimeType: 'application/json',
              text: JSON.stringify({ error: authError }),
            },
          ],
        };
      }

      return {
        contents: [
          {
            uri: safeUri,
            mimeType: 'application/json',
            text: JSON.stringify(cache.history, null, 2),
          },
        ],
      };
    }
  );
}
