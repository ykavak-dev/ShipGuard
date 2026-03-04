import { AIProvider } from '../../src/ai/providers/base';
import type { ScanResult, Finding } from '../../src/core/scanner';
import type { AIReviewResult } from '../../src/ai/aiReview';
import type { AIFixSuggestion } from '../../src/ai/providers/base';

export class MockProvider extends AIProvider {
  readonly name = 'mock';
  readonly model = 'mock-1.0';

  async reviewFindings(_scanResults: ScanResult): Promise<AIReviewResult> {
    return {
      prioritizedRisks: ['Mock risk 1'],
      quickFixes: ['Mock fix 1'],
      shipReadiness: 'Ready to ship (mock)',
    };
  }

  async generateFix(_finding: Finding, _fileContent: string): Promise<AIFixSuggestion> {
    return {
      filePath: 'mock/file.ts',
      patch: '--- a/mock\n+++ b/mock\n@@ -1 +1 @@\n-old\n+new',
      description: 'Mock fix description',
      confidence: 0.95,
      testSuggestion: 'Test the mock fix',
    };
  }

  async streamResponse(_prompt: string, onChunk: (chunk: string) => void): Promise<string> {
    const response = 'Mock streaming response';
    onChunk(response);
    return response;
  }
}
