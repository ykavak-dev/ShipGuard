import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ═════════════════════════════════════════════════════════════════════════════
// Types
// ═════════════════════════════════════════════════════════════════════════════

export interface ShipGuardConfig {
  provider: 'claude' | 'openai' | 'ollama';
  model?: string;
  apiKey?: string;
  threshold: number;
  rulesDir?: string;
  mcpPort: number;
  stream: boolean;
  verbose: boolean;
}

const DEFAULTS: ShipGuardConfig = {
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

function getLocalRcPath(): string {
  return path.join(process.cwd(), RC_FILENAME);
}

function getGlobalRcPath(): string {
  return path.join(os.homedir(), RC_FILENAME);
}

const VALID_PROVIDERS = ['claude', 'openai', 'ollama'];

function readRcFile(filePath: string): Partial<ShipGuardConfig> {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(content);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    const result: Partial<ShipGuardConfig> = {};
    if (typeof parsed.provider === 'string' && VALID_PROVIDERS.includes(parsed.provider)) {
      result.provider = parsed.provider as ShipGuardConfig['provider'];
    }
    if (typeof parsed.model === 'string') result.model = parsed.model;
    if (typeof parsed.apiKey === 'string') result.apiKey = parsed.apiKey;
    if (typeof parsed.threshold === 'number' && parsed.threshold >= 0 && parsed.threshold <= 100) {
      result.threshold = parsed.threshold;
    }
    if (typeof parsed.rulesDir === 'string') result.rulesDir = parsed.rulesDir;
    if (typeof parsed.mcpPort === 'number' && Number.isInteger(parsed.mcpPort)) {
      result.mcpPort = parsed.mcpPort;
    }
    if (typeof parsed.stream === 'boolean') result.stream = parsed.stream;
    if (typeof parsed.verbose === 'boolean') result.verbose = parsed.verbose;
    return result;
  } catch {
    return {};
  }
}

function checkFilePermissions(filePath: string, config: Partial<ShipGuardConfig>): void {
  if (!config.apiKey) return;
  if (process.platform === 'win32') return;

  try {
    const stats = fs.statSync(filePath);
    const mode = (stats.mode & 0o777).toString(8);
    if (mode !== '600') {
      console.warn(
        `[shipguard] WARNING: ${filePath} contains an API key but has permissions ${mode}. Run: chmod 600 ${filePath}`
      );
    }
  } catch {
    // File might not exist, that's fine
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Environment Variable Mapping
// ═════════════════════════════════════════════════════════════════════════════

function loadEnvOverrides(): Partial<ShipGuardConfig> {
  const overrides: Partial<ShipGuardConfig> = {};

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
    if (!isNaN(t)) overrides.threshold = Math.max(0, Math.min(100, t));
  }
  if (process.env.SHIPGUARD_RULES_DIR) {
    overrides.rulesDir = process.env.SHIPGUARD_RULES_DIR;
  }
  if (process.env.SHIPGUARD_MCP_PORT) {
    const p = parseInt(process.env.SHIPGUARD_MCP_PORT, 10);
    if (!isNaN(p)) overrides.mcpPort = p;
  }

  return overrides;
}

// ═════════════════════════════════════════════════════════════════════════════
// API Key Resolution
// ═════════════════════════════════════════════════════════════════════════════

/** Resolves an API key from explicit config, generic env var, or provider-specific env var. */
export function getApiKey(provider: string, configApiKey?: string): string | undefined {
  // 1. Explicit config apiKey
  if (configApiKey) return configApiKey;

  // 2. Generic env var
  if (process.env.SHIPGUARD_API_KEY) return process.env.SHIPGUARD_API_KEY;

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
// Load Config (merge hierarchy, cached with TTL)
// ═════════════════════════════════════════════════════════════════════════════

const CONFIG_CACHE_TTL_MS = 5000;
let configCache: { config: ShipGuardConfig; timestamp: number } | null = null;

/** Merges defaults, global/local rc files, env vars, and CLI overrides into a final config. */
export function loadConfig(cliOverrides?: Partial<ShipGuardConfig>): ShipGuardConfig {
  // Skip cache when CLI overrides are provided (different call-sites may pass different flags)
  if (!cliOverrides && configCache && Date.now() - configCache.timestamp < CONFIG_CACHE_TTL_MS) {
    return { ...configCache.config };
  }

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

  // Cache when no overrides
  if (!cliOverrides) {
    configCache = { config: { ...config }, timestamp: Date.now() };
  }

  return config;
}

/** Clear the config cache (useful for testing). */
export function clearConfigCache(): void {
  configCache = null;
}

// ═════════════════════════════════════════════════════════════════════════════
// Save Config
// ═════════════════════════════════════════════════════════════════════════════

/** Persists config values to the local (default) or global rc file. */
export function saveConfig(values: Partial<ShipGuardConfig>, global?: boolean): void {
  const filePath = global ? getGlobalRcPath() : getLocalRcPath();

  let existing: Partial<ShipGuardConfig> = {};
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    existing = JSON.parse(content) as Partial<ShipGuardConfig>;
  } catch {
    // No existing file
  }

  const merged = { ...existing, ...stripUndefined(values) };
  const data = JSON.stringify(merged, null, 2) + '\n';

  // Write with restrictive permissions atomically to avoid race condition
  if (merged.apiKey && process.platform !== 'win32') {
    fs.writeFileSync(filePath, data, { encoding: 'utf-8', mode: 0o600 });
  } else {
    fs.writeFileSync(filePath, data, 'utf-8');
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Mask API Key
// ═════════════════════════════════════════════════════════════════════════════

/** Returns a masked version of an API key for safe display (e.g. `sk-a***`). */
export function maskApiKey(key: string | undefined): string {
  if (!key) return '(not set)';
  if (key.length <= 8) return '***';
  return key.substring(0, 4) + '***';
}

// ═════════════════════════════════════════════════════════════════════════════
// Helpers
// ═════════════════════════════════════════════════════════════════════════════

function stripUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const result: Partial<T> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      (result as Record<string, unknown>)[key] = value;
    }
  }
  return result;
}
