import { describe, it, expect, afterEach } from 'vitest';
import { createProvider } from '../../src/ai/providerFactory';
import { MockProvider } from '../helpers/mockProvider';

describe('createProvider', () => {
  const envVarsToSave = [
    'ANTHROPIC_API_KEY',
    'OPENAI_API_KEY',
    'SHIPGUARD_API_KEY',
  ];
  const savedEnv: Record<string, string | undefined> = {};

  // Save and clear env vars before tests that need clean state
  function clearApiEnv(): void {
    for (const key of envVarsToSave) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  }

  afterEach(() => {
    for (const key of envVarsToSave) {
      if (savedEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedEnv[key];
      }
    }
  });

  it('creates OllamaProvider (no API key needed)', () => {
    clearApiEnv();
    const provider = createProvider({ provider: 'ollama' });
    expect(provider.name).toBe('ollama');
  });

  it('creates ClaudeProvider with explicit apiKey', () => {
    clearApiEnv();
    const provider = createProvider({ provider: 'claude', apiKey: 'test-key-12345' });
    expect(provider.name).toBe('claude');
  });

  it('creates OpenAIProvider with explicit apiKey', () => {
    clearApiEnv();
    const provider = createProvider({ provider: 'openai', apiKey: 'test-key-12345' });
    expect(provider.name).toBe('openai');
  });

  it('throws for unknown provider', () => {
    clearApiEnv();
    expect(() => createProvider({ provider: 'nonexistent' as 'claude' })).toThrow();
  });

  it('throws when Claude provider has no API key', () => {
    clearApiEnv();
    expect(() => createProvider({ provider: 'claude' })).toThrow(/ANTHROPIC_API_KEY/);
  });
});

describe('MockProvider', () => {
  it('implements all required methods and returns expected shapes', async () => {
    const mock = new MockProvider();

    expect(mock.name).toBe('mock');
    expect(mock.model).toBe('mock-1.0');

    const scanResult = { critical: [], medium: [], low: [] };
    const review = await mock.reviewFindings(scanResult);
    expect(review).toHaveProperty('prioritizedRisks');
    expect(review).toHaveProperty('quickFixes');
    expect(review).toHaveProperty('shipReadiness');
    expect(Array.isArray(review.prioritizedRisks)).toBe(true);
    expect(Array.isArray(review.quickFixes)).toBe(true);

    const finding = {
      filePath: 'test.ts',
      line: 1,
      severity: 'medium' as const,
      message: 'test',
      ruleId: 'test',
      category: 'test',
    };
    const fix = await mock.generateFix(finding, 'const x = 1;');
    expect(fix).toHaveProperty('filePath');
    expect(fix).toHaveProperty('patch');
    expect(fix).toHaveProperty('description');
    expect(fix).toHaveProperty('confidence');
    expect(typeof fix.confidence).toBe('number');

    const chunks: string[] = [];
    const streamResult = await mock.streamResponse('test prompt', (chunk) => chunks.push(chunk));
    expect(typeof streamResult).toBe('string');
    expect(chunks.length).toBeGreaterThan(0);
  });

  it('token usage starts at 0', () => {
    const mock = new MockProvider();
    const usage = mock.getTokenUsage();
    expect(usage.input).toBe(0);
    expect(usage.output).toBe(0);
    expect(usage.cost).toBe(0);
  });
});
