import type { Rule, ScanContext, Finding } from '../scanner';
import { isCommentLine, stripInlineComments } from '../commentUtils';

const QUERY_METHODS = ['query', 'execute', 'raw', 'prepare', 'findRaw', 'executeRaw', 'all', 'get'];

const rule: Rule = {
  id: 'sql-injection',
  name: 'SQL Injection Risk',
  description: 'Detects SQL queries built with string concatenation or template literals',
  category: 'injection',
  severity: 'critical',
  applicableTo: ['.ts', '.js'],
  check(context: ScanContext): Finding[] {
    const findings: Finding[] = [];

    for (let i = 0; i < context.lines.length; i++) {
      const line = context.lines[i];
      const trimmed = line.trim();

      // Skip comment lines
      if (isCommentLine(trimmed)) continue;
      const codeOnly = stripInlineComments(line);

      for (const method of QUERY_METHODS) {
        // Template literal with interpolation: .query(`...${...}...`)
        const templatePattern = new RegExp(`\\.${method}\\s*\\(\`[^\\)]*\\$\\{`);
        if (templatePattern.test(codeOnly)) {
          findings.push({
            filePath: context.filePath,
            line: i + 1,
            severity: 'critical',
            message: `SQL injection risk: .${method}() uses template literal with variable interpolation. Use parameterized queries instead.`,
            ruleId: 'sql-injection',
            category: 'injection',
          });
          break;
        }

        // String concatenation: .query("SELECT" + variable) or .query('INSERT' +
        const concatPattern = new RegExp(`\\.${method}\\s*\\(\\s*['"][^'"]*['"]\\s*\\+`);
        if (concatPattern.test(codeOnly)) {
          findings.push({
            filePath: context.filePath,
            line: i + 1,
            severity: 'critical',
            message: `SQL injection risk: .${method}() uses string concatenation. Use parameterized queries instead.`,
            ruleId: 'sql-injection',
            category: 'injection',
          });
          break;
        }
      }
    }

    return findings;
  },
};

export default rule;
