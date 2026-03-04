import type { Rule, ScanContext, Finding } from '../scanner';

const WEAK_HASH_PATTERN = /createHash\s*\(\s*['"](?:md5|sha1)['"]\s*\)/;
const PSEUDO_RANDOM_PATTERN = /crypto\.pseudoRandomBytes/;
const MATH_RANDOM_PATTERN = /Math\.random\s*\(\)/;

const SECURITY_CONTEXT_KEYWORDS = [
  'token',
  'secret',
  'password',
  'key',
  'salt',
  'hash',
  'nonce',
  'session',
  'csrf',
  'auth',
  'credential',
  'encrypt',
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
    // Lazily lowercased lines — only allocated when Math.random() is found
    let lowerLines: string[] | null = null;

    for (let i = 0; i < context.lines.length; i++) {
      const codeOnly = context.strippedLines[i];
      if (!codeOnly || codeOnly.trimStart().startsWith('*')) continue;

      if (WEAK_HASH_PATTERN.test(codeOnly)) {
        findings.push({
          filePath: context.filePath,
          line: i + 1,
          severity: 'medium',
          message: 'Weak hash algorithm (MD5/SHA1) detected. Use SHA-256 or stronger.',
          ruleId: 'weak-crypto',
          category: 'cryptography',
        });
      }

      if (PSEUDO_RANDOM_PATTERN.test(codeOnly)) {
        findings.push({
          filePath: context.filePath,
          line: i + 1,
          severity: 'medium',
          message: 'crypto.pseudoRandomBytes is deprecated. Use crypto.randomBytes() instead.',
          ruleId: 'weak-crypto',
          category: 'cryptography',
        });
      }

      if (MATH_RANDOM_PATTERN.test(codeOnly)) {
        if (!lowerLines) {
          lowerLines = context.lines.map((l) => l.toLowerCase());
        }
        const start = Math.max(0, i - 3);
        const end = Math.min(lowerLines.length, i + 4);
        let inSecurityContext = false;
        outer: for (let j = start; j < end; j++) {
          for (const kw of SECURITY_CONTEXT_KEYWORDS) {
            if (lowerLines[j].includes(kw)) {
              inSecurityContext = true;
              break outer;
            }
          }
        }

        if (inSecurityContext) {
          findings.push({
            filePath: context.filePath,
            line: i + 1,
            severity: 'medium',
            message:
              'Math.random() is not cryptographically secure. Use crypto.randomBytes() or crypto.randomUUID() for security-sensitive values.',
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
