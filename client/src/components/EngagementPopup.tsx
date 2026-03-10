import { useEffect, useState, useRef } from "react";
import { useEngagementTracking } from "@/hooks/useEngagementTracking";
import { usePopupCoordination } from "@/hooks/usePopupCoordination";
import { QuickEnquiryDialog } from "./QuickEnquiryDialog";
import { trackEvent } from "@/lib/analytics";

interface EngagementPopupProps {
  enabled?: boolean;
  timeThreshold?: number;
  scrollThreshold?: number;
}

export function EngagementPopup({
  enabled = true,
  timeThreshold = 30,
  scrollThreshold = 50,
}: EngagementPopupProps) {
  const [showDialog, setShowDialog] = useState(false);
  const hasTriggeredRef = useRef(false);

  const {
    canShow,
    isSlotAvailable,
    hasEnquirySubmitted,
    claimPopup,
    releasePopup,
  } = usePopupCoordination("engagement_popup");

  const {
    shouldShowPopup,
    markAsShown,
    hasShownThisSession,
  } = useEngagementTracking({
    timeThreshold,
    scrollThreshold,
    enableExitIntent: false,
    storageKey: "medpg_engagement_popup_shown",
  });

  useEffect(() => {
    if (shouldShowPopup && !hasTriggeredRef.current) {
      hasTriggeredRef.current = true;
    }
  }, [shouldShowPopup]);

  useEffect(() => {
    if (
      enabled &&
      hasTriggeredRef.current &&
      !showDialog &&
      !hasShownThisSession &&
      canShow &&
      isSlotAvailable &&
      !hasEnquirySubmitted
    ) {
      const timer = setTimeout(() => {
        const claimed = claimPopup();
        if (claimed) {
          setShowDialog(true);
          markAsShown();
          trackEvent("engagement_popup", "show", "auto_trigger");
        }
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [enabled, showDialog, hasShownThisSession, canShow, isSlotAvailable, hasEnquirySubmitted, claimPopup, markAsShown]);

  const handleOpenChange = (open: boolean) => {
    setShowDialog(open);
    if (!open) {
      releasePopup();
      trackEvent("engagement_popup", "close", "user_action");
    }
  };

  if (!enabled) return null;

  return (
    <QuickEnquiryDialog
      open={showDialog}
      onOpenChange={handleOpenChange}
      trigger="engagement_popup"
    />
  );
}
