/**
 * create_brainstorm_doc tool for Brainstorm mode.
 * Saves a markdown document to the user's My Files (artifact flow).
 */
const { v4 } = require('uuid');
const crypto = require('crypto');
const { tool } = require('@langchain/core/tools');
const { logger } = require('@librechat/data-schemas');

/** Max output size (5MB) to prevent abuse */
const MAX_OUTPUT_SIZE_BYTES = 5 * 1024 * 1024;

/** Timestamp suffix: YYYYMMDD_HHmmss */
function getTimestampSuffix() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  return `${y}${m}${d}_${h}${min}${s}`;
}

/** Short hash for uniqueness (first 8 chars of sha256) */
function getShortHash(input) {
  return crypto.createHash('sha256').update(String(input)).digest('hex').slice(0, 8);
}

function createBrainstormDocTool() {
  const sessionId = v4();

  return tool(
    async (rawInput) => {
      const { content } = rawInput ?? {};
      if (!content || typeof content !== 'string') {
        return ['Error: content is required', {}];
      }

      try {
        const buffer = Buffer.from(content, 'utf8');
        if (buffer.length > MAX_OUTPUT_SIZE_BYTES) {
          return [
            `Error: Document size (${(buffer.length / 1024).toFixed(1)} KB) exceeds limit of ${MAX_OUTPUT_SIZE_BYTES / 1024} KB`,
            {},
          ];
        }

        const suffix = `${getTimestampSuffix()}_${getShortHash(Date.now())}`;
        const name = `brainstorm_${suffix}.md`;

        const artifact = {
          session_id: sessionId,
          files: [{ name, buffer }],
        };

        return [`Saved brainstorm document to ${name}.`, artifact];
      } catch (err) {
        logger.error('[create_brainstorm_doc] Error:', err);
        return [`Error: ${err.message}`, {}];
      }
    },
    {
      name: 'create_brainstorm_doc',
      description:
        'Save a brainstorm/plan document as markdown for the user. Use after researching with web_search and file_search. Format: # Title, summary paragraph, ## Sections, markdown content. Creates a downloadable file in the user\'s My Files.',
      schema: {
        type: 'object',
        properties: {
          content: {
            type: 'string',
            description: 'Markdown document content',
          },
        },
        required: ['content'],
      },
      responseFormat: 'content_and_artifact',
    },
  );
}

module.exports = { createBrainstormDocTool };
