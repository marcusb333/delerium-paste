/**
 * sanitize.ts - HTML sanitizer and text escaper for untrusted content
 *
 * DOM-walker sanitizer used before any innerHTML assignment.
 * Runs on untrusted paste content rendered as markdown.
 * No external dependencies — uses only browser-native DOM APIs.
 *
 * Security: ALL innerHTML assignments must use output from sanitizeHtml().
 *           All other dynamic text must use textContent.
 */

const BLOCKED_TAGS = new Set([
  'script', 'iframe', 'object', 'embed', 'form', 'input',
  'button', 'link', 'meta', 'base', 'style'
]);

const BLOCKED_ATTR = /^on/i;
const BLOCKED_HREF = /^javascript:/i;
const SAFE_IMG_SRC = /^(data:|blob:)/i;

/**
 * Sanitize an HTML string by removing dangerous tags and attributes.
 *
 * Blocked tags: script, iframe, object, embed, form, input, button, link, meta, base, style
 * Blocked attributes: all event handlers (on*), javascript: hrefs/srcs
 * Tracking pixel protection: <img> elements with external src (http:, https://, relative)
 *   are removed entirely. Only data: and blob: src values are allowed — these are inline
 *   data that cannot make network requests. This is defense-in-depth alongside CSP.
 *
 * @param html - Raw HTML string (e.g. markdown-rendered output)
 * @returns Safe HTML string with all dangerous nodes and attributes removed
 */
export function sanitizeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const toRemove: Element[] = [];

  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT);
  let node = walker.nextNode();

  while (node) {
    const el = node as Element;

    if (BLOCKED_TAGS.has(el.tagName.toLowerCase())) {
      toRemove.push(el);
    } else if (el.tagName === 'IMG') {
      const src = el.getAttribute('src');
      if (src && !SAFE_IMG_SRC.test(src.trim())) {
        toRemove.push(el);
      } else {
        for (const attr of Array.from(el.attributes)) {
          if (BLOCKED_ATTR.test(attr.name)) {
            el.removeAttribute(attr.name);
          }
        }
      }
    } else {
      for (const attr of Array.from(el.attributes)) {
        const isEventHandler = BLOCKED_ATTR.test(attr.name);
        const isJsUrl =
          (attr.name === 'href' || attr.name === 'src') &&
          BLOCKED_HREF.test(attr.value.trim());
        if (isEventHandler || isJsUrl) {
          el.removeAttribute(attr.name);
        }
      }
    }

    node = walker.nextNode();
  }

  // Remove blocked elements after walking (avoids skipping siblings during traversal)
  toRemove.forEach(el => el.remove());

  // Safe: all dangerous nodes and attrs have been removed above
  return doc.body.innerHTML;
}

/**
 * Escape a plain-text string for safe inclusion in HTML content.
 *
 * Use this when you need to interpolate untrusted text into an HTML string
 * (e.g. building innerHTML templates). Prefer textContent for simple cases.
 *
 * @param text - Raw user-supplied string
 * @returns HTML-escaped string (special chars replaced with entities)
 */
export function escapeText(text: string): string {
  if (text == null) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
