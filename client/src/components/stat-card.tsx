import { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown } from "lucide-react";

interface StatCardProps {
  icon: LucideIcon;
  value: string;
  label: string;
  testId?: string;
  /** Optional sparkline data (e.g. last 7 values) */
  sparklineData?: number[];
  /** Trend percentage vs previous period (e.g. 12.5 for +12.5%) */
  trend?: number;
  /** Comparison text (e.g. "vs last 30 days") */
  comparison?: string;
}

export function StatCard({ icon: Icon, value, label, testId, sparklineData, trend, comparison }: StatCardProps) {
  return (
    <Card className="text-center" data-testid={testId}>
      <CardContent className="pt-6 pb-6">
        <Icon className="h-10 w-10 text-primary mx-auto mb-3" />
        <div className="text-3xl font-bold text-foreground mb-1">{value}</div>
        <div className="text-sm text-muted-foreground">{label}</div>
        {(trend !== undefined || comparison || (sparklineData && sparklineData.length > 0)) && (
          <div className="mt-2 flex items-center justify-center gap-1.5 text-xs">
            {trend !== undefined && (
              <span
                className={cn(
                  "flex items-center gap-0.5 font-medium",
                  trend > 0 ? "text-green-600 dark:text-green-500" : trend < 0 ? "text-red-600 dark:text-red-500" : "text-muted-foreground"
                )}
              >
                {trend > 0 ? <TrendingUp className="h-3 w-3" /> : trend < 0 ? <TrendingDown className="h-3 w-3" /> : null}
                {trend > 0 ? "+" : ""}
                {trend.toFixed(1)}%
              </span>
            )}
            {comparison && <span className="text-muted-foreground">{comparison}</span>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
