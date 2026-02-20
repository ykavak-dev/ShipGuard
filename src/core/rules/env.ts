import * as fs from 'fs';
import * as path from 'path';
import type { Rule, ScanContext, Finding } from '../scanner';

const rule: Rule = {
  id: 'env-missing-example',
  name: 'Missing .env.example Template',
  description: 'Detects .env files without a corresponding .env.example template',
  category: 'configuration',
  severity: 'medium',
  applicableTo: ['.env'],
  check(context: ScanContext): Finding[] {
    const dir = path.dirname(context.filePath);
    const examplePath = path.join(dir, '.env.example');

    if (!fs.existsSync(examplePath)) {
      return [{
        filePath: context.filePath,
        severity: 'medium',
        message: '.env file exists but .env.example template is missing',
        ruleId: 'env-missing-example',
        category: 'configuration',
      }];
    }

    return [];
  },
};

export default rule;
