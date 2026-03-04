import type { Rule, ScanContext, Finding } from '../scanner';

const DANGEROUS_PACKAGES: { name: string; reason: string }[] = [
  // Supply chain attacks
  { name: 'event-stream', reason: 'Known supply chain attack (flatmap-stream injection)' },
  { name: 'flatmap-stream', reason: 'Malicious package used in event-stream attack' },
  { name: 'ua-parser-js', reason: 'Package was hijacked with cryptominer/password stealer' },
  // Maintainer sabotage
  { name: 'colors', reason: 'Maintainer sabotaged package (infinite loop in v1.4.1+)' },
  { name: 'faker', reason: 'Maintainer sabotaged package (replaced with ENDGAME module)' },
  { name: 'node-ipc', reason: 'Maintainer added protestware (data destruction payload)' },
  // Deprecated / unmaintained
  { name: 'left-pad', reason: 'Deprecated and unmaintained — use String.prototype.padStart()' },
  { name: 'request', reason: 'Deprecated since 2020 — use node-fetch, undici, or built-in fetch' },
  { name: 'nomnom', reason: 'Deprecated and unmaintained — use commander or yargs' },
  // Known hijacked / malicious (2023-2025)
  { name: 'coa', reason: 'Package was hijacked to deliver malware (2021-2023)' },
  { name: 'rc', reason: 'Package was hijacked to deliver malware (2021-2023)' },
  { name: 'es5-ext', reason: 'Protestware added in 0.10.53+ (2024)' },
  { name: 'lottie-player', reason: 'Supply chain attack — npm package compromised (2024)' },
  {
    name: '@lottiefiles/lottie-player',
    reason: 'Supply chain attack — wallet drainer injected (2024)',
  },
  {
    name: 'everything',
    reason: 'Malicious package that installs all npm packages as dependencies',
  },
  { name: 'cors-parser', reason: 'Typosquat of cors — contains data exfiltration payload' },
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

    // Lazily build line number map only when a dangerous package is found
    let lineMap: Map<string, number> | null = null;

    for (const { name, reason } of DANGEROUS_PACKAGES) {
      if (name in deps) {
        if (!lineMap) {
          lineMap = new Map<string, number>();
          for (let i = 0; i < context.lines.length; i++) {
            const match = context.lines[i].match(/"([^"]+)"\s*:/);
            if (match) {
              lineMap.set(match[1], i + 1);
            }
          }
        }
        findings.push({
          filePath: context.filePath,
          line: lineMap.get(name),
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
