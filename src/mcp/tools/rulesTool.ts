import { z } from 'zod';
import { loadRules } from '../../core/scanner';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerRulesTool(server: McpServer): void {
  server.registerTool(
    'list_rules',
    {
      description: 'List all active security rules with their severity and descriptions',
      inputSchema: z.object({
        category: z.string().optional().describe('Filter by category (optional)'),
      }),
    },
    async ({ category }) => {
      try {
        let rules = await loadRules();

        if (category) {
          rules = rules.filter((r) => r.category === category);
        }

        const response = rules.map((r) => ({
          id: r.id,
          name: r.name,
          description: r.description,
          severity: r.severity,
          category: r.category,
          applicableTo: r.applicableTo,
        }));

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(response, null, 2) }],
        };
      } catch (err) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Failed to load rules: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
