import { useEffect } from "react";
import { MarketingLayout } from "@/components/layout/MarketingLayout";
import { SupportHero } from "@/components/support/SupportHero";
import { SupportFlowSection } from "@/components/support/SupportFlowSection";
import { SupportFaqSection } from "@/components/support/SupportFaqSection";
import { SupportContactSection } from "@/components/support/SupportContactSection";
import { SUPPORT_COPY } from "@/lib/brand";
import { clearManagedMetaTags, updateMetaTags } from "@/lib/seo-utils";

export default function Support() {
  useEffect(() => {
    const url = `${window.location.origin}/support`;
    updateMetaTags(SUPPORT_COPY.pageTitle, SUPPORT_COPY.metaDescription, undefined, url);
    return () => {
      clearManagedMetaTags();
    };
  }, []);

  return (
    <MarketingLayout>
      <SupportHero />
      <SupportFlowSection />
      <SupportFaqSection />
      <SupportContactSection />
    </MarketingLayout>
  );
}
