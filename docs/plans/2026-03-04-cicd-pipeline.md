# CI/CD Pipeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade ShipGuard from a basic build+scan workflow to a comprehensive CI/CD pipeline with linting, matrix testing, self-scan (dogfooding), and release automation.

**Architecture:** Four-job CI pipeline (lint → test → self-scan + build-check) with matrix Node.js testing. Separate release workflow for tag-based GitHub Releases. ESLint + Prettier added as dev tooling.

**Tech Stack:** GitHub Actions, ESLint (flat config), Prettier, Vitest, SARIF upload via codeql-action, softprops/action-gh-release.

---

### Task 1: Install ESLint dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install ESLint and TypeScript ESLint packages**

Run:
```bash
cd /Users/val/shipguard && npm install -D eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin
```

**Step 2: Verify installation**

Run: `npx eslint --version`
Expected: Version 9.x printed

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add eslint and typescript-eslint dependencies"
```

---

### Task 2: Create ESLint flat config

**Files:**
- Create: `eslint.config.js`

**Step 1: Create eslint.config.js with flat config format**

```js
const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');

module.exports = [
  {
    ignores: ['dist/', 'node_modules/', 'demo-examples/', 'tests/fixtures/', 'coverage/'],
  },
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      'no-console': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
];
```

**Step 2: Run ESLint to check current state**

Run: `npx eslint src/ --ext .ts 2>&1 | tail -20`
Expected: Some warnings/errors — note them for Task 3.

**Step 3: Commit**

```bash
git add eslint.config.js
git commit -m "chore: add eslint flat config for typescript"
```

---

### Task 3: Fix critical ESLint errors in source code

**Files:**
- Modify: Various `src/**/*.ts` files as needed

**Step 1: Run ESLint and capture output**

Run: `npx eslint src/ --ext .ts 2>&1 | head -80`

**Step 2: Fix only errors (not warnings)**

Fix any `error`-level issues. Do NOT touch `warn`-level issues — those are intentional soft enforcement. Focus on:
- `@typescript-eslint/no-unused-vars` errors (remove or prefix with `_`)
- Any other `error`-severity rules

If there are too many `no-console` warnings in legitimate CLI code, adjust the ESLint config to allow console in `src/cli.ts` and `src/core/report/index.ts` by adding a file-specific override block:

```js
{
  files: ['src/cli.ts', 'src/core/report/**/*.ts'],
  rules: {
    'no-console': 'off',
  },
},
```

**Step 3: Verify ESLint passes with zero errors**

Run: `npx eslint src/ --ext .ts 2>&1 | grep -c "error" || echo "0 errors"`
Expected: Only warnings remain, no errors.

**Step 4: Run tests to confirm no regressions**

Run: `npm test`
Expected: All 153 tests pass.

**Step 5: Commit**

```bash
git add -A
git commit -m "fix: resolve eslint errors in source code"
```

---

### Task 4: Install Prettier and create config

**Files:**
- Modify: `package.json`
- Create: `.prettierrc`
- Create: `.prettierignore`

**Step 1: Install Prettier**

Run:
```bash
cd /Users/val/shipguard && npm install -D prettier
```

**Step 2: Create .prettierrc**

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "es5",
  "printWidth": 100,
  "tabWidth": 2
}
```

**Step 3: Create .prettierignore**

```
dist/
node_modules/
demo-examples/
coverage/
*.json
```

**Step 4: Check how many files would change**

Run: `npx prettier --check "src/**/*.ts" 2>&1 | tail -5`
Expected: Reports files that need formatting (or all pass).

**Step 5: Commit config files**

```bash
git add package.json package-lock.json .prettierrc .prettierignore
git commit -m "chore: add prettier configuration"
```

---

### Task 5: Format source code with Prettier

**Files:**
- Modify: Various `src/**/*.ts` files

**Step 1: Run Prettier to format all source files**

Run: `npx prettier --write "src/**/*.ts"`

**Step 2: Also format test files**

Run: `npx prettier --write "tests/**/*.ts"`

**Step 3: Verify Prettier check passes**

Run: `npx prettier --check "src/**/*.ts" && npx prettier --check "tests/**/*.ts"`
Expected: All files pass.

**Step 4: Run tests to confirm no regressions**

Run: `npm test`
Expected: All tests pass.

**Step 5: Run ESLint to confirm no new issues**

Run: `npx eslint src/ --ext .ts 2>&1 | grep "error" | head -5`
Expected: No new errors.

**Step 6: Commit**

```bash
git add -A
git commit -m "style: format codebase with prettier"
```

---

