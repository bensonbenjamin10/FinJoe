/**
 * HTML Utilities Module
 * 
 * SOLID-based reusable utilities for HTML content manipulation.
 * Each function follows Single Responsibility Principle.
 * 
 * **IMPORTANT**: These utilities use DOM APIs (`document.createElement`)
 * and are designed for browser-only contexts. Do not use server-side.
 * 
 * Use cases:
 * - Admin preview cards showing rich text content
 * - Generating plain text excerpts from HTML
 * - Creating meta descriptions from HTML content
 */

/**
 * Strips all HTML tags from a string, leaving only plain text.
 * 
 * **Browser-only**: Uses DOM APIs for safe HTML parsing.
 * 
 * @param html - The HTML string to strip
 * @returns Plain text without HTML tags
 * 
 * @example
 * stripHtml("<p>Hello <strong>World</strong></p>")
 * // Returns: "Hello World"
 */
export function stripHtml(html: string): string {
  if (!html) return "";
  
  // Guard: Ensure DOM is available (browser context only)
  if (typeof document === "undefined") {
    console.warn("stripHtml called in non-browser context");
    return html;
  }
  
  // Create a temporary DOM element to parse HTML safely
  const temp = document.createElement("div");
  temp.innerHTML = html;
  
  // Extract text content (automatically strips all tags)
  return temp.textContent || temp.innerText || "";
}

/**
 * Truncates text to a specified length and adds ellipsis if needed.
 * 
 * @param text - The text to truncate
 * @param maxLength - Maximum length before truncation (default: 150)
 * @param suffix - Suffix to add when truncated (default: "...")
 * @returns Truncated text with suffix if applicable
 * 
 * @example
 * truncateText("This is a very long sentence that needs truncation", 20)
 * // Returns: "This is a very long..."
 */
export function truncateText(
  text: string, 
  maxLength: number = 150, 
  suffix: string = "..."
): string {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  
  // Truncate at maxLength and add suffix
  return text.substring(0, maxLength).trim() + suffix;
}

/**
 * Gets a plain text preview from HTML content.
 * Combines stripHtml, normalizeWhitespace, and truncateText for clean preview cards.
 * 
 * @param html - The HTML content
 * @param maxLength - Maximum preview length (default: 150)
 * @returns Clean, normalized plain text preview with ellipsis if truncated
 * 
 * @example
 * getPlainTextPreview("<p>Dr. Abbas Ali is a <strong>renowned</strong> educator...</p>", 50)
 * // Returns: "Dr. Abbas Ali is a renowned educator..."
 */
export function getPlainTextPreview(html: string, maxLength: number = 150): string {
  const plainText = stripHtml(html);
  const normalized = normalizeWhitespace(plainText);
  return truncateText(normalized, maxLength);
}

/**
 * Removes extra whitespace and normalizes line breaks in text.
 * Useful for cleaning up text extracted from HTML.
 * 
 * @param text - The text to normalize
 * @returns Normalized text with single spaces
 * 
 * @example
 * normalizeWhitespace("Hello\n\n  World  \n  ")
 * // Returns: "Hello World"
 */
export function normalizeWhitespace(text: string): string {
  if (!text) return "";
  
  return text
    .replace(/\s+/g, " ")  // Replace multiple spaces/newlines with single space
    .trim();                // Remove leading/trailing whitespace
}
