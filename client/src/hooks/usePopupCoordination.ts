import { useEffect, useCallback, useSyncExternalStore } from "react";

const POPUP_COORDINATION_KEY = "medpg_popup_coordination";
const ENQUIRY_SUBMITTED_KEY = "medpg_enquiry_submitted";

type Listener = () => void;
const listeners = new Set<Listener>();

interface PopupCoordinationState {
  activePopup: string | null;
  enquirySubmitted: boolean;
}

let cachedSnapshot: PopupCoordinationState = { activePopup: null, enquirySubmitted: false };
const serverSnapshot: PopupCoordinationState = { activePopup: null, enquirySubmitted: false };

function readFromStorage(): PopupCoordinationState {
  if (typeof window === "undefined") {
    return { activePopup: null, enquirySubmitted: false };
  }
  
  try {
    const stored = sessionStorage.getItem(POPUP_COORDINATION_KEY);
    const enquirySubmitted = sessionStorage.getItem(ENQUIRY_SUBMITTED_KEY) === "true";
    
    if (stored) {
      const parsed = JSON.parse(stored);
      return { activePopup: parsed.activePopup ?? null, enquirySubmitted };
    }
    return { activePopup: null, enquirySubmitted };
  } catch {
    return { activePopup: null, enquirySubmitted: false };
  }
}

function updateCachedSnapshot() {
  const newState = readFromStorage();
  if (
    newState.activePopup !== cachedSnapshot.activePopup ||
    newState.enquirySubmitted !== cachedSnapshot.enquirySubmitted
  ) {
    cachedSnapshot = newState;
  }
}

function notifyListeners() {
  updateCachedSnapshot();
  listeners.forEach((listener) => listener());
}

function setState(state: Partial<PopupCoordinationState>) {
  if (typeof window === "undefined") return;
  
  const current = readFromStorage();
  const newState = { ...current, ...state };
  
  sessionStorage.setItem(POPUP_COORDINATION_KEY, JSON.stringify({
    activePopup: newState.activePopup,
  }));
  
  if (state.enquirySubmitted !== undefined) {
    sessionStorage.setItem(ENQUIRY_SUBMITTED_KEY, String(state.enquirySubmitted));
  }
  
  notifyListeners();
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): PopupCoordinationState {
  updateCachedSnapshot();
  return cachedSnapshot;
}

function getServerSnapshot(): PopupCoordinationState {
  return serverSnapshot;
}

export function usePopupCoordination(popupId: string) {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const canShow = state.activePopup === null && !state.enquirySubmitted;
  const isActive = state.activePopup === popupId;
  const hasEnquirySubmitted = state.enquirySubmitted;
  const isSlotAvailable = state.activePopup === null;

  const claimPopup = useCallback(() => {
    const currentState = readFromStorage();
    if (currentState.activePopup || currentState.enquirySubmitted) {
      return false;
    }
    setState({ activePopup: popupId });
    return true;
  }, [popupId]);

  const releasePopup = useCallback(() => {
    const currentState = readFromStorage();
    if (currentState.activePopup === popupId) {
      setState({ activePopup: null });
    }
  }, [popupId]);

  const markEnquirySubmitted = useCallback(() => {
    setState({ enquirySubmitted: true, activePopup: null });
  }, []);

  useEffect(() => {
    return () => {
      const currentState = readFromStorage();
      if (currentState.activePopup === popupId) {
        setState({ activePopup: null });
      }
    };
  }, [popupId]);

  return {
    canShow,
    isActive,
    hasEnquirySubmitted,
    isSlotAvailable,
    claimPopup,
    releasePopup,
    markEnquirySubmitted,
  };
}

export function markGlobalEnquirySubmitted() {
  setState({ enquirySubmitted: true, activePopup: null });
}

export function hasGlobalEnquirySubmitted(): boolean {
  return readFromStorage().enquirySubmitted;
}
