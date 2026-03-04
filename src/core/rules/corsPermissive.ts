import type { Rule, ScanContext, Finding } from '../scanner';
import { isCommentLine, stripInlineComments } from '../commentUtils';

const CORS_PATTERNS: { pattern: RegExp; message: string }[] = [
  {
    pattern: /['"]Access-Control-Allow-Origin['"]\s*[:=]\s*['"]\*['"]/,
    message: 'Access-Control-Allow-Origin set to wildcard (*). Restrict to specific origins.',
  },
  {
    pattern: /origin\s*:\s*['"]\*['"]/,
    message: "CORS origin set to '*'. Restrict to specific allowed origins.",
  },
  {
    pattern: /origin\s*:\s*true\b/,
    message: 'CORS origin set to true (reflects any origin). Restrict to specific allowed origins.',
  },
  {
    pattern: /\bcors\s*\(\s*\)/,
    message: 'cors() called without options allows all origins. Pass a configuration object.',
  },
  {
    pattern: /origin\s*:\s*\(.*\)\s*=>\s*true/,
    message:
      'Dynamic CORS origin callback always returns true, accepting any origin. Validate origins explicitly.',
  },
  {
    pattern: /origin\s*:.*callback\s*\(\s*null\s*,\s*true\s*\)/,
    message:
      'CORS origin function calls callback(null, true), accepting any origin. Validate origins explicitly.',
  },
];

const rule: Rule = {
  id: 'cors-permissive',
  name: 'Permissive CORS Policy',
  description: 'Detects overly permissive CORS configurations',
  category: 'cors',
  severity: 'medium',
  applicableTo: ['.ts', '.js'],
  check(context: ScanContext): Finding[] {
    const findings: Finding[] = [];

    for (let i = 0; i < context.lines.length; i++) {
      const line = context.lines[i];
      const trimmed = line.trim();

      if (isCommentLine(trimmed)) continue;
      const codeOnly = stripInlineComments(line);

      for (const { pattern, message } of CORS_PATTERNS) {
        if (pattern.test(codeOnly)) {
          findings.push({
            filePath: context.filePath,
            line: i + 1,
            severity: 'medium',
            message,
            ruleId: 'cors-permissive',
            category: 'cors',
          });
          break;
        }
      }
    }

    return findings;
  },
};

export default rule;
