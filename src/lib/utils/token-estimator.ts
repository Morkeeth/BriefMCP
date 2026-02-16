/**
 * Token estimation utilities
 * Uses approximation: 1 token ≈ 4 characters (standard for English text)
 */

export function estimateTokens(text: string): number {
  // Simple approximation: 1 token ≈ 4 characters
  // This is a rough estimate, actual tokenization varies by model
  return Math.ceil(text.length / 4);
}

export function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}K`;
  }
  return tokens.toLocaleString();
}

export function calculateSavings(baselineTokens: number, actualTokens: number): {
  saved: number;
  percentage: number;
} {
  const saved = Math.max(0, baselineTokens - actualTokens);
  const percentage = baselineTokens > 0 
    ? Math.round((saved / baselineTokens) * 100) 
    : 0;
  
  return { saved, percentage };
}

export function estimateCost(tokens: number, pricePer1KTokens: number = 0.002): number {
  // Default: $0.002 per 1K tokens (GPT-4o pricing approximation)
  return (tokens / 1000) * pricePer1KTokens;
}
