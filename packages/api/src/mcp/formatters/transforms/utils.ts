import { convert } from 'html-to-text';

const DEFAULT_BODY_MAX_LENGTH = 2000;

/**
 * Converts HTML to plain text, strips hrefs (keeps link text only to avoid token waste),
 * collapses whitespace, and optionally truncates.
 */
export function stripHtml(html: string, options?: { maxLength?: number }): string {
  if (!html || typeof html !== 'string') return '';
  const text = convert(html, {
    wordwrap: 0,
    selectors: [
      {
        selector: 'a',
        format: 'anchor',
        options: {
          ignoreHref: true, // Keep link text only, drop long URLs
        },
      },
    ],
  });
  const collapsed = text.replace(/\s+/g, ' ').trim();
  const maxLen = options?.maxLength ?? DEFAULT_BODY_MAX_LENGTH;
  if (collapsed.length <= maxLen) return collapsed;
  return `${collapsed.slice(0, maxLen)}...`;
}
