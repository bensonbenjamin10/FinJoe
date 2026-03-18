import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

interface CellDrilldownProps {
  open: boolean;
  onClose: () => void;
  fy: string;
  type: "expense" | "income";
  categorySlug: string;
  monthIdx: number;
  monthLabel: string;
  label: string;
}

interface Transaction {
  id: string;
  amount: number;
  date: string;
  description: string;
  vendor: string;
  category: string;
  costCenter: string;
  status: string;
}

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "approved" || status === "recorded" || status === "paid") return "default";
  if (status === "pending_approval" || status === "submitted") return "secondary";
  if (status === "rejected") return "destructive";
  return "outline";
}

export function CellDrilldown({
  open,
  onClose,
  fy,
  type,
  categorySlug,
  monthIdx,
  monthLabel,
  label,
}: CellDrilldownProps) {
  const { data: transactions, isLoading } = useQuery<Transaction[]>({
    queryKey: ["/api/admin/mis/transactions", fy, type, categorySlug, monthIdx],
    queryFn: async () => {
      const params = new URLSearchParams({
        fy,
        type,
        categorySlug,
        monthIdx: String(monthIdx),
      });
      const res = await fetch(`/api/admin/mis/transactions?${params}`);
      if (!res.ok) throw new Error("Failed to fetch transactions");
      return res.json();
    },
    enabled: open && !!categorySlug,
  });

  const total = transactions?.reduce((s, t) => s + t.amount, 0) ?? 0;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <span>{label}</span>
            <Badge variant="outline" className="text-xs font-normal">
              {monthLabel}
            </Badge>
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-auto -mx-6 px-6">
          {isLoading ? (
            <div className="space-y-3 py-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : !transactions?.length ? (
            <div className="py-12 text-center text-muted-foreground">
              No transactions found for this period.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  {type === "expense" && <TableHead>Vendor</TableHead>}
                  <TableHead>Centre</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((txn) => (
                  <TableRow key={txn.id}>
                    <TableCell className="whitespace-nowrap text-xs">
                      {format(new Date(txn.date), "dd MMM yyyy")}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-xs">
                      {txn.description || txn.category}
                    </TableCell>
                    {type === "expense" && (
                      <TableCell className="text-xs">{txn.vendor || "—"}</TableCell>
                    )}
                    <TableCell className="text-xs">{txn.costCenter || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(txn.status)} className="text-[10px]">
                        {txn.status.replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium text-xs">
                      {txn.amount.toLocaleString("en-IN")}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-semibold bg-muted/30">
                  <TableCell colSpan={type === "expense" ? 5 : 4} className="text-right">
                    Total ({transactions.length} transactions)
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {total.toLocaleString("en-IN")}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
