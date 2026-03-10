import { useEffect, useState, useRef } from "react";

interface EngagementTriggers {
  timeEngaged: boolean; // 30+ seconds active
  scrollEngaged: boolean; // 50%+ scroll depth
  exitIntent: boolean; // Mouse leaving viewport (desktop)
}

interface UseEngagementTrackingOptions {
  timeThreshold?: number; // Seconds before triggering (default: 30)
  scrollThreshold?: number; // Percentage before triggering (default: 50)
  enableExitIntent?: boolean; // Enable exit intent detection (default: true)
  storageKey?: string; // localStorage key for session tracking
}

export function useEngagementTracking(options: UseEngagementTrackingOptions = {}) {
  const {
    timeThreshold = 30,
    scrollThreshold = 50,
    enableExitIntent = true,
    storageKey = "engagement_popup_shown",
  } = options;

  const [triggers, setTriggers] = useState<EngagementTriggers>({
    timeEngaged: false,
    scrollEngaged: false,
    exitIntent: false,
  });

  const [hasShownThisSession, setHasShownThisSession] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(storageKey) === "true";
  });

  // Use ref to track session state for immediate access in event handlers
  const hasShownRef = useRef(hasShownThisSession);
  
  useEffect(() => {
    hasShownRef.current = hasShownThisSession;
  }, [hasShownThisSession]);

  // Track time engagement
  useEffect(() => {
    const timer = setTimeout(() => {
      setTriggers((prev) => ({ ...prev, timeEngaged: true }));
    }, timeThreshold * 1000);

    return () => clearTimeout(timer);
  }, [timeThreshold]);

  // Track scroll depth
  useEffect(() => {
    const handleScroll = () => {
      const scrollPercentage =
        (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100;

      if (scrollPercentage >= scrollThreshold) {
        setTriggers((prev) => ({ ...prev, scrollEngaged: true }));
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [scrollThreshold]);

  // Track exit intent (desktop only)
  useEffect(() => {
    if (!enableExitIntent) return;

    const handleMouseLeave = (e: MouseEvent) => {
      // Only trigger if mouse is leaving from top (closing tab/window),
      // not on mobile devices, and hasn't been shown this session
      if (e.clientY < 10 && window.innerWidth >= 768 && !hasShownRef.current) {
        setTriggers((prev) => ({ ...prev, exitIntent: true }));
      }
    };

    document.addEventListener("mouseleave", handleMouseLeave);
    return () => document.removeEventListener("mouseleave", handleMouseLeave);
  }, [enableExitIntent]);

  // Mark as shown for this session
  const markAsShown = () => {
    if (typeof window !== "undefined") {
      localStorage.setItem(storageKey, "true");
      setHasShownThisSession(true);
    }
  };

  // Reset (useful for testing)
  const reset = () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem(storageKey);
      setHasShownThisSession(false);
      setTriggers({
        timeEngaged: false,
        scrollEngaged: false,
        exitIntent: false,
      });
    }
  };

  // Check if any trigger is active
  const isEngaged = triggers.timeEngaged || triggers.scrollEngaged;
  const shouldShowPopup = isEngaged && !hasShownThisSession;
  const shouldShowExitIntent = triggers.exitIntent && !hasShownThisSession;

  return {
    triggers,
    isEngaged,
    shouldShowPopup,
    shouldShowExitIntent,
    hasShownThisSession,
    markAsShown,
    reset,
  };
}
