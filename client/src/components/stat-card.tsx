import { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface StatCardProps {
  icon: LucideIcon;
  value: string;
  label: string;
  testId?: string;
}

export function StatCard({ icon: Icon, value, label, testId }: StatCardProps) {
  return (
    <Card className="text-center" data-testid={testId}>
      <CardContent className="pt-6 pb-6">
        <Icon className="h-10 w-10 text-primary mx-auto mb-3" />
        <div className="text-3xl font-bold text-foreground mb-1">{value}</div>
        <div className="text-sm text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  );
}
