"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const CONSOLE_LOG_THRESHOLD = 5;
const rule = {
    id: 'console-log-excessive',
    name: 'Excessive console.log Usage',
    description: 'Detects files with too many console.log statements',
    category: 'reliability',
    severity: 'low',
    applicableTo: ['.ts', '.js'],
    check(context) {
        let count = 0;
        let firstLine;
        for (let i = 0; i < context.lines.length; i++) {
            if (context.lines[i].includes('console.log')) {
                count++;
                if (firstLine === undefined)
                    firstLine = i + 1;
            }
        }
        if (count > CONSOLE_LOG_THRESHOLD) {
            return [{
                    filePath: context.filePath,
                    line: firstLine,
                    severity: 'low',
                    message: `Found ${count} console.log statements (threshold: ${CONSOLE_LOG_THRESHOLD}) - consider using a structured logger`,
                    ruleId: 'console-log-excessive',
                    category: 'reliability',
                }];
        }
        return [];
    },
};
exports.default = rule;
//# sourceMappingURL=reliability.js.map