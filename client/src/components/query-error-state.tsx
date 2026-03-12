import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function QueryErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <Card>
      <CardContent className="py-8 text-center">
        <p className="text-muted-foreground mb-4">{message}</p>
        <Button onClick={onRetry}>Retry</Button>
      </CardContent>
    </Card>
  );
}
