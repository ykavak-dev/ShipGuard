import type { Rule, ScanContext, Finding } from '../scanner';

const SENSITIVE_PORTS: { port: number; service: string }[] = [
  { port: 5432, service: 'PostgreSQL' },
  { port: 3306, service: 'MySQL' },
  { port: 27017, service: 'MongoDB' },
  { port: 6379, service: 'Redis' },
  { port: 9200, service: 'Elasticsearch' },
];

const rule: Rule = {
  id: 'docker-expose-postgres',
  name: 'Docker Exposes Database/Service Port',
  description: 'Detects Dockerfiles that expose sensitive database and service ports',
  category: 'docker',
  severity: 'medium',
  applicableTo: ['Dockerfile'],
  check(context: ScanContext): Finding[] {
    const findings: Finding[] = [];
    const exposeRegex = /^EXPOSE\s+(\d+)/i;

    for (let i = 0; i < context.lines.length; i++) {
      const match = exposeRegex.exec(context.lines[i].trim());
      if (match) {
        const port = parseInt(match[1], 10);
        const entry = SENSITIVE_PORTS.find((p) => p.port === port);
        if (entry) {
          findings.push({
            filePath: context.filePath,
            line: i + 1,
            severity: 'medium',
            message: `Dockerfile exposes ${entry.service} port ${entry.port} - use internal Docker networking instead`,
            ruleId: 'docker-expose-postgres',
            category: 'docker',
          });
        }
      }
    }

    return findings;
  },
};

export default rule;
