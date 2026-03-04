import type { Rule, ScanContext, Finding } from '../scanner';
import { isCommentLine, stripInlineComments } from '../commentUtils';

const XSS_PATTERNS: { pattern: RegExp; message: string }[] = [
  {
    pattern: /\.innerHTML\s*=/,
    message:
      'Direct innerHTML assignment is an XSS risk. Use textContent or a sanitization library.',
  },
  {
    pattern: /\.outerHTML\s*=/,
    message: 'Direct outerHTML assignment is an XSS risk. Use safe DOM APIs.',
  },
  {
    pattern: /dangerouslySetInnerHTML/,
    message: 'dangerouslySetInnerHTML bypasses React XSS protection. Sanitize input first.',
  },
  {
    pattern: /document\.write\s*\(/,
    message: 'document.write() can introduce XSS vulnerabilities. Use safe DOM APIs.',
  },
  {
    pattern: /\beval\s*\(/,
    message: 'eval() executes arbitrary code and is an XSS/injection risk. Avoid eval entirely.',
  },
  {
    pattern: /v-html\s*=/,
    message: 'Vue.js v-html directive can introduce XSS vulnerabilities. Sanitize input first.',
  },
  {
    pattern: /\[innerHTML\]\s*=/,
    message:
      'Angular [innerHTML] binding can introduce XSS vulnerabilities. Use a sanitization pipe.',
  },
  {
    pattern: /\.insertAdjacentHTML\s*\(/,
    message: 'insertAdjacentHTML() can introduce XSS vulnerabilities. Sanitize input first.',
  },
  {
    pattern: /\.srcdoc\s*=/,
    message: 'iframe srcdoc assignment can introduce XSS vulnerabilities. Sanitize input first.',
  },
];

const rule: Rule = {
  id: 'xss-vulnerable',
  name: 'XSS Vulnerability',
  description: 'Detects patterns that may lead to cross-site scripting vulnerabilities',
  category: 'xss',
  severity: 'critical',
  applicableTo: ['.ts', '.js', '.jsx', '.tsx'],
  check(context: ScanContext): Finding[] {
    const findings: Finding[] = [];

    for (let i = 0; i < context.lines.length; i++) {
      const line = context.lines[i];
      const trimmed = line.trim();

      // Skip comment lines
      if (isCommentLine(trimmed)) continue;
      const codeOnly = stripInlineComments(line);

      for (const { pattern, message } of XSS_PATTERNS) {
        if (pattern.test(codeOnly)) {
          findings.push({
            filePath: context.filePath,
            line: i + 1,
            severity: 'critical',
            message,
            ruleId: 'xss-vulnerable',
            category: 'xss',
          });
          break;
        }
      }
    }

    return findings;
  },
};

export default rule;
