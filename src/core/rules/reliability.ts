import type { Rule, ScanContext, Finding } from '../scanner';

const CONSOLE_LOG_THRESHOLD = 5;

const rule: Rule = {
  id: 'console-log-excessive',
  name: 'Excessive console.log Usage',
  description: 'Detects files with too many console.log statements',
  category: 'reliability',
  severity: 'low',
  applicableTo: ['.ts', '.js'],
  check(context: ScanContext): Finding[] {
    let count = 0;
    let firstLine: number | undefined;

    for (let i = 0; i < context.lines.length; i++) {
      if (context.lines[i].includes('console.log')) {
        count++;
        if (firstLine === undefined) firstLine = i + 1;
      }
    }

    if (count > CONSOLE_LOG_THRESHOLD) {
      return [
        {
          filePath: context.filePath,
          line: firstLine,
          severity: 'low',
          message: `Found ${count} console.log statements (threshold: ${CONSOLE_LOG_THRESHOLD}) - consider using a structured logger`,
          ruleId: 'console-log-excessive',
          category: 'reliability',
        },
      ];
    }

    return [];
  },
};

export default rule;
