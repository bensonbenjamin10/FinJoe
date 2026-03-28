import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { COPY } from "@/lib/brand";
import { LogIn } from "lucide-react";

export function CTASection() {
  return (
    <section
      className="py-12 md:py-16 lg:py-20"
      aria-labelledby="cta-heading"
    >
      <div className="container mx-auto px-4 md:px-6">
        <div className="mx-auto max-w-2xl rounded-2xl border bg-primary/5 p-8 text-center md:p-12">
          <h2
            id="cta-heading"
            className="font-display text-2xl font-bold text-foreground sm:text-3xl"
          >
            {COPY.ctaTitle}
          </h2>
          <p className="mt-4 text-muted-foreground md:text-lg md:leading-relaxed">
            {COPY.ctaDescription}
          </p>
          <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link href="/login">
              <Button size="lg" className="min-h-[48px] w-full min-w-[200px] sm:w-auto">
                <LogIn className="h-5 w-5 mr-2" />
                Log in to Admin
              </Button>
            </Link>
            <Link href="/signup">
              <Button variant="outline" size="lg" className="min-h-[48px] w-full min-w-[200px] sm:w-auto">
                Sign Up Free
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
