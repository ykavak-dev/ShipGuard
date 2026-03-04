export interface AIReviewResult {
  prioritizedRisks: string[];
  quickFixes: string[];
  shipReadiness: string;
}

interface OpenAIResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

export async function reviewWithAI(
  scanResults: unknown,
  options: {
    apiKey?: string;
    baseUrl?: string;
    model?: string;
  } = {}
): Promise<AIReviewResult> {
  const apiKey = options.apiKey || process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not provided');
  }

  const baseUrl = options.baseUrl || 'https://api.openai.com/v1';
  const model = options.model || 'gpt-5-mini';

  const systemPrompt = `You are a security review assistant. Analyze the provided scan results and respond ONLY with a JSON object in this exact format:
{
  "prioritizedRisks": ["risk 1", "risk 2", "risk 3"],
  "quickFixes": ["fix 1", "fix 2", "fix 3"],
  "shipReadiness": "One sentence summary"
}`;

  const userPrompt = `Given these repository risk findings, prioritize the top 3 critical risks, provide quick fixes under 30 minutes, and give a one-sentence ship readiness summary.

Scan Results:
${JSON.stringify(scanResults, null, 2)}`;

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 1000,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as OpenAIResponse;
  const content = data.choices[0]?.message?.content;

  if (!content) {
    throw new Error('Empty response from AI');
  }

  // Extract JSON from potential markdown code blocks
  const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/) ||
    content.match(/```\n?([\s\S]*?)\n?```/) || [null, content];

  const jsonContent = jsonMatch[1]?.trim() || content.trim();

  try {
    const parsed = JSON.parse(jsonContent) as AIReviewResult;
    return {
      prioritizedRisks: parsed.prioritizedRisks || [],
      quickFixes: parsed.quickFixes || [],
      shipReadiness: parsed.shipReadiness || 'Unable to determine ship readiness.',
    };
  } catch {
    // Fallback: return raw content as ship readiness if parsing fails
    return {
      prioritizedRisks: [],
      quickFixes: [],
      shipReadiness: content.substring(0, 200),
    };
  }
}
