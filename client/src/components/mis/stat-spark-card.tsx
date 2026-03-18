import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface StatSparkCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  sparkData?: number[];
  trend?: number;
  trendLabel?: string;
  accentColor?: string;
}

function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  if (!data.length) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const h = 32;
  const w = 80;
  const step = w / Math.max(data.length - 1, 1);
  const points = data.map((v, i) => {
    const x = i * step;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return `${x},${y}`;
  });
  const pathD = `M ${points.join(" L ")}`;
  const fillPoints = [...points, `${w},${h}`, `0,${h}`].join(" ");

  return (
    <svg width={w} height={h} className="shrink-0">
      <defs>
        <linearGradient id={`spark-grad-${color}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0.02} />
        </linearGradient>
      </defs>
      <polygon points={fillPoints} fill={`url(#spark-grad-${color})`} />
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function StatSparkCard({
  icon: Icon,
  label,
  value,
  sparkData,
  trend,
  trendLabel,
  accentColor = "hsl(174, 84%, 32%)",
}: StatSparkCardProps) {
  const TrendIcon = trend !== undefined && trend > 0 ? TrendingUp : trend !== undefined && trend < 0 ? TrendingDown : Minus;

  return (
    <Card className="relative overflow-hidden group hover:shadow-md transition-shadow duration-200">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <div
                className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ backgroundColor: `color-mix(in srgb, ${accentColor} 15%, transparent)` }}
              >
                <Icon className="h-4 w-4" style={{ color: accentColor }} />
              </div>
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider truncate">
                {label}
              </span>
            </div>
            <div className="text-2xl font-bold tracking-tight text-foreground tabular-nums">
              {value}
            </div>
            {trend !== undefined && (
              <div className="mt-1.5 flex items-center gap-1.5">
                <span
                  className={cn(
                    "inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-full",
                    trend > 0
                      ? "text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/50"
                      : trend < 0
                        ? "text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-950/50"
                        : "text-muted-foreground bg-muted"
                  )}
                >
                  <TrendIcon className="h-3 w-3" />
                  {trend > 0 ? "+" : ""}{trend.toFixed(1)}%
                </span>
                {trendLabel && (
                  <span className="text-xs text-muted-foreground">{trendLabel}</span>
                )}
              </div>
            )}
          </div>
          {sparkData && sparkData.length > 1 && (
            <div className="pt-1">
              <MiniSparkline data={sparkData} color={accentColor} />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
