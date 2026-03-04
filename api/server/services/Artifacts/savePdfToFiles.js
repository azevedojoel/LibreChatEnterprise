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
} = require('librechat-data-provider');
const { createFile } = require('~/models');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { htmlToPdfBuffer } = require('./htmlToPdf');

async function saveArtifactPdfToFiles({ req, html, filename = 'document.pdf' }) {
  const appConfig = req.config;
  const mergedFileConfig = mergeFileConfig(appConfig.fileConfig);
  const endpointFileConfig = getEndpointFileConfig({
    fileConfig: mergedFileConfig,
    endpoint: EModelEndpoint.agents,
  });
  const fileSizeLimit = endpointFileConfig.fileSizeLimit ?? mergedFileConfig.serverFileSizeLimit;

  let buffer;
  try {
    buffer = await htmlToPdfBuffer(html);
  } catch (error) {
    logger.error('[saveArtifactPdfToFiles] HTML to PDF conversion failed:', error);
    throw error;
  }

  if (buffer.length > fileSizeLimit) {
    throw new Error(
      `PDF (${(buffer.length / megabyte).toFixed(2)} MB) exceeds size limit of ${(fileSizeLimit / megabyte).toFixed(2)} MB`,
    );
  }

  const name = path.extname(filename).toLowerCase() === '.pdf' ? filename : `${filename}.pdf`;
  const file_id = v4();

  const { saveBuffer } = getStrategyFunctions(appConfig.fileStrategy);
  if (!saveBuffer) {
    throw new Error(`saveBuffer not available for strategy ${appConfig.fileStrategy}`);
  }

  const mimeType = 'application/pdf';
  const isSupportedMimeType = fileConfig.checkType(
    mimeType,
    endpointFileConfig.supportedMimeTypes,
  );
  if (!isSupportedMimeType) {
    logger.warn(
      `[saveArtifactPdfToFiles] PDF MIME type may not be supported, proceeding with storage`,
    );
  }

  const fileName = `${file_id}__${name}`;
  const filepath = await saveBuffer({
    userId: req.user.id,
    buffer,
    fileName,
    basePath: 'uploads',
  });

  const currentDate = new Date().toISOString();
  const file = {
    file_id,
    filepath,
    object: 'file',
    filename: name,
    type: mimeType,
    user: req.user.id,
    bytes: buffer.length,
    updatedAt: currentDate,
    source: appConfig.fileStrategy,
    context: FileContext.message_attachment,
    usage: 1,
    createdAt: currentDate,
  };

  await createFile(file, true);
  return { file_id, filepath, filename: name };
}

module.exports = { saveArtifactPdfToFiles };
