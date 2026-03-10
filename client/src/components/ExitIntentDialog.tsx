import { useEffect, useState, useRef } from "react";
import { useEngagementTracking } from "@/hooks/useEngagementTracking";
import { usePopupCoordination } from "@/hooks/usePopupCoordination";
import { useIsDesktop } from "@/hooks/useMediaQuery";
import { QuickEnquiryDialog } from "./QuickEnquiryDialog";
import { trackEvent } from "@/lib/analytics";

interface ExitIntentDialogProps {
  enabled?: boolean;
}

export function ExitIntentDialog({ enabled = true }: ExitIntentDialogProps) {
  const isDesktop = useIsDesktop();
  const [showDialog, setShowDialog] = useState(false);
  const hasTriggeredRef = useRef(false);
  
  const {
    canShow,
    isSlotAvailable,
    hasEnquirySubmitted,
    claimPopup,
    releasePopup,
  } = usePopupCoordination("exit_intent");

  const {
    shouldShowExitIntent,
    markAsShown,
    hasShownThisSession,
  } = useEngagementTracking({
    enableExitIntent: isDesktop,
    storageKey: "medpg_exit_intent_shown",
  });

  useEffect(() => {
    if (shouldShowExitIntent && !hasTriggeredRef.current) {
      hasTriggeredRef.current = true;
    }
  }, [shouldShowExitIntent]);

  useEffect(() => {
    if (
      enabled &&
      isDesktop &&
      hasTriggeredRef.current &&
      !showDialog &&
      !hasShownThisSession &&
      canShow &&
      isSlotAvailable &&
      !hasEnquirySubmitted
    ) {
      const claimed = claimPopup();
      if (claimed) {
        setShowDialog(true);
        markAsShown();
        trackEvent("exit_intent", "show", "auto_trigger");
      }
    }
  }, [enabled, isDesktop, showDialog, hasShownThisSession, canShow, isSlotAvailable, hasEnquirySubmitted, claimPopup, markAsShown]);

  const handleOpenChange = (open: boolean) => {
    setShowDialog(open);
    if (!open) {
      releasePopup();
      trackEvent("exit_intent", "close", "user_action");
    }
  };

  if (!enabled || !isDesktop) {
    return null;
  }

  return (
    <QuickEnquiryDialog
      open={showDialog}
      onOpenChange={handleOpenChange}
      trigger="exit_intent"
    />
  );
}
