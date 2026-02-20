import type { Rule, ScanContext, Finding } from '../scanner';

const SECRET_PATTERNS = [
  { pattern: /sk_live_[a-zA-Z0-9]{24,}/g, name: 'Stripe Live Key' },
  { pattern: /AKIA[0-9A-Z]{16}/g, name: 'AWS Access Key ID' },
  { pattern: /ghp_[a-zA-Z0-9]{36}/g, name: 'GitHub Personal Token' },
  { pattern: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/g, name: 'Private Key' },
];

const rule: Rule = {
  id: 'hardcoded-secrets',
  name: 'Hardcoded Secrets',
  description: 'Detects hardcoded API keys, tokens, and private keys in source files',
  category: 'secrets',
  severity: 'critical',
  applicableTo: ['.ts', '.js', '.env'],
  check(context: ScanContext): Finding[] {
    const findings: Finding[] = [];

    for (let i = 0; i < context.lines.length; i++) {
      const line = context.lines[i];

      for (const { pattern, name } of SECRET_PATTERNS) {
        pattern.lastIndex = 0;
        if (pattern.test(line)) {
          findings.push({
            filePath: context.filePath,
            line: i + 1,
            severity: 'critical',
            message: `Potential hardcoded secret detected: ${name}`,
            ruleId: 'hardcoded-secrets',
            category: 'secrets',
          });
        }
      }
    }

    return findings;
  },
};

export default rule;
