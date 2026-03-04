import { loadConfig, maskApiKey } from '../../config';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { checkMcpAuth } from '../types';

export function registerConfigResource(server: McpServer): void {
  server.registerResource(
    'config',
    'shipguard://config',
    {
      description: 'Current ShipGuard configuration with masked API keys',
      mimeType: 'application/json',
    },
    async (uri) => {
      const parsedUrl = new URL(uri.href);
      const token = parsedUrl.searchParams.get('token') ?? undefined;
      const authError = checkMcpAuth(token);
      // Strip token from response URI to avoid leaking in logs
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

      const config = loadConfig();
      const response = {
        ...config,
        apiKey: maskApiKey(config.apiKey),
      };

      return {
        contents: [
          {
            uri: safeUri,
            mimeType: 'application/json',
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    }
  );
}
