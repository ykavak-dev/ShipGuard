import type { Rule, ScanContext, Finding } from '../scanner';

const STACK_LEAK_PATTERNS: { pattern: RegExp; message: string }[] = [
  {
    pattern: /res\.(send|json)\s*\(\s*err\.stack/,
    message: 'Sending error stack trace to client leaks internal information.',
  },
  {
    pattern: /res\.json\s*\(\s*\{[^}]*stack\s*:/,
    message: 'Including stack trace in JSON response leaks internal information.',
  },
  {
    pattern: /res\.status\s*\(\s*500\s*\)\s*\.\s*send\s*\(\s*(?:err|error)\s*\)/,
    message: 'Sending raw error object in 500 response may leak stack traces and internal paths.',
  },
  {
    pattern: /res\.(send|json)\s*\(\s*(?:err|error)\.message\s*\)/,
    message: 'Sending error.message directly may leak internal error details to clients.',
  },
];

const rule: Rule = {
  id: 'error-info-leak',
  name: 'Error Information Leak',
  description: 'Detects patterns that may leak stack traces or internal error details to clients',
  category: 'information-disclosure',
  severity: 'low',
  applicableTo: ['.ts', '.js'],
  check(context: ScanContext): Finding[] {
    const findings: Finding[] = [];

    for (let i = 0; i < context.lines.length; i++) {
      const line = context.lines[i];
      const trimmed = line.trim();

      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;

      for (const { pattern, message } of STACK_LEAK_PATTERNS) {
        if (pattern.test(line)) {
          findings.push({
            filePath: context.filePath,
            line: i + 1,
            severity: 'low',
            message,
            ruleId: 'error-info-leak',
            category: 'information-disclosure',
          });
          break;
        }
      }
    }

    return findings;
  },
};

export default rule;
