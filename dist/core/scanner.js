"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.scanProject = scanProject;
exports.loadRules = loadRules;
exports.shouldApplyRule = shouldApplyRule;
const fast_glob_1 = require("fast-glob");
const fs_1 = require("fs");
const path = __importStar(require("path"));
// ═════════════════════════════════════════════════════════════════════════════
// Configuration
// ═════════════════════════════════════════════════════════════════════════════
const GLOB_PATTERNS = [
    '**/*.ts',
    '**/*.js',
    '**/.env',
    '**/Dockerfile',
];
const IGNORE_PATTERNS = [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/.git/**',
    '**/demo-examples/**',
];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const CONCURRENCY_LIMIT = 50; // Parallel file processing limit
// ═════════════════════════════════════════════════════════════════════════════
// Rule Loading
// ═════════════════════════════════════════════════════════════════════════════
async function loadRules() {
    const rules = [];
    const rulesDir = path.join(__dirname, 'rules');
    try {
        const ruleFiles = await (0, fast_glob_1.glob)('*.js', {
            cwd: rulesDir,
            absolute: true,
            onlyFiles: true,
        });
        const rulePromises = ruleFiles.map(async (file) => {
            try {
                const ruleModule = await Promise.resolve(`${file}`).then(s => __importStar(require(s)));
                const rule = ruleModule.default || ruleModule.rule || ruleModule;
                return isValidRule(rule) ? rule : null;
            }
            catch (error) {
                // Silently skip invalid rule files
                return null;
            }
        });
        const loadedRules = await Promise.all(rulePromises);
        rules.push(...loadedRules.filter((r) => r !== null));
    }
    catch {
        // Rules directory may not exist yet
    }
    return rules;
}
function isValidRule(obj) {
    if (typeof obj !== 'object' || obj === null)
        return false;
    const rule = obj;
    return (typeof rule.id === 'string' &&
        typeof rule.name === 'string' &&
        typeof rule.check === 'function');
}
function shouldApplyRule(rule, filePath) {
    const normalizedPath = filePath.toLowerCase();
    return rule.applicableTo.some(pattern => {
        if (pattern.startsWith('.')) {
            return normalizedPath.endsWith(pattern.toLowerCase());
        }
        if (pattern.includes('/')) {
            return normalizedPath.endsWith(pattern.toLowerCase());
        }
        return path.basename(normalizedPath) === pattern.toLowerCase();
    });
}
async function readFileWithResult(filePath) {
    try {
        const stats = await fs_1.promises.stat(filePath);
        if (!stats.isFile()) {
            return { success: false, filePath, reason: 'not_file' };
        }
        if (stats.size > MAX_FILE_SIZE) {
            return { success: false, filePath, reason: 'too_large' };
        }
        const content = await fs_1.promises.readFile(filePath, 'utf-8');
        return { success: true, filePath, content };
    }
    catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        return {
            success: false,
            filePath,
            reason: 'read_error',
            error: errorMsg
        };
    }
}
async function scanSingleFile(filePath, content, rootPath, rules) {
    const context = {
        rootPath,
        filePath,
        content,
        lines: content.split('\n'),
    };
    const findings = [];
    const errors = [];
    // Run applicable rules
    for (const rule of rules) {
        if (!shouldApplyRule(rule, filePath))
            continue;
        try {
            const ruleFindings = rule.check(context);
            for (const finding of ruleFindings) {
                findings.push({
                    ...finding,
                    filePath: path.relative(rootPath, finding.filePath),
                    severity: finding.severity || rule.severity,
                    ruleId: finding.ruleId || rule.id,
                    category: finding.category || rule.category,
                });
            }
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            errors.push({
                filePath,
                error: `Rule ${rule.id} failed: ${errorMsg}`,
            });
        }
    }
    return { findings, errors };
}
// Process files in batches to control concurrency
async function processBatch(items, processor, concurrency) {
    const results = [];
    for (let i = 0; i < items.length; i += concurrency) {
        const batch = items.slice(i, i + concurrency);
        const batchResults = await Promise.all(batch.map(processor));
        results.push(...batchResults);
    }
    return results;
}
// ═════════════════════════════════════════════════════════════════════════════
// Main Scanner
// ═════════════════════════════════════════════════════════════════════════════
function categorizeFindings(findings) {
    return {
        critical: findings.filter(f => f.severity === 'critical'),
        medium: findings.filter(f => f.severity === 'medium'),
        low: findings.filter(f => f.severity === 'low'),
    };
}
async function scanProject(rootPath) {
    const startedAt = new Date().toISOString();
    const startTime = performance.now();
    const absoluteRoot = path.resolve(rootPath);
    const allFindings = [];
    const scanErrors = [];
    // Load rules
    const rules = await loadRules();
    // Discover files
    const files = await (0, fast_glob_1.glob)(GLOB_PATTERNS, {
        cwd: absoluteRoot,
        absolute: true,
        onlyFiles: true,
        ignore: IGNORE_PATTERNS,
    });
    // Read all files in parallel with concurrency limit
    const fileReadResults = await processBatch(files, (filePath) => readFileWithResult(filePath), CONCURRENCY_LIMIT);
    // Process successfully read files
    const validFiles = [];
    let filesSkipped = 0;
    let filesWithErrors = 0;
    for (const result of fileReadResults) {
        if (result.success) {
            validFiles.push({ filePath: result.filePath, content: result.content });
        }
        else {
            filesSkipped++;
            if ('reason' in result && result.reason === 'read_error') {
                filesWithErrors++;
                scanErrors.push({ filePath: result.filePath, error: result.error || 'Unknown error' });
            }
        }
    }
    // Scan files in parallel with concurrency limit
    const scanResults = await processBatch(validFiles, async ({ filePath, content }) => {
        try {
            return await scanSingleFile(filePath, content, absoluteRoot, rules);
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            return {
                findings: [],
                errors: [{ filePath, error: `Scan failed: ${errorMsg}` }],
            };
        }
    }, CONCURRENCY_LIMIT);
    // Aggregate results
    for (const result of scanResults) {
        allFindings.push(...result.findings);
        scanErrors.push(...result.errors);
    }
    const completedAt = new Date().toISOString();
    const durationMs = Math.round(performance.now() - startTime);
    // Log errors in development mode
    if (scanErrors.length > 0 && process.env.DEBUG) {
        console.error('Scan errors:', scanErrors);
    }
    return {
        ...categorizeFindings(allFindings),
        metadata: {
            durationMs,
            filesScanned: validFiles.length,
            filesSkipped,
            filesWithErrors: scanErrors.length,
            rulesLoaded: rules.length,
            startedAt,
            completedAt,
        },
    };
}
//# sourceMappingURL=scanner.js.map