### Task 6: Add lint/format scripts to package.json

**Files:**
- Modify: `package.json` (scripts section)

**Step 1: Add scripts to package.json**

Add these scripts (keep all existing ones):

```json
{
  "scripts": {
    "build": "tsc",
    "dev": "ts-node -- src/cli.ts",
    "start": "node dist/cli.js",
    "clean": "rm -rf dist",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "lint": "eslint src/ --ext .ts",
    "format": "prettier --write \"src/**/*.ts\"",
    "format:check": "prettier --check \"src/**/*.ts\"",
    "prepublishOnly": "npm run build && npm test"
  }
}
```

**Step 2: Verify scripts work**

Run: `npm run lint 2>&1 | tail -3`
Run: `npm run format:check 2>&1 | tail -3`
Expected: Both complete without error-level failures.

**Step 3: Commit**

```bash
git add package.json
git commit -m "chore: add lint, format, and prepublishOnly scripts"
```

---

### Task 7: Deprecate guardian.yml

**Files:**
- Modify: `.github/workflows/guardian.yml`

**Step 1: Add deprecation notice to guardian.yml**

Add a comment block at the very top of the file, before the `name:` field:

```yaml
# ⚠️ DEPRECATED: This workflow is superseded by ci.yml
# Kept for backward compatibility. Use .github/workflows/ci.yml instead.
# This workflow will be removed in a future release.
```

**Step 2: Commit**

```bash
git add .github/workflows/guardian.yml
git commit -m "chore: mark guardian.yml workflow as deprecated"
```

---

### Task 8: Create CI workflow — .github/workflows/ci.yml

**Files:**
- Create: `.github/workflows/ci.yml`

**Step 1: Create the ci.yml file**

```yaml
name: CI

on:
  push:
    branches: [main, dev]
  pull_request:
    branches: [main]

jobs:
  lint-and-format:
    name: Lint & Format
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run ESLint
        run: npx eslint src/ --ext .ts

      - name: Check Prettier formatting
        run: npx prettier --check "src/**/*.ts"

  test:
    name: Test (Node ${{ matrix.node-version }})
    runs-on: ubuntu-latest
    needs: lint-and-format

    strategy:
      matrix:
        node-version: [18, 20]

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js ${{ matrix.node-version }}
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build project
        run: npm run build

      - name: Run tests
        run: npm test

      - name: Run tests with coverage
        run: npm run test:coverage

      - name: Upload coverage report
        if: matrix.node-version == 20
        uses: actions/upload-artifact@v4
        with:
          name: coverage-report
          path: coverage/
          retention-days: 14

  self-scan:
    name: Self-Scan (Dogfooding)
    runs-on: ubuntu-latest
    needs: test

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build project
        run: npm run build

      - name: Run ShipGuard self-scan
        run: node dist/cli.js scan --threshold 70
        continue-on-error: true

      - name: Generate SARIF report
        run: node dist/cli.js scan --format sarif > shipguard-results.sarif
        continue-on-error: true

      - name: Upload SARIF to GitHub Security
        if: github.event_name == 'push' && github.ref == 'refs/heads/main'
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: shipguard-results.sarif
          category: shipguard-self-scan
        continue-on-error: true

  build-check:
    name: Build Verification
    runs-on: ubuntu-latest
    needs: test

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build project
        run: npm run build

      - name: Verify dist directory exists
        run: test -d dist

      - name: Verify CLI entry point
        run: test -f dist/cli.js

      - name: Verify MCP server entry point
        run: test -f dist/mcp/server.js

      - name: Verify CLI runs
        run: node dist/cli.js --help
```

**Step 2: Validate YAML syntax**

Run: `node -e "const yaml = require('js-yaml'); const fs = require('fs'); yaml.load(fs.readFileSync('.github/workflows/ci.yml', 'utf8')); console.log('Valid YAML')"`
Expected: "Valid YAML"

**Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add comprehensive CI pipeline with lint, test matrix, self-scan, and build verification"
```

---

### Task 9: Create Release workflow — .github/workflows/release.yml

**Files:**
- Create: `.github/workflows/release.yml`

**Step 1: Create the release.yml file**

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

permissions:
  contents: write

jobs:
  release:
    name: Build & Release
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build project
        run: npm run build

      - name: Run tests
        run: npm test

      - name: Generate changelog
        id: changelog
        run: |
          # Get previous tag
          PREV_TAG=$(git describe --tags --abbrev=0 HEAD^ 2>/dev/null || git rev-list --max-parents=0 HEAD)
          echo "Previous tag: $PREV_TAG"
          # Generate commit log
          CHANGELOG=$(git log ${PREV_TAG}..HEAD --pretty=format:"- %s (%h)" --no-merges)
          # Write to file for the release body
          echo "$CHANGELOG" > CHANGELOG_BODY.md

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          body_path: CHANGELOG_BODY.md
          generate_release_notes: true
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      # Uncomment when ready to publish to npm:
      # - name: Publish to npm
      #   run: npm publish
      #   env:
      #     NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

**Step 2: Validate YAML syntax**

Run: `node -e "const yaml = require('js-yaml'); const fs = require('fs'); yaml.load(fs.readFileSync('.github/workflows/release.yml', 'utf8')); console.log('Valid YAML')"`
Expected: "Valid YAML"

**Step 3: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: add release workflow for tag-based GitHub releases"
```

---

### Task 10: Add tests/fixtures to scanner IGNORE_PATTERNS

**Files:**
- Modify: `src/core/scanner.ts:73-80`

**Step 1: Check current IGNORE_PATTERNS**

Current value at line 73-80:
```ts
const IGNORE_PATTERNS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/.git/**',
  '**/demo-examples/**',
  '**/src/core/rules/**',
];
```

**Step 2: Add tests/fixtures pattern**

Add `'**/tests/fixtures/**'` to the array:

```ts
const IGNORE_PATTERNS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/.git/**',
  '**/demo-examples/**',
  '**/src/core/rules/**',
  '**/tests/fixtures/**',
];
```

**Step 3: Build and run self-scan locally to verify**

Run:
```bash
npm run build && node dist/cli.js scan --threshold 70
```
Expected: Score >= 70, no findings from tests/fixtures/.

**Step 4: Run tests to confirm no regressions**

Run: `npm test`
Expected: All tests pass.

**Step 5: Commit**

```bash
git add src/core/scanner.ts
git commit -m "fix: exclude tests/fixtures from scan to prevent false positives in CI self-scan"
```

---

### Task 11: End-to-end local verification

**Files:** None (verification only)

**Step 1: Run full lint check**

Run: `npm run lint 2>&1 | tail -5`
Expected: Exits 0 (warnings OK, no errors).

**Step 2: Run format check**

Run: `npm run format:check`
Expected: All files formatted.

**Step 3: Run full test suite**

Run: `npm test`
Expected: All tests pass.

**Step 4: Run build**

Run: `npm run build`
Expected: Clean build, no errors.

**Step 5: Run self-scan**

Run: `node dist/cli.js scan --threshold 70`
Expected: Score >= 70.

**Step 6: Generate SARIF output**

Run: `node dist/cli.js scan --format sarif > /tmp/shipguard-test.sarif && echo "SARIF OK"`
Expected: "SARIF OK"

**Step 7: Verify workflow YAMLs are valid**

Run:
```bash
for f in .github/workflows/*.yml; do
  node -e "require('js-yaml').load(require('fs').readFileSync('$f','utf8'))" && echo "$f: OK"
done
```
Expected: All three workflow files valid.

**Step 8: Final commit if any stragglers**

```bash
git status
# If clean, no commit needed
```

---

## Summary of deliverables

| File | Action | Purpose |
|------|--------|---------|
| `eslint.config.js` | Create | ESLint flat config for TypeScript |
| `.prettierrc` | Create | Prettier formatting rules |
| `.prettierignore` | Create | Prettier file exclusions |
| `.github/workflows/ci.yml` | Create | 4-job CI pipeline |
| `.github/workflows/release.yml` | Create | Tag-based release workflow |
| `.github/workflows/guardian.yml` | Modify | Add deprecation notice |
| `package.json` | Modify | Add lint/format/prepublishOnly scripts + dev deps |
| `src/core/scanner.ts` | Modify | Add tests/fixtures to IGNORE_PATTERNS |
| Various `src/**/*.ts` | Modify | ESLint error fixes + Prettier formatting |

## Dependency graph

```
Task 1 (ESLint deps) → Task 2 (ESLint config) → Task 3 (Fix ESLint errors)
Task 4 (Prettier deps) → Task 5 (Format code)
Task 3 + Task 5 → Task 6 (package.json scripts)
Task 6 → Task 7 (Deprecate guardian.yml)
Task 6 → Task 8 (CI workflow)
Task 6 → Task 9 (Release workflow)
Task 6 → Task 10 (IGNORE_PATTERNS fix)
Task 8 + Task 9 + Task 10 → Task 11 (Verification)
```

Tasks 1-3 and Tasks 4-5 can run in parallel (ESLint and Prettier are independent).
