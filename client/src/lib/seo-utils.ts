/**
 * SEO Utilities for Meta Tags and JSON-LD Structured Data
 */

/**
 * Helper to get absolute URL for images
 */
export function getAbsoluteUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (url.startsWith('http')) return url;
  return `${window.location.origin}${url}`;
}

/**
 * Removes all meta tags with data-seo-managed="true"
 */
export function clearManagedMetaTags(): void {
  const managedTags = document.querySelectorAll('[data-seo-managed="true"]');
  managedTags.forEach(tag => tag.remove());
}

/**
 * Removes existing JSON-LD script with our specific ID
 */
export function clearJSONLD(): void {
  const jsonLdScript = document.getElementById('jsonld-structured-data');
  if (jsonLdScript) {
    jsonLdScript.remove();
  }
}

/**
 * Injects JSON-LD structured data into page head
 */
export function injectJSONLD(data: Record<string, any>): void {
  // Clear existing before injecting
  clearJSONLD();

  const script = document.createElement('script');
  script.id = 'jsonld-structured-data'; // Unique ID for scoped cleanup
  script.type = 'application/ld+json';
  script.textContent = JSON.stringify(data);
  document.head.appendChild(script);
}

/**
 * Sets or updates a meta tag with data-seo-managed="true" attribute
 */
function setOrUpdateMetaTag(
  property: string,
  content: string,
  isProperty: boolean = true
): void {
  const attributeName = isProperty ? 'property' : 'name';
  
  // Clear existing managed tag with this property/name
  const existing = document.querySelector(
    `meta[${attributeName}="${property}"][data-seo-managed="true"]`
  );
  if (existing) {
    existing.remove();
  }
  
  // Create new managed tag
  const meta = document.createElement('meta');
  meta.setAttribute(attributeName, property);
  meta.setAttribute('content', content);
  meta.setAttribute('data-seo-managed', 'true'); // Track for cleanup
  document.head.appendChild(meta);
}

/**
 * Updates or creates a link tag (not managed - these are permanent)
 */
function updateOrCreateLinkTag(rel: string, href: string): void {
  let element = document.querySelector(`link[rel="${rel}"]`);
  
  if (!element) {
    element = document.createElement('link');
    element.setAttribute('rel', rel);
    document.head.appendChild(element);
  }
  
  element.setAttribute('href', href);
}

/**
 * Updates document title and essential meta tags
 * All OG and Twitter tags are marked as managed and will be cleared on next update
 */
export function updateMetaTags(
  title: string,
  description: string,
  image?: string,
  url?: string
): void {
  // Update title
  document.title = title;
  
  // Clear all managed tags before setting new ones
  clearManagedMetaTags();
  
  // Get absolute URLs
  const absoluteUrl = url || window.location.href;
  const absoluteImage = image ? getAbsoluteUrl(image) : undefined;
  
  // Standard meta tags (managed)
  setOrUpdateMetaTag('description', description, false);
  
  // Open Graph tags (all managed)
  setOrUpdateMetaTag('og:title', title, true);
  setOrUpdateMetaTag('og:description', description, true);
  setOrUpdateMetaTag('og:type', 'website', true); // Default, pages can override
  setOrUpdateMetaTag('og:url', absoluteUrl, true);
  if (absoluteImage) {
    setOrUpdateMetaTag('og:image', absoluteImage, true);
  }
  
  // Twitter Card tags (all managed)
  setOrUpdateMetaTag('twitter:card', 'summary_large_image', false);
  setOrUpdateMetaTag('twitter:title', title, false);
  setOrUpdateMetaTag('twitter:description', description, false);
  if (absoluteImage) {
    setOrUpdateMetaTag('twitter:image', absoluteImage, false);
  }
  
  // Canonical URL (not managed - permanent)
  updateOrCreateLinkTag('canonical', absoluteUrl);
}

/**
 * Creates a managed meta tag (for page-specific tags like article:* or profile:*)
 * Removes existing tag with same property/name before creating new one
 * Returns the created element for tracking
 */
export function createManagedMetaTag(
  property: string,
  content: string,
  isProperty: boolean = true
): HTMLMetaElement {
  const attributeName = isProperty ? 'property' : 'name';
  
  // Remove existing managed tag with this property/name
  const existing = document.querySelector(
    `meta[${attributeName}="${property}"][data-seo-managed="true"]`
  );
  if (existing) {
    existing.remove();
  }
  
  const meta = document.createElement('meta');
  meta.setAttribute(attributeName, property);
  meta.setAttribute('content', content);
  meta.setAttribute('data-seo-managed', 'true');
  document.head.appendChild(meta);
  return meta;
}
