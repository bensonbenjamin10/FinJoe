import { Check, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type ProgressStep = {
  step: number;
  totalSteps: number;
  label: string;
  status: "pending" | "running" | "done" | "error";
};

const ANALYSIS_STEPS = [
  "Aggregating financial data...",
  "Building MIS period slice...",
  "Running financial health tests...",
  "Generating intelligence brief...",
  "Analysis complete",
];

export function AnalysisProgress({
  currentStep,
  error,
}: {
  currentStep: number;
  error?: string;
}) {
  return (
    <div className="space-y-3 py-2">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
        Running Analysis
      </p>
      <div className="space-y-2.5">
        {ANALYSIS_STEPS.map((label, i) => {
          const stepNum = i + 1;
          const isActive = stepNum === currentStep;
          const isDone = stepNum < currentStep || (stepNum === ANALYSIS_STEPS.length && currentStep > ANALYSIS_STEPS.length);
          const isError = error && isActive;

          return (
            <div
              key={stepNum}
              className={cn(
                "flex items-center gap-3 text-sm transition-all duration-300",
                isDone && "text-muted-foreground",
                isActive && !isError && "text-primary font-medium",
                isError && "text-destructive font-medium",
                !isDone && !isActive && "text-muted-foreground/50",
              )}
            >
              <div className="shrink-0 flex items-center justify-center h-5 w-5">
                {isDone ? (
                  <div className="h-5 w-5 rounded-full bg-emerald-500/15 flex items-center justify-center">
                    <Check className="h-3 w-3 text-emerald-600" />
                  </div>
                ) : isError ? (
                  <AlertCircle className="h-4 w-4 text-destructive" />
                ) : isActive ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                ) : (
                  <div className="h-2 w-2 rounded-full bg-muted-foreground/30" />
                )}
              </div>
              <span>{label}</span>
            </div>
          );
        })}
      </div>
      {error && (
        <p className="text-xs text-destructive mt-2 pl-8">{error}</p>
      )}
    </div>
  );
}
