import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, RefreshCw, Clock, ChevronDown, ChevronRight, Shield, Check, AlertTriangle, XCircle } from "lucide-react";
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
      {healthTests && (() => {
        const passCount = healthTests.tests.filter((t) => t.score === "pass").length;
        const warnCount = healthTests.tests.filter((t) => t.score === "warn").length;
        const failCount = healthTests.tests.filter((t) => t.score === "fail").length;
        const scoreColor = healthTests.overallScore >= 70
          ? "text-emerald-600 dark:text-emerald-400"
          : healthTests.overallScore >= 40
            ? "text-amber-600 dark:text-amber-400"
            : "text-red-600 dark:text-red-400";
        const scoreBg = healthTests.overallScore >= 70
          ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200/60 dark:border-emerald-800/40"
          : healthTests.overallScore >= 40
            ? "bg-amber-50 dark:bg-amber-950/30 border-amber-200/60 dark:border-amber-800/40"
            : "bg-red-50 dark:bg-red-950/30 border-red-200/60 dark:border-red-800/40";

        return (
          <Card className="dash-section border-border/60">
            {/* ── Collapsed header ── */}
            <button
              onClick={() => setShowHealth(!showHealth)}
              className="w-full text-left"
            >
              <div className="flex items-center justify-between px-5 pt-4 pb-3">
                <div className="flex items-center gap-2">
                  <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-primary/10">
                    <Shield className="h-4 w-4 text-primary" />
                  </div>
                  <span className="text-base font-semibold">Financial Health Check</span>
                </div>

                <div className="flex items-center gap-3">
                  {/* Score pill */}
                  <div className={cn("flex items-center gap-2 px-3 py-1 rounded-full border text-sm font-semibold", scoreBg, scoreColor)}>
                    <span className="tabular-nums text-base font-bold">{healthTests.overallScore}</span>
                    <span className="text-xs opacity-60 font-normal">/ 100</span>
                    <span className="text-xs font-medium">· Grade {healthTests.grade}</span>
                  </div>

                  {/* Pass/warn/fail counts */}
                  <div className="hidden sm:flex items-center gap-2.5 text-xs">
                    <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                      <Check className="h-3 w-3" /> {passCount}
                    </span>
                    {warnCount > 0 && (
                      <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
                        <AlertTriangle className="h-3 w-3" /> {warnCount}
                      </span>
                    )}
                    {failCount > 0 && (
                      <span className="flex items-center gap-1 text-red-600 dark:text-red-400 font-medium">
                        <XCircle className="h-3 w-3" /> {failCount}
                      </span>
                    )}
                  </div>

                  {showHealth ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                </div>
              </div>

              {/* Summary bar always visible */}
              {!showHealth && (
                <div className="px-5 pb-3">
                  <div className="flex gap-0.5 h-1.5 w-full rounded-full overflow-hidden">
                    {passCount > 0 && <div className="bg-emerald-500 transition-all" style={{ width: `${(passCount / healthTests.tests.length) * 100}%` }} />}
                    {warnCount > 0 && <div className="bg-amber-500 transition-all" style={{ width: `${(warnCount / healthTests.tests.length) * 100}%` }} />}
                    {failCount > 0 && <div className="bg-red-500 transition-all" style={{ width: `${(failCount / healthTests.tests.length) * 100}%` }} />}
                  </div>
                  {healthTests.summary && (
                    <p className="text-sm text-muted-foreground leading-relaxed mt-2.5">{healthTests.summary}</p>
                  )}
                </div>
              )}
            </button>

            {/* ── Expanded content ── */}
            {showHealth && (
              <div className="px-5 pb-5 space-y-5 animate-in slide-in-from-top-1 duration-200">
                {/* Large speedometer gauge centered */}
                <div className="flex justify-center">
                  <HealthScoreGauge
                    score={healthTests.overallScore}
                    grade={healthTests.grade}
                    size={280}
                  />
                </div>

                {/* 3-column stat row */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-xl border border-emerald-200/50 dark:border-emerald-800/40 bg-emerald-50/60 dark:bg-emerald-950/20 p-3 text-center">
                    <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{passCount}</p>
                    <p className="text-xs font-medium text-emerald-700 dark:text-emerald-500 mt-0.5">Passed</p>
                  </div>
                  <div className="rounded-xl border border-amber-200/50 dark:border-amber-800/40 bg-amber-50/60 dark:bg-amber-950/20 p-3 text-center">
                    <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 tabular-nums">{warnCount}</p>
                    <p className="text-xs font-medium text-amber-700 dark:text-amber-500 mt-0.5">Warnings</p>
                  </div>
                  <div className="rounded-xl border border-red-200/50 dark:border-red-800/40 bg-red-50/60 dark:bg-red-950/20 p-3 text-center">
                    <p className="text-2xl font-bold text-red-600 dark:text-red-400 tabular-nums">{failCount}</p>
                    <p className="text-xs font-medium text-red-700 dark:text-red-500 mt-0.5">Failed</p>
                  </div>
                </div>

                {/* Detailed test results */}
                <HealthTestResults
                  tests={healthTests.tests}
                  summary={healthTests.summary}
                />
              </div>
            )}
          </Card>
        );
      })()}
    </div>
  );
}
