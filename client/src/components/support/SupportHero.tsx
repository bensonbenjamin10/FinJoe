import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { SUPPORT_COPY } from "@/lib/brand";
import { BookOpen, HelpCircle, LogIn, MessageCircle } from "lucide-react";

const LOGIN_WITH_HELP_REDIRECT = `/login?redirect=${encodeURIComponent("/admin/help")}`;

export function SupportHero() {
  return (
    <section
      className="relative border-b bg-gradient-to-br from-primary/5 via-background to-accent/10 py-12 md:py-16 lg:py-20"
      aria-labelledby="support-hero-heading"
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent" />
      <div className="container relative z-10 mx-auto px-4 md:px-6">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border bg-background/80 px-4 py-1.5 text-sm text-muted-foreground backdrop-blur-sm">
            <HelpCircle className="h-4 w-4 text-primary" />
            <span>{SUPPORT_COPY.heroBadge}</span>
          </div>
          <h1
            id="support-hero-heading"
            className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl md:text-5xl"
          >
            {SUPPORT_COPY.heroHeadline}
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg md:leading-relaxed">
            {SUPPORT_COPY.heroSubhead}
          </p>
          <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <Link href={LOGIN_WITH_HELP_REDIRECT}>
              <Button size="lg" className="min-h-[48px] w-full min-w-[200px] sm:w-auto">
                <BookOpen className="mr-2 h-5 w-5" />
                {SUPPORT_COPY.ctaTeamGuides}
              </Button>
            </Link>
            <Link href="/login">
              <Button variant="outline" size="lg" className="min-h-[48px] w-full min-w-[200px] sm:w-auto">
                <LogIn className="mr-2 h-5 w-5" />
                {SUPPORT_COPY.ctaLogin}
              </Button>
            </Link>
            <Button variant="secondary" size="lg" className="min-h-[48px] w-full min-w-[200px] sm:w-auto" asChild>
              <a href="#support-faq">{SUPPORT_COPY.ctaFaq}</a>
            </Button>
            <Button variant="ghost" size="lg" className="min-h-[48px] w-full min-w-[200px] sm:w-auto" asChild>
              <a href="#support-contact">
                <MessageCircle className="mr-2 h-5 w-5" />
                {SUPPORT_COPY.ctaContact}
              </a>
            </Button>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">{SUPPORT_COPY.ctaTeamGuidesSub}</p>
        </div>
      </div>
    </section>
  );
}
