import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Quote } from "lucide-react";

interface TestimonialCardProps {
  name: string;
  rank: string;
  image?: string;
  quote: string;
  testId?: string;
}

export function TestimonialCard({ name, rank, image, quote, testId }: TestimonialCardProps) {
  const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  return (
    <Card className="h-full" data-testid={testId}>
      <CardContent className="pt-6 pb-6">
        <Quote className="h-8 w-8 text-primary/20 mb-4" />
        <p className="text-sm text-card-foreground mb-6 italic leading-relaxed">
          "{quote}"
        </p>
        <div className="flex items-center gap-3">
          <Avatar className="h-12 w-12">
            <AvatarImage src={image} alt={name} />
            <AvatarFallback className="bg-primary/10 text-primary font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="font-semibold text-foreground">{name}</div>
            <div className="text-sm text-muted-foreground">{rank}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
