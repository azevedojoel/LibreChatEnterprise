/**
 * Process email attachments from Postmark inbound payload.
 * Saves each attachment to user files (Local/S3/Azure/Firebase) and creates File records.
 * For retrieval types (PDF, etc.), embeds in vector DB when RAG_API_URL is configured.
 * Returns saved files for use as requestFiles in agent processing.
 */
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('@librechat/data-schemas');
const { sanitizeFilename } = require('@librechat/api');
const {
  EModelEndpoint,
  FileContext,
  mergeFileConfig,
  getEndpointFileConfig,
  retrievalMimeTypes,
} = require('librechat-data-provider');
const { createFile } = require('~/models');
const { getFileStrategy } = require('~/server/utils/getFileStrategy');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');

/**
 * Process Postmark email attachments: save to storage and create File records.
 * For retrieval types (PDF, etc.), embeds in vector DB when RAG_API_URL is configured.
 * @param {Object} params
 * @param {Array<{ Name: string, Content: string, ContentType: string, ContentLength?: number }>} params.attachments - Postmark Attachments array
 * @param {string} params.userId - User ID (owner of the files)
 * @param {object} params.appConfig - App configuration (paths, fileConfig, fileStrategy)
 * @returns {Promise<Array<object>>} Created MongoFile records (saved to DB, suitable for requestFiles)
 */
async function processEmailAttachments({ attachments = [], userId, appConfig }) {
  if (!attachments || !Array.isArray(attachments) || attachments.length === 0) {
    return [];
  }

  const fileConfig = mergeFileConfig(appConfig?.fileConfig);
  const endpointFileConfig = getEndpointFileConfig({
    fileConfig,
    endpoint: EModelEndpoint.agents,
    endpointType: EModelEndpoint.agents,
  });
  const fileSizeLimit = endpointFileConfig?.fileSizeLimit ?? 512 * 1024 * 1024; // 512MB default
  const supportedMimeTypes = endpointFileConfig?.supportedMimeTypes ?? fileConfig?.endpoints?.default?.supportedMimeTypes;

  const savedFiles = [];

  for (const attachment of attachments) {
    try {
      const name = attachment.Name ?? attachment.name ?? 'attachment';
      const content = attachment.Content ?? attachment.content ?? '';
      const contentType = (attachment.ContentType ?? attachment.contentType ?? 'application/octet-stream').trim();
      const contentLength = attachment.ContentLength ?? attachment.contentLength ?? 0;

      const sanitizedName = sanitizeFilename(name) || 'attachment';
      if (!content || typeof content !== 'string') {
        logger.warn('[InboundEmail] Attachment skipped: empty or invalid content', { name: sanitizedName });
        continue;
      }

      let buffer;
      try {
        buffer = Buffer.from(content, 'base64');
      } catch (err) {
        logger.warn('[InboundEmail] Attachment skipped: invalid base64', { name: sanitizedName, error: err.message });
        continue;
      }

      const bytes = buffer.length;
      if (contentLength > 0 && bytes !== contentLength) {
        logger.warn('[InboundEmail] Attachment size mismatch', {
          name: sanitizedName,
          expected: contentLength,
          actual: bytes,
        });
      }

      if (bytes > fileSizeLimit) {
        logger.warn('[InboundEmail] Attachment skipped: exceeds size limit', {
          name: sanitizedName,
          bytes,
          limit: fileSizeLimit,
        });
        continue;
      }

      const isSupportedType = fileConfig?.checkType?.(contentType, supportedMimeTypes);
      if (!isSupportedType) {
        logger.warn('[InboundEmail] Attachment skipped: unsupported MIME type', {
          name: sanitizedName,
          contentType,
        });
        continue;
      }

      const isImage = contentType.startsWith('image/');
      const source = getFileStrategy(appConfig, { isImage });
      const { saveBuffer } = getStrategyFunctions(source);

      if (!saveBuffer) {
        logger.warn(
          `[InboundEmail] Attachment skipped: saveBuffer not available for strategy ${source}`,
          { name: sanitizedName },
        );
        continue;
      }

      const basePath = isImage ? 'images' : 'uploads';
      const file_id = uuidv4();
      const fileName = `${file_id}__${sanitizedName}`;

      const filepath = await saveBuffer({
        userId,
        buffer,
        fileName,
        basePath,
      });

      if (!filepath) {
        logger.warn('[InboundEmail] Attachment save returned no filepath', { name: sanitizedName });
        continue;
      }

      const isSupportedByRetrieval = Array.isArray(retrievalMimeTypes)
        ? retrievalMimeTypes.some((regex) => regex.test(contentType))
        : false;

      let embedded = false;
      if (isSupportedByRetrieval && process.env.RAG_API_URL) {
        const tempDir = path.join(
          appConfig?.paths?.uploads ?? path.resolve(__dirname, '../../../uploads'),
          'temp',
          userId,
        );
        const tempPath = path.join(tempDir, fileName);
        try {
          if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
          }
          fs.writeFileSync(tempPath, buffer);
          const { uploadVectors } = require('~/server/services/Files/VectorDB/crud');
          const syntheticReq = { user: { id: userId } };
          const syntheticFile = {
            path: tempPath,
            mimetype: contentType,
            originalname: sanitizedName,
            size: bytes,
          };
          const embeddingResult = await uploadVectors({
            req: syntheticReq,
            file: syntheticFile,
            file_id,
          });
          embedded = Boolean(embeddingResult?.embedded);
        } catch (embedErr) {
          logger.warn('[InboundEmail] Vector embedding failed for attachment', {
            name: sanitizedName,
            error: embedErr.message,
          });
        } finally {
          try {
            if (fs.existsSync(tempPath)) {
              fs.unlinkSync(tempPath);
            }
          } catch (unlinkErr) {
            logger.warn('[InboundEmail] Failed to remove temp file', {
              path: tempPath,
              error: unlinkErr.message,
            });
          }
        }
      }

      const fileRecord = await createFile(
        {
          user: userId,
          file_id,
          bytes,
          filepath,
          filename: sanitizedName,
          context: FileContext.message_attachment,
          source,
          type: contentType,
          embedded: isSupportedByRetrieval ? embedded : false,
        },
        true,
      );

      savedFiles.push(fileRecord);
    } catch (err) {
      logger.error('[InboundEmail] Error processing attachment', {
        name: attachment?.Name ?? attachment?.name ?? 'unknown',
        error: err.message,
      });
      // Continue with other attachments
    }
  }

  return savedFiles;
}

module.exports = {
  processEmailAttachments,
};
