import { TokenSavingsRecord, SavingsDataPoint } from '@/types/savings';
import { calculateSavings } from '@/lib/utils/token-estimator';

// Mock data generator for development
export function generateMockSavingsRecords(count: number = 20): TokenSavingsRecord[] {
  const records: TokenSavingsRecord[] = [];
  const now = new Date();
  
  const sampleQueries = [
    "How do we handle authentication?",
    "What's our database schema?",
    "Explain the API endpoints",
    "How does the ingestion pipeline work?",
    "What are the security best practices?",
    "Describe the deployment process",
    "What's the error handling strategy?",
    "How do we manage user sessions?",
  ];
  
  for (let i = 0; i < count; i++) {
    const daysAgo = Math.floor(Math.random() * 30);
    const createdAt = new Date(now);
    createdAt.setDate(createdAt.getDate() - daysAgo);
    
    // Simulate realistic token usage
    const baselineTokens = Math.floor(Math.random() * 15000) + 5000; // 5K-20K tokens
    const actualTokens = Math.floor(baselineTokens * (0.05 + Math.random() * 0.15)); // 5-20% of baseline
    
    const { saved, percentage } = calculateSavings(baselineTokens, actualTokens);
    
    records.push({
      id: `record-${i}`,
      query: sampleQueries[i % sampleQueries.length],
      baselineTokens,
      actualTokens,
      savedTokens: saved,
      savingsPercentage: percentage,
      createdAt: createdAt.toISOString(),
      documentTitle: `Document ${Math.floor(Math.random() * 10) + 1}`,
    });
  }
  
  return records.sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function generateMockChartData(records: TokenSavingsRecord[]): SavingsDataPoint[] {
  const dataMap = new Map<string, { saved: number; queries: number }>();
  
  records.forEach(record => {
    const date = new Date(record.createdAt).toISOString().split('T')[0];
    const existing = dataMap.get(date) || { saved: 0, queries: 0 };
    dataMap.set(date, {
      saved: existing.saved + record.savedTokens,
      queries: existing.queries + 1,
    });
  });
  
  return Array.from(dataMap.entries())
    .map(([date, data]) => ({ date, ...data }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
