"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { TrendingDown, DollarSign, Zap, FileText } from "lucide-react";
import { TokenSavingsRecord, TokenSavingsStats, TimePeriod, SavingsDataPoint } from "@/types/savings";
import { SavingsService } from "@/services/savings/savings-service";
import { formatTokenCount, estimateCost } from "@/lib/utils/token-estimator";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";

export default function SavingsPage() {
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('all');
  const [records, setRecords] = useState<TokenSavingsRecord[]>([]);
  const [stats, setStats] = useState<TokenSavingsStats | null>(null);
  const [chartData, setChartData] = useState<SavingsDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState<string | null>(null);

  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    const loadUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: userData } = await supabase
          .from("users")
          .select("org_id")
          .eq("id", user.id)
          .single();

        if (userData?.org_id) {
          setOrgId(userData.org_id);
        } else {
          setLoading(false);
        }
      } else {
        router.push('/login');
      }
    };

    loadUser();
  }, [supabase, router]);

  useEffect(() => {
    const loadSavingsData = async () => {
      if (!orgId) return;

      setLoading(true);

      try {
        const service = new SavingsService(supabase);
        const fetchedRecords = await service.getSavingsRecords(orgId, timePeriod);

        setRecords(fetchedRecords);

        const totalSaved = fetchedRecords.reduce((sum, r) => sum + r.savedTokens, 0);
        const totalQueries = fetchedRecords.length;
        const averageSavings = totalQueries > 0 ? Math.round(totalSaved / totalQueries) : 0;
        const averagePercentage = totalQueries > 0
          ? Math.round(fetchedRecords.reduce((sum, r) => sum + r.savingsPercentage, 0) / totalQueries)
          : 0;

        setStats({
          totalSaved,
          totalQueries,
          averageSavings,
          averagePercentage,
          estimatedCostSaved: estimateCost(totalSaved),
          period: timePeriod,
        });

        setChartData(service.generateChartData(fetchedRecords));
      } catch (error) {
        console.error('Error loading savings data:', error);
        setRecords([]);
        setStats({
          totalSaved: 0,
          totalQueries: 0,
          averageSavings: 0,
          averagePercentage: 0,
          estimatedCostSaved: 0,
          period: timePeriod,
        });
        setChartData([]);
      } finally {
        setLoading(false);
      }
    };

    if (orgId) {
      loadSavingsData();
    }
  }, [timePeriod, orgId, supabase]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Spinner className="text-foreground" />
      </div>
    );
  }

  return (
    <div>
      {/* Period Selector */}
        <div className="flex items-center gap-2 mb-8">
          {(['today', 'week', 'month', 'all'] as TimePeriod[]).map((period) => (
            <Button
              key={period}
              variant={timePeriod === period ? "default" : "secondary"}
              size="sm"
              onClick={() => setTimePeriod(period)}
            >
              {period === 'today' ? 'Today' : period === 'week' ? '7 days' : period === 'month' ? '30 days' : 'All time'}
            </Button>
          ))}
        </div>

        {/* Stats Grid */}
        {stats && (
          <div
            className="grid gap-4 mb-8"
            style={{
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            }}
          >
            <Card className="p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-muted">
                  <Zap className="w-4 h-4 text-muted-foreground" />
                </div>
              </div>
              <div className="text-2xl font-bold text-foreground mb-1">
                {formatTokenCount(stats.totalSaved)}
              </div>
              <div className="text-sm text-muted-foreground">tokens saved</div>
            </Card>

            <Card className="p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-muted">
                  <TrendingDown className="w-4 h-4 text-muted-foreground" />
                </div>
              </div>
              <div className="text-2xl font-bold text-foreground mb-1">
                {stats.averagePercentage}%
              </div>
              <div className="text-sm text-muted-foreground">avg reduction</div>
            </Card>

            <Card className="p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-muted">
                  <DollarSign className="w-4 h-4 text-muted-foreground" />
                </div>
              </div>
              <div className="text-2xl font-bold text-foreground mb-1">
                ${stats.estimatedCostSaved.toFixed(2)}
              </div>
              <div className="text-sm text-muted-foreground">cost saved</div>
            </Card>

            <Card className="p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-muted">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                </div>
              </div>
              <div className="text-2xl font-bold text-foreground mb-1">
                {stats.totalQueries}
              </div>
              <div className="text-sm text-muted-foreground">queries</div>
            </Card>
          </div>
        )}

        {/* Chart */}
        {chartData.length > 0 && (
          <Card className="mb-8 p-6">
            <h3 className="text-sm font-medium text-foreground mb-4">Savings over time</h3>
            <div className="flex items-end gap-1 h-24">
              {chartData.map((point, index) => {
                const maxSaved = Math.max(...chartData.map(d => d.saved));
                const height = maxSaved > 0 ? (point.saved / maxSaved) * 100 : 0;
                return (
                  <div
                    key={index}
                    className="flex-1 bg-foreground hover:bg-foreground/80 transition-colors cursor-pointer"
                    style={{ height: `${Math.max(height, 4)}%` }}
                    title={`${formatTokenCount(point.saved)} tokens - ${new Date(point.date).toLocaleDateString()}`}
                  />
                );
              })}
            </div>
          </Card>
        )}

        {/* Recent Queries */}
        <div>
          <h3 className="text-sm font-medium text-foreground mb-4">Recent queries</h3>
          <div className="space-y-3">
            {records.length > 0 ? (
              records.slice(0, 10).map((record) => (
                <Card key={record.id} className="p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate mb-1">
                        {record.query}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>
                          {new Date(record.createdAt).toLocaleDateString('en-US', {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                        {record.documentTitle && (
                          <>
                            <span className="text-border">•</span>
                            <span className="truncate">{record.documentTitle}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <div className="text-sm font-medium text-foreground">
                          -{formatTokenCount(record.savedTokens)}
                        </div>
                      </div>
                      <Badge variant="secondary">
                        {record.savingsPercentage}%
                      </Badge>
                    </div>
                  </div>
                </Card>
              ))
            ) : (
              <Card className="p-12 border-dashed text-center">
                <div className="w-12 h-12 mx-auto mb-4 bg-muted flex items-center justify-center">
                  <FileText className="w-6 h-6 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-foreground mb-1">No queries yet</p>
                <p className="text-sm text-muted-foreground">
                  Start using Brief with your AI agent to see savings
                </p>
              </Card>
            )}
          </div>
        </div>
    </div>
  );
}
