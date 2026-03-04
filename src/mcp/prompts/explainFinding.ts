import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerExplainFindingPrompt(server: McpServer): void {
  server.registerPrompt(
    'explain-finding',
    {
      description: 'Explain a specific security finding in detail with fix guidance',
      argsSchema: {
        ruleId: z.string().describe('The rule ID of the finding to explain'),
        filePath: z.string().describe('Path to the file containing the finding'),
      },
    },
    ({ ruleId, filePath }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: [
              `Explain the security finding from rule "${ruleId}" in file "${filePath}".`,
              '',
              '1. Use analyze_file to get details about this specific finding.',
              '2. Explain what the vulnerability is and why it matters.',
              '3. Show the vulnerable code and explain the attack vector.',
              '4. Use generate_fix to create a patch.',
              '5. Explain why the fix resolves the issue.',
            ].join('\n'),
          },
        },
      ],
    })
  );
}
