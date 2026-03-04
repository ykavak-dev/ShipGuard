import { loadRules } from '../../core/scanner';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerRulesResource(server: McpServer): void {
  server.registerResource(
    'rules-active',
    'shipguard://rules/active',
    {
      description: 'All active security scanning rules',
      mimeType: 'application/json',
    },
    async (uri) => {
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
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    }
  );
}
