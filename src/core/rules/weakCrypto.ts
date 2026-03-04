import type { Rule, ScanContext, Finding } from '../scanner';

const WEAK_HASH_PATTERN = /createHash\s*\(\s*['"](?:md5|sha1)['"]\s*\)/;
const PSEUDO_RANDOM_PATTERN = /crypto\.pseudoRandomBytes/;
const MATH_RANDOM_PATTERN = /Math\.random\s*\(\)/;

const SECURITY_CONTEXT_KEYWORDS = [
  'token', 'secret', 'password', 'key', 'salt', 'hash', 'nonce',
  'session', 'csrf', 'auth', 'credential', 'encrypt',
];

const rule: Rule = {
  id: 'weak-crypto',
  name: 'Weak Cryptography',
  description: 'Detects use of weak cryptographic algorithms and insecure random number generation',
  category: 'cryptography',
  severity: 'medium',
  applicableTo: ['.ts', '.js'],
  check(context: ScanContext): Finding[] {
    const findings: Finding[] = [];

    for (let i = 0; i < context.lines.length; i++) {
      const line = context.lines[i];
      const trimmed = line.trim();

      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;

      if (WEAK_HASH_PATTERN.test(line)) {
        findings.push({
          filePath: context.filePath,
          line: i + 1,
          severity: 'medium',
          message: 'Weak hash algorithm (MD5/SHA1) detected. Use SHA-256 or stronger.',
          ruleId: 'weak-crypto',
          category: 'cryptography',
        });
      }

      if (PSEUDO_RANDOM_PATTERN.test(line)) {
        findings.push({
          filePath: context.filePath,
          line: i + 1,
          severity: 'medium',
          message: 'crypto.pseudoRandomBytes is deprecated. Use crypto.randomBytes() instead.',
          ruleId: 'weak-crypto',
          category: 'cryptography',
        });
      }

      if (MATH_RANDOM_PATTERN.test(line)) {
        const surroundingLines = context.lines
          .slice(Math.max(0, i - 3), Math.min(context.lines.length, i + 4))
          .join(' ')
          .toLowerCase();

        const inSecurityContext = SECURITY_CONTEXT_KEYWORDS.some(kw => surroundingLines.includes(kw));

        if (inSecurityContext) {
          findings.push({
            filePath: context.filePath,
            line: i + 1,
            severity: 'medium',
            message: 'Math.random() is not cryptographically secure. Use crypto.randomBytes() or crypto.randomUUID() for security-sensitive values.',
            ruleId: 'weak-crypto',
            category: 'cryptography',
          });
        }
      }
    }

    return findings;
  },
};

export default rule;
