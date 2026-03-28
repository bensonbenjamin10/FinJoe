import { MarketingLayout } from "@/components/layout/MarketingLayout";
import { HeroSection } from "@/components/landing/HeroSection";
import { IntelligenceVisionSection } from "@/components/landing/IntelligenceVisionSection";
import { ValuePropsSection } from "@/components/landing/ValuePropsSection";
import { HowItWorksSection } from "@/components/landing/HowItWorksSection";
import { CTASection } from "@/components/landing/CTASection";

export default function Landing() {
  return (
    <MarketingLayout>
      <HeroSection />
      <IntelligenceVisionSection />
      <ValuePropsSection />
      <HowItWorksSection />
      <CTASection />
    </MarketingLayout>
  );
}
