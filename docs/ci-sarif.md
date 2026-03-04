# GitHub Actions SARIF Upload

ShipGuard can output SARIF v2.1.0 reports compatible with GitHub Advanced Security.

## Workflow Example

```yaml
name: Security Scan

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  shipguard:
    runs-on: ubuntu-latest
    permissions:
      security-events: write
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - run: npm ci

      - name: Run ShipGuard scan
        run: npx kilo-guardian scan --format sarif --output results.sarif

      - name: Upload SARIF to GitHub
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: results.sarif
        if: always()
```

## Key Points

- `--format sarif` generates a SARIF v2.1.0 compliant file.
- `--output results.sarif` writes to disk instead of stdout.
- The `security-events: write` permission is required for SARIF upload.
- `if: always()` ensures results are uploaded even when the scan finds issues.
- Results appear in the repository's **Security > Code scanning alerts** tab.

## Threshold Gate

Add `--threshold 80` to fail the workflow when the security score drops below a threshold:

```yaml
      - name: Run ShipGuard scan
        run: npx kilo-guardian scan --format sarif --output results.sarif --threshold 80
```

The process exits with code 1 when the score is below the threshold, failing the workflow step.
