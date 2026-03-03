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
exports.getApiKey = getApiKey;
exports.loadConfig = loadConfig;
exports.saveConfig = saveConfig;
exports.maskApiKey = maskApiKey;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const DEFAULTS = {
    provider: 'claude',
    threshold: 80,
    mcpPort: 3333,
    stream: false,
    verbose: false,
};
const RC_FILENAME = '.shipguardrc.json';
// ═════════════════════════════════════════════════════════════════════════════
// Config File I/O
// ═════════════════════════════════════════════════════════════════════════════
function getLocalRcPath() {
    return path.join(process.cwd(), RC_FILENAME);
}
function getGlobalRcPath() {
    return path.join(os.homedir(), RC_FILENAME);
}
function readRcFile(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(content);
    }
    catch {
        return {};
    }
}
function checkFilePermissions(filePath, config) {
    if (!config.apiKey)
        return;
    if (process.platform === 'win32')
        return;
    try {
        const stats = fs.statSync(filePath);
        const mode = (stats.mode & 0o777).toString(8);
        if (mode !== '600') {
            console.error(`\x1b[33m⚠ Warning: ${filePath} contains an API key but has permissions ${mode}. Run: chmod 600 ${filePath}\x1b[0m`);
        }
    }
    catch {
        // File might not exist, that's fine
    }
}
// ═════════════════════════════════════════════════════════════════════════════
// Environment Variable Mapping
// ═════════════════════════════════════════════════════════════════════════════
function loadEnvOverrides() {
    const overrides = {};
    if (process.env.SHIPGUARD_PROVIDER) {
        const p = process.env.SHIPGUARD_PROVIDER;
        if (p === 'claude' || p === 'openai' || p === 'ollama') {
            overrides.provider = p;
        }
    }
    if (process.env.SHIPGUARD_API_KEY) {
        overrides.apiKey = process.env.SHIPGUARD_API_KEY;
    }
    if (process.env.SHIPGUARD_MODEL) {
        overrides.model = process.env.SHIPGUARD_MODEL;
    }
    if (process.env.SHIPGUARD_THRESHOLD) {
        const t = parseInt(process.env.SHIPGUARD_THRESHOLD, 10);
        if (!isNaN(t))
            overrides.threshold = t;
    }
    if (process.env.SHIPGUARD_RULES_DIR) {
        overrides.rulesDir = process.env.SHIPGUARD_RULES_DIR;
    }
    if (process.env.SHIPGUARD_MCP_PORT) {
        const p = parseInt(process.env.SHIPGUARD_MCP_PORT, 10);
        if (!isNaN(p))
            overrides.mcpPort = p;
    }
    return overrides;
}
// ═════════════════════════════════════════════════════════════════════════════
// API Key Resolution
// ═════════════════════════════════════════════════════════════════════════════
function getApiKey(provider, configApiKey) {
    // 1. Explicit config apiKey
    if (configApiKey)
        return configApiKey;
    // 2. Generic env var
    if (process.env.SHIPGUARD_API_KEY)
        return process.env.SHIPGUARD_API_KEY;
    // 3. Provider-specific env var
    switch (provider) {
        case 'claude':
            return process.env.ANTHROPIC_API_KEY;
        case 'openai':
            return process.env.OPENAI_API_KEY;
        default:
            return undefined;
    }
}
// ═════════════════════════════════════════════════════════════════════════════
// Load Config (merge hierarchy)
// ═════════════════════════════════════════════════════════════════════════════
function loadConfig(cliOverrides) {
    // Layer 1: Defaults
    const config = { ...DEFAULTS };
    // Layer 2: Global rc
    const globalRc = readRcFile(getGlobalRcPath());
    Object.assign(config, stripUndefined(globalRc));
    // Layer 3: Local rc
    const localPath = getLocalRcPath();
    const localRc = readRcFile(localPath);
    Object.assign(config, stripUndefined(localRc));
    checkFilePermissions(localPath, localRc);
    // Layer 4: Environment variables
    const envOverrides = loadEnvOverrides();
    Object.assign(config, stripUndefined(envOverrides));
    // Layer 5: CLI arguments
    if (cliOverrides) {
        Object.assign(config, stripUndefined(cliOverrides));
    }
    // Resolve API key
    config.apiKey = getApiKey(config.provider, config.apiKey);
    return config;
}
// ═════════════════════════════════════════════════════════════════════════════
// Save Config
// ═════════════════════════════════════════════════════════════════════════════
function saveConfig(values, global) {
    const filePath = global ? getGlobalRcPath() : getLocalRcPath();
    let existing = {};
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        existing = JSON.parse(content);
    }
    catch {
        // No existing file
    }
    const merged = { ...existing, ...stripUndefined(values) };
    fs.writeFileSync(filePath, JSON.stringify(merged, null, 2) + '\n', 'utf-8');
    // Set restrictive permissions if apiKey is present
    if (merged.apiKey && process.platform !== 'win32') {
        fs.chmodSync(filePath, 0o600);
    }
}
// ═════════════════════════════════════════════════════════════════════════════
// Mask API Key
// ═════════════════════════════════════════════════════════════════════════════
function maskApiKey(key) {
    if (!key)
        return '(not set)';
    if (key.length <= 8)
        return '***';
    return key.substring(0, 7) + '***' + key.substring(key.length - 3);
}
// ═════════════════════════════════════════════════════════════════════════════
// Helpers
// ═════════════════════════════════════════════════════════════════════════════
function stripUndefined(obj) {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
        if (value !== undefined) {
            result[key] = value;
        }
    }
    return result;
}
//# sourceMappingURL=index.js.map