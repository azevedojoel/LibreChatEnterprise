const { logger } = require('@librechat/data-schemas');
const { convert: htmlToText } = require('html-to-text');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const sanitizeHtml = require('sanitize-html');

/** Max HTML size (1MB) to prevent abuse */
const MAX_HTML_SIZE_BYTES = 1024 * 1024;

/** Allowed tags for PDF HTML - safe subset, no scripts */
const SANITIZE_OPTIONS = {
  allowedTags: [
    'p',
    'br',
    'strong',
    'em',
    'b',
    'i',
    'u',
    'ul',
    'ol',
    'li',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'pre',
    'code',
    'blockquote',
    'hr',
    'div',
    'span',
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
  ],
  allowedAttributes: {},
  allowedSchemes: [],
};

/** Convert HTML to plain text for PDF, preserving structure */
function htmlToPlainText(html) {
  return htmlToText(html, {
    wordwrap: 80,
    preserveNewlines: true,
  });
}

/** WinAnsi (StandardFonts) cannot encode Unicode. Replace with ASCII equivalents. */
const UNICODE_TO_ASCII = {
  '\u2713': '[OK]', // ✓
  '\u2714': '[OK]', // ✔
  '\u2717': '[X]',  // ✗
  '\u2718': '[X]',  // ✘
  '\u2192': '->',   // →
  '\u2190': '<-',   // ←
  '\u2022': '*',    // •
  '\u2013': '-',    // –
  '\u2014': '--',   // —
  '\u2018': "'",    // '
  '\u2019': "'",    // '
  '\u201C': '"',    // "
  '\u201D': '"',    // "
  '\u00A0': ' ',    // nbsp
};

function toWinAnsiSafe(text) {
  return text.replace(/[\u2713\u2714\u2717\u2718\u2192\u2190\u2022\u2013\u2014\u2018\u2019\u201C\u201D\u00A0]/g, (c) => UNICODE_TO_ASCII[c] ?? '?')
    .replace(/[^\x00-\x7F]/g, '?'); // Fallback: any non-ASCII -> ?
}

/**
 * Convert HTML to PDF buffer using pdf-lib (no Puppeteer).
 * Sanitizes HTML, extracts text, and creates a simple PDF.
 * @param {string} html - HTML content to convert
 * @returns {Promise<Buffer>} PDF buffer
 */
async function htmlToPdfBuffer(html) {
  if (!html || typeof html !== 'string') {
    throw new Error('HTML content is required');
  }

  const htmlSize = Buffer.byteLength(html, 'utf8');
  if (htmlSize > MAX_HTML_SIZE_BYTES) {
    throw new Error(
      `HTML size (${(htmlSize / 1024).toFixed(1)} KB) exceeds limit of ${MAX_HTML_SIZE_BYTES / 1024} KB`,
    );
  }

  const sanitized = sanitizeHtml(html.trim(), SANITIZE_OPTIONS);
  const rawText = htmlToPlainText(sanitized);
  const text = toWinAnsiSafe(rawText);

  if (!text.trim()) {
    throw new Error('No content to convert to PDF');
  }

  try {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontSize = 11;
    const lineHeight = fontSize * 1.4;
    const margin = 72; // 1 inch
    const pageWidth = 595; // A4
    const pageHeight = 842;
    const contentWidth = pageWidth - 2 * margin;

    let page = pdfDoc.addPage([pageWidth, pageHeight]);
    let y = pageHeight - margin;

    const lines = text.split('\n');

    for (const line of lines) {
      if (y < margin + lineHeight) {
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
      }

      const trimmed = line.trim();
      if (!trimmed) {
        y -= lineHeight * 0.5;
        continue;
      }

      const words = trimmed.split(/\s+/);
      let currentLine = '';
      const textLines = [];

      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const textWidth = font.widthOfTextAtSize(testLine, fontSize);
        if (textWidth > contentWidth && currentLine) {
          textLines.push(currentLine);
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine) textLines.push(currentLine);

      for (const textLine of textLines) {
        if (y < margin + lineHeight) {
          page = pdfDoc.addPage([pageWidth, pageHeight]);
          y = pageHeight - margin;
        }
        page.drawText(textLine || ' ', {
          x: margin,
          y,
          size: fontSize,
          font,
          color: rgb(0, 0, 0),
        });
        y -= lineHeight;
      }
    }

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  } catch (error) {
    logger.error('[htmlToPdf] Error generating PDF:', error);
    throw error;
  }
}

/** @deprecated Use htmlToPdfBuffer for PDF generation. Kept for backwards compatibility. */
function wrapHtmlForPdf(html) {
  const trimmed = String(html).trim();
  if (trimmed.toLowerCase().startsWith('<!doctype') || trimmed.toLowerCase().startsWith('<html')) {
    return trimmed;
  }
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Document</title>
</head>
<body>${trimmed}</body>
</html>`;
}

module.exports = { htmlToPdfBuffer, wrapHtmlForPdf };
