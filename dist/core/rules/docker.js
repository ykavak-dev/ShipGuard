"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const rule = {
    id: 'docker-expose-postgres',
    name: 'Docker Exposes PostgreSQL Port',
    description: 'Detects Dockerfiles that expose PostgreSQL port 5432',
    category: 'docker',
    severity: 'medium',
    applicableTo: ['Dockerfile'],
    check(context) {
        const findings = [];
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
exports.default = rule;
//# sourceMappingURL=docker.js.map