import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { COPY } from "@/lib/brand";
import { LogIn, Sparkles } from "lucide-react";

export function HeroSection() {
  return (
    <section
      className="relative flex min-h-[70vh] md:min-h-[80vh] items-center justify-center overflow-hidden bg-gradient-to-br from-primary/5 via-background to-accent/10"
      aria-label="Hero"
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent" />
      <div className="container relative z-10 mx-auto px-4 py-12 md:py-16 lg:py-20">
        <div className="mx-auto max-w-4xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border bg-background/80 px-4 py-1.5 text-sm text-muted-foreground backdrop-blur-sm">
            <Sparkles className="h-4 w-4 text-primary" />
            <span>WhatsApp AI for finance</span>
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl md:text-5xl lg:text-6xl">
            {COPY.heroHeadline}
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base text-muted-foreground sm:text-lg md:text-xl md:leading-relaxed">
            {COPY.heroSubhead}
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link href="/login">
              <Button size="lg" className="min-h-[48px] w-full min-w-[200px] sm:w-auto">
                <LogIn className="h-5 w-5 mr-2" />
                {COPY.ctaLogin}
              </Button>
            </Link>
            <Link href="/signup">
              <Button variant="outline" size="lg" className="min-h-[48px] w-full min-w-[200px] sm:w-auto">
                {COPY.ctaGetStarted}
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
