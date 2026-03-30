import { SUPPORT_COPY } from "@/lib/brand";
import { Headphones, LogIn, Mail, Search } from "lucide-react";

const ICONS = [LogIn, Search, Mail, Headphones];

export function SupportFlowSection() {
  const steps = [...SUPPORT_COPY.flowSteps];
  return (
    <section className="border-b bg-muted/20 py-12 md:py-16 lg:py-20" aria-labelledby="support-flow-heading">
      <div className="container mx-auto px-4 md:px-6">
        <h2
          id="support-flow-heading"
          className="font-display text-center text-2xl font-bold text-foreground sm:text-3xl md:text-4xl"
        >
          {SUPPORT_COPY.flowTitle}
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-muted-foreground md:text-lg md:leading-relaxed">
          {SUPPORT_COPY.flowSubtitle}
        </p>
        <div className="mt-12 flex flex-col gap-8 md:flex-row md:items-stretch md:justify-center md:gap-4 lg:gap-6">
          {steps.map((item, i) => {
            const Icon = ICONS[i] ?? LogIn;
            return (
              <div
                key={item.step}
                className="relative flex flex-1 flex-col items-center rounded-xl border bg-card p-6 text-center shadow-sm md:max-w-[260px]"
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Icon className="h-7 w-7" />
                </div>
                <span className="mt-4 text-sm font-medium text-primary">Step {item.step}</span>
                <h3 className="mt-2 font-display font-semibold text-foreground">{item.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{item.description}</p>
                {i < steps.length - 1 && (
                  <div className="absolute -right-3 top-1/2 hidden -translate-y-1/2 text-muted-foreground/50 md:block lg:-right-5">
                    <svg className="h-6 w-6 lg:h-8 lg:w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
