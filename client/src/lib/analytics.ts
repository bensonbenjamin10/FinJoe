// Analytics tracking utilities for GA4 and Meta Pixel
// Supports dynamic tracker IDs from database + env var fallback

declare global {
  interface Window {
    dataLayer: any[];
    gtag: (...args: any[]) => void;
    fbq: (...args: any[]) => void;
  }
}

// Track initialization status to prevent duplicate scripts
let gaInitialized = false;
let metaPixelInitialized = false;

// Store active tracker IDs for use in tracking functions
let activeMeasurementId: string | null = null;
let activePixelId: string | null = null;

// Initialize Google Analytics with dynamic measurement ID
export const initGA = (measurementId?: string) => {
  // Prevent duplicate initialization
  if (gaInitialized) return;

  // Try dynamic ID first, then fallback to env var
  const id = measurementId || import.meta.env.VITE_GA_MEASUREMENT_ID;

  if (!id) {
    console.warn('Google Analytics not initialized: No measurement ID provided');
    return;
  }

  const script1 = document.createElement('script');
  script1.async = true;
  script1.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
  document.head.appendChild(script1);

  const script2 = document.createElement('script');
  script2.textContent = `
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', '${id}');
  `;
  document.head.appendChild(script2);
  
  gaInitialized = true;
  activeMeasurementId = id; // Store for use in tracking functions
  console.log('Google Analytics initialized with ID:', id);
};

// Initialize Meta Pixel with dynamic pixel ID
export const initMetaPixel = (pixelId?: string) => {
  // Prevent duplicate initialization
  if (metaPixelInitialized) return;

  // Try dynamic ID first, then fallback to env var
  const id = pixelId || import.meta.env.VITE_META_PIXEL_ID;

  if (!id) {
    console.warn('Meta Pixel not initialized: No pixel ID provided');
    return;
  }

  const script = document.createElement('script');
  script.textContent = `
    !function(f,b,e,v,n,t,s)
    {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};
    if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
    n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t,s)}(window, document,'script',
    'https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', '${id}');
    fbq('track', 'PageView');
  `;
  document.head.appendChild(script);

  const noscript = document.createElement('noscript');
  noscript.innerHTML = `<img height="1" width="1" style="display:none"
    src="https://www.facebook.com/tr?id=${id}&ev=PageView&noscript=1" />`;
  document.body.appendChild(noscript);
  
  metaPixelInitialized = true;
  activePixelId = id; // Store for use in tracking functions
  console.log('Meta Pixel initialized with ID:', id);
};

// Initialize analytics with database-driven configuration
export const initAnalyticsFromDatabase = async () => {
  try {
    const response = await fetch('/api/system-settings');
    if (!response.ok) {
      console.warn('Failed to fetch system settings, using env vars for analytics');
      initGA();
      initMetaPixel();
      return;
    }

    const settings = await response.json();
    
    // Initialize GA4 if measurement ID is configured
    if (settings.ga4MeasurementId) {
      initGA(settings.ga4MeasurementId);
    }
    
    // Initialize Meta Pixel if pixel ID is configured
    if (settings.metaPixelId) {
      initMetaPixel(settings.metaPixelId);
    }
  } catch (error) {
    console.error('Error initializing analytics from database:', error);
    // Fallback to env vars
    initGA();
    initMetaPixel();
  }
};

// Track page views for SPA routing
export const trackPageView = (url: string) => {
  if (typeof window === 'undefined') return;
  
  // Use stored measurement ID from initialization
  if (activeMeasurementId && window.gtag) {
    window.gtag('config', activeMeasurementId, {
      page_path: url
    });
  }

  if (window.fbq) {
    window.fbq('track', 'PageView');
  }
};

// Track custom events
export const trackEvent = (
  action: string, 
  category?: string, 
  label?: string, 
  value?: number
) => {
  if (typeof window === 'undefined') return;
  
  if (window.gtag) {
    window.gtag('event', action, {
      event_category: category,
      event_label: label,
      value: value,
    });
  }

  if (window.fbq) {
    window.fbq('trackCustom', action, {
      category,
      label,
      value
    });
  }
};

// MedPG-specific tracking events
export const trackLeadView = (section?: string) => {
  trackEvent('lead_view', 'engagement', section);
};

export const trackFormStart = (formType: 'enquiry' | 'registration') => {
  trackEvent('form_start', 'conversion', formType);
};

export const trackFormSubmit = (formType: 'enquiry' | 'registration') => {
  trackEvent('form_submit', 'conversion', formType);
  
  if (window.fbq) {
    window.fbq('track', 'Lead', {
      content_name: formType,
    });
  }
};

export const trackBookCall = () => {
  trackEvent('book_call', 'engagement', 'consultation');
};

export const trackWhatsAppStart = () => {
  trackEvent('whatsapp_start', 'engagement', 'chat');
};

export const trackRegistrationComplete = (programName: string, amount: number) => {
  trackEvent('registration_complete', 'conversion', programName, amount);
  
  if (window.fbq) {
    window.fbq('track', 'Purchase', {
      value: amount,
      currency: 'INR',
      content_name: programName,
    });
  }
};

export const trackConsentUpdate = (consented: boolean) => {
  trackEvent('consent_update', 'privacy', consented ? 'granted' : 'denied');
};

// Get GA Client ID for CRM tracking
export const getGAClientId = (): string | null => {
  if (typeof window === 'undefined' || !window.gtag || !activeMeasurementId) return null;
  
  let clientId: string | null = null;
  
  window.gtag('get', activeMeasurementId, 'client_id', (id: string) => {
    clientId = id;
  });
  
  return clientId;
};

// Get Meta FBP cookie for tracking
export const getMetaFBP = (): string | null => {
  if (typeof document === 'undefined') return null;
  
  const match = document.cookie.match(/_fbp=([^;]+)/);
  return match ? match[1] : null;
};

// Get Meta FBC parameter from URL
export const getMetaFBC = (): string | null => {
  if (typeof window === 'undefined') return null;
  
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('fbclid');
};

// Get UTM parameters for campaign tracking
export const getUTMParams = () => {
  if (typeof window === 'undefined') return {};
  
  const urlParams = new URLSearchParams(window.location.search);
  
  return {
    source: urlParams.get('utm_source') || undefined,
    medium: urlParams.get('utm_medium') || undefined,
    campaign: urlParams.get('utm_campaign') || undefined,
    gaClientId: getGAClientId() || undefined,
    metaFbp: getMetaFBP() || undefined,
    metaFbc: getMetaFBC() || undefined,
  };
};
