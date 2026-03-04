import type { Rule, ScanContext, Finding } from '../scanner';

const DANGEROUS_PACKAGES: { name: string; reason: string }[] = [
  { name: 'event-stream', reason: 'Known supply chain attack (flatmap-stream injection)' },
  { name: 'ua-parser-js', reason: 'Package was hijacked with cryptominer/password stealer' },
  { name: 'colors', reason: 'Maintainer sabotaged package (infinite loop in v1.4.1+)' },
  { name: 'faker', reason: 'Maintainer sabotaged package (replaced with ENDGAME module)' },
  { name: 'node-ipc', reason: 'Maintainer added protestware (data destruction payload)' },
  { name: 'flatmap-stream', reason: 'Malicious package used in event-stream attack' },
  { name: 'left-pad', reason: 'Deprecated and unmaintained — use String.prototype.padStart()' },
];

const rule: Rule = {
  id: 'insecure-dependency',
  name: 'Insecure Dependency',
  description: 'Detects known vulnerable, hijacked, or sabotaged npm packages',
  category: 'supply-chain',
  severity: 'critical',
  applicableTo: ['package.json'],
  check(context: ScanContext): Finding[] {
    const findings: Finding[] = [];

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(context.content);
    } catch {
      return [];
    }

    const deps = {
      ...(typeof parsed.dependencies === 'object' && parsed.dependencies !== null
        ? (parsed.dependencies as Record<string, string>)
        : {}),
      ...(typeof parsed.devDependencies === 'object' && parsed.devDependencies !== null
        ? (parsed.devDependencies as Record<string, string>)
        : {}),
    };

    for (const { name, reason } of DANGEROUS_PACKAGES) {
      if (name in deps) {
        let lineNum: number | undefined;
        for (let i = 0; i < context.lines.length; i++) {
          if (context.lines[i].includes(`"${name}"`)) {
            lineNum = i + 1;
            break;
          }
        }

        findings.push({
          filePath: context.filePath,
          line: lineNum,
          severity: 'critical',
          message: `Insecure dependency "${name}": ${reason}`,
          ruleId: 'insecure-dependency',
          category: 'supply-chain',
        });
      }
    }

    return findings;
  },
};

export default rule;
