import { COPY } from "@/lib/brand";
import { Check } from "lucide-react";

export function IntelligenceVisionSection() {
  return (
    <section
      id="intelligence"
      className="border-t bg-muted/15 py-12 md:py-16 lg:py-20"
      aria-labelledby="intelligence-heading"
    >
      <div className="container mx-auto px-4 md:px-6">
        <div className="mx-auto max-w-3xl text-center">
          <h2
            id="intelligence-heading"
            className="font-display text-2xl font-bold text-foreground sm:text-3xl md:text-4xl"
          >
            {COPY.intelligenceSectionTitle}
          </h2>
          <p className="mt-5 text-base text-muted-foreground sm:text-lg md:leading-relaxed">
            {COPY.intelligenceSectionLead}
          </p>
        </div>
        <ul className="mx-auto mt-10 max-w-2xl space-y-3">
          {COPY.intelligenceSectionPoints.map((point) => (
            <li
              key={point}
              className="flex gap-3 rounded-lg border bg-card/80 px-4 py-3 text-left text-sm text-foreground shadow-sm sm:text-base"
            >
              <Check className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
              <span className="leading-relaxed">{point}</span>
            </li>
          ))}
        </ul>
        <p className="mx-auto mt-8 max-w-xl text-center text-sm font-medium text-primary">
          {COPY.intelligenceRoadmapHint}
        </p>
      </div>
    </section>
  );
}
