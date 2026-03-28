import { COPY } from "@/lib/brand";
import { Layers, ArrowLeftRight, ShieldCheck, Sparkles } from "lucide-react";

const ICONS = [Layers, ArrowLeftRight, ShieldCheck, Sparkles];

export function ValuePropsSection() {
  return (
    <section
      id="features"
      className="py-12 md:py-16 lg:py-20"
      aria-labelledby="value-props-heading"
    >
      <div className="container mx-auto px-4 md:px-6">
        <h2
          id="value-props-heading"
          className="font-display text-center text-2xl font-bold text-foreground sm:text-3xl md:text-4xl"
        >
          {COPY.featuresSectionTitle}
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-muted-foreground md:text-lg md:leading-relaxed">
          {COPY.featuresSectionSubtitle}
        </p>
        <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {COPY.valueProps.map((prop, i) => {
            const Icon = ICONS[i] ?? Layers;
            return (
              <div
                key={prop.title}
                className="flex flex-col items-center rounded-xl border bg-card p-6 text-center shadow-sm transition-shadow hover:shadow-md md:items-start md:text-left"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="mt-4 font-display font-semibold text-foreground">
                  {prop.title}
                </h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  {prop.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
