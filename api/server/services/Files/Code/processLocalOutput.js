const path = require('path');
const { v4 } = require('uuid');
const { logger } = require('@librechat/data-schemas');
const {
  megabyte,
  fileConfig,
  FileContext,
  EModelEndpoint,
  mergeFileConfig,
  getEndpointFileConfig,
  imageExtRegex,
  inferMimeType,
} = require('librechat-data-provider');
const { createFile, claimCodeFile } = require('~/models');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { convertImage } = require('~/server/services/Files/images/convert');
const { determineFileType } = require('~/server/utils');

/**
 * Process locally-generated code execution output files (from buffer).
 * Saves images and non-image files to storage and returns metadata.
 *
 * @param {Object} params
 * @param {ServerRequest} params.req
 * @param {Buffer} params.buffer
 * @param {string} params.name
 * @param {string} params.session_id
 * @param {string} params.toolCallId
 * @param {string} params.conversationId
 * @param {string} params.messageId
 * @returns {Promise<(MongoFile & { messageId: string; toolCallId: string })|null>}
 */
const processLocalCodeOutput = async ({
  req,
  buffer,
  name,
  session_id,
  toolCallId,
  conversationId,
  messageId,
}) => {
  const appConfig = req.config;
  const currentDate = new Date();
  const formattedDate = currentDate.toISOString();
  const fileExt = path.extname(name).toLowerCase();
  const isImage = fileExt && imageExtRegex.test(name);

  const mergedFileConfig = mergeFileConfig(appConfig.fileConfig);
  const endpointFileConfig = getEndpointFileConfig({
    fileConfig: mergedFileConfig,
    endpoint: EModelEndpoint.agents,
  });
  const fileSizeLimit = endpointFileConfig.fileSizeLimit ?? mergedFileConfig.serverFileSizeLimit;

  if (buffer.length > fileSizeLimit) {
    logger.warn(
      `[processLocalCodeOutput] File "${name}" (${(buffer.length / megabyte).toFixed(2)} MB) exceeds size limit of ${(fileSizeLimit / megabyte).toFixed(2)} MB, skipping`,
    );
    return null;
  }

  const fileIdentifier = `local/${session_id}/${name}`;

  const newFileId = v4();
  const claimed = await claimCodeFile({
    filename: name,
    conversationId,
    file_id: newFileId,
    user: req.user.id,
  });
  const file_id = claimed.file_id;
  const isUpdate = file_id !== newFileId;

  try {
    if (isImage) {
      const usage = isUpdate ? (claimed.usage ?? 0) + 1 : 1;
      const _file = await convertImage(req, buffer, 'high', `${file_id}${fileExt}`);
      const filepath = usage > 1 ? `${_file.filepath}?v=${Date.now()}` : _file.filepath;
      const file = {
        ..._file,
        filepath,
        file_id,
        messageId,
        usage,
        filename: name,
        conversationId,
        user: req.user.id,
        type: `image/${appConfig.imageOutputType}`,
        createdAt: isUpdate ? claimed.createdAt : formattedDate,
        updatedAt: formattedDate,
        source: appConfig.fileStrategy,
        context: FileContext.execute_code,
        metadata: { fileIdentifier },
      };
      await createFile(file, true);
      return Object.assign(file, { messageId, toolCallId });
    }

    const { saveBuffer } = getStrategyFunctions(appConfig.fileStrategy);
    if (!saveBuffer) {
      logger.warn(
        `[processLocalCodeOutput] saveBuffer not available for strategy ${appConfig.fileStrategy}, skipping file`,
      );
      return null;
    }

    const detectedType = await determineFileType(buffer, true);
    const mimeType = detectedType?.mime || inferMimeType(name, '') || 'application/octet-stream';

    const isSupportedMimeType = fileConfig.checkType(
      mimeType,
      endpointFileConfig.supportedMimeTypes,
    );
    if (!isSupportedMimeType) {
      logger.warn(
        `[processLocalCodeOutput] File "${name}" has unsupported MIME type "${mimeType}", proceeding with storage`,
      );
    }

    const fileName = `${file_id}__${name}`;
    const filepath = await saveBuffer({
      userId: req.user.id,
      buffer,
      fileName,
      basePath: 'uploads',
    });

    const file = {
      file_id,
      filepath,
      messageId,
      object: 'file',
      filename: name,
      type: mimeType,
      conversationId,
      user: req.user.id,
      bytes: buffer.length,
      updatedAt: formattedDate,
      metadata: { fileIdentifier },
      source: appConfig.fileStrategy,
      context: FileContext.execute_code,
      usage: isUpdate ? (claimed.usage ?? 0) + 1 : 1,
      createdAt: isUpdate ? claimed.createdAt : formattedDate,
    };

    await createFile(file, true);
    return Object.assign(file, { messageId, toolCallId });
  } catch (error) {
    logger.error('[processLocalCodeOutput] Error processing file', error);
    return null;
  }
};

module.exports = { processLocalCodeOutput };
