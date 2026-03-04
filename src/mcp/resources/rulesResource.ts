import { loadRules } from '../../core/scanner';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { checkMcpAuth } from '../types';

export function registerRulesResource(server: McpServer): void {
  server.registerResource(
    'rules-active',
    'shipguard://rules/active',
    {
      description: 'All active security scanning rules',
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

      const rules = await loadRules();
      const response = rules.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        severity: r.severity,
        category: r.category,
        applicableTo: r.applicableTo,
      }));

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
