import { cn } from "@/lib/utils";

function getScoreColor(score: number): string {
  if (score >= 70) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 40) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function getStrokeColor(score: number): string {
  if (score >= 70) return "#10b981";
  if (score >= 40) return "#f59e0b";
  return "#ef4444";
}

function getGradeLabel(grade: string): string {
  switch (grade) {
    case "A": return "Excellent";
    case "B": return "Good";
    case "C": return "Fair";
    case "D": return "Needs Attention";
    case "F": return "Critical";
    default: return grade;
  }
}

export function HealthScoreGauge({
  score,
  grade,
  size = 120,
  className,
}: {
  score: number;
  grade: string;
  size?: number;
  className?: string;
}) {
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(100, Math.max(0, score));
  const dashOffset = circumference - (progress / 100) * circumference;
  const center = size / 2;

  return (
    <div className={cn("flex flex-col items-center gap-1.5", className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          className="transform -rotate-90"
        >
          <circle
            cx={center}
            cy={center}
            r={radius}
            stroke="currentColor"
            strokeWidth={strokeWidth}
            fill="none"
            className="text-muted/30"
          />
          <circle
            cx={center}
            cy={center}
            r={radius}
            stroke={getStrokeColor(score)}
            strokeWidth={strokeWidth}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn("text-2xl font-bold tabular-nums", getScoreColor(score))}>
            {score}
          </span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            / 100
          </span>
        </div>
      </div>
      <div className="text-center">
        <span className={cn("text-sm font-semibold", getScoreColor(score))}>
          Grade {grade}
        </span>
        <span className="text-xs text-muted-foreground block">
          {getGradeLabel(grade)}
        </span>
      </div>
    </div>
  );
}
