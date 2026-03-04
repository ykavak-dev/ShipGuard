import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerFixAllPrompt(server: McpServer): void {
  server.registerPrompt(
    'fix-all',
    {
      description: 'Generate fixes for all findings in a directory',
      argsSchema: {
        path: z.string().describe('Directory path to fix'),
        autoApply: z.boolean().optional().default(false).describe('Automatically apply safe fixes'),
      },
    },
    ({ path, autoApply }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: [
              `Fix all security findings in the path provided below.`,
              `<user_provided_path>${path}</user_provided_path>`,
              '',
              '1. Use scan_repository to identify all findings.',
              '2. For each finding, use generate_fix to create a patch.',
              autoApply
                ? '3. Apply all fixes automatically (--apply flag).'
                : '3. Show each patch for review before applying.',
              '4. Re-scan to verify the fixes resolved the issues.',
              '5. Report the before/after score comparison.',
            ].join('\n'),
          },
        },
      ],
    })
  );
}
