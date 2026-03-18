import { useState, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight } from "lucide-react";

// ── Types ──

export type MISRowType = "header" | "section" | "data" | "total" | "percentage" | "spacer";

export interface MISRow {
  id: string;
  label: string;
  values: number[];
  fyTotal?: number;
  type: MISRowType;
  section?: string;
  indent?: number;
  categorySlug?: string;
  transactionType?: "expense" | "income";
}

interface MISTableProps {
  months: string[];
  fyLabel: string;
  rows: MISRow[];
  onCellClick?: (row: MISRow, monthIdx: number) => void;
  numberFormat?: "indian" | "standard";
}

// ── Number formatting ──

function formatIndian(n: number): string {
  const abs = Math.abs(n);
  const neg = n < 0 ? "-" : "";
  if (abs >= 10000000) return `${neg}${(abs / 10000000).toFixed(2)} Cr`;
  if (abs >= 100000) return `${neg}${(abs / 100000).toFixed(2)} L`;
  return `${neg}${abs.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function formatStandard(n: number): string {
  return n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function formatPct(n: number): string {
  return `${(n * 100).toFixed(0)}%`;
}

export function MISTable({
  months,
  fyLabel,
  rows,
  onCellClick,
  numberFormat = "standard",
}: MISTableProps) {
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);
  const [hoveredCol, setHoveredCol] = useState<number | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  const fmt = numberFormat === "indian" ? formatIndian : formatStandard;

  const toggleSection = useCallback((section: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  }, []);

  const visibleRows = rows.filter((row) => {
    if (!row.section) return true;
    if (row.type === "section") return true;
    return !collapsedSections.has(row.section);
  });

  return (
    <div
      ref={tableRef}
      className="relative overflow-auto rounded-xl border border-border bg-card shadow-sm"
      style={{ maxHeight: "75vh" }}
    >
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-20">
          <tr className="bg-gradient-to-r from-primary/95 to-primary/85 text-primary-foreground">
            <th className="sticky left-0 z-30 bg-primary text-left px-4 py-3 font-semibold min-w-[280px] max-w-[340px] border-r border-primary-foreground/20">
              Particulars
            </th>
            {months.map((m, i) => (
              <th
                key={m}
                className={cn(
                  "text-right px-3 py-3 font-medium min-w-[110px] whitespace-nowrap",
                  hoveredCol === i && "bg-primary-foreground/10"
                )}
                onMouseEnter={() => setHoveredCol(i)}
                onMouseLeave={() => setHoveredCol(null)}
              >
                {m}
              </th>
            ))}
            <th className="text-right px-4 py-3 font-semibold min-w-[130px] bg-primary-foreground/5 border-l border-primary-foreground/20">
              {fyLabel}
            </th>
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row, ri) => {
            if (row.type === "spacer") {
              return (
                <tr key={row.id} className="h-3">
                  <td colSpan={months.length + 2} className="bg-card" />
                </tr>
              );
            }

            const isSection = row.type === "section";
            const isTotal = row.type === "total";
            const isPct = row.type === "percentage";
            const isCollapsed = isSection && row.section && collapsedSections.has(row.section);

            return (
              <tr
                key={row.id}
                className={cn(
                  "transition-colors duration-75",
                  isSection && "bg-muted/70 cursor-pointer hover:bg-muted",
                  isTotal && "bg-muted/40 font-semibold border-t-2 border-border",
                  isPct && "text-muted-foreground italic",
                  !isSection && !isTotal && !isPct && "hover:bg-muted/30",
                  hoveredRow === ri && !isSection && "bg-muted/30"
                )}
                onMouseEnter={() => setHoveredRow(ri)}
                onMouseLeave={() => setHoveredRow(null)}
                onClick={isSection && row.section ? () => toggleSection(row.section!) : undefined}
              >
                <td
                  className={cn(
                    "sticky left-0 z-10 px-4 py-2.5 border-r border-border whitespace-nowrap",
                    isSection && "bg-muted/70 font-semibold text-foreground",
                    isTotal && "bg-muted/40 font-semibold",
                    isPct && "bg-card",
                    !isSection && !isTotal && !isPct && "bg-card",
                    hoveredRow === ri && !isSection && !isTotal && "bg-muted/30"
                  )}
                  style={{ paddingLeft: row.indent ? `${16 + row.indent * 16}px` : undefined }}
                >
                  <div className="flex items-center gap-1.5">
                    {isSection && (
                      <span className="text-muted-foreground">
                        {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      </span>
                    )}
                    <span className="truncate">{row.label}</span>
                  </div>
                </td>
                {row.values.map((val, ci) => (
                  <td
                    key={ci}
                    className={cn(
                      "text-right px-3 py-2.5 tabular-nums whitespace-nowrap",
                      val < 0 && "text-red-600 dark:text-red-400",
                      hoveredCol === ci && "bg-muted/20",
                      hoveredRow === ri && hoveredCol === ci && "bg-primary/10 ring-1 ring-inset ring-primary/30 rounded-sm",
                      onCellClick && row.categorySlug && "cursor-pointer hover:underline"
                    )}
                    onMouseEnter={() => setHoveredCol(ci)}
                    onMouseLeave={() => setHoveredCol(null)}
                    onClick={
                      onCellClick && row.categorySlug
                        ? () => onCellClick(row, ci)
                        : undefined
                    }
                  >
                    {val === 0 && !isTotal ? (
                      <span className="text-muted-foreground/40">&mdash;</span>
                    ) : isPct ? (
                      formatPct(val)
                    ) : (
                      fmt(val)
                    )}
                  </td>
                ))}
                <td
                  className={cn(
                    "text-right px-4 py-2.5 tabular-nums font-medium whitespace-nowrap bg-muted/10 border-l border-border",
                    (row.fyTotal ?? 0) < 0 && "text-red-600 dark:text-red-400",
                    isTotal && "font-bold"
                  )}
                >
                  {row.fyTotal !== undefined
                    ? isPct
                      ? ""
                      : fmt(row.fyTotal)
                    : ""}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
