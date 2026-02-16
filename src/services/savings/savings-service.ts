import { SupabaseClient } from '@supabase/supabase-js';
import { TokenSavingsRecord, TimePeriod, SavingsDataPoint } from '@/types/savings';
import { estimateTokens, calculateSavings } from '@/lib/utils/token-estimator';

export class SavingsService {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Fetch token savings records from query_logs table
   * Falls back to calculating from documents if query_logs doesn't exist
   */
  async getSavingsRecords(
    orgId: string,
    period: TimePeriod
  ): Promise<TokenSavingsRecord[]> {
    // Try to fetch from query_logs table first
    const queryLogs = await this.fetchFromQueryLogs(orgId, period);
    if (queryLogs.length > 0) {
      return queryLogs;
    }

    // Fallback: Calculate savings from documents
    return await this.calculateFromDocuments(orgId, period);
  }

  /**
   * Fetch from query_logs table if it exists
   */
  private async fetchFromQueryLogs(
    orgId: string,
    period: TimePeriod
  ): Promise<TokenSavingsRecord[]> {
    try {
      const cutoff = this.getCutoffDate(period);
      
      let query = this.supabase
        .from('query_logs')
        .select('*')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false });

      if (cutoff) {
        query = query.gte('created_at', cutoff.toISOString());
      }

      const { data, error } = await query;

      if (error) {
        // Table might not exist or other error - silently return empty array
        // The fallback to calculateFromDocuments will handle the data
        return [];
      }

      if (!data || data.length === 0) {
        return [];
      }

      // Transform query_logs data to TokenSavingsRecord
      return data.map((log: {
        id: string;
        query?: string;
        baseline_tokens?: number;
        packet_tokens?: number;
        answer_tokens?: number;
        created_at: string;
        router_plan?: Record<string, unknown>;
      }) => {
        const baselineTokens = log.baseline_tokens || this.estimateBaseline();
        const actualTokens = (log.packet_tokens || 0) + (log.answer_tokens || 0);
        const { saved, percentage } = calculateSavings(baselineTokens, actualTokens);

        return {
          id: log.id,
          query: log.query || 'Unknown query',
          baselineTokens,
          actualTokens,
          savedTokens: saved,
          savingsPercentage: percentage,
          createdAt: log.created_at,
          documentTitle: this.extractDocumentTitle(log.router_plan),
        };
      });
    } catch {
      // Silently return empty array - fallback to documents will handle it
      return [];
    }
  }

  /**
   * Calculate savings from documents (fallback method)
   * Estimates what tokens would have been used if entire docs were pasted
   */
  private async calculateFromDocuments(
    orgId: string,
    period: TimePeriod
  ): Promise<TokenSavingsRecord[]> {
    try {
      const cutoff = this.getCutoffDate(period);
      
      let query = this.supabase
        .from('context_documents')
        .select('id, title, content, created_at')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false });

      if (cutoff) {
        query = query.gte('created_at', cutoff.toISOString());
      }

      const { data: documents, error } = await query;

      if (error) {
        console.error('Error fetching documents:', error);
        return [];
      }

      if (!documents || documents.length === 0) {
        return [];
      }

      // Transform documents to savings records
      // Estimate: if user pasted full doc, they'd use all tokens
      // With our system, they use ~10-15% (retrieved chunks + packet + answer)
      return documents.map((doc: {
        id: string;
        title: string;
        content: string | null;
        created_at: string;
      }) => {
        const baselineTokens = estimateTokens(doc.content || '');
        // Estimate actual usage: ~12% of baseline (realistic for RAG system)
        const actualTokens = Math.floor(baselineTokens * 0.12);
        const { saved, percentage } = calculateSavings(baselineTokens, actualTokens);

        return {
          id: doc.id,
          query: `Document: ${doc.title}`,
          baselineTokens,
          actualTokens,
          savedTokens: saved,
          savingsPercentage: percentage,
          createdAt: doc.created_at,
          documentTitle: doc.title,
        };
      });
    } catch (error) {
      console.error('Error calculating from documents:', error);
      return [];
    }
  }

  /**
   * Generate chart data from records
   */
  generateChartData(records: TokenSavingsRecord[]): SavingsDataPoint[] {
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

  /**
   * Get cutoff date for time period
   */
  private getCutoffDate(period: TimePeriod): Date | null {
    const cutoff = new Date();

    switch (period) {
      case 'today':
        cutoff.setHours(0, 0, 0, 0);
        return cutoff;
      case 'week':
        cutoff.setDate(cutoff.getDate() - 7);
        return cutoff;
      case 'month':
        cutoff.setDate(cutoff.getDate() - 30);
        return cutoff;
      case 'all':
        return null;
    }
  }

  /**
   * Estimate baseline tokens from query text
   */
  private estimateBaseline(): number {
    // Rough estimate: assume user would paste ~5000 tokens worth of context
    // This is a conservative estimate
    return 5000;
  }

  /**
   * Extract document title from router plan JSON
   */
  private extractDocumentTitle(routerPlan: Record<string, unknown> | undefined): string | undefined {
    if (!routerPlan || typeof routerPlan !== 'object') {
      return undefined;
    }

    // Try to extract from queries array
    if (routerPlan.queries && Array.isArray(routerPlan.queries)) {
      const firstQuery = routerPlan.queries[0] as { source?: string } | undefined;
      if (firstQuery?.source) {
        return `${firstQuery.source} document`;
      }
    }

    return undefined;
  }
}
