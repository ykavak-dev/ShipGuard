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
