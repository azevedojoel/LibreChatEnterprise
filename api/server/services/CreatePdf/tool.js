const { v4 } = require('uuid');
const path = require('path');
const { tool } = require('@langchain/core/tools');
const { logger } = require('@librechat/data-schemas');

/** Max HTML size (1MB) to prevent abuse */
const MAX_HTML_SIZE_BYTES = 1024 * 1024;

/** Wrap HTML fragment in full document if needed */
function wrapHtml(html) {
  const trimmed = String(html).trim();
  if (
    trimmed.toLowerCase().startsWith('<!doctype') ||
    trimmed.toLowerCase().startsWith('<html')
  ) {
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

function createCreatePdfTool({ req }) {
  const sessionId = v4();

  return tool(
    async (rawInput) => {
      const { html, filename } = rawInput ?? {};
      if (!html || typeof html !== 'string') {
        return ['Error: HTML content is required.', {}];
      }

      const htmlSize = Buffer.byteLength(html, 'utf8');
      if (htmlSize > MAX_HTML_SIZE_BYTES) {
        return [
          `Error: HTML size (${(htmlSize / 1024).toFixed(1)} KB) exceeds limit of ${MAX_HTML_SIZE_BYTES / 1024} KB`,
          {},
        ];
      }

      try {
        const wrappedHtml = wrapHtml(html);
        const buffer = Buffer.from(wrappedHtml, 'utf8');
        const name =
          filename && path.extname(filename).toLowerCase() === '.html'
            ? filename
            : `${filename || 'document'}.html`.replace(/\.html\.html$/, '.html');

        return [
          `Created document: ${name}. Open in Artifact to preview and print to PDF.`,
          {
            session_id: sessionId,
            files: [{ name, buffer }],
          },
        ];
      } catch (error) {
        logger.error('[create_pdf] Error creating HTML document:', error);
        return [`Error creating document: ${error.message || 'Unknown error'}`, {}];
      }
    },
    {
      name: 'create_pdf',
      description:
        "Create an HTML document for viewing and printing. Use when the user needs a document they can preview and print to PDF. Provide valid HTML (optionally with inline CSS in <style> tags). The HTML is saved to the user's files. User opens it in the Artifact preview and uses browser Print (Cmd/Ctrl+P) to save as PDF.",
      schema: {
        type: 'object',
        properties: {
          html: {
            type: 'string',
            description: 'HTML content. Can include inline CSS in <style> tags.',
          },
          filename: {
            type: 'string',
            description:
              'Optional filename (e.g. "report.html"). Defaults to "document.html".',
          },
        },
        required: ['html'],
      },
      responseFormat: 'content_and_artifact',
    },
  );
}

module.exports = { createCreatePdfTool };
