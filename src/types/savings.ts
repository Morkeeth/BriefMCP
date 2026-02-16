export type TimePeriod = 'today' | 'week' | 'month' | 'all';

export interface TokenSavingsRecord {
  id: string;
  query: string;
  baselineTokens: number;
  actualTokens: number;
  savedTokens: number;
  savingsPercentage: number;
  createdAt: string;
  documentTitle?: string;
}

export interface TokenSavingsStats {
  totalSaved: number;
  totalQueries: number;
  averageSavings: number;
  averagePercentage: number;
  estimatedCostSaved: number;
  period: TimePeriod;
}

export interface SavingsDataPoint {
  date: string;
  saved: number;
  queries: number;
}
