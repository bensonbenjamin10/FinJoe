import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, RefreshCw, Clock, AlertTriangle, ChevronDown, ChevronRight, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { AnalysisProgress } from "./AnalysisProgress";
import { AskFinJoe } from "./AskFinJoe";
import { HealthScoreGauge } from "./HealthScoreGauge";
import { HealthTestResults } from "./HealthTestResults";
import type { CfoStructuredInsightResult, FinancialHealthReport } from "../../../../lib/cfo-insight-types";

type InsightsResponse = {
  insights: string | null;
  insight: CfoStructuredInsightResult | null;
  facts: Record<string, unknown>;
  healthTests?: FinancialHealthReport | null;
  snapshotAge: number;
  snapshotId?: string;
};

function formatAge(minutes: number): string {
  if (minutes < 1) return "Updated just now";
  if (minutes < 60) return `Updated ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Updated ${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `Updated ${days}d ago`;
}

export function IntelligenceBrief({
  tenantId,
  startDate,
  endDate,
  costCenterId,
  granularity,
  className,
}: {
  tenantId: string;
  startDate: string;
  endDate: string;
  costCenterId?: string;
  granularity?: string;
  className?: string;
}) {
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [streamStep, setStreamStep] = useState(0);
  const [streamError, setStreamError] = useState<string>();
  const [showHealth, setShowHealth] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const params = new URLSearchParams();
  params.append("tenantId", tenantId);
  params.append("startDate", startDate);
  params.append("endDate", endDate);
  if (granularity) params.append("granularity", granularity);
  if (costCenterId) params.append("costCenterId", costCenterId);

  const queryKey = ["/api/admin/analytics/insights", params.toString()];

  const { data: insights, isLoading } = useQuery<InsightsResponse>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(`/api/admin/analytics/insights?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const refreshAnalysis = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    setStreamStep(1);
    setStreamError(undefined);

    abortRef.current = new AbortController();

    try {
      const streamParams = new URLSearchParams(params);
      const res = await fetch(`/api/admin/analytics/insights/stream?${streamParams.toString()}`, {
        credentials: "include",
        signal: abortRef.current.signal,
      });

      if (!res.ok) throw new Error("Stream request failed");

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No stream reader");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.step > 0) setStreamStep(event.step);
            if (event.status === "done" && event.data) {
              queryClient.setQueryData(queryKey, {
                ...event.data,
                snapshotAge: 0,
              });
            }
            if (event.status === "error") {
              setStreamError(event.error ?? "Analysis failed");
            }
          } catch {
            // skip malformed SSE
          }
        }
      }
    } catch (e: any) {
      if (e.name !== "AbortError") {
        setStreamError("Connection lost. Try again.");
      }
    } finally {
      setIsRefreshing(false);
      setStreamStep(0);
    }
  }, [isRefreshing, params, queryClient, queryKey]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const hasContent = insights?.insight?.narrative || insights?.insights;
  const isStale = (insights?.snapshotAge ?? 0) > 1440;
  const healthTests = insights?.healthTests;

  if (!isLoading && !hasContent && !isRefreshing) return null;

  return (
    <div className={cn("space-y-4", className)}>
      {/* Intelligence Brief Card */}
      <Card className="dash-section border-primary/20 bg-gradient-to-br from-primary/[0.03] to-transparent">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-primary/10">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              FinJoe Intelligence Brief
            </CardTitle>
            <div className="flex items-center gap-2">
              {insights && !isRefreshing && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {formatAge(insights.snapshotAge ?? 0)}
                  {isStale && (
                    <span className="ml-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                      Outdated
                    </span>
                  )}
                </span>
              )}
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={refreshAnalysis}
                disabled={isRefreshing}
              >
                <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
                {isRefreshing ? "Analyzing..." : "Refresh Analysis"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isRefreshing ? (
            <AnalysisProgress currentStep={streamStep} error={streamError} />
          ) : isLoading ? (
            <div className="space-y-2">
              <div className="h-4 w-full bg-muted/60 rounded animate-pulse" />
              <div className="h-4 w-5/6 bg-muted/60 rounded animate-pulse" />
              <div className="h-4 w-3/4 bg-muted/60 rounded animate-pulse" />
            </div>
          ) : hasContent ? (
            <>
              <p className="text-sm leading-relaxed">
                {insights!.insight?.narrative ?? insights!.insights}
              </p>
              {insights!.insight?.keyPoints && insights!.insight.keyPoints.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Key Highlights
                  </p>
                  <ul className="text-sm list-disc pl-5 space-y-1">
                    {insights!.insight.keyPoints.map((k, i) => (
                      <li key={i}>{k}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                {insights!.insight?.risks && insights!.insight.risks.length > 0 && (
                  <div className="rounded-lg border border-amber-200/50 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-950/20 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400 mb-2">
                      Risks
                    </p>
                    <ul className="text-sm space-y-1.5">
                      {insights!.insight.risks.map((k, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span className="text-amber-500 mt-0.5 shrink-0">•</span>
                          <span>{k}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {insights!.insight?.suggestedActions && insights!.insight.suggestedActions.length > 0 && (
                  <div className="rounded-lg border border-emerald-200/50 dark:border-emerald-800/50 bg-emerald-50/50 dark:bg-emerald-950/20 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 mb-2">
                      Suggested Actions
                    </p>
                    <ul className="text-sm space-y-1.5">
                      {insights!.insight.suggestedActions.map((k, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span className="text-emerald-500 mt-0.5 shrink-0">•</span>
                          <span>{k}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Ask FinJoe */}
              <AskFinJoe
                tenantId={tenantId}
                startDate={startDate}
                endDate={endDate}
                costCenterId={costCenterId}
              />
            </>
          ) : (
            <div className="text-center py-4 space-y-2">
              <p className="text-sm text-muted-foreground">
                No analysis available yet for this period.
              </p>
              <Button
                variant="default"
                size="sm"
                className="gap-1.5"
                onClick={refreshAnalysis}
                disabled={isRefreshing}
              >
                <Sparkles className="h-3.5 w-3.5" />
                Run Analysis
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Financial Health Check Card */}
      {healthTests && (
        <Card className="dash-section border-border/60">
          <CardHeader className="pb-3">
            <button
              onClick={() => setShowHealth(!showHealth)}
              className="flex items-center justify-between w-full text-left"
            >
              <CardTitle className="flex items-center gap-2 text-lg">
                <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-primary/10">
                  <Shield className="h-4 w-4 text-primary" />
                </div>
                Financial Health Check
              </CardTitle>
              <div className="flex items-center gap-3">
                <HealthScoreGauge
                  score={healthTests.overallScore}
                  grade={healthTests.grade}
                  size={48}
                  className="[&>div:last-child]:hidden"
                />
                {showHealth ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </button>
          </CardHeader>
          {showHealth && (
            <CardContent className="pt-0 space-y-4">
              <div className="flex flex-col sm:flex-row gap-6 items-start">
                <HealthScoreGauge
                  score={healthTests.overallScore}
                  grade={healthTests.grade}
                  size={120}
                />
                <div className="flex-1">
                  <HealthTestResults
                    tests={healthTests.tests}
                    summary={healthTests.summary}
                  />
                </div>
              </div>
            </CardContent>
          )}
          {!showHealth && healthTests.summary && (
            <CardContent className="pt-0">
              <HealthTestResults
                tests={healthTests.tests}
                summary={healthTests.summary}
                compact
              />
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}
