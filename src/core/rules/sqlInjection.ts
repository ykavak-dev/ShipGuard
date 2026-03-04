import type { Rule, ScanContext, Finding } from '../scanner';
import { isCommentLine } from '../commentUtils';

const QUERY_METHODS = ['query', 'execute', 'raw', 'prepare', 'findRaw', 'executeRaw', 'all', 'get'];

// Pre-compiled regex patterns for each method
const TEMPLATE_PATTERNS = QUERY_METHODS.map((method) => ({
  method,
  pattern: new RegExp(`\\.${method}\\s*\\(\`[^\\)]*\\$\\{`),
}));

const CONCAT_PATTERNS = QUERY_METHODS.map((method) => ({
  method,
  pattern: new RegExp(`\\.${method}\\s*\\(\\s*['"][^'"]*['"]\\s*\\+`),
}));

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
      const trimmed = context.lines[i].trim();

      // Skip comment lines
      if (isCommentLine(trimmed)) continue;
      const codeOnly = context.strippedLines[i];

      let matched = false;

      // Check template literal patterns first
      for (const { method, pattern } of TEMPLATE_PATTERNS) {
        if (pattern.test(codeOnly)) {
          findings.push({
            filePath: context.filePath,
            line: i + 1,
            severity: 'critical',
            message: `SQL injection risk: .${method}() uses template literal with variable interpolation. Use parameterized queries instead.`,
            ruleId: 'sql-injection',
            category: 'injection',
          });
          matched = true;
          break;
        }
      }

      if (matched) continue;

      // Check string concatenation patterns
      for (const { method, pattern } of CONCAT_PATTERNS) {
        if (pattern.test(codeOnly)) {
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
