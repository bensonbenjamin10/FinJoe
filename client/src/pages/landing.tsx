import { MarketingLayout } from "@/components/layout/MarketingLayout";
import { HeroSection } from "@/components/landing/HeroSection";
import { ValuePropsSection } from "@/components/landing/ValuePropsSection";
import { HowItWorksSection } from "@/components/landing/HowItWorksSection";
import { CTASection } from "@/components/landing/CTASection";

export default function Landing() {
  return (
    <MarketingLayout>
      <HeroSection />
      <ValuePropsSection />
      <HowItWorksSection />
      <CTASection />
    </MarketingLayout>
  );
}
