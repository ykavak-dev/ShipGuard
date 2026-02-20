import type { Rule, ScanContext, Finding } from '../scanner';

const rule: Rule = {
  id: 'docker-expose-postgres',
  name: 'Docker Exposes PostgreSQL Port',
  description: 'Detects Dockerfiles that expose PostgreSQL port 5432',
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
        if (port === 5432) {
          findings.push({
            filePath: context.filePath,
            line: i + 1,
            severity: 'medium',
            message: 'Dockerfile exposes PostgreSQL port 5432 - use internal Docker networking instead',
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
