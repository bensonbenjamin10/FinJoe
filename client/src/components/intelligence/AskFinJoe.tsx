import { useState, useRef, useCallback } from "react";
import { Send, Loader2, X, BarChart3, PieChart, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  BarChart,
  Bar,
  PieChart as RechartsPie,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const CHART_COLORS = ["#0ea5e9", "#8b5cf6", "#f59e0b", "#ec4899", "#10b981", "#6366f1", "#f43f5e", "#14b8a6"];

type QAEntry = {
  question: string;
  answer: string;
  dataPoints?: Array<{ label: string; value: number }>;
  visualization?: "bar" | "pie" | "table" | null;
  followUpSuggestions?: string[];
};

const QUICK_CHIPS = [
  { label: "By Category", question: "Break down expenses by category for this period with trend analysis" },
  { label: "By Cost Center", question: "Compare spending across all cost centers for this period" },
  { label: "By Vendor", question: "Show vendor-wise expense distribution and concentration risk" },
  { label: "Trend Analysis", question: "What are the key expense and revenue trends over this period?" },
  { label: "Compare Periods", question: "How does this period compare to the previous period? What changed?" },
  { label: "Risk Summary", question: "What are the top financial risks I should be aware of right now?" },
];

function MiniChart({ dataPoints, type }: { dataPoints: Array<{ label: string; value: number }>; type: "bar" | "pie" | "table" }) {
  if (type === "table") {
    return (
      <div className="mt-2 rounded-lg border border-border/60 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/40">
              <th className="text-left px-3 py-1.5 font-medium">Item</th>
              <th className="text-right px-3 py-1.5 font-medium">Value</th>
            </tr>
          </thead>
          <tbody>
            {dataPoints.map((dp, i) => (
              <tr key={i} className="border-t border-border/40">
                <td className="px-3 py-1.5">{dp.label}</td>
                <td className="text-right px-3 py-1.5 tabular-nums">
                  {dp.value >= 100 ? `₹${dp.value.toLocaleString("en-IN")}` : dp.value.toFixed(1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (type === "pie") {
    return (
      <div className="mt-2 h-[180px]">
        <ResponsiveContainer width="100%" height="100%">
          <RechartsPie>
            <Pie
              data={dataPoints}
              dataKey="value"
              nameKey="label"
              cx="50%"
              cy="50%"
              outerRadius={70}
              label={({ label, percent }) => `${label} (${(percent * 100).toFixed(0)}%)`}
              labelLine={false}
              fontSize={10}
            >
              {dataPoints.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(v: number) => `₹${v.toLocaleString("en-IN")}`} />
          </RechartsPie>
        </ResponsiveContainer>
      </div>
    );
  }

  return (
    <div className="mt-2 h-[180px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={dataPoints} layout="vertical" margin={{ left: 80, right: 16, top: 4, bottom: 4 }}>
          <XAxis type="number" tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))} fontSize={10} />
          <YAxis type="category" dataKey="label" width={75} fontSize={10} />
          <Tooltip formatter={(v: number) => `₹${v.toLocaleString("en-IN")}`} />
          <Bar dataKey="value" radius={[0, 4, 4, 0]}>
            {dataPoints.map((_, i) => (
              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AskFinJoe({
  tenantId,
  startDate,
  endDate,
  costCenterId,
  className,
}: {
  tenantId: string;
  startDate: string;
  endDate: string;
  costCenterId?: string;
  className?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [history, setHistory] = useState<QAEntry[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const askQuestion = useCallback(
    async (q: string) => {
      if (!q.trim() || isLoading) return;
      setIsLoading(true);
      setQuestion("");

      try {
        const res = await fetch("/api/admin/analytics/ask", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question: q.trim(),
            tenantId,
            context: { startDate, endDate, costCenterId },
          }),
        });
        const data = await res.json();
        setHistory((prev) => [
          ...prev.slice(-4),
          {
            question: q.trim(),
            answer: data.answer ?? "Unable to generate an answer.",
            dataPoints: data.dataPoints,
            visualization: data.visualization,
            followUpSuggestions: data.followUpSuggestions,
          },
        ]);
        setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }), 100);
      } catch {
        setHistory((prev) => [
          ...prev.slice(-4),
          { question: q.trim(), answer: "Something went wrong. Please try again." },
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    [tenantId, startDate, endDate, costCenterId, isLoading],
  );

  if (!isOpen) {
    return (
      <button
        onClick={() => {
          setIsOpen(true);
          setTimeout(() => inputRef.current?.focus(), 100);
        }}
        className={cn(
          "w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-border/60 text-sm text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors",
          className,
        )}
      >
        <Send className="h-3.5 w-3.5" />
        Ask FinJoe about your finances...
      </button>
    );
  }

  return (
    <div className={cn("space-y-3 border-t border-border/60 pt-3", className)}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Ask FinJoe
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={() => {
            setIsOpen(false);
            setHistory([]);
            setQuestion("");
          }}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {QUICK_CHIPS.map((chip) => (
          <button
            key={chip.label}
            disabled={isLoading}
            onClick={() => askQuestion(chip.question)}
            className="shrink-0 text-xs px-2.5 py-1 rounded-full border border-border/60 text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors disabled:opacity-50"
          >
            {chip.label}
          </button>
        ))}
      </div>

      {history.length > 0 && (
        <div ref={scrollRef} className="max-h-[320px] overflow-y-auto space-y-3 scrollbar-thin">
          {history.map((entry, i) => (
            <div key={i} className="space-y-1.5">
              <p className="text-xs font-medium text-primary">{entry.question}</p>
              <p className="text-sm leading-relaxed">{entry.answer}</p>
              {entry.dataPoints && entry.dataPoints.length > 0 && entry.visualization && (
                <MiniChart dataPoints={entry.dataPoints} type={entry.visualization} />
              )}
              {entry.followUpSuggestions && entry.followUpSuggestions.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {entry.followUpSuggestions.map((s, j) => (
                    <button
                      key={j}
                      disabled={isLoading}
                      onClick={() => askQuestion(s)}
                      className="text-[11px] px-2 py-0.5 rounded-md bg-primary/5 text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Thinking...
            </div>
          )}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          askQuestion(question);
        }}
        className="flex gap-2"
      >
        <Input
          ref={inputRef}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask about your financial data..."
          className="flex-1 h-8 text-sm"
          disabled={isLoading}
        />
        <Button type="submit" size="sm" className="h-8 px-3" disabled={!question.trim() || isLoading}>
          {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
        </Button>
      </form>
    </div>
  );
}
