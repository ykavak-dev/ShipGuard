import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig, maskApiKey, getApiKey, saveConfig, clearConfigCache } from '../../src/config/index';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('config', () => {
  // Save all env vars that could affect config
  const envVarsToSave = [
    'SHIPGUARD_PROVIDER',
    'SHIPGUARD_API_KEY',
    'SHIPGUARD_MODEL',
    'SHIPGUARD_THRESHOLD',
    'SHIPGUARD_RULES_DIR',
    'SHIPGUARD_MCP_PORT',
    'ANTHROPIC_API_KEY',
    'OPENAI_API_KEY',
  ];

  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    clearConfigCache();
    for (const key of envVarsToSave) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of envVarsToSave) {
      if (savedEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedEnv[key];
      }
    }
  });

  describe('loadConfig', () => {
    it('returns correct default values', () => {
      const config = loadConfig();
      expect(config.provider).toBe('claude');
      expect(config.threshold).toBe(80);
      expect(config.mcpPort).toBe(3333);
      expect(config.stream).toBe(false);
      expect(config.verbose).toBe(false);
    });

    it('env override: SHIPGUARD_PROVIDER=openai sets config.provider', () => {
      process.env.SHIPGUARD_PROVIDER = 'openai';
      const config = loadConfig();
      expect(config.provider).toBe('openai');
    });

    it('CLI override takes precedence over env', () => {
      process.env.SHIPGUARD_THRESHOLD = '50';
      const config = loadConfig({ threshold: 95 });
      expect(config.threshold).toBe(95);
    });
  });

  describe('maskApiKey', () => {
    it('returns "(not set)" for undefined', () => {
      expect(maskApiKey(undefined)).toBe('(not set)');
    });

    it('returns "***" for short key (<=8 chars)', () => {
      expect(maskApiKey('abc')).toBe('***');
      expect(maskApiKey('12345678')).toBe('***');
    });

    it('masks long key: first 4 chars + "***"', () => {
      const key = 'sk-ant-1234567890abcdef';
      const masked = maskApiKey(key);
      expect(masked).toBe('sk-a***');
      expect(masked.startsWith(key.substring(0, 4))).toBe(true);
      expect(masked).not.toContain(key.substring(key.length - 3));
    });
  });

  describe('getApiKey', () => {
    it('explicit config key takes precedence', () => {
      process.env.SHIPGUARD_API_KEY = 'env-key';
      process.env.ANTHROPIC_API_KEY = 'anthropic-key';
      expect(getApiKey('claude', 'explicit-key')).toBe('explicit-key');
    });

    it('falls back to SHIPGUARD_API_KEY env', () => {
      process.env.SHIPGUARD_API_KEY = 'generic-key';
      expect(getApiKey('claude')).toBe('generic-key');
    });

    it('falls back to ANTHROPIC_API_KEY for claude provider', () => {
      process.env.ANTHROPIC_API_KEY = 'anthropic-key';
      expect(getApiKey('claude')).toBe('anthropic-key');
    });

    it('returns undefined for ollama (no API key needed)', () => {
      expect(getApiKey('ollama')).toBeUndefined();
    });

    it('falls back to OPENAI_API_KEY for openai provider', () => {
      process.env.OPENAI_API_KEY = 'openai-key-123';
      expect(getApiKey('openai')).toBe('openai-key-123');
    });

    it('returns undefined for unknown provider without env vars', () => {
      expect(getApiKey('unknown-provider')).toBeUndefined();
    });
  });

  describe('loadConfig – env var overrides', () => {
    it('SHIPGUARD_MCP_PORT overrides mcpPort', () => {
      process.env.SHIPGUARD_MCP_PORT = '9999';
      const config = loadConfig();
      expect(config.mcpPort).toBe(9999);
    });

    it('SHIPGUARD_MCP_PORT with non-numeric value does not override', () => {
      process.env.SHIPGUARD_MCP_PORT = 'not-a-number';
      const config = loadConfig();
      expect(config.mcpPort).toBe(3333); // default
    });

    it('SHIPGUARD_THRESHOLD with non-numeric value does not override', () => {
      process.env.SHIPGUARD_THRESHOLD = 'abc';
      const config = loadConfig();
      expect(config.threshold).toBe(80); // default
    });

    it('SHIPGUARD_MODEL overrides model', () => {
      process.env.SHIPGUARD_MODEL = 'gpt-4o';
      const config = loadConfig();
      expect(config.model).toBe('gpt-4o');
    });

    it('SHIPGUARD_RULES_DIR overrides rulesDir', () => {
      process.env.SHIPGUARD_RULES_DIR = '/custom/rules';
      const config = loadConfig();
      expect(config.rulesDir).toBe('/custom/rules');
    });

    it('SHIPGUARD_API_KEY overrides apiKey', () => {
      process.env.SHIPGUARD_API_KEY = 'my-api-key';
      const config = loadConfig();
      expect(config.apiKey).toBe('my-api-key');
    });

    it('SHIPGUARD_PROVIDER=ollama sets provider to ollama', () => {
      process.env.SHIPGUARD_PROVIDER = 'ollama';
      const config = loadConfig();
      expect(config.provider).toBe('ollama');
    });

    it('SHIPGUARD_PROVIDER with invalid value does not override', () => {
      process.env.SHIPGUARD_PROVIDER = 'invalid-provider';
      const config = loadConfig();
      expect(config.provider).toBe('claude'); // default
    });
  });

  describe('saveConfig', () => {
    const tempDirs: string[] = [];

    afterEach(() => {
      for (const dir of tempDirs) {
        try {
          fs.rmSync(dir, { recursive: true, force: true });
        } catch {
          // best-effort cleanup
        }
      }
      tempDirs.length = 0;
    });

    it('saves config to a local rc file', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shipguard-cfg-'));
      tempDirs.push(dir);
      const origCwd = process.cwd();
      process.chdir(dir);
      try {
        saveConfig({ threshold: 90, verbose: true });
        const content = fs.readFileSync(path.join(dir, '.shipguardrc.json'), 'utf-8');
        const parsed = JSON.parse(content);
        expect(parsed.threshold).toBe(90);
        expect(parsed.verbose).toBe(true);
      } finally {
        process.chdir(origCwd);
      }
    });

    it('merges with existing config file', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shipguard-cfg-'));
      tempDirs.push(dir);
      const origCwd = process.cwd();
      process.chdir(dir);
      try {
        // Write initial config
        fs.writeFileSync(
          path.join(dir, '.shipguardrc.json'),
          JSON.stringify({ provider: 'openai', threshold: 50 }, null, 2) + '\n'
        );
        // Merge new values
        saveConfig({ threshold: 95 });
        const content = fs.readFileSync(path.join(dir, '.shipguardrc.json'), 'utf-8');
        const parsed = JSON.parse(content);
        expect(parsed.provider).toBe('openai'); // preserved
        expect(parsed.threshold).toBe(95); // overridden
      } finally {
        process.chdir(origCwd);
      }
    });

    it('sets chmod 600 when apiKey is present (non-win32)', () => {
      if (process.platform === 'win32') return;
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shipguard-cfg-'));
      tempDirs.push(dir);
      const origCwd = process.cwd();
      process.chdir(dir);
      try {
        saveConfig({ apiKey: 'secret-key-12345' });
        const stats = fs.statSync(path.join(dir, '.shipguardrc.json'));
        const mode = (stats.mode & 0o777).toString(8);
        expect(mode).toBe('600');
      } finally {
        process.chdir(origCwd);
      }
    });

    it('saves config without apiKey and does not set restrictive permissions', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shipguard-cfg-'));
      tempDirs.push(dir);
      const origCwd = process.cwd();
      process.chdir(dir);
      try {
        saveConfig({ threshold: 70, stream: true });
        const filePath = path.join(dir, '.shipguardrc.json');
        const content = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(content);
        expect(parsed.threshold).toBe(70);
        expect(parsed.stream).toBe(true);
        // Without apiKey, permissions should NOT be 600 (default is typically 644)
        if (process.platform !== 'win32') {
          const stats = fs.statSync(filePath);
          const mode = (stats.mode & 0o777).toString(8);
          expect(mode).not.toBe('600');
        }
      } finally {
        process.chdir(origCwd);
      }
    });
  });
});
