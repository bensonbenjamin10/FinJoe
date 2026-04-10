import { useState } from "react";
import { Check, AlertTriangle, XCircle, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { HealthTestResult, HealthTestScore } from "../../../../lib/cfo-insight-types";

type CategoryGroup = {
  label: string;
  tests: HealthTestResult[];
  passPct: number;
};

const CATEGORY_LABELS: Record<string, string> = {
  liquidity: "Liquidity",
  profitability: "Profitability",
  efficiency: "Efficiency",
  concentration: "Concentration Risk",
  governance: "Governance",
  trend: "Trend Analysis",
  cashflow: "Cash Flow",
  anomaly: "Anomaly Detection",
};

function ScoreBadge({ score }: { score: HealthTestScore }) {
  if (score === "pass") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-2 py-0.5 rounded-full">
        <Check className="h-3 w-3" /> Pass
      </span>
    );
  }
  if (score === "warn") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-2 py-0.5 rounded-full">
        <AlertTriangle className="h-3 w-3" /> Warn
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-2 py-0.5 rounded-full">
      <XCircle className="h-3 w-3" /> Fail
    </span>
  );
}

function CategoryBar({ tests }: { tests: HealthTestResult[] }) {
  const pass = tests.filter((t) => t.score === "pass").length;
  const warn = tests.filter((t) => t.score === "warn").length;
  const fail = tests.filter((t) => t.score === "fail").length;
  const total = tests.length;

  return (
    <div className="flex gap-0.5 h-1.5 w-full rounded-full overflow-hidden">
      {pass > 0 && <div className="bg-emerald-500" style={{ width: `${(pass / total) * 100}%` }} />}
      {warn > 0 && <div className="bg-amber-500" style={{ width: `${(warn / total) * 100}%` }} />}
      {fail > 0 && <div className="bg-red-500" style={{ width: `${(fail / total) * 100}%` }} />}
    </div>
  );
}

function TestRow({ test }: { test: HealthTestResult }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b border-border/50 last:border-0">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 py-2 px-1 text-left hover:bg-muted/30 transition-colors rounded"
      >
        <div className="shrink-0">
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </div>
        <span className="flex-1 text-sm">{test.name}</span>
        <span className="text-xs text-muted-foreground tabular-nums mr-2">
          {test.formattedValue}
        </span>
        <ScoreBadge score={test.score} />
      </button>
      {expanded && (
        <div className="pl-8 pr-2 pb-2.5 space-y-1 animate-in slide-in-from-top-1 duration-200">
          <p className="text-xs text-muted-foreground">
            <span className="font-medium">Benchmark:</span> {test.benchmark}
          </p>
          <p className="text-sm">{test.interpretation}</p>
        </div>
      )}
    </div>
  );
}

export function HealthTestResults({
  tests,
  summary,
  compact = false,
}: {
  tests: HealthTestResult[];
  summary?: string;
  compact?: boolean;
}) {
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  const groups: CategoryGroup[] = Object.entries(
    tests.reduce(
      (acc, t) => {
        if (!acc[t.category]) acc[t.category] = [];
        acc[t.category].push(t);
        return acc;
      },
      {} as Record<string, HealthTestResult[]>,
    ),
  ).map(([cat, catTests]) => ({
    label: CATEGORY_LABELS[cat] ?? cat,
    tests: catTests,
    passPct: Math.round((catTests.filter((t) => t.score === "pass").length / catTests.length) * 100),
  }));

  if (compact) {
    const failCount = tests.filter((t) => t.score === "fail").length;
    const warnCount = tests.filter((t) => t.score === "warn").length;
    const passCount = tests.filter((t) => t.score === "pass").length;

    return (
      <div className="space-y-2">
        <div className="flex items-center gap-4 text-xs">
          <span className="text-emerald-600 dark:text-emerald-400 font-medium">{passCount} passed</span>
          {warnCount > 0 && (
            <span className="text-amber-600 dark:text-amber-400 font-medium">{warnCount} warnings</span>
          )}
          {failCount > 0 && (
            <span className="text-red-600 dark:text-red-400 font-medium">{failCount} failed</span>
          )}
        </div>
        <CategoryBar tests={tests} />
        {summary && <p className="text-sm leading-relaxed mt-2">{summary}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {summary && (
        <p className="text-sm leading-relaxed text-muted-foreground">{summary}</p>
      )}
      {groups.map((g) => {
        const isOpen = expandedCategory === g.label;
        return (
          <div key={g.label} className="rounded-lg border border-border/60">
            <button
              onClick={() => setExpandedCategory(isOpen ? null : g.label)}
              className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/30 transition-colors rounded-lg"
            >
              <div className="shrink-0">
                {isOpen ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
              <span className="flex-1 text-sm font-medium">{g.label}</span>
              <div className="w-20">
                <CategoryBar tests={g.tests} />
              </div>
              <span className={cn(
                "text-xs font-medium tabular-nums ml-2",
                g.passPct === 100 ? "text-emerald-600" : g.passPct >= 50 ? "text-amber-600" : "text-red-600",
              )}>
                {g.passPct}%
              </span>
            </button>
            {isOpen && (
              <div className="px-3 pb-2 animate-in slide-in-from-top-1 duration-200">
                {g.tests.map((t) => (
                  <TestRow key={t.id} test={t} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
