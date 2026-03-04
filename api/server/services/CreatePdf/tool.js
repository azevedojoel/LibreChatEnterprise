const { v4 } = require('uuid');
const path = require('path');
const { tool } = require('@langchain/core/tools');
const { htmlToPdfBuffer } = require('~/server/services/Artifacts/htmlToPdf');
const { logger } = require('@librechat/data-schemas');

function createCreatePdfTool({ req }) {
  const sessionId = v4();

  return tool(
    async (rawInput) => {
      const { html, filename } = rawInput ?? {};
      if (!html || typeof html !== 'string') {
        return ['Error: HTML content is required.', {}];
      }

      try {
        const buffer = await htmlToPdfBuffer(html);
        const name =
          filename && path.extname(filename).toLowerCase() === '.pdf'
            ? filename
            : `${filename || 'document'}.pdf`.replace(/\.pdf\.pdf$/, '.pdf');

        return [
          `Created PDF: ${name}. The file has been saved to your files and is displayed below.`,
          {
            session_id: sessionId,
            files: [{ name, buffer }],
          },
        ];
      } catch (error) {
        logger.error('[create_pdf] Error generating PDF:', error);
        return [`Error creating PDF: ${error.message || 'Unknown error'}`, {}];
      }
    },
    {
      name: 'create_pdf',
      description:
        "Convert HTML/CSS content to a PDF document. Use when the user or task requires a PDF. Provide valid HTML (optionally with inline CSS). The PDF is saved to the user's files and displayed in chat.",
      schema: {
        type: 'object',
        properties: {
          html: {
            type: 'string',
            description: 'HTML content to convert to PDF. Can include inline CSS in <style> tags.',
          },
          filename: {
            type: 'string',
            description:
              'Optional filename for the PDF (e.g. "report.pdf"). Defaults to "document.pdf".',
          },
        },
        required: ['html'],
      },
      responseFormat: 'content_and_artifact',
    },
  );
}

module.exports = { createCreatePdfTool };
