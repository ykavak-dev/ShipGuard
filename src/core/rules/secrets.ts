import type { Rule, ScanContext, Finding } from '../scanner';

const SECRET_PATTERNS = [
  { pattern: /sk_live_[a-zA-Z0-9]{24,}/g, name: 'Stripe Live Key' },
  { pattern: /AKIA[0-9A-Z]{16}/g, name: 'AWS Access Key ID' },
  { pattern: /ghp_[a-zA-Z0-9]{36}/g, name: 'GitHub Personal Token' },
  { pattern: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/g, name: 'Private Key' },
  // Google Cloud API Key
  { pattern: /AIza[0-9A-Za-z\-_]{35}/g, name: 'Google Cloud API Key' },
  // Slack Bot Token
  { pattern: /xoxb-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{24}/g, name: 'Slack Bot Token' },
  // Slack User/Workspace Token
  { pattern: /xox[ps]-[0-9]+-[a-zA-Z0-9-]+/g, name: 'Slack Token' },
  // SendGrid API Key
  { pattern: /SG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43}/g, name: 'SendGrid API Key' },
  // Twilio API Key
  { pattern: /SK[0-9a-fA-F]{32}/g, name: 'Twilio API Key' },
  // Generic high-entropy secret assignment
  {
    pattern: /(?:password|passwd|secret|token|api_key|apikey|api-key)\s*[:=]\s*['"][^'"]{8,}/gi,
    name: 'Hardcoded credential',
  },
  // AWS Secret Access Key (40 chars base64)
  {
    pattern: /(?:aws_secret_access_key|AWS_SECRET)\s*[:=]\s*['"]?[A-Za-z0-9/+=]{40}/gi,
    name: 'AWS Secret Access Key',
  },
  // MongoDB connection string with credentials
  { pattern: /mongodb(\+srv)?:\/\/[^:]+:[^@]+@/g, name: 'MongoDB Connection String' },
  // JWT token (eyJ prefix)
  { pattern: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, name: 'JWT Token' },
  // Azure connection string
  {
    pattern: /DefaultEndpointsProtocol=https;AccountName=[^;]+;AccountKey=[^;]+/g,
    name: 'Azure Storage Connection String',
  },
  // Anthropic API Key
  { pattern: /sk-ant-[a-zA-Z0-9_-]{20,}/g, name: 'Anthropic API Key' },
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
