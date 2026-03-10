import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { LinkButton } from "@/components/link-button";
import { Badge } from "@/components/ui/badge";
import { Check } from "lucide-react";
import { Link } from "wouter";
import type { Program } from "@shared/schema";

interface ProgramCardProps {
  program: Program;
  featured?: boolean;
}

export function ProgramCard({ program, featured }: ProgramCardProps) {
  return (
    <Card className={`h-full flex flex-col ${featured ? 'border-primary shadow-lg' : ''}`} data-testid={`card-program-${program.slug}`}>
      {featured && (
        <div className="bg-primary text-primary-foreground text-center py-2 text-sm font-semibold rounded-t-lg">
          Most Popular
        </div>
      )}
      <CardHeader>
        <CardTitle className="text-2xl">{program.name}</CardTitle>
        <p className="text-sm text-muted-foreground mt-2">{program.description}</p>
      </CardHeader>
      <CardContent className="flex-1 space-y-4">
        <div className="space-y-1">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-foreground">₹{(program.fee / 1000).toFixed(0)}k</span>
            <span className="text-sm text-muted-foreground">/ {program.duration}</span>
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-sm font-semibold text-foreground">Key Features:</div>
          <ul className="space-y-2">
            {program.features.slice(0, 5).map((feature, index) => (
              <li key={index} className="flex items-start gap-2 text-sm">
                <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                <span className="text-card-foreground">{feature}</span>
              </li>
            ))}
          </ul>
        </div>

        <Badge variant="secondary" className="text-xs">
          {program.schedule}
        </Badge>
      </CardContent>
      <CardFooter className="flex flex-col gap-2">
        <LinkButton 
          href={`/program/${program.slug}`}
          variant="outline" 
          className="w-full" 
          data-testid={`button-learn-more-${program.slug}`}
        >
          Learn More
        </LinkButton>
        <LinkButton 
          href={`/register?program=${program.id}`}
          className="w-full" 
          data-testid={`button-register-${program.slug}`}
        >
          Register Now
        </LinkButton>
      </CardFooter>
    </Card>
  );
}
