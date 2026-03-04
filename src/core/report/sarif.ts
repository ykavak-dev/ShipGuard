import type { ScanResult, Rule } from '../scanner';

const SARIF_SCHEMA = 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json';
const SARIF_VERSION = '2.1.0';

type SarifLevel = 'error' | 'warning' | 'note';

function toSarifLevel(severity: 'critical' | 'medium' | 'low'): SarifLevel {
  switch (severity) {
    case 'critical': return 'error';
    case 'medium': return 'warning';
    case 'low': return 'note';
  }
}

function toUri(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

export function generateSarif(scanResult: ScanResult, rules: Rule[]): object {
  const allFindings = [
    ...scanResult.critical,
    ...scanResult.medium,
    ...scanResult.low,
  ];

  const ruleIndexMap = new Map<string, number>();
  const sarifRules = rules.map((rule, index) => {
    ruleIndexMap.set(rule.id, index);
    return {
      id: rule.id,
      shortDescription: { text: rule.name },
      fullDescription: { text: rule.description },
      defaultConfiguration: {
        level: toSarifLevel(rule.severity),
      },
      properties: {
        category: rule.category,
      },
    };
  });

  const results = allFindings.map(finding => {
    const result: Record<string, unknown> = {
      ruleId: finding.ruleId,
      level: toSarifLevel(finding.severity),
      message: { text: finding.message },
      locations: [
        {
          physicalLocation: {
            artifactLocation: {
              uri: toUri(finding.filePath),
              uriBaseId: '%SRCROOT%',
            },
            region: {
              startLine: finding.line || 1,
              startColumn: finding.column || 1,
            },
          },
        },
      ],
    };

    const ruleIndex = ruleIndexMap.get(finding.ruleId);
    if (ruleIndex !== undefined) {
      result.ruleIndex = ruleIndex;
    }

    return result;
  });

  return {
    $schema: SARIF_SCHEMA,
    version: SARIF_VERSION,
    runs: [
      {
        tool: {
          driver: {
            name: 'ShipGuard',
            version: '2.0.0',
            informationUri: 'https://github.com/shipguard/shipguard',
            rules: sarifRules,
          },
        },
        results,
      },
    ],
  };
}
