import type { Rule, ScanContext, Finding } from '../scanner';

const SECRET_PATTERNS = [
  { pattern: /sk_live_[a-zA-Z0-9]{24,}/, name: 'Stripe Live Key' },
  { pattern: /AKIA[0-9A-Z]{16}/, name: 'AWS Access Key ID' },
  { pattern: /ghp_[a-zA-Z0-9]{36}/, name: 'GitHub Personal Token' },
  { pattern: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/, name: 'Private Key' },
  // Google Cloud API Key
  { pattern: /AIza[0-9A-Za-z\-_]{35}/, name: 'Google Cloud API Key' },
  // Slack Bot Token
  { pattern: /xoxb-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{24}/, name: 'Slack Bot Token' },
  // Slack User/Workspace Token
  { pattern: /xox[ps]-[0-9]+-[a-zA-Z0-9-]+/, name: 'Slack Token' },
  // SendGrid API Key
  { pattern: /SG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43}/, name: 'SendGrid API Key' },
  // Twilio API Key
  { pattern: /SK[0-9a-fA-F]{32}/, name: 'Twilio API Key' },
  // Generic high-entropy secret assignment
  {
    pattern: /(?:password|passwd|secret|token|api_key|apikey|api-key)\s*[:=]\s*['"][^'"]{8,}/i,
    name: 'Hardcoded credential',
  },
  // AWS Secret Access Key (40 chars base64)
  {
    pattern: /(?:aws_secret_access_key|AWS_SECRET)\s*[:=]\s*['"]?[A-Za-z0-9/+=]{40}/i,
    name: 'AWS Secret Access Key',
  },
  // MongoDB connection string with credentials
  { pattern: /mongodb(\+srv)?:\/\/[^:]+:[^@]+@/, name: 'MongoDB Connection String' },
  // JWT token (eyJ prefix)
  { pattern: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, name: 'JWT Token' },
  // Azure connection string
  {
    pattern: /DefaultEndpointsProtocol=https;AccountName=[^;]+;AccountKey=[^;]+/,
    name: 'Azure Storage Connection String',
  },
  // Anthropic API Key
  { pattern: /sk-ant-[a-zA-Z0-9_-]{20,}/, name: 'Anthropic API Key' },
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
        if (pattern.test(line)) {
          findings.push({
            filePath: context.filePath,
            line: i + 1,
            severity: 'critical',
            message: `Potential hardcoded secret detected: ${name}`,
            ruleId: 'hardcoded-secrets',
            category: 'secrets',
          });
          break;
        }
      }
    }

    return findings;
  },
};

export default rule;